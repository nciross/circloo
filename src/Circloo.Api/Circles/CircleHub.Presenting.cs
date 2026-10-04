using Circloo.Api.Data;
using Circloo.Api.Presentations;
using Circloo.Api.Security;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Circloo.Api.Circles;

/// <summary>
/// Presenting in a circle (spec 006 US3, contracts/hub.md). The animator steers; everyone in the circle group gets the
/// full state on every change, so a reload or a late join lands in place. Notes and the next slide go only to the
/// animator's own connections; the audience screen is the animator's extra window: read only, without presence or notes.
/// </summary>
public sealed partial class CircleHub
{
    /// <summary>The animator's connections: notes and the next slide (never participants or the audience screen).</summary>
    public static string AnimatorGroup(Guid circleId) => $"animator:{circleId}";

    /// <summary>The audience screen(s): answer counts and pending people, like the animator, but no notes.</summary>
    public static string AudienceGroup(Guid circleId) => $"audience:{circleId}";

    /// <summary>Marks an audience-screen connection: it only listens, so every action and <c>Enter</c> are refused.</summary>
    private const string AudienceKey = "audience";

    /// <summary>Animator actions are last-write-wins: on a concurrent change the action re-applies to the fresh row.</summary>
    private const int ActAttempts = 5;

    public async Task StartPresentation(Guid presentationId)
    {
        var (circleId, me) = await CurrentAsync(animatorOnly: true);
        if (me.UserId is not { } userId)
        {
            throw new HubException("animator-only");
        }
        // The circle's activity settings apply here too (FR-607).
        if (!me.Circle!.Activities.Contains(ActivityCatalog.Presentation))
        {
            throw new HubException("activity-invalid");
        }
        var deck = await db.Presentations.AsNoTracking().Include(p => p.Slides)
            .FirstOrDefaultAsync(p => p.Id == presentationId && p.OwnerUserId == userId);
        if (deck is null || deck.Status != PresentationStatus.Ready)
        {
            throw new HubException("presentation-not-ready");
        }
        var now = clock.GetUtcNow();
        PresentationSession session;
        try
        {
            session = LiveSession.Start(circleId, deck.Id, me.Id, LiveSession.BuildSnapshot(deck.Slides), deck.ShowPodium, now);
        }
        catch (LiveSessionException e)
        {
            throw new HubException(e.Code);
        }

        // One active session per circle: a new start ends the previous one first.
        await live.EndAsync(s => s.CircleId == circleId, userId, "replaced", clearActivity: false, Context.ConnectionAborted);
        db.PresentationSessions.Add(session);
        audit.Add(AuditTypes.SessionStarted, userId, detail: new { circleId, sessionId = session.Id, slides = LiveSession.Slides(session).Count });
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Another tab started one at the same moment; that one runs.
            throw new HubException("session-conflict");
        }
        await db.Presentations.Where(p => p.Id == deck.Id).ExecuteUpdateAsync(s => s.SetProperty(p => p.LastUsedAt, now));
        await db.Circles.Where(c => c.Id == circleId).ExecuteUpdateAsync(s => s.SetProperty(c => c.CurrentActivity, ActivityCatalog.Presentation));

        var started = await AddMessageAsync(circleId, ActivityCatalog.Presentation, me.Id, "system", $"start:{ActivityCatalog.Presentation}");
        await Clients.Group(Group(circleId)).Activity(new ActivityState(ActivityCatalog.Presentation, me.Id));
        await Clients.Group(Group(circleId)).Message(MessageDto.From(started));
        await live.BroadcastAsync(session, deck.Name, CancellationToken.None);
    }

    public async Task GoToSlide(int position)
    {
        var circleId = await AnimatorCircleAsync();
        await ActAsync(circleId, (s, now) => LiveSession.GoTo(s, position, now));
    }

    public async Task SetBlank(bool blank)
    {
        var circleId = await AnimatorCircleAsync();
        await ActAsync(circleId, (s, _) => LiveSession.SetBlank(s, blank));
    }

    /// <summary>Opens answering on the current question; a quiz locks itself at its deadline (<see cref="QuizClock"/>).</summary>
    public async Task OpenQuestion()
    {
        var circleId = await AnimatorCircleAsync();
        // The quiz clock is set as soon as the opening is saved, before any screen hears of it: even if the animator's
        // connection drops right then, the quiz still locks on time (FR-611).
        await ActAsync(circleId, (s, now) =>
        {
            LiveSession.Open(s, now);
            return true;
        }, saved: s =>
        {
            if (s.Deadline is { } deadline)
            {
                quizClock.Schedule(s.Id, deadline);
            }
        });
    }

    /// <summary>Reveals the current question's results to every screen; answering locks first (spec 006 US5).</summary>
    public async Task RevealResults()
    {
        var circleId = await AnimatorCircleAsync();
        await ActAsync(circleId, (s, now) =>
        {
            LiveSession.Reveal(s, now);
            return true;
        });
    }

    public async Task LockQuestion()
    {
        var circleId = await AnimatorCircleAsync();
        await ActAsync(circleId, (s, now) =>
        {
            LiveSession.Lock(s, now);
            return true;
        });
    }

    /// <summary>
    /// A participant answers the current question (spec 006 US4): one answer per person, which a poll may change while
    /// answering is open and a quiz never may. The session row is read under a share lock, so the animator's lock waits
    /// for an answer in flight and no answer lands after it.
    /// </summary>
    public async Task<MyAnswerView> Answer(Guid slideId, string[] options)
    {
        ThrottleVotes();
        var (circleId, me) = await CurrentAsync();
        if (me.Role == Roles.Animator)
        {
            throw new HubException("animator-cannot-answer");
        }
        // One unit the retrying strategy can replay: the share lock lives as long as the transaction.
        var chosen = await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            var session = await db.PresentationSessions
                .FromSql($"""SELECT * FROM "PresentationSessions" WHERE "CircleId" = {circleId} AND "EndedAt" IS NULL FOR SHARE""")
                .AsNoTracking().FirstOrDefaultAsync() ?? throw new HubException("not-current-question");
            var now = clock.GetUtcNow();
            if (LiveSession.AnswerRefusal(session, slideId, now) is { } refusal)
            {
                throw new HubException(refusal);
            }
            var slide = LiveSession.Current(session);
            var clean = LiveSession.CleanOptions(slide, options) ?? throw new HubException("invalid-options");
            int saved;
            if (slide.Kind == SlideKinds.Quiz)
            {
                // A quiz answer is final: the first one in stands, whatever the tabs or devices.
                bool correct = clean[0] == slide.Correct;
                saved = await db.Database.ExecuteSqlAsync($"""
                    INSERT INTO "SessionAnswers" ("SessionId", "SlideId", "MemberId", "Options", "FirstReceivedAt", "ReceivedAt", "Correct", "Points")
                    VALUES ({session.Id}, {slideId}, {me.Id}, {clean}, {now}, {now}, {correct}, 0)
                    ON CONFLICT ("SessionId", "SlideId", "MemberId") DO NOTHING
                    """);
            }
            else
            {
                // A poll answer may change; it keeps when it first came in.
                saved = await db.Database.ExecuteSqlAsync($"""
                    INSERT INTO "SessionAnswers" ("SessionId", "SlideId", "MemberId", "Options", "FirstReceivedAt", "ReceivedAt", "Points")
                    VALUES ({session.Id}, {slideId}, {me.Id}, {clean}, {now}, {now}, 0)
                    ON CONFLICT ("SessionId", "SlideId", "MemberId") DO UPDATE SET "Options" = EXCLUDED."Options", "ReceivedAt" = EXCLUDED."ReceivedAt"
                    """);
            }
            if (saved == 0)
            {
                throw new HubException("quiz-final");
            }
            await tx.CommitAsync();
            return clean;
        });
        // Correct and points stay on the server until the reveal (FR-612).
        var mine = new MyAnswerView(slideId, chosen);
        await Clients.Group(MemberGroup(me.Id)).MyAnswer(mine);
        RequestAnswerCount(circleId);
        return mine;
    }

    public async Task EndPresentation()
    {
        var (circleId, me) = await CurrentAsync(animatorOnly: true);
        if (!await EndSessionAsync(circleId, me, "ended"))
        {
            throw new HubException("no-session");
        }
        await db.Circles.Where(c => c.Id == circleId).ExecuteUpdateAsync(s => s.SetProperty(c => c.CurrentActivity, (string?)null));
        var ended = await AddMessageAsync(circleId, ActivityCatalog.Presentation, me.Id, "system", $"end:{ActivityCatalog.Presentation}");
        await Clients.Group(Group(circleId)).Activity(new ActivityState(null, me.Id));
        await Clients.Group(Group(circleId)).Message(MessageDto.From(ended));
    }

    /// <summary>
    /// The audience screen (spec 006 US3 #7): the animator's own extra window. It follows the circle without counting
    /// as present and joins the audience group for answer counts; it never receives notes and cannot act.
    /// </summary>
    public async Task<PresentationStateView?> EnterAudience(Guid circleId)
    {
        var me = await MemberAsync(circleId);
        if (me.Role != Roles.Animator)
        {
            throw new HubException("animator-only");
        }
        Context.Items[AudienceKey] = circleId;
        await Groups.AddToGroupAsync(Context.ConnectionId, Group(circleId));
        await Groups.AddToGroupAsync(Context.ConnectionId, AudienceGroup(circleId));
        if (await ActiveSessionAsync(circleId) is not { } active)
        {
            return null;
        }
        RequestAnswerCount(circleId);
        var results = LiveSession.ShowsResults(active.Session) ? await live.ResultsAsync(active.Session) : null;
        return LiveSession.View(active.Session, active.Name, clock.GetUtcNow(), results);
    }

    private async Task<Guid> AnimatorCircleAsync() => (await CurrentAsync(animatorOnly: true)).CircleId;

    /// <summary>
    /// Applies an animator action to the active session and broadcasts the result to every screen. An action that
    /// changes nothing (moving to the slide already shown) is not saved or sent, so it can never close a question.
    /// Once saved, the change reaches every screen even if the animator's connection drops meanwhile. Returns the saved
    /// session, or null when nothing changed.
    /// </summary>
    private async Task<PresentationSession?> ActAsync(Guid circleId, Func<PresentationSession, DateTimeOffset, bool> act, Action<PresentationSession>? saved = null)
    {
        for (var attempt = 1; ; attempt++)
        {
            var session = await db.PresentationSessions.FirstOrDefaultAsync(s => s.CircleId == circleId && s.EndedAt == null)
                ?? throw new HubException("no-session");
            bool changed;
            try
            {
                changed = act(session, clock.GetUtcNow());
            }
            catch (LiveSessionException e)
            {
                throw new HubException(e.Code);
            }
            if (!changed)
            {
                return null;
            }
            session.Version++;
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                // Another animator tab (or the quiz clock) acted first: apply this action on top of its result.
                db.ChangeTracker.Clear();
                if (attempt < ActAttempts)
                {
                    continue;
                }
                throw new HubException("busy");
            }
            saved?.Invoke(session);
            await live.BroadcastAsync(session, ct: CancellationToken.None);
            return session;
        }
    }

    /// <summary>
    /// What a screen entering the room needs to land in place: the state (with live poll results), the notes for the
    /// animator, and a participant's own answer to the open question.
    /// </summary>
    private async Task SendPresentationAsync(Guid circleId, ICircleClient to, CircleMember me)
    {
        if (await ActiveSessionAsync(circleId) is not { } active)
        {
            return;
        }
        var session = active.Session;
        var results = LiveSession.ShowsResults(session) ? await live.ResultsAsync(session) : null;
        await to.PresentationState(LiveSession.View(session, active.Name, clock.GetUtcNow(), results));
        if (me.Role == Roles.Animator)
        {
            await live.SendNotesAsync(to, session);
            return;
        }
        var slideId = LiveSession.Current(session).SlideId;
        var mine = await db.SessionAnswers.AsNoTracking()
            .Where(a => a.SessionId == session.Id && a.SlideId == slideId && a.MemberId == me.Id)
            .Select(a => a.Options).FirstOrDefaultAsync();
        if (mine is not null)
        {
            await to.MyAnswer(new MyAnswerView(slideId, mine));
        }
    }

    /// <summary>Recounts "n of N answered" for the animator and the audience screen, at most 4 times a second.</summary>
    private void RequestAnswerCount(Guid circleId) =>
        throttle.Request($"answers:{circleId}", services => services.GetRequiredService<LiveSessions>().SendAnswersAsync(circleId));

    private async Task<(PresentationSession Session, string Name)?> ActiveSessionAsync(Guid circleId)
    {
        var row = await db.PresentationSessions.AsNoTracking()
            .Where(s => s.CircleId == circleId && s.EndedAt == null)
            .Select(s => new { Session = s, Name = db.Presentations.Where(p => p.Id == s.PresentationId).Select(p => p.Name).FirstOrDefault() })
            .FirstOrDefaultAsync();
        return row is null ? null : (row.Session, row.Name ?? "");
    }

    /// <summary>Ends the circle's running presentation, if any, and tells every screen. Returns whether one was running.</summary>
    private async Task<bool> EndSessionAsync(Guid circleId, CircleMember me, string reason) =>
        (await live.EndAsync(s => s.CircleId == circleId, me.UserId, reason, clearActivity: false, Context.ConnectionAborted)).Count > 0;
}
