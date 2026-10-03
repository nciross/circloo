using Circloo.Api.Circles;
using Circloo.Api.Data;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Decide;

/// <summary>
/// Q&A seen from outside one hub call (spec 007 US2, contracts/hub.md): views, ordering and who receives what. The author
/// of an anonymous question is never sent to anyone, the animator included; hidden questions reach the animator only.
/// </summary>
public sealed class Qa(CirclooDbContext db, IHubContext<CircleHub, ICircleClient> hub)
{
    public static QaQuestionView View(QaQuestion q, CircleMember? author, bool mine = false, bool upvotedByMe = false) =>
        new(q.Id, q.Text, q.Anonymous || author is null ? null : new QaAuthorView(author.Id, author.Name, author.Character),
            q.Upvotes, q.State, q.Answer, q.CreatedAt, q.AnsweredAt, mine, upvotedByMe);

    /// <summary>Most upvoted first, newest first on a tie; answered after open; hidden last (the animator's view only).</summary>
    public static IEnumerable<QaQuestion> Ordered(IEnumerable<QaQuestion> questions) =>
        questions.OrderBy(q => q.State switch { QaStates.Open => 0, QaStates.Answered => 1, _ => 2 })
            .ThenByDescending(q => q.Upvotes).ThenByDescending(q => q.CreatedAt);

    /// <summary>Sends a question's current state: to everyone, or for a hidden one, removal to everyone then the full row to the animator.</summary>
    public async Task BroadcastAsync(long questionId, bool justHidden = false, CancellationToken ct = default)
    {
        var q = await db.QaQuestions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == questionId, ct);
        if (q is null)
        {
            return;
        }
        var author = q.Anonymous ? null : await db.CircleMembers.AsNoTracking().FirstOrDefaultAsync(m => m.Id == q.AuthorMemberId, ct);
        var view = View(q, author);
        if (q.State == QaStates.Hidden)
        {
            if (justHidden)
            {
                await hub.Clients.Group(CircleHub.Group(q.CircleId)).QaRemoved(q.Id);
            }
            await hub.Clients.Group(CircleHub.AnimatorGroup(q.CircleId)).QaChanged(view);
            return;
        }
        await hub.Clients.Group(CircleHub.Group(q.CircleId)).QaChanged(view);
    }

    /// <summary>The circle view's Q&A part: visible questions (hidden ones for the animator too), with this member's marks.</summary>
    public async Task<QaView> ForMemberAsync(Circle circle, CircleMember me, CancellationToken ct = default)
    {
        var animator = me.Role == Roles.Animator;
        var questions = await db.QaQuestions.AsNoTracking()
            .Where(q => q.CircleId == circle.Id && (animator || q.State != QaStates.Hidden))
            .ToListAsync(ct);
        var authorIds = questions.Where(q => !q.Anonymous).Select(q => q.AuthorMemberId).Distinct().ToList();
        var authors = await db.CircleMembers.AsNoTracking().Where(m => authorIds.Contains(m.Id)).ToDictionaryAsync(m => m.Id, ct);
        var ids = questions.Select(q => q.Id).ToList();
        var mine = (await db.QaUpvotes.AsNoTracking().Where(u => u.MemberId == me.Id && ids.Contains(u.QuestionId)).Select(u => u.QuestionId).ToListAsync(ct)).ToHashSet();
        return new QaView(circle.QaAllowAnonymous, [.. Ordered(questions).Select(q =>
            View(q, authors.GetValueOrDefault(q.AuthorMemberId), mine: q.AuthorMemberId == me.Id, upvotedByMe: mine.Contains(q.Id)))]);
    }
}
