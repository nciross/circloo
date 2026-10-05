using Circloo.Api.Auth;
using Circloo.Api.Data;
using Circloo.Api.Discussion;
using Circloo.Api.Security;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Circles;

/// <summary>
/// The live discussion switch (spec 009 US1, contracts/hub.md). Only the animator, read from the database on every
/// call, can switch it on or off. No audio or video ever reaches the server: it only holds the setting.
/// </summary>
public sealed partial class CircleHub
{
    /// <summary>Refused attempts write at most this many audit rows per member per minute.</summary>
    private const int RefusedAuditsPerMinute = 5;

    /// <summary>Switches the discussion on, or changes "allow cameras" while it is on. Calling it again with the same values changes nothing.</summary>
    public async Task EnableDiscussion(bool videoAllowed)
    {
        var (circleId, me) = await DiscussionAnimatorAsync(nameof(EnableDiscussion));
        var circle = me.Circle!;
        if (circle.DiscussionOn && circle.DiscussionVideo == videoAllowed)
        {
            return;
        }
        var wasOn = circle.DiscussionOn;
        var now = clock.GetUtcNow();
        circle.DiscussionOn = true;
        circle.DiscussionVideo = videoAllowed;
        circle.DiscussionChangedAt = now;
        circle.DiscussionChangedByMemberId = me.Id;
        audit.Add(AuditTypes.DiscussionOn, me.UserId, detail: new { circle = circleId, member = me.Id, videoAllowed });
        var line = wasOn ? null : AddSystemLine(circle, me.Id, "discussion:on");
        await db.SaveChangesAsync();
        await BroadcastDiscussionAsync(circle, line);
    }

    /// <summary>Switches the discussion off for everyone and clears the raised hands (spec 009 FR-902).</summary>
    public async Task DisableDiscussion()
    {
        var (circleId, me) = await DiscussionAnimatorAsync(nameof(DisableDiscussion));
        var circle = me.Circle!;
        if (!circle.DiscussionOn)
        {
            return;
        }
        circle.DiscussionOn = false;
        circle.DiscussionChangedAt = clock.GetUtcNow();
        circle.DiscussionChangedByMemberId = me.Id;
        db.RaisedHands.RemoveRange(await db.RaisedHands.Where(h => h.CircleId == circleId).ToListAsync());
        audit.Add(AuditTypes.DiscussionOff, me.UserId, detail: new { circle = circleId, member = me.Id });
        var line = AddSystemLine(circle, me.Id, "discussion:off");
        await db.SaveChangesAsync();
        await BroadcastDiscussionAsync(circle, line);
    }

    private CircleMessage AddSystemLine(Circle circle, Guid memberId, string text)
    {
        var line = new CircleMessage { CircleId = circle.Id, ActivityId = circle.CurrentActivity, MemberId = memberId, Kind = "system", Text = text, CreatedAt = clock.GetUtcNow() };
        db.CircleMessages.Add(line);
        return line;
    }

    private async Task BroadcastDiscussionAsync(Circle circle, CircleMessage? line)
    {
        await Clients.Group(Group(circle.Id)).Discussion(DiscussionRules.State(circle, discussion.Value));
        if (line is not null)
        {
            await Clients.Group(Group(circle.Id)).Message(MessageDto.From(line));
        }
    }

    /// <summary>
    /// The one gate of every animator method of the discussion: the role is read from the database, never from the
    /// client. An audience screen, a connection that never entered, a non-member and a participant are all refused and
    /// audited.
    /// </summary>
    private async Task<(Guid CircleId, CircleMember Me)> DiscussionAnimatorAsync(string method)
    {
        if (Context.Items[AudienceKey] is Guid audienceCircle)
        {
            throw await RefuseAnimatorOnlyAsync(method, "audience-read-only", audienceCircle, null);
        }
        if (Context.Items[CircleKey] is not Guid circleId)
        {
            throw await RefuseAnimatorOnlyAsync(method, "not-entered", null, null);
        }
        var me = await CircleAccess.ResolveAsync(db, Context.User!, circleId, Context.ConnectionAborted);
        if (me is null || !me.Circle!.IsOpen(clock.GetUtcNow()))
        {
            throw await RefuseAnimatorOnlyAsync(method, "not-a-member", circleId, null);
        }
        if (me.Role != Roles.Animator)
        {
            throw await RefuseAnimatorOnlyAsync(method, "animator-only", circleId, me.Id);
        }
        return (circleId, me);
    }

    /// <summary>
    /// Audits a refused animator method (ids only, at most 5 rows per member per minute) and returns the error to throw.
    /// Used by every animator method of the discussion.
    /// </summary>
    private async Task<HubException> RefuseAnimatorOnlyAsync(string method, string code, Guid? circleId, Guid? memberId)
    {
        var userId = Context.User?.TryGetUserId();
        if (limits.TryTake(memberId ?? userId ?? Guid.Empty, "refused-audit", RefusedAuditsPerMinute, TimeSpan.FromMinutes(1)))
        {
            audit.Add(AuditTypes.DiscussionRefused, userId, detail: new { method, code, circle = circleId, member = memberId });
            await db.SaveChangesAsync();
        }
        return new HubException(code);
    }
}
