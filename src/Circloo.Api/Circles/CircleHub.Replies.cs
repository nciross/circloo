using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Circles;

/// <summary>
/// One-level replies in the circle chat (spec 009 US5, contracts/hub.md). A reply goes through the same send path as
/// <see cref="Say"/>, so the safety filter, the spec 008 limits, slow mode and pause apply to it unchanged. Nothing about
/// a call is written to the chat (FR-930): call status lines are live <c>CallNotice</c> events only.
/// </summary>
public sealed partial class CircleHub
{
    /// <summary>Answers a member message, one level deep. Works with the call off, like the circle chat.</summary>
    public Task Reply(long parentId, string text)
    {
        if (Context.Items[AudienceKey] is Guid)
        {
            throw new HubException("audience-read-only");
        }
        return SendAsync(text, parentId);
    }

    /// <summary>
    /// Hiding a message hides its replies for members too, and showing it again brings them back. The animator keeps them.
    /// </summary>
    private async Task SendReplyVisibilityAsync(Guid circleId, long parentId, bool hidden)
    {
        var replies = await db.CircleMessages.AsNoTracking().Where(m => m.ReplyToId == parentId && m.HiddenAt == null).ToListAsync();
        if (replies.Count == 0)
        {
            return;
        }
        var ids = replies.Select(r => r.Id).ToList();
        var likes = await db.MessageLikes.Where(l => ids.Contains(l.MessageId)).GroupBy(l => l.MessageId)
            .Select(g => new { Id = g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Id, x => x.Count);
        foreach (var reply in replies)
        {
            var view = MessageDto.From(reply, likes.GetValueOrDefault(reply.Id));
            if (hidden)
            {
                await Clients.Group(Group(circleId)).MessageHidden(reply.Id);
                await Clients.Group(AnimatorGroup(circleId)).Message(view);
            }
            else
            {
                await Clients.Group(Group(circleId)).Message(view);
            }
        }
    }
}
