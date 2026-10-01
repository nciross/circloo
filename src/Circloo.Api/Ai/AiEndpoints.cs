using System.Security.Cryptography;
using System.Text.Json;
using Circloo.Api.Auth;
using Circloo.Api.Data;
using Circloo.Api.Security;
using Circloo.Api.Sparks;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Ai;

public sealed record KeepRequest(string? KeepToken, int Index);

public static class AiEndpoints
{
    public static RouteGroupBuilder MapAiEndpoints(this RouteGroupBuilder api)
    {
        var ai = api.MapGroup("/ai").RequireAuthorization();

        ai.MapGet("/allowance", async (HttpContext ctx, IcebreakerGenerator generator, CancellationToken ct) =>
            Results.Ok(await generator.GetAllowanceAsync(ctx.User.GetUserId(), ct)));

        ai.MapPost("/sparks", async (AiSparkRequest body, HttpContext ctx, IcebreakerGenerator generator, CancellationToken ct) =>
        {
            var r = await generator.GenerateAsync(ctx.User.GetUserId(), body, ct);
            return r.Outcome switch
            {
                GenerationOutcome.Ok => Results.Ok(new { items = r.Items, keepToken = r.KeepToken, remainingToday = r.RemainingToday }),
                GenerationOutcome.InvalidRequest => Results.ValidationProblem(r.Errors!.ToDictionary(), type: "invalid-request"),
                GenerationOutcome.UnsafeTheme => Results.Problem(statusCode: 400, type: "unsafe-theme", title: "This theme can't be used. Try a kinder one."),
                GenerationOutcome.InFlight => Results.Problem(statusCode: 409, type: "in-flight", title: "The fridge is already thinking."),
                GenerationOutcome.Limited => Results.Problem(statusCode: 429, type: "allowance", title: "Daily allowance reached.",
                    extensions: new Dictionary<string, object?> { ["resetsAt"] = r.ResetsAt }),
                _ => Results.Problem(statusCode: 503, type: "ai-unavailable", title: "The fridge could not come up with anything right now."),
            };
        }).RequireRateLimiting(RateLimits.Ai);

        ai.MapPost("/sparks/keep", async (KeepRequest body, HttpContext ctx, IDataProtectionProvider dp, CirclooDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            var userId = ctx.User.GetUserId();
            KeepPayload? payload;
            try
            {
                var json = dp.CreateProtector(IcebreakerGenerator.KeepPurpose).ToTimeLimitedDataProtector().Unprotect(body.KeepToken ?? "");
                payload = JsonSerializer.Deserialize<KeepPayload>(json);
            }
            catch (Exception ex) when (ex is CryptographicException or JsonException)
            {
                payload = null;
            }
            if (payload is null || payload.UserId != userId || payload.ExpiresAt <= clock.GetUtcNow() || body.Index < 0 || body.Index >= payload.Items.Count)
            {
                return Results.Problem(statusCode: 400, type: "invalid-keep", title: "This suggestion has expired. Ask the fridge again.");
            }

            var item = payload.Items[body.Index];
            // Keeping is idempotent: replaying the same token and index returns the card already kept, never a copy.
            var existing = await db.Sparks.AsNoTracking()
                .FirstOrDefaultAsync(s => s.OwnerId == userId && s.Source == "ai" && s.Lang == payload.Lang && s.Text == item.Text, ct);
            if (existing is not null)
            {
                return Results.Ok(SparkDto.From(existing, false));
            }
            var spark = new Spark
            {
                Id = $"ai-{Guid.CreateVersion7():N}",
                Lang = payload.Lang,
                Kind = item.Kind,
                Tone = payload.Tone,
                Audiences = [payload.Audience],
                KidsSafe = payload.KidsSafe,
                Text = item.Text,
                Answer = item.Answer,
                Source = "ai",
                OwnerId = userId,
                CreatedAt = clock.GetUtcNow(),
            };
            db.Sparks.Add(spark);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/sparks/mine/{spark.Id}", SparkDto.From(spark, false));
        }).RequireRateLimiting(RateLimits.Ai);

        return api;
    }
}
