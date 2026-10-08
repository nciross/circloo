using Circloo.Api.Auth;
using Circloo.Api.Data;
using Circloo.Api.Discussion;
using Circloo.Api.Security;
using Microsoft.AspNetCore.SignalR;

namespace Circloo.Api.Circles;

/// <summary>
/// The group call's switches and speaking mode (spec 009 US1, US3, contracts/hub.md). Only the animator, read from the
/// database on every call, can change them. Audio and video never reach the hub: it holds the settings and puts them
/// on the call server. A change the call server does not take is not kept (<c>try-again</c>). Nothing about a call is
/// written to the chat (FR-930): <c>CallNotice</c> is live only.
/// </summary>
public sealed partial class CircleHub
{
    /// <summary>Refused attempts write at most this many audit rows per member per minute.</summary>
    private const int RefusedAuditsPerMinute = 5;

    /// <summary>The animator's call actions per <see cref="CallAdminWindow"/>, across tabs (contracts/hub.md, <c>call-admin</c>).</summary>
    private const int CallAdminPerWindow = 30;

    private static readonly TimeSpan CallAdminWindow = TimeSpan.FromSeconds(10);

    /// <summary>
    /// Starts the call when it is off (the call server's room is opened first), or, while it is on, switches between
    /// audio and video and changes the speaking mode for everyone in the call. The same values change nothing.
    /// </summary>
    public async Task EnableDiscussion(bool videoAllowed, string speaking)
    {
        var (circleId, me) = await DiscussionAnimatorAsync(nameof(EnableDiscussion));
        if (!livekit.Value.Available)
        {
            throw new HubException("calls-unavailable");
        }
        if (!CallSpeakingModes.IsValid(speaking))
        {
            throw new HubException("mode-invalid");
        }
        var circle = me.Circle!;
        if (circle.DiscussionOn)
        {
            await ChangeCallAsync(circle, me, videoAllowed, speaking);
            return;
        }
        try
        {
            await calls.OpenAsync(circleId, CancellationToken.None);
        }
        catch (LiveKitException)
        {
            throw new HubException("try-again");
        }
        circle.DiscussionOn = true;
        circle.DiscussionVideo = videoAllowed;
        circle.DiscussionSpeaking = speaking;
        audit.Add(AuditTypes.DiscussionOn, me.UserId, detail: new { circle = circleId, member = me.Id, videoAllowed, speaking });
        await db.SaveChangesAsync();
        await BroadcastDiscussionAsync(circle);
        await Clients.Group(Group(circleId)).CallNotice(CallNoticeKinds.CallStarted, me.Id, null);
    }

    /// <summary>
    /// Ends the call for everyone: the hands go down, the call server's room is deleted (everyone disconnects) and the
    /// animator's mutes and removals are forgotten (FR-902). Off already: nothing happens.
    /// </summary>
    public async Task DisableDiscussion()
    {
        var (_, me) = await DiscussionAnimatorAsync(nameof(DisableDiscussion));
        await calls.EndAsync(me.Circle!, me.UserId, me.Id, CallLifecycle.ByAnimator);
    }

    /// <summary>
    /// <c>open</c> (everyone may speak) or <c>hand</c> (only the animator and the floor holder). Everyone's microphone
    /// permission is recomputed on the call server. People the animator muted stay muted.
    /// </summary>
    public async Task SetSpeakingMode(string mode)
    {
        var (_, me) = await DiscussionAnimatorAsync(nameof(SetSpeakingMode));
        var circle = me.Circle!;
        if (!circle.DiscussionOn)
        {
            throw new HubException("call-off");
        }
        if (!CallSpeakingModes.IsValid(mode))
        {
            throw new HubException("mode-invalid");
        }
        if (!limits.TryTake(me.Id, RateLimits.CallAdmin, CallAdminPerWindow, CallAdminWindow))
        {
            throw new HubException("slow-down");
        }
        await ChangeCallAsync(circle, me, circle.DiscussionVideo, mode);
    }

    /// <summary>
    /// Applies a video or speaking-mode change to everyone in the call, then keeps it. When the call server does not
    /// take it, the circle is put back and nothing is saved, audited or broadcast.
    /// </summary>
    private async Task ChangeCallAsync(Circle circle, CircleMember me, bool videoAllowed, string speaking)
    {
        var videoChanged = circle.DiscussionVideo != videoAllowed;
        var modeChanged = circle.DiscussionSpeaking != speaking;
        if (!videoChanged && !modeChanged)
        {
            return;
        }
        var (videoBefore, speakingBefore) = (circle.DiscussionVideo, circle.DiscussionSpeaking);
        (circle.DiscussionVideo, circle.DiscussionSpeaking) = (videoAllowed, speaking);
        try
        {
            await callPermissions.ApplyEveryoneAsync(circle, CancellationToken.None);
        }
        catch (LiveKitException)
        {
            (circle.DiscussionVideo, circle.DiscussionSpeaking) = (videoBefore, speakingBefore);
            throw new HubException("try-again");
        }
        if (videoChanged)
        {
            audit.Add(AuditTypes.DiscussionOn, me.UserId, detail: new { circle = circle.Id, member = me.Id, videoAllowed, speaking });
        }
        if (modeChanged)
        {
            audit.Add(AuditTypes.CallMode, me.UserId, detail: new { circle = circle.Id, member = me.Id, speaking });
        }
        await db.SaveChangesAsync();
        await BroadcastDiscussionAsync(circle);
        var everyone = Clients.Group(Group(circle.Id));
        if (videoChanged)
        {
            await everyone.CallNotice(videoAllowed ? CallNoticeKinds.VideoOn : CallNoticeKinds.VideoOff, me.Id, null);
        }
        if (modeChanged)
        {
            await everyone.CallNotice(speaking == CallSpeakingModes.Open ? CallNoticeKinds.ModeOpen : CallNoticeKinds.ModeHand, me.Id, null);
        }
    }

    private Task BroadcastDiscussionAsync(Circle circle) =>
        Clients.Group(Group(circle.Id)).Discussion(DiscussionRules.State(circle, livekit.Value));

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
