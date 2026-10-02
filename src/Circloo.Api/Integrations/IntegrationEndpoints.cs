using System.Text.Json;
using Circloo.Api.Auth;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Security;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Integrations;

public sealed record IntegrationView(string Provider, bool Connected, string? Hint, DateTimeOffset? LastUsedAt);
public sealed record ExportRequest(string? Provider, Dictionary<string, string>? Titles);

public static class IntegrationEndpoints
{
    /// <summary>Secrets are encrypted per user: one person's ciphertext is useless under another's purpose.</summary>
    private static IDataProtector Protector(IDataProtectionProvider dp, Guid userId) =>
        dp.CreateProtector("circloo.integrations.v1", userId.ToString());

    public static RouteGroupBuilder MapIntegrationEndpoints(this RouteGroupBuilder api)
    {
        var group = api.MapGroup("/integrations").RequireAuthorization();

        group.MapGet("/", async (HttpContext ctx, CirclooDbContext db, CancellationToken ct) =>
        {
            var userId = ctx.User.GetUserId();
            var rows = await db.IntegrationConnections.AsNoTracking().Where(c => c.UserId == userId).ToListAsync(ct);
            return Results.Ok(Providers.All.Select(p =>
            {
                var row = rows.FirstOrDefault(r => r.Provider == p);
                return new IntegrationView(p, row is not null, row?.Hint, row?.LastUsedAt);
            }));
        });

        group.MapPut("/{provider}", async (string provider, IntegrationConfig body, HttpContext ctx, CirclooDbContext db,
            IDataProtectionProvider dp, AuditLog audit, TimeProvider clock, CancellationToken ct) =>
        {
            if (!Providers.All.Contains(provider))
            {
                return Results.NotFound();
            }
            var errors = ConnectionRules.Validate(provider, body, out var clean, out var hint);
            if (errors.Count > 0)
            {
                return Results.ValidationProblem(errors);
            }
            var userId = ctx.User.GetUserId();
            var protectedConfig = Protector(dp, userId).Protect(JsonSerializer.Serialize(clean, IntegrationConfig.Json));
            var row = await db.IntegrationConnections.FirstOrDefaultAsync(c => c.UserId == userId && c.Provider == provider, ct);
            if (row is null)
            {
                db.IntegrationConnections.Add(new IntegrationConnection { UserId = userId, Provider = provider, ConfigProtected = protectedConfig, Hint = hint, CreatedAt = clock.GetUtcNow() });
            }
            else
            {
                row.ConfigProtected = protectedConfig;
                row.Hint = hint;
            }
            audit.Add(AuditTypes.IntegrationConnected, userId, detail: new { provider });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new IntegrationView(provider, true, hint, row?.LastUsedAt));
        });

        group.MapDelete("/{provider}", async (string provider, HttpContext ctx, CirclooDbContext db, AuditLog audit, CancellationToken ct) =>
        {
            var userId = ctx.User.GetUserId();
            var removed = await db.IntegrationConnections.Where(c => c.UserId == userId && c.Provider == provider).ExecuteDeleteAsync(ct);
            if (removed > 0)
            {
                audit.Add(AuditTypes.IntegrationDisconnected, userId, detail: new { provider });
                await db.SaveChangesAsync(ct);
            }
            return Results.NoContent();
        });

        group.MapPost("/{provider}/test", async (string provider, HttpContext ctx, CirclooDbContext db, IDataProtectionProvider dp,
            IntegrationSender sender, CancellationToken ct) =>
        {
            var userId = ctx.User.GetUserId();
            var config = await ConfigAsync(db, dp, userId, provider, ct);
            if (config is null)
            {
                return Results.NotFound();
            }
            try
            {
                var result = await sender.TestAsync(provider, config, ct);
                return Results.Ok(new { ok = result.Ok, status = result.Status });
            }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
            {
                return Results.Ok(new { ok = false, status = (int?)null });
            }
        }).RequireRateLimiting(RateLimits.Integration);

        api.MapPost("/circles/{id:guid}/export", async (Guid id, ExportRequest body, HttpContext ctx, CirclooDbContext db, IDataProtectionProvider dp,
            IntegrationSender sender, AuditLog audit, TimeProvider clock, CancellationToken ct) =>
        {
            var userId = ctx.User.GetUserId();
            var circle = await db.Circles.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id && c.OwnerUserId == userId, ct);
            if (circle is null)
            {
                return Results.NotFound();
            }
            var provider = body.Provider ?? "";
            var config = await ConfigAsync(db, dp, userId, provider, ct);
            if (config is null)
            {
                return Results.Problem(statusCode: StatusCodes.Status409Conflict, type: "integration-not-connected", title: "Connect this service first.");
            }
            // Titles come from the animator's own screen (their language); they are display text only, so bound them.
            var titles = (body.Titles ?? []).Where(kv => ActivityCatalog.Find(kv.Key) is not null)
                .ToDictionary(kv => kv.Key, kv => TextRules.Clean(kv.Value, 60) ?? kv.Key);
            var report = await CircleReports.BuildAsync(db, circle, titles, clock.GetUtcNow(), ct);
            SendResult result;
            try
            {
                result = await sender.SendAsync(provider, config, report, ct);
            }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
            {
                result = new SendResult(false, null, 0);
            }
            await db.IntegrationConnections.Where(c => c.UserId == userId && c.Provider == provider)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.LastUsedAt, clock.GetUtcNow()), ct);
            audit.Add(AuditTypes.CircleExported, userId, detail: new { circle = id, provider, ok = result.Ok, created = result.Created });
            await db.SaveChangesAsync(ct);
            return result.Ok
                ? Results.Ok(new { url = result.Url, created = result.Created })
                : Results.Problem(statusCode: StatusCodes.Status502BadGateway, type: "integration-failed", title: "The service refused the request.",
                    extensions: new Dictionary<string, object?> { ["serviceStatus"] = result.Status });
        }).RequireAuthorization().RequireRateLimiting(RateLimits.Integration);

        return api;
    }

    private static async Task<IntegrationConfig?> ConfigAsync(CirclooDbContext db, IDataProtectionProvider dp, Guid userId, string provider, CancellationToken ct)
    {
        var row = await db.IntegrationConnections.AsNoTracking().FirstOrDefaultAsync(c => c.UserId == userId && c.Provider == provider, ct);
        return row is null ? null : JsonSerializer.Deserialize<IntegrationConfig>(Protector(dp, userId).Unprotect(row.ConfigProtected), IntegrationConfig.Json);
    }
}
