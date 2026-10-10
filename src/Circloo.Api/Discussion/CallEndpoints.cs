using Circloo.Api.Auth;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Circloo.Api.Discussion;

/// <summary>
/// The answer to a pass request (spec 009 contracts/rest.md). <c>CanSpeak</c> and <c>CanVideo</c> mirror the pass so
/// the interface can draw the right buttons before connecting; the call server enforces the pass itself.
/// </summary>
public sealed record CallPassView(string Url, string Token, string Identity, DateTimeOffset ExpiresAt, bool CanSpeak, bool CanVideo);

/// <summary>The call's HTTP endpoints (spec 009, contracts/rest.md). The call server's webhook comes with T922.</summary>
public static class CallEndpoints
{
    public const string TokenMethod = "call-token";

    /// <summary>Refused pass requests write at most this many audit rows per member per minute, like the hub's refusals.</summary>
    private const int RefusedAuditsPerMinute = 5;

    public static RouteGroupBuilder MapCallEndpoints(this RouteGroupBuilder api)
    {
        // POST: it issues a credential, so it is never cached and it carries the CSRF check of the /api group.
        api.MapPost("/circles/{id:guid}/call/token", IssuePassAsync).RequireAuthorization(SessionAuthentication.CircleMemberPolicy);
        return api;
    }

    /// <summary>
    /// A call pass for the caller, with the checks of the contract in their order: member (404), circle open (404),
    /// call on (409), call server configured (503), not removed from this call (403), then the per-member limit
    /// (429). Membership, role and floor are read from the database on every request, never from the client.
    /// </summary>
    private static async Task<IResult> IssuePassAsync(Guid id, HttpContext ctx, CirclooDbContext db, TimeProvider clock, AuditLog audit,
        IOptions<LiveKitOptions> livekit, IOptions<CircleOptions> circles, IOptions<RateLimitOptions> rates,
        ILiveKitRooms rooms, LiveKitTokens tokens, CallModeration moderation, RoomLimits limits, CancellationToken ct)
    {
        var me = await CircleAccess.ResolveAsync(db, ctx.User, id, ct);
        if (me is null)
        {
            await AuditRefusalAsync(ctx, audit, limits, "not-a-member", id, null, ct);
            return Results.NotFound();
        }
        var circle = me.Circle!;
        if (!circle.IsOpen(clock.GetUtcNow()))
        {
            return Refusal(StatusCodes.Status404NotFound, "circle-not-open", "This circle is not open.");
        }
        if (!circle.DiscussionOn)
        {
            return Refusal(StatusCodes.Status409Conflict, "call-off", "The call is off.");
        }
        if (!livekit.Value.Available)
        {
            return Refusal(StatusCodes.Status503ServiceUnavailable, "calls-unavailable", "Calls are not available here.");
        }
        var moderated = moderation.Of(id, me.Id);
        if (moderated.Removed)
        {
            await AuditRefusalAsync(ctx, audit, limits, "removed-from-call", id, me.Id, ct);
            return Refusal(StatusCodes.Status403Forbidden, "removed-from-call", "The animator removed you from this call.");
        }
        if (!limits.TryTake(me.Id, RateLimits.CallToken, rates.Value.CallTokensPerMemberPerMinute, TimeSpan.FromMinutes(1)))
        {
            return await RateLimits.RejectAsync(ctx, TimeSpan.FromMinutes(1), RateLimits.CallToken, ct);
        }

        var hasFloor = await db.RaisedHands.AnyAsync(h => h.CircleId == id && h.MemberId == me.Id && h.HasFloor, ct);
        var permission = CallRules.Permissions(circle, me, hasFloor, moderated) ?? CallRights.Nothing;
        var room = CallRules.RoomName(id);
        try
        {
            // Only the API opens rooms (auto_create is off): with our size limit and timeouts.
            await rooms.CreateRoomAsync(room, circles.Value.MaxPeople, ct);
        }
        catch (LiveKitException)
        {
            return Refusal(StatusCodes.Status503ServiceUnavailable, "try-again", "The call server did not answer. Try again.");
        }
        var pass = tokens.JoinPass(room, me.Id, me.Name, permission);
        ctx.Response.Headers.CacheControl = "no-store";
        return Results.Ok(new CallPassView(livekit.Value.Url!.Trim(), pass.Token, me.Id.ToString(), pass.ExpiresAt,
            CanSpeak: permission.Microphone, CanVideo: permission.Camera));
    }

    private static IResult Refusal(int status, string type, string title) => Results.Problem(statusCode: status, type: type, title: title);

    /// <summary>A refused attempt (founder decision D10): ids only, capped per member. A granted pass is never audited.</summary>
    private static async Task AuditRefusalAsync(HttpContext ctx, AuditLog audit, RoomLimits limits, string code, Guid circleId, Guid? memberId,
        CancellationToken ct)
    {
        var userId = ctx.User.TryGetUserId();
        if (limits.TryTake(memberId ?? userId ?? Guid.Empty, "refused-audit", RefusedAuditsPerMinute, TimeSpan.FromMinutes(1)))
        {
            await audit.WriteAsync(AuditTypes.DiscussionRefused, userId,
                detail: new { method = TokenMethod, code, circle = circleId, member = memberId }, ct: ct);
        }
    }
}
