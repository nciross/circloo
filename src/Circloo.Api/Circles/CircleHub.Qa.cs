using Circloo.Api.Data;
using Circloo.Api.Decide;
using Circloo.Api.Security;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Circloo.Api.Circles;

/// <summary>
/// Q&A (spec 007 US2, contracts/hub.md): participants ask and upvote; the animator answers, reopens, hides and decides
/// whether questions may be anonymous. Every text passes the safety filter; anonymity is never broken in a payload.
/// </summary>
public sealed partial class CircleHub
{
    private const string AsksKey = "asks";

    /// <summary>At most this many questions per connection per minute (spec 007 FR-720).</summary>
    private const int AsksPerMinute = 5;

    public async Task SetQaAnonymous(bool allow)
    {
        var (circleId, _) = await QaAnimatorAsync();
        await db.Circles.Where(c => c.Id == circleId).ExecuteUpdateAsync(s => s.SetProperty(c => c.QaAllowAnonymous, allow));
        await Clients.Group(Group(circleId)).QaSettings(allow);
    }

    public async Task<QaQuestionView> Ask(string text, bool anonymous)
    {
        var (circleId, me) = await QaMemberAsync();
        if (me.Role == Roles.Animator)
        {
            throw new HubException("animator-cannot-answer");
        }
        if (anonymous && !me.Circle!.QaAllowAnonymous)
        {
            throw new HubException("anonymous-off");
        }
        Limit(AsksKey, AsksPerMinute, TimeSpan.FromMinutes(1));
        var (clean, error) = DecideRules.QaText(text, DecideRules.QaQuestionMax, safety.IsMessageSafe);
        if (error is not null)
        {
            throw new HubException(error);
        }
        var question = new QaQuestion
        {
            CircleId = circleId, AuthorMemberId = me.Id, Anonymous = anonymous, Text = clean!, State = QaStates.Open, CreatedAt = clock.GetUtcNow(),
        };
        db.QaQuestions.Add(question);
        await db.SaveChangesAsync();
        await qa.BroadcastAsync(question.Id);
        return Decide.Qa.View(question, anonymous ? null : me, mine: true);
    }

    /// <summary>Toggles the caller's upvote; never on one's own question; the count is recomputed from the rows.</summary>
    public async Task Upvote(long questionId)
    {
        ThrottleVotes();
        var (circleId, me) = await QaMemberAsync();
        if (me.Role == Roles.Animator)
        {
            throw new HubException("animator-cannot-answer");
        }
        var question = await db.QaQuestions.AsNoTracking().FirstOrDefaultAsync(q => q.Id == questionId && q.CircleId == circleId)
            ?? throw new HubException("question-invalid");
        if (question.State == QaStates.Hidden)
        {
            throw new HubException("question-closed");
        }
        if (question.AuthorMemberId == me.Id)
        {
            throw new HubException("own-question");
        }

        var removed = await db.QaUpvotes.Where(u => u.QuestionId == questionId && u.MemberId == me.Id).ExecuteDeleteAsync();
        var on = removed == 0;
        if (on)
        {
            db.QaUpvotes.Add(new QaUpvote { QuestionId = questionId, MemberId = me.Id });
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                // Another tab upvoted at the same moment: one upvote stands.
                db.ChangeTracker.Clear();
            }
        }
        // Recomputed from the rows, so concurrent toggles can never drift the count.
        await db.QaQuestions.Where(q => q.Id == questionId)
            .ExecuteUpdateAsync(s => s.SetProperty(q => q.Upvotes, q => db.QaUpvotes.Count(u => u.QuestionId == q.Id)));
        await Clients.Group(MemberGroup(me.Id)).MyUpvote(questionId, on);
        throttle.Request($"qa:{questionId}", services => services.GetRequiredService<Decide.Qa>().BroadcastAsync(questionId));
    }

    public async Task AnswerQuestion(long questionId, string? answer)
    {
        var (circleId, _) = await QaAnimatorAsync();
        var question = await QuestionAsync(circleId, questionId);
        string? clean = null;
        if (!string.IsNullOrWhiteSpace(answer))
        {
            var (text, error) = DecideRules.QaText(answer, DecideRules.QaAnswerMax, safety.IsMessageSafe);
            clean = text ?? throw new HubException(error!);
        }
        question.State = QaStates.Answered;
        question.Answer = clean;
        question.AnsweredAt = clock.GetUtcNow();
        await db.SaveChangesAsync();
        await qa.BroadcastAsync(questionId);
    }

    public async Task ReopenQuestion(long questionId)
    {
        var (circleId, _) = await QaAnimatorAsync();
        var question = await QuestionAsync(circleId, questionId);
        question.State = QaStates.Open;
        question.AnsweredAt = null;
        await db.SaveChangesAsync();
        await qa.BroadcastAsync(questionId);
    }

    /// <summary>Hides an unkind question from everyone but the animator, or brings it back.</summary>
    public async Task HideQuestion(long questionId, bool hidden)
    {
        var (circleId, me) = await QaAnimatorAsync();
        var question = await QuestionAsync(circleId, questionId);
        question.State = hidden ? QaStates.Hidden : question.AnsweredAt is not null ? QaStates.Answered : QaStates.Open;
        if (hidden)
        {
            audit.Add(AuditTypes.QaHidden, me.UserId, detail: new { circleId, questionId });
        }
        await db.SaveChangesAsync();
        await qa.BroadcastAsync(questionId, justHidden: hidden);
    }

    /// <summary>A member of a circle running Q&A.</summary>
    private async Task<(Guid CircleId, CircleMember Me)> QaMemberAsync()
    {
        var (circleId, me) = await CurrentAsync();
        if (me.Circle!.CurrentActivity != ActivityCatalog.Qa)
        {
            throw new HubException("activity-invalid");
        }
        return (circleId, me);
    }

    private async Task<(Guid CircleId, CircleMember Me)> QaAnimatorAsync()
    {
        var (circleId, me) = await QaMemberAsync();
        if (me.Role != Roles.Animator)
        {
            throw new HubException("animator-only");
        }
        return (circleId, me);
    }

    private async Task<QaQuestion> QuestionAsync(Guid circleId, long questionId) =>
        await db.QaQuestions.FirstOrDefaultAsync(q => q.Id == questionId && q.CircleId == circleId) ?? throw new HubException("question-invalid");

    /// <summary>A sliding-window rate limit per connection: at most <paramref name="max"/> calls per <paramref name="window"/>.</summary>
    private void Limit(string key, int max, TimeSpan window)
    {
        var now = clock.GetUtcNow();
        var recent = Context.Items[key] as Queue<DateTimeOffset> ?? new Queue<DateTimeOffset>();
        while (recent.Count > 0 && now - recent.Peek() >= window)
        {
            recent.Dequeue();
        }
        if (recent.Count >= max)
        {
            throw new HubException("slow-down");
        }
        recent.Enqueue(now);
        Context.Items[key] = recent;
    }
}
