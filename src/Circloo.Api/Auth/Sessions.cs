using System.Security.Claims;
using Circloo.Api.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Circloo.Api.Auth;

public static class CirclooClaims
{
    public const string UserId = "sub";
    public const string SessionId = "sid";

    public static Guid GetUserId(this ClaimsPrincipal user) => Guid.Parse(user.FindFirstValue(UserId)!);

    public static Guid? GetSessionId(this ClaimsPrincipal user) =>
        Guid.TryParse(user.FindFirstValue(SessionId), out var sid) ? sid : null;
}

/// <summary>
/// Server-side sessions behind the auth cookie. Validity is cached for 30 s, so a revoked
/// session (sign out everywhere) stops working within 30 s on every replica (FR-021).
/// </summary>
public sealed class SessionStore(CirclooDbContext db, IMemoryCache cache, TimeProvider clock)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(30);
    private static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(30);

    private static string Key(Guid sid) => $"session:{sid}";

    public async Task<UserSession> CreateAsync(Guid userId, string? userAgent, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var session = new UserSession
        {
            UserId = userId,
            CreatedAt = now,
            LastSeenAt = now,
            ExpiresAt = now + Lifetime,
            UserAgent = userAgent is { Length: > 200 } ? userAgent[..200] : userAgent,
        };
        db.UserSessions.Add(session);
        await db.SaveChangesAsync(ct);
        return session;
    }

    public async Task<bool> IsValidAsync(Guid sid, Guid userId, CancellationToken ct)
    {
        if (cache.TryGetValue(Key(sid), out bool valid))
        {
            return valid;
        }
        var now = clock.GetUtcNow();
        var session = await db.UserSessions.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sid, ct);
        valid = session is not null && session.UserId == userId && session.RevokedAt == null && session.ExpiresAt > now;
        if (valid && now - session!.LastSeenAt > TimeSpan.FromHours(1))
        {
            // Sliding expiry, written at most hourly to keep requests cheap.
            await db.UserSessions.Where(s => s.Id == sid).ExecuteUpdateAsync(s => s
                .SetProperty(x => x.LastSeenAt, now)
                .SetProperty(x => x.ExpiresAt, now + Lifetime), ct);
        }
        cache.Set(Key(sid), valid, CacheFor);
        return valid;
    }

    public async Task RevokeAsync(Guid sid, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        await db.UserSessions.Where(s => s.Id == sid && s.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now), ct);
        cache.Remove(Key(sid));
    }

    public async Task RevokeAllAsync(Guid userId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var ids = await db.UserSessions.Where(s => s.UserId == userId && s.RevokedAt == null).Select(s => s.Id).ToListAsync(ct);
        await db.UserSessions.Where(s => s.UserId == userId && s.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now), ct);
        foreach (var id in ids)
        {
            cache.Remove(Key(id));
        }
    }

    public static ClaimsPrincipal Principal(Guid userId, Guid sessionId) =>
        new(new ClaimsIdentity(
            [new Claim(CirclooClaims.UserId, userId.ToString()), new Claim(CirclooClaims.SessionId, sessionId.ToString())],
            CookieAuthenticationDefaults.AuthenticationScheme, CirclooClaims.UserId, null));
}

public static class SessionAuthentication
{
    public const string CookieName = "__Host-circloo";

    public static IServiceCollection AddCirclooAuthentication(this IServiceCollection services)
    {
        services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(o =>
            {
                o.Cookie.Name = CookieName;
                o.Cookie.HttpOnly = true;
                o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
                o.Cookie.SameSite = SameSiteMode.Lax;
                o.Cookie.Path = "/";
                o.ExpireTimeSpan = SessionStore.Lifetime;
                o.SlidingExpiration = true;
                o.Events = new CookieAuthenticationEvents
                {
                    // An API never redirects to a login page.
                    OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; },
                    OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; },
                    OnValidatePrincipal = async ctx =>
                    {
                        var sid = ctx.Principal?.GetSessionId();
                        var uid = ctx.Principal?.FindFirstValue(CirclooClaims.UserId);
                        var store = ctx.HttpContext.RequestServices.GetRequiredService<SessionStore>();
                        if (sid is null || !Guid.TryParse(uid, out var userId)
                            || !await store.IsValidAsync(sid.Value, userId, ctx.HttpContext.RequestAborted))
                        {
                            ctx.RejectPrincipal();
                            await ctx.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
                        }
                    },
                };
            });
        services.AddAuthorization();
        services.AddScoped<SessionStore>();
        return services;
    }
}
