using System.Security.Claims;
using Circloo.Api.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Circloo.Api.Auth;

/// <summary>
/// Participants join a circle from a link without an account (spec 003, FR-304). Their identity is a separate
/// HttpOnly cookie holding only the member id and circle id. It is checked against the database (cached 30 s),
/// so closing a circle or removing someone ends their access within 30 s. Guests never satisfy user-only policies.
/// </summary>
public static class GuestAuthentication
{
    public const string Scheme = "Guest";
    public const string CookieName = "__Host-circloo-guest";
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(12);
    private static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(30);

    public static string CacheKey(Guid memberId) => $"guest:{memberId}";

    public static AuthenticationBuilder AddGuestCookie(this AuthenticationBuilder builder) =>
        builder.AddCookie(Scheme, o =>
        {
            o.Cookie.Name = CookieName;
            o.Cookie.HttpOnly = true;
            o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            o.Cookie.SameSite = SameSiteMode.Lax;
            o.Cookie.Path = "/";
            o.ExpireTimeSpan = Lifetime;
            o.SlidingExpiration = false;
            o.Events = new CookieAuthenticationEvents
            {
                // A guest asking for an account-only resource is simply not signed in.
                OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; },
                OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; },
                OnValidatePrincipal = async ctx =>
                {
                    var guest = ctx.Principal?.GetGuest();
                    if (guest is null || !await IsActiveAsync(ctx.HttpContext.RequestServices, guest.Value.MemberId, guest.Value.CircleId, ctx.HttpContext.RequestAborted))
                    {
                        ctx.RejectPrincipal();
                        await ctx.HttpContext.SignOutAsync(Scheme);
                    }
                },
            };
        });

    public static ClaimsPrincipal Principal(Guid memberId, Guid circleId) =>
        new(new ClaimsIdentity(
            [new Claim(CirclooClaims.GuestMemberId, memberId.ToString()), new Claim(CirclooClaims.GuestCircleId, circleId.ToString())],
            Scheme, CirclooClaims.GuestMemberId, null));

    private static async Task<bool> IsActiveAsync(IServiceProvider services, Guid memberId, Guid circleId, CancellationToken ct)
    {
        var cache = services.GetRequiredService<IMemoryCache>();
        if (cache.TryGetValue(CacheKey(memberId), out bool active))
        {
            return active;
        }
        var db = services.GetRequiredService<CirclooDbContext>();
        var now = services.GetRequiredService<TimeProvider>().GetUtcNow();
        active = await db.CircleMembers.AsNoTracking().AnyAsync(m => m.Id == memberId && m.CircleId == circleId && m.UserId == null && m.LeftAt == null
            && m.Circle!.ClosedAt == null && m.Circle.ExpiresAt > now, ct);
        cache.Set(CacheKey(memberId), active, CacheFor);
        return active;
    }
}
