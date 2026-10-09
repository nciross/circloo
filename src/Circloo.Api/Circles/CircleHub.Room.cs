using Circloo.Api.Data;
using Circloo.Api.Security;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Circloo.Api.Circles;

/// <summary>
/// The live room (spec 008, contracts/hub.md): chat controls (US3: likes, hiding, room settings), emoji reactions (US4:
/// grouped bursts, no names) and raised hands (US5: a queue ordered by <c>RaisedAt</c> then <c>Id</c>, at most one
/// person with the floor). Every method goes
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

    #region Reactions (T807)

    /// <summary>Everyone, the animator included, sends at most this many reactions per <see cref="ReactionWindow"/> (FR-817).</summary>
    private const int ReactionsPerWindow = 5;

    private static readonly TimeSpan ReactionWindow = TimeSpan.FromSeconds(10);

    /// <summary>
    /// One emoji reaction. Only an unknown kind is refused: when reactions can't be sent now, or the caller is over the
    /// limit, it is dropped without a word (FR-817). Counted in the circle's <see cref="ReactionBuffer"/>, never with the
    /// sender: the burst carries counts only.
    /// </summary>
    public async Task React(string kind)
    {
        var (circleId, me) = await RoomMemberAsync();
        if (!ReactionKinds.IsValid(kind))
        {
            throw new HubException("reaction-invalid");
        }
        if (!await ReactionAllowedAsync(circleId, me) || !limits.TryTake(me.Id, "reaction", ReactionsPerWindow, ReactionWindow))
        {
            return;
        }
        reactions.Add(circleId, kind);
    }

    /// <summary>
    /// The one rule for whether a reaction goes out now: the room has reactions on and a presentation is running
    /// (FR-815). Keep every condition here, so a new place to react (a call, spec 009) only changes this rule. Where the
    /// counts are kept is the flush's business: only a running presentation stores totals (FR-818).
    /// </summary>
    private async Task<bool> ReactionAllowedAsync(Guid circleId, CircleMember me) =>
        me.Circle!.ReactionsOn && await db.PresentationSessions.AnyAsync(s => s.CircleId == circleId && s.EndedAt == null);

    #endregion

    #region Hands (T809)

    private const int GiveFloorAttempts = 3;

    public async Task RaiseHand()
    {
        var (circleId, me) = await RoomMemberAsync();
        if (me.Role == Roles.Animator)
        {
            throw new HubException("animator-cannot-raise");
        }
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

    /// <summary>Lowers the caller's own hand, or (animator only) another member's. Lowering the speaker's hand ends their turn.</summary>
    public async Task LowerHand(Guid? memberId)
    {
        var (circleId, me) = await RoomMemberAsync();
        var target = memberId ?? me.Id;
        if (target != me.Id && me.Role != Roles.Animator)
        {
            throw new HubException("animator-only");
        }
        var removed = await db.RaisedHands.Where(h => h.CircleId == circleId && h.MemberId == target).ExecuteDeleteAsync();
        if (removed > 0)
        {
            await BroadcastHandsAsync(circleId);
        }
    }

    public async Task LowerAllHands()
    {
        var (circleId, me) = await RoomMemberAsync(animatorOnly: true);
        await ClearHandsAsync(circleId, me.UserId, "lower-all");
    }

    /// <summary>
    /// The previous speaker's hand goes down and <paramref name="memberId"/> gets the floor, in one transaction. Two
    /// animator tabs racing hit the one-floor index: the loser tries again.
    /// </summary>
    public async Task GiveFloor(Guid memberId)
    {
        var (circleId, _) = await RoomMemberAsync(animatorOnly: true);
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
                {
                    await using var tx = await db.Database.BeginTransactionAsync();
                    var hand = await db.RaisedHands.AsNoTracking()
                        .Where(h => h.CircleId == circleId && h.MemberId == memberId && db.CircleMembers.Any(m => m.Id == h.MemberId && m.LeftAt == null))
                        .Select(h => new { h.HasFloor }).FirstOrDefaultAsync() ?? throw new HubException("hand-invalid");
                    if (hand.HasFloor)
                    {
                        return;
                    }
                    await db.RaisedHands.Where(h => h.CircleId == circleId && h.HasFloor).ExecuteDeleteAsync();
                    var marked = await db.RaisedHands.Where(h => h.CircleId == circleId && h.MemberId == memberId)
                        .ExecuteUpdateAsync(s => s.SetProperty(h => h.HasFloor, true));
                    if (marked == 0)
                    {
                        throw new HubException("hand-invalid");
                    }
                    await tx.CommitAsync();
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
    }

    /// <summary>Removes every hand and the floor, audits it and tells the circle. Does nothing when no hand is up.</summary>
    private async Task ClearHandsAsync(Guid circleId, Guid? userId, string reason)
    {
        var cleared = await db.RaisedHands.Where(h => h.CircleId == circleId).ExecuteDeleteAsync();
        if (cleared == 0)
        {
            return;
        }
        await audit.WriteAsync(AuditTypes.HandsCleared, userId, detail: new { circle = circleId, reason, count = cleared });
        await BroadcastHandsAsync(circleId);
    }

    private async Task BroadcastHandsAsync(Guid circleId) =>
        await Clients.Group(Group(circleId)).Hands(await Circloo.Api.Circles.Hands.LoadAsync(db, circleId));

    #endregion
}
