using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text.Json;
using Circloo.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;

namespace Circloo.Api.Ai;

/// <summary>
/// The zero-cost dev provider (constitution IX): answers the generator's request by remixing seed sparks that match
/// the filters, optionally framed by the theme. No network, no tokens, same JSON contract as a real model.
/// </summary>
public sealed class SeedRemixChatClient(IServiceScopeFactory scopes) : IChatClient
{
    public const string ModelName = "seed-remix";

    private static readonly Dictionary<string, string> ThemeFrames = new()
    {
        ["en"] = "{0} edition: {1}",
        ["fr"] = "Spécial {0} : {1}",
        ["ar"] = "على طريقة {0}: {1}",
        ["es"] = "Edición {0}: {1}",
    };

    public async Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default)
    {
        var request = GenerationRequest.FromPrompt(messages.Last(m => m.Role == ChatRole.User).Text);
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();

        var pool = await db.Sparks.AsNoTracking()
            .Where(s => s.Source == "seed" && !s.Retired && s.Lang == request.Lang && s.Kind == request.Kind
                        && s.Audiences.Contains(request.Audience) && (!request.KidsSafe || s.KidsSafe))
            .ToListAsync(cancellationToken);
        var preferred = pool.Where(s => s.Tone == request.Tone).ToList();
        var source = preferred.Count >= request.Count ? preferred : pool;
        var picked = source.OrderBy(_ => RandomNumberGenerator.GetInt32(int.MaxValue)).Take(request.Count);

        var items = picked.Select(s => new GeneratedItem(
            string.IsNullOrWhiteSpace(request.Theme) || s.Kind is "joke" or "riddle"
                ? s.Text
                : string.Format(System.Globalization.CultureInfo.InvariantCulture, ThemeFrames[request.Lang], request.Theme, s.Text),
            s.Kind,
            s.Answer)).ToArray();

        var json = JsonSerializer.Serialize(new GeneratedBatch(items), GenerationRequest.Json);
        return new ChatResponse(new ChatMessage(ChatRole.Assistant, json))
        {
            ModelId = ModelName,
            Usage = new UsageDetails { InputTokenCount = 0, OutputTokenCount = 0 },
        };
    }

    public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var response = await GetResponseAsync(messages, options, cancellationToken);
        foreach (var update in response.ToChatResponseUpdates())
        {
            yield return update;
        }
    }

    public object? GetService(Type serviceType, object? serviceKey = null) =>
        serviceKey is null && serviceType.IsInstanceOfType(this) ? this : null;

    public void Dispose()
    {
    }
}
