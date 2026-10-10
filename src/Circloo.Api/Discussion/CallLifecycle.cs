using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Security;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Circloo.Api.Discussion;

/// <summary>
/// Opening and ending a circle's call (spec 009 data-model, lifecycle rules). The animator's switch, a closed circle
/// and, later, an animator who stays away all end it the same way: the setting and the hands in one unit of work, then
/// the call server's room (everyone disconnects), then the animator's mutes and removals, then the circle is told.
/// </summary>
public sealed partial class CallLifecycle(CirclooDbContext db, ILiveKitRooms rooms, CallModeration moderation, AuditLog audit,
    IHubContext<CircleHub, ICircleClient> hub, IOptions<LiveKitOptions> livekit, IOptions<CircleOptions> circles, ILogger<CallLifecycle> log)
{
    /// <summary>Why a call ended, in the <c>discussion.off</c> audit row (plan, audit events).</summary>
    public const string ByAnimator = "animator";
    public const string CircleClosed = "circle-closed";
    public const string AnimatorAway = "animator-away";

    /// <summary>
    /// Gets a new call ready: opens the circle's room on the call server, with the circle's size as its limit (only the
    /// API opens rooms, <c>auto_create</c> is off), and starts with nobody muted or removed. Throws
    /// <see cref="LiveKitException"/> when the call server fails, before anything changes.
    /// </summary>
    public async Task OpenAsync(Guid circleId, CancellationToken ct)
    {
        await rooms.CreateRoomAsync(CallRules.RoomName(circleId), circles.Value.MaxPeople, ct);
        moderation.Clear(circleId);
    }

    /// <summary>
    /// Ends the call of a tracked <paramref name="circle"/>. Does nothing and returns false when it is already off.
    /// Ending never waits for the call server to agree: if deleting the room fails, the call is still off for us, no
    /// pass is issued any more, and the room closes itself once empty.
    /// </summary>
    public async Task<bool> EndAsync(Circle circle, Guid? userId, Guid? memberId, string reason)
    {
        ArgumentNullException.ThrowIfNull(circle);
        if (!circle.DiscussionOn)
        {
            return false;
        }
        circle.DiscussionOn = false;
        db.RaisedHands.RemoveRange(await db.RaisedHands.Where(h => h.CircleId == circle.Id).ToListAsync());
        audit.Add(AuditTypes.DiscussionOff, userId, detail: new { circle = circle.Id, member = memberId, reason });
        await db.SaveChangesAsync();

        if (livekit.Value.Available)
        {
            try
            {
                await rooms.DeleteRoomAsync(CallRules.RoomName(circle.Id), CancellationToken.None);
            }
            catch (LiveKitException)
            {
                LogRoomNotDeleted(log, circle.Id);
            }
        }
        moderation.Clear(circle.Id);

        var everyone = hub.Clients.Group(CircleHub.Group(circle.Id));
        await everyone.Discussion(DiscussionRules.State(circle, livekit.Value));
        await everyone.Hands(HandsView.Empty);
        await everyone.CallNotice(CallNoticeKinds.CallEnded, memberId, null);
        return true;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "The call of circle {CircleId} ended but its room could not be deleted")]
    private static partial void LogRoomNotDeleted(ILogger logger, Guid circleId);
}
