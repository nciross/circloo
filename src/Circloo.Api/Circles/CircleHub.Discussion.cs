using Circloo.Api.Auth;
using Circloo.Api.Data;
using Circloo.Api.Decide;
using Circloo.Api.Discussion;
using Circloo.Api.Security;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Circles;

/// <summary>
/// The group call's switches, speaking mode and moderation (spec 009 US1, US3, contracts/hub.md). Only the animator,
/// read from the database on every call, can change them. Audio and video never reach the hub: it holds the settings and puts them
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

    /// <summary>Marks a connection that entered as an animator: when the last one closes during a call, <see cref="CallAway"/> starts.</summary>
    private const string AnimatorKey = "animator";

    /// <summary>Every connection that entered the circle, never the audience screen: the call's roster goes there.</summary>
    public static string RosterGroup(Guid circleId) => $"roster:{circleId}";

    /// <summary>
    /// Sends the circle's roster to its people, at most every 250 ms with the latest last (<see cref="LiveThrottle"/>),
    /// so 100 people joining at once do not send everyone 100 lists. Used by the webhook and when a call ends.
    /// </summary>
    public static void RequestRoster(LiveThrottle throttle, Guid circleId)
    {
        ArgumentNullException.ThrowIfNull(throttle);
        throttle.Request($"call-roster:{circleId}", services => services.GetRequiredService<IHubContext<CircleHub, ICircleClient>>()
            .Clients.Group(RosterGroup(circleId)).CallRoster(services.GetRequiredService<CallModeration>().Roster(circleId)));
    }

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

    /// <summary>
    /// Takes <paramref name="source"/> (<c>microphone</c> or <c>camera</c>) away from a participant until
    /// <see cref="AllowMember"/>: the call server stops the track for everyone, and every new pass leaves it out. They are
    /// told; nothing is stored or audited (FR-922). Already muted: nothing happens.
    /// </summary>
    public async Task MuteMember(Guid memberId, string source)
    {
        var (me, target) = await CallSourceActionAsync(nameof(MuteMember), memberId, source);
        var circle = me.Circle!;
        if (IsMuted(moderation.Of(circle.Id, target), source))
        {
            return;
        }
        moderation.Mute(circle.Id, target, source);
        try
        {
            await callPermissions.ApplyAsync(circle, target, CancellationToken.None);
        }
        catch (LiveKitException)
        {
            moderation.Allow(circle.Id, target, source);
            throw new HubException("try-again");
        }
        var kind = source == CallRights.MicrophoneSource ? CallNoticeKinds.MicMuted : CallNoticeKinds.CameraStopped;
        await Clients.Group(MemberGroup(target)).CallNotice(kind, me.Id, target);
    }

    /// <summary>
    /// Gives a muted source back, as far as the speaking mode and the video switch allow. It never switches a device on
    /// (FR-908): the person may use it again when they choose. Not muted: nothing happens.
    /// </summary>
    public async Task AllowMember(Guid memberId, string source)
    {
        var (me, target) = await CallSourceActionAsync(nameof(AllowMember), memberId, source);
        var circle = me.Circle!;
        if (!IsMuted(moderation.Of(circle.Id, target), source))
        {
            return;
        }
        moderation.Allow(circle.Id, target, source);
        try
        {
            await callPermissions.ApplyAsync(circle, target, CancellationToken.None);
        }
        catch (LiveKitException)
        {
            moderation.Mute(circle.Id, target, source);
            throw new HubException("try-again");
        }
        var kind = source == CallRights.MicrophoneSource ? CallNoticeKinds.MicAllowed : CallNoticeKinds.CameraAllowed;
        await Clients.Group(MemberGroup(target)).CallNotice(kind, me.Id, target);
    }

    /// <summary>
    /// Open mic only: mutes every participant's published microphone. Permissions do not change, so anyone may unmute
    /// again (a reset, not a lock). In Hand to speak only the floor holder can talk, so it answers <c>mode-invalid</c>.
    /// </summary>
    public async Task MuteEveryone()
    {
        var me = await CallAdminAsync(nameof(MuteEveryone));
        var circle = me.Circle!;
        if (circle.DiscussionSpeaking != CallSpeakingModes.Open)
        {
            throw new HubException("mode-invalid");
        }
        TakeCallAdmin(me);
        try
        {
            await callPermissions.MuteMicrophonesAsync(circle, CancellationToken.None);
        }
        catch (LiveKitException)
        {
            throw new HubException("try-again");
        }
        await Clients.Group(Group(circle.Id)).CallNotice(CallNoticeKinds.MutedEveryone, me.Id, null);
    }

    /// <summary>
    /// Takes a participant out of this call and keeps them out until <see cref="AllowBack"/> or the end of the call:
    /// no new pass, the call server disconnects them, their hand goes down. They stay in the circle. The one call
    /// moderation that is audited (<c>call.removed</c>, ids only). Removing again disconnects them again.
    /// </summary>
    public async Task RemoveFromCall(Guid memberId)
    {
        var me = await CallAdminAsync(nameof(RemoveFromCall));
        var circle = me.Circle!;
        TakeCallAdmin(me);
        var target = await CallTargetAsync(circle.Id, memberId);
        var first = !moderation.IsRemoved(circle.Id, target);
        // Kept out first, so a pass asked for at this moment is already refused.
        moderation.Remove(circle.Id, target);
        try
        {
            await calls.DropAsync(circle.Id, target);
        }
        catch (LiveKitException)
        {
            if (first)
            {
                moderation.AllowBack(circle.Id, target);
            }
            throw new HubException("try-again");
        }
        // Off the roster now, for everyone in the room (issue #275): their screens drop the tile on it, without waiting
        // for the call server to tell each browser. Its webhook for this connection then changes nothing.
        if (moderation.Left(circle.Id, target, null))
        {
            RequestRoster(throttle, circle.Id);
        }
        if (!first)
        {
            return;
        }
        await audit.WriteAsync(AuditTypes.CallRemoved, me.UserId, detail: new { circle = circle.Id, member = me.Id, subject = target });
        await Clients.Group(MemberGroup(target)).CallNotice(CallNoticeKinds.Removed, me.Id, target);
    }

    /// <summary>Lets a removed participant back into this call (they ask for a new pass). Not removed: nothing happens.</summary>
    public async Task AllowBack(Guid memberId)
    {
        var me = await CallAdminAsync(nameof(AllowBack));
        var circle = me.Circle!;
        TakeCallAdmin(me);
        var target = await CallTargetAsync(circle.Id, memberId);
        if (!moderation.IsRemoved(circle.Id, target))
        {
            return;
        }
        moderation.AllowBack(circle.Id, target);
        await Clients.Group(MemberGroup(target)).CallNotice(CallNoticeKinds.AllowedBack, me.Id, target);
    }

    /// <summary>The animator gate, then <c>call-off</c>: every moderation method needs a call that is on.</summary>
    private async Task<CircleMember> CallAdminAsync(string method)
    {
        var (_, me) = await DiscussionAnimatorAsync(method);
        return me.Circle!.DiscussionOn ? me : throw new HubException("call-off");
    }

    /// <summary>The checks of <see cref="MuteMember"/> and <see cref="AllowMember"/>, in the contract's order.</summary>
    private async Task<(CircleMember Me, Guid Target)> CallSourceActionAsync(string method, Guid memberId, string source)
    {
        var me = await CallAdminAsync(method);
        if (source is not (CallRights.MicrophoneSource or CallRights.CameraSource))
        {
            throw new HubException("source-invalid");
        }
        TakeCallAdmin(me);
        return (me, await CallTargetAsync(me.CircleId, memberId));
    }

    /// <summary>The <c>call-admin</c> limit: 30 animator call actions per 10 s, across tabs.</summary>
    private void TakeCallAdmin(CircleMember me)
    {
        if (!limits.TryTake(me.Id, RateLimits.CallAdmin, CallAdminPerWindow, CallAdminWindow))
        {
            throw new HubException("slow-down");
        }
    }

    /// <summary>
    /// The person an animator acts on: a current member of this circle who is not an animator (an animator may always
    /// speak and show their camera). Anyone else is <c>member-invalid</c>.
    /// </summary>
    private async Task<Guid> CallTargetAsync(Guid circleId, Guid memberId)
    {
        var found = await db.CircleMembers.AsNoTracking()
            .AnyAsync(m => m.Id == memberId && m.CircleId == circleId && m.LeftAt == null && m.Role != Roles.Animator);
        return found ? memberId : throw new HubException("member-invalid");
    }

    private static bool IsMuted(MemberModeration state, string source) =>
        source == CallRights.MicrophoneSource ? state.MicrophoneMuted : state.CameraStopped;

    private Task BroadcastDiscussionAsync(Circle circle) =>
        Clients.Group(Group(circle.Id)).Discussion(StateOf(circle));

    /// <summary>The call as everyone sees it, with the animator-away countdown when one runs.</summary>
    private DiscussionState StateOf(Circle circle) => DiscussionRules.State(circle, livekit.Value, away.EndsAt(circle.Id));

    /// <summary>
    /// An animator connection closed: if it was the circle's last one during a call, the animator-away countdown starts
    /// (research R34) and everyone sees when the call will end. Another animator tab or device keeps the call as it is.
    /// </summary>
    private async Task WatchAnimatorAwayAsync(Guid circleId)
    {
        var circle = await db.Circles.AsNoTracking().FirstOrDefaultAsync(c => c.Id == circleId);
        if (circle is null || !circle.DiscussionOn)
        {
            return;
        }
        var animators = await db.CircleMembers.AsNoTracking()
            .Where(m => m.CircleId == circleId && m.LeftAt == null && m.Role == Roles.Animator)
            .Select(m => m.Id)
            .ToListAsync();
        if (presence.Online(circleId).Intersect(animators).Any() || !away.Start(circleId))
        {
            return;
        }
        // A reload: the new tab entered between the check and the start, and found nothing to cancel yet.
        if (presence.Online(circleId).Intersect(animators).Any())
        {
            away.Cancel(circleId);
            return;
        }
        await BroadcastDiscussionAsync(circle);
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
