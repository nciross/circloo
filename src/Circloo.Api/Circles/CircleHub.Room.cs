using Circloo.Api.Data;
using Circloo.Api.Discussion;
using Circloo.Api.Security;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;

namespace Circloo.Api.Circles;

/// <summary>
/// The live room (spec 008, contracts/hub.md): chat controls (US3: likes, hiding, room settings) and raised hands
/// (US5: a queue ordered by <c>RaisedAt</c> then <c>Id</c>, at most one person with the floor). Every method goes
/// through <see cref="RoomMemberAsync"/>: the role is read from the database on every call and the audience screen only
/// reads. A hidden message only ever reaches the animator's connections.
/// </summary>
public sealed partial class CircleHub
{
    /// <summary>
    /// The gate of every live-room method: the audience screen is read only (even a connection that also entered), and
    /// the caller must be a current member, or the animator when <paramref name="animatorOnly"/>.
    /// </summary>
    private async Task<(Guid CircleId, CircleMember Me)> RoomMemberAsync(bool animatorOnly = false)
    {
        if (Context.Items.ContainsKey(AudienceKey))
        {
            throw new HubException("audience-read-only");
        }
        return await CurrentAsync(animatorOnly);
    }

    #region Chat (T805)

    /// <summary>Participants send at most this many messages per <see cref="MessageWindow"/>, across all their tabs (FR-812).</summary>
    private const int MessagesPerWindow = 5;

    private static readonly TimeSpan MessageWindow = TimeSpan.FromSeconds(10);

    /// <summary>In slow mode a participant sends one message per this long (FR-811).</summary>
    public static readonly TimeSpan SlowEvery = TimeSpan.FromSeconds(10);

    /// <summary>Refuses a participant's message when the chat is paused, in slow mode too soon, or over the sending rate.</summary>
    private async Task CheckChatLimitsAsync(CircleMember me)
    {
        if (me.Role == Roles.Animator)
        {
            return;
        }
        var mode = me.Circle!.ChatMode;
        if (mode == RoomChatModes.Paused)
        {
            throw new HubException("chat-paused");
        }
        if (mode == RoomChatModes.Slow)
        {
            // Counted from the last stored message, so a reload or a second tab changes nothing.
            var last = await db.CircleMessages.AsNoTracking().Where(m => m.MemberId == me.Id && m.Kind == "member")
                .OrderByDescending(m => m.CreatedAt).Select(m => (DateTimeOffset?)m.CreatedAt).FirstOrDefaultAsync();
            var left = last is null ? TimeSpan.Zero : SlowEvery - (clock.GetUtcNow() - last.Value);
            if (left > TimeSpan.Zero)
            {
                throw new HubException($"slow-mode:{(int)Math.Ceiling(left.TotalSeconds)}");
            }
        }
        // Two tabs sending at the same moment cannot both pass the slow-mode check. Taken before the sending rate: once
        // the stored message is 10 s old the rate window is empty, so a message refused here never uses that budget.
        if (mode == RoomChatModes.Slow && !limits.TryTake(me.Id, "slow", 1, SlowEvery))
        {
            throw new HubException($"slow-mode:{(int)SlowEvery.TotalSeconds}");
        }
        if (!limits.TryTake(me.Id, "message", MessagesPerWindow, MessageWindow))
        {
            throw new HubException("slow-down");
        }
    }

    /// <summary>Toggles the caller's like. Never on one's own message or a hidden one; the count is recomputed from the rows.</summary>
    public async Task LikeMessage(long messageId)
    {
        var (circleId, me) = await RoomMemberAsync();
        var message = await db.CircleMessages.AsNoTracking().FirstOrDefaultAsync(m => m.Id == messageId && m.CircleId == circleId && m.Kind != "system")
            ?? throw new HubException("message-invalid");
        if (message.MemberId == me.Id)
        {
            throw new HubException("own-message");
        }
        if (message.HiddenAt is not null)
        {
            throw new HubException("message-hidden");
        }

        var removed = await db.MessageLikes.Where(l => l.MessageId == messageId && l.MemberId == me.Id).ExecuteDeleteAsync();
        if (removed == 0)
        {
            db.MessageLikes.Add(new MessageLike { MessageId = messageId, MemberId = me.Id, At = clock.GetUtcNow() });
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                // Another tab liked at the same moment: one like stands.
                db.ChangeTracker.Clear();
            }
        }
        var liked = await db.MessageLikes.AnyAsync(l => l.MessageId == messageId && l.MemberId == me.Id);
        await Clients.Group(MemberGroup(me.Id)).MyLike(messageId, liked);
        throttle.Request($"likes:{messageId}", services => SendLikesAsync(services, circleId, messageId));
    }

    private static async Task SendLikesAsync(IServiceProvider services, Guid circleId, long messageId)
    {
        var count = await services.GetRequiredService<CirclooDbContext>().MessageLikes.CountAsync(l => l.MessageId == messageId);
        await services.GetRequiredService<IHubContext<CircleHub, ICircleClient>>().Clients.Group(Group(circleId)).MessageLikes(messageId, count);
    }

    /// <summary>
    /// Hides a message from everyone but the animator, or brings it back. Members drop a hidden one; the animator's
    /// clients keep it, marked hidden.
    /// </summary>
    public async Task HideMessage(long messageId, bool hidden)
    {
        var (circleId, me) = await RoomMemberAsync(animatorOnly: true);
        var message = await db.CircleMessages.FirstOrDefaultAsync(m => m.Id == messageId && m.CircleId == circleId && m.Kind != "system")
            ?? throw new HubException("message-invalid");
        var changed = (message.HiddenAt is not null) != hidden;
        if (changed)
        {
            message.HiddenAt = hidden ? clock.GetUtcNow() : null;
            if (hidden)
            {
                audit.Add(AuditTypes.MessageHidden, me.UserId, detail: new { circleId, messageId });
            }
            await db.SaveChangesAsync();
        }
        var likes = await db.MessageLikes.CountAsync(l => l.MessageId == messageId);
        var view = MessageDto.From(message, likes);
        if (hidden)
        {
            await Clients.Group(Group(circleId)).MessageHidden(messageId);
            await Clients.Group(AnimatorGroup(circleId)).Message(view);
        }
        else
        {
            await Clients.Group(Group(circleId)).Message(view);
        }
    }

    public async Task SetRoomSettings(RoomSettings settings)
    {
        var (circleId, me) = await RoomMemberAsync(animatorOnly: true);
        if (settings is null || !RoomChatModes.IsValid(settings.Chat))
        {
            throw new HubException("settings-invalid");
        }
        var before = me.Circle!.ChatMode;
        await db.Circles.Where(c => c.Id == circleId).ExecuteUpdateAsync(s => s
            .SetProperty(c => c.ChatMode, settings.Chat)
            .SetProperty(c => c.ReactionsOn, settings.Reactions)
            .SetProperty(c => c.PirikooQuiet, settings.PirikooQuiet));
        if (before != settings.Chat && settings.Chat != RoomChatModes.Open)
        {
            audit.Add(settings.Chat == RoomChatModes.Paused ? AuditTypes.ChatPaused : AuditTypes.ChatSlow, me.UserId, detail: new { circleId });
            await db.SaveChangesAsync();
        }
        await Clients.Group(Group(circleId)).RoomSettings(settings);
    }

    /// <summary>Back to the defaults (open chat, reactions on, Pirikoo not quiet) when the activity changes (spec 008 FR-811).</summary>
    private async Task ResetRoomSettingsAsync(Guid circleId)
    {
        var defaults = RoomSettings.Default;
        await db.Circles.Where(c => c.Id == circleId).ExecuteUpdateAsync(s => s
            .SetProperty(c => c.ChatMode, defaults.Chat)
            .SetProperty(c => c.ReactionsOn, defaults.Reactions)
            .SetProperty(c => c.PirikooQuiet, defaults.PirikooQuiet));
        await Clients.Group(Group(circleId)).RoomSettings(defaults);
    }

    #endregion

    #region Hands (T809, spec 009 T921)

    private const int GiveFloorAttempts = 3;

    /// <summary>Raising or lowering one's own hand, per <see cref="HandWindow"/> across tabs (spec 009 FR-921, <c>hand</c>).</summary>
    private const int HandsPerWindow = 6;

    private static readonly TimeSpan HandWindow = TimeSpan.FromSeconds(10);

    public async Task RaiseHand()
    {
        var (circleId, me) = await RoomMemberAsync();
        if (me.Role == Roles.Animator)
        {
            throw new HubException("animator-cannot-raise");
        }
        TakeHand(me);
        // One row per member: parallel raises from several tabs leave one, and the first keeps the place.
        var added = await db.Database.ExecuteSqlAsync($"""
            INSERT INTO "RaisedHands" ("CircleId", "MemberId", "RaisedAt", "HasFloor")
            VALUES ({circleId}, {me.Id}, {clock.GetUtcNow()}, false)
            ON CONFLICT DO NOTHING
            """);
        if (added > 0)
        {
            await BroadcastHandsAsync(circleId);
        }
    }

    /// <summary>
    /// Lowers the caller's own hand, or (animator only) another member's. Lowering the speaker's hand ends their turn:
    /// in a call in Hand to speak their microphone permission goes with it before the change is kept.
    /// </summary>
    public async Task LowerHand(Guid? memberId)
    {
        var (circleId, me) = await RoomMemberAsync();
        var target = memberId ?? me.Id;
        if (target != me.Id && me.Role != Roles.Animator)
        {
            throw new HubException("animator-only");
        }
        if (target == me.Id)
        {
            TakeHand(me);
        }
        var circle = me.Circle!;
        var hadFloor = false;
        var removed = await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            hadFloor = await db.RaisedHands.AnyAsync(h => h.CircleId == circleId && h.MemberId == target && h.HasFloor);
            var deleted = await db.RaisedHands.Where(h => h.CircleId == circleId && h.MemberId == target).ExecuteDeleteAsync();
            if (hadFloor)
            {
                await PutFloorOnCallAsync(circle, tx, [target]);
            }
            await tx.CommitAsync();
            return deleted;
        });
        if (removed > 0)
        {
            await BroadcastHandsAsync(circleId);
        }
        if (hadFloor && FloorOnCall(circle))
        {
            await Clients.Group(MemberGroup(target)).CallNotice(CallNoticeKinds.FloorTaken, me.Id, target);
        }
    }

    public async Task LowerAllHands()
    {
        var (_, me) = await RoomMemberAsync(animatorOnly: true);
        await ClearHandsAsync(me, "lower-all", tryAgainOnCallFailure: true);
    }

    /// <summary>
    /// The previous speaker's hand goes down and <paramref name="memberId"/> gets the floor, in one transaction. Two
    /// animator tabs racing hit the one-floor index: the loser tries again. In a call in Hand to speak the floor is the
    /// microphone: the previous speaker loses it and the new one gets it (never switched on for them) before the change
    /// is kept, and both are told.
    /// </summary>
    public async Task GiveFloor(Guid memberId)
    {
        var (circleId, me) = await RoomMemberAsync(animatorOnly: true);
        var circle = me.Circle!;
        Guid? previous = null;
        var moved = false;
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
                {
                    (previous, moved) = (null, false);
                    await using var tx = await db.Database.BeginTransactionAsync();
                    var hand = await db.RaisedHands.AsNoTracking()
                        .Where(h => h.CircleId == circleId && h.MemberId == memberId && db.CircleMembers.Any(m => m.Id == h.MemberId && m.LeftAt == null))
                        .Select(h => new { h.HasFloor }).FirstOrDefaultAsync() ?? throw new HubException("hand-invalid");
                    if (hand.HasFloor)
                    {
                        return;
                    }
                    previous = await db.RaisedHands.Where(h => h.CircleId == circleId && h.HasFloor).Select(h => (Guid?)h.MemberId).FirstOrDefaultAsync();
                    await db.RaisedHands.Where(h => h.CircleId == circleId && h.HasFloor).ExecuteDeleteAsync();
                    var marked = await db.RaisedHands.Where(h => h.CircleId == circleId && h.MemberId == memberId)
                        .ExecuteUpdateAsync(s => s.SetProperty(h => h.HasFloor, true));
                    if (marked == 0)
                    {
                        throw new HubException("hand-invalid");
                    }
                    // The previous speaker's microphone goes before the new one's comes: never two at once.
                    await PutFloorOnCallAsync(circle, tx, previous is { } before ? [before, memberId] : [memberId]);
                    await tx.CommitAsync();
                    moved = true;
                });
                break;
            }
            catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                if (attempt == GiveFloorAttempts)
                {
                    throw new HubException("try-again");
                }
            }
        }
        await BroadcastHandsAsync(circleId);
        if (moved && FloorOnCall(circle))
        {
            if (previous is { } before)
            {
                await Clients.Group(MemberGroup(before)).CallNotice(CallNoticeKinds.FloorTaken, me.Id, before);
            }
            await Clients.Group(MemberGroup(memberId)).CallNotice(CallNoticeKinds.FloorGiven, me.Id, memberId);
        }
    }

    /// <summary>
    /// Removes every hand and the floor, audits it and tells the circle. Does nothing when no hand is up. In a call in
    /// Hand to speak the floor holder's microphone goes too: before the change is kept when the animator asked for it
    /// (<paramref name="tryAgainOnCallFailure"/>, <c>LowerAllHands</c>), at best effort when an activity changes.
    /// </summary>
    private async Task ClearHandsAsync(CircleMember me, string reason, bool tryAgainOnCallFailure = false)
    {
        var circle = me.Circle!;
        Guid? floor = null;
        var cleared = await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            floor = await db.RaisedHands.Where(h => h.CircleId == circle.Id && h.HasFloor).Select(h => (Guid?)h.MemberId).FirstOrDefaultAsync();
            var deleted = await db.RaisedHands.Where(h => h.CircleId == circle.Id).ExecuteDeleteAsync();
            if (floor is { } holder && tryAgainOnCallFailure)
            {
                await PutFloorOnCallAsync(circle, tx, [holder]);
            }
            await tx.CommitAsync();
            return deleted;
        });
        if (cleared == 0)
        {
            return;
        }
        if (floor is { } speaker && !tryAgainOnCallFailure && FloorOnCall(circle))
        {
            await callPermissions.TryApplyAsync(circle, [speaker]);
        }
        await audit.WriteAsync(AuditTypes.HandsCleared, me.UserId, detail: new { circle = circle.Id, reason, count = cleared });
        await BroadcastHandsAsync(circle.Id);
        if (floor is { } taken && FloorOnCall(circle))
        {
            await Clients.Group(MemberGroup(taken)).CallNotice(CallNoticeKinds.FloorTaken, me.Id, taken);
        }
    }

    /// <summary>
    /// Inside a hands transaction that moved the floor: with a call on in Hand to speak, puts the microphone permission
    /// of <paramref name="concerned"/> on the call server (recomputed from the uncommitted hands). If the call server
    /// fails, the hands change is rolled back, whoever was already updated is put back, and the caller gets
    /// <c>try-again</c> (contracts/hub.md rule 5).
    /// </summary>
    private async Task PutFloorOnCallAsync(Circle circle, IDbContextTransaction tx, Guid[] concerned)
    {
        if (!FloorOnCall(circle))
        {
            return;
        }
        var done = new List<Guid>();
        try
        {
            foreach (var id in concerned)
            {
                await callPermissions.ApplyAsync(circle, id, CancellationToken.None);
                done.Add(id);
            }
        }
        catch (LiveKitException)
        {
            await tx.RollbackAsync();
            await callPermissions.TryApplyAsync(circle, done);
            throw new HubException("try-again");
        }
    }

    /// <summary>Whether the floor is a microphone right now (a call in Hand to speak, on a host with a call server).</summary>
    private bool FloorOnCall(Circle circle) => livekit.Value.Available && CallRules.FloorGivesMicrophone(circle);

    private void TakeHand(CircleMember me)
    {
        if (!limits.TryTake(me.Id, RateLimits.Hand, HandsPerWindow, HandWindow))
        {
            throw new HubException("slow-down");
        }
    }

    private async Task BroadcastHandsAsync(Guid circleId) =>
        await Clients.Group(Group(circleId)).Hands(await Circloo.Api.Circles.Hands.LoadAsync(db, circleId));

    #endregion
}
