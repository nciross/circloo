using System.Diagnostics;
using System.Text.Json;
using Circloo.Api.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;

namespace Circloo.Api.Ai;

public enum GenerationOutcome { Ok, InvalidRequest, UnsafeTheme, InFlight, Limited, Failed }

public sealed record GeneratedView(int Index, string Text, string Kind, string? Answer);

public sealed record GenerationResult(
    GenerationOutcome Outcome,
    IReadOnlyList<GeneratedView> Items,
    string? KeepToken,
    int RemainingToday,
    DateTimeOffset ResetsAt,
    IReadOnlyDictionary<string, string[]>? Errors = null);

public sealed record Allowance(int RemainingToday, int Limit, DateTimeOffset ResetsAt);

/// <summary>
/// "Ask the fridge": validate → screen theme → allowance → one call in flight → model (any IChatClient) →
/// validate each item → keep token. Only successful generations consume the allowance (FR-104..110).
/// </summary>
public sealed partial class IcebreakerGenerator(
    IChatClient chat,
    CirclooDbContext db,
    SafetyPolicy safety,
    InFlightGate gate,
    IDataProtectionProvider dp,
    TimeProvider clock,
    IOptions<AiOptions> options,
    ILogger<IcebreakerGenerator> log)
{
    internal const string KeepPurpose = "Circloo.Ai.Keep.v1";
    private const int Count = 5;
    private readonly AiOptions _o = options.Value;

    public async Task<Allowance> GetAllowanceAsync(Guid userId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var since = now.AddDays(-1);
        var mine = await db.AiGenerations.Where(g => g.UserId == userId && g.At > since && g.Outcome == "ok")
            .OrderBy(g => g.At).Select(g => g.At).ToListAsync(ct);
        var globalUsed = await db.AiGenerations.CountAsync(g => g.At > since && g.Outcome == "ok", ct);
        var remaining = Math.Max(0, Math.Min(_o.DailyPerUser - mine.Count, _o.DailyGlobal - globalUsed));
        // The allowance frees up 24 h after the oldest counted generation.
        var resetsAt = mine.Count > 0 ? mine[0].AddDays(1) : now;
        return new Allowance(remaining, _o.DailyPerUser, resetsAt);
    }

    public async Task<GenerationResult> GenerateAsync(Guid userId, AiSparkRequest request, CancellationToken ct)
    {
        var errors = GenerationRequest.Validate(request);
        var allowance = await GetAllowanceAsync(userId, ct);
        if (errors.Count > 0)
        {
            return new GenerationResult(GenerationOutcome.InvalidRequest, [], null, allowance.RemainingToday, allowance.ResetsAt, errors);
        }
        var theme = string.IsNullOrWhiteSpace(request.Theme) ? null : request.Theme.Trim();
        if (!safety.IsThemeSafe(theme))
        {
            await AuditAsync(userId, "refused", 0, 0, null, null, ct);
            return new GenerationResult(GenerationOutcome.UnsafeTheme, [], null, allowance.RemainingToday, allowance.ResetsAt);
        }
        if (allowance.RemainingToday <= 0)
        {
            await AuditAsync(userId, "limited", 0, 0, null, null, ct);
            return new GenerationResult(GenerationOutcome.Limited, [], null, 0, allowance.ResetsAt);
        }
        if (!gate.TryEnter(userId))
        {
            return new GenerationResult(GenerationOutcome.InFlight, [], null, allowance.RemainingToday, allowance.ResetsAt);
        }

        var req = new GenerationRequest(request.Lang!, request.Audience!, request.Tone!, request.Kind!, request.KidsSafe, theme, Count);
        var watch = Stopwatch.StartNew();
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(_o.TimeoutSeconds));
            var response = await chat.GetResponseAsync(
                [new ChatMessage(ChatRole.System, PolicyPrompt.For(req)), new ChatMessage(ChatRole.User, req.ToPrompt())],
                new ChatOptions { Temperature = 0.9f, MaxOutputTokens = 700, ResponseFormat = ChatResponseFormat.Json },
                timeout.Token);

            var accepted = Accept(Parse(response.Text), req);
            var usage = response.Usage;
            if (accepted.Count == 0)
            {
                await AuditAsync(userId, "failed", (int)watch.ElapsedMilliseconds, 0, usage, response.ModelId, ct);
                return new GenerationResult(GenerationOutcome.Failed, [], null, allowance.RemainingToday, allowance.ResetsAt);
            }

            await AuditAsync(userId, "ok", (int)watch.ElapsedMilliseconds, accepted.Count, usage, response.ModelId, ct);
            var token = dp.CreateProtector(KeepPurpose).ToTimeLimitedDataProtector()
                .Protect(JsonSerializer.Serialize(new KeepPayload(userId, req.Lang, req.Tone, req.Audience, req.KidsSafe, accepted)), TimeSpan.FromMinutes(15));
            var views = accepted.Select((i, n) => new GeneratedView(n, i.Text, i.Kind, i.Answer)).ToList();
            return new GenerationResult(GenerationOutcome.Ok, views, token, allowance.RemainingToday - 1, allowance.ResetsAt);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            LogGenerationFailed(log, ex, _o.IsSeed ? SeedRemixChatClient.ModelName : _o.Model);
            await AuditAsync(userId, "failed", (int)watch.ElapsedMilliseconds, 0, null, null, CancellationToken.None);
            return new GenerationResult(GenerationOutcome.Failed, [], null, allowance.RemainingToday, allowance.ResetsAt);
        }
        finally
        {
            gate.Exit(userId);
        }
    }

    private static GeneratedItem[] Parse(string text)
    {
        // Models sometimes wrap JSON in a code fence; take the outermost object.
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            return [];
        }
        try
        {
            return JsonSerializer.Deserialize<GeneratedBatch>(text[start..(end + 1)], GenerationRequest.Json)?.Items ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private List<GeneratedItem> Accept(GeneratedItem[] items, GenerationRequest req)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var seeds = db.Sparks.AsNoTracking().Where(s => s.Lang == req.Lang && s.Source == "seed").Select(s => s.Text).ToHashSet();
        return items
            .Where(i => i is not null)
            .Select(i => i with { Text = i.Text?.Trim() ?? "", Answer = string.IsNullOrWhiteSpace(i.Answer) ? null : i.Answer.Trim() })
            .Where(i => safety.IsOutputSafe(i, req.Lang, req.Kind))
            .Where(i => !seeds.Contains(i.Text) || req.Theme is not null || _o.IsSeed)
            .Where(i => seen.Add(SafetyPolicy.Normalize(i.Text)))
            .Take(Count)
            .ToList();
    }

    private async Task AuditAsync(Guid userId, string outcome, int latencyMs, int accepted, UsageDetails? usage, string? model, CancellationToken ct)
    {
        db.AiGenerations.Add(new AiGeneration
        {
            UserId = userId,
            At = clock.GetUtcNow(),
            Provider = _o.IsSeed ? "seed" : "openai-compatible",
            Model = model ?? (_o.IsSeed ? SeedRemixChatClient.ModelName : _o.Model),
            InputTokens = (int?)usage?.InputTokenCount,
            OutputTokens = (int?)usage?.OutputTokenCount,
            Requested = Count,
            Accepted = accepted,
            Outcome = outcome,
            LatencyMs = latencyMs,
        });
        await db.SaveChangesAsync(ct);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "AI generation failed on model {Model}")]
    private static partial void LogGenerationFailed(ILogger logger, Exception ex, string model);
}

public sealed record KeepPayload(Guid UserId, string Lang, string Tone, string Audience, bool KidsSafe, List<GeneratedItem> Items);
