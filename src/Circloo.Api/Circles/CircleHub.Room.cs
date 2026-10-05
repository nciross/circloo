using Circloo.Api.Data;
using Circloo.Api.Security;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Circloo.Api.Circles;

/// <summary>
/// The live room's chat controls (spec 008 US3, contracts/hub.md): likes, hiding and the room settings. The animator's
/// actions are checked against the member's role in the database on every call; a hidden message only ever reaches the
/// animator's connections.
/// </summary>
public sealed partial class CircleHub
{
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
        if (!limits.TryTake(me.Id, "message", MessagesPerWindow, MessageWindow))
        {
            throw new HubException("slow-down");
        }
        // Taken last, so two tabs sending at the same moment cannot both pass the slow-mode check.
        if (mode == RoomChatModes.Slow && !limits.TryTake(me.Id, "slow", 1, SlowEvery))
        {
            throw new HubException($"slow-mode:{(int)SlowEvery.TotalSeconds}");
        }
    }

    /// <summary>Toggles the caller's like. Never on one's own message or a hidden one; the count is recomputed from the rows.</summary>
    public async Task LikeMessage(long messageId)
    {
        var (circleId, me) = await CurrentAsync();
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
        var (circleId, me) = await CurrentAsync(animatorOnly: true);
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
        var (circleId, me) = await CurrentAsync(animatorOnly: true);
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
}
