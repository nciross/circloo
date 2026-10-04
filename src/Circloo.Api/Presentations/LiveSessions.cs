using System.Linq.Expressions;
using System.Security.Claims;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Security;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Presentations;

public sealed record EndedSession(Guid SessionId, Guid CircleId);

/// <summary>
/// Running sessions seen from outside the presenting actions: who may load a slide picture, and ending sessions
/// (the animator ends or switches activity, the deck is deleted or purged, the circle closes).
/// </summary>
public sealed class LiveSessions(CirclooDbContext db, IHubContext<CircleHub, ICircleClient> hub, AuditLog audit, TimeProvider clock, CirclePresence presence)
{
    /// <summary>
    /// Sends the session's state to every screen in the circle (with live results for polls that show them), the notes
    /// and next slide to the animator's connections, and, on a question, the answer count to the animator and audience.
    /// </summary>
    public async Task BroadcastAsync(PresentationSession session, string? name = null, CancellationToken ct = default)
    {
        name ??= await db.Presentations.Where(p => p.Id == session.PresentationId).Select(p => p.Name).FirstOrDefaultAsync(ct) ?? "";
        var results = LiveSession.ShowsResults(session) ? await ResultsAsync(session, ct) : null;
        await hub.Clients.Group(CircleHub.Group(session.CircleId)).PresentationState(LiveSession.View(session, name, clock.GetUtcNow(), results));
        await SendNotesAsync(hub.Clients.Group(CircleHub.AnimatorGroup(session.CircleId)), session, ct);
        if (LiveSession.AsksNow(session))
        {
            await SendCountAsync(session, ct);
        }
    }

    /// <summary>The current slide's notes and a preview of the next one, for the animator only.</summary>
    public async Task SendNotesAsync(ICircleClient to, PresentationSession session, CancellationToken ct = default)
    {
        var slide = LiveSession.Current(session);
        var notes = slide.HasNotes ? await db.Slides.Where(s => s.Id == slide.SlideId).Select(s => s.Notes).FirstOrDefaultAsync(ct) : null;
        await to.PresenterNotes(slide.SlideId, notes, LiveSession.Next(session));
    }

    /// <summary>
    /// After answers changed: the count to the animator and the audience screen, and for a poll that shows results live
    /// the whole state with its results to everyone. Nothing about counts reaches participants otherwise (FR-612).
    /// </summary>
    public async Task SendAnswersAsync(Guid circleId, CancellationToken ct = default)
    {
        var session = await db.PresentationSessions.AsNoTracking().FirstOrDefaultAsync(s => s.CircleId == circleId && s.EndedAt == null, ct);
        if (session is null || !LiveSession.AsksNow(session))
        {
            return;
        }
        await SendCountAsync(session, ct);
        if (LiveSession.ShowsLiveResults(session))
        {
            var name = await db.Presentations.Where(p => p.Id == session.PresentationId).Select(p => p.Name).FirstOrDefaultAsync(ct) ?? "";
            await hub.Clients.Group(CircleHub.Group(session.CircleId))
                .PresentationState(LiveSession.View(session, name, clock.GetUtcNow(), await ResultsAsync(session, ct)));
        }
    }

    /// <summary>
    /// "n of N answered": N is the participants in the room plus anyone who answered and left; pending lists who in the
    /// room has not answered yet (member ids, for their characters).
    /// </summary>
    public async Task<AnswerCountView> CountAsync(PresentationSession session, CancellationToken ct = default)
    {
        var slideId = LiveSession.Current(session).SlideId;
        var answered = await db.SessionAnswers.Where(a => a.SessionId == session.Id && a.SlideId == slideId).Select(a => a.MemberId).ToListAsync(ct);
        var online = presence.Online(session.CircleId);
        var participants = await db.CircleMembers
            .Where(m => m.CircleId == session.CircleId && m.LeftAt == null && m.Role == Roles.Participant && online.Contains(m.Id))
            .Select(m => m.Id).ToListAsync(ct);
        var pending = participants.Except(answered).ToList();
        return new AnswerCountView(slideId, answered.Count, answered.Union(participants).Count(), pending);
    }

    private async Task SendCountAsync(PresentationSession session, CancellationToken ct)
    {
        var count = await CountAsync(session, ct);
        await hub.Clients.Groups(CircleHub.AnimatorGroup(session.CircleId), CircleHub.AudienceGroup(session.CircleId)).AnswerCount(count);
    }

    /// <summary>
    /// The current question's results: counts while live, and once revealed the correct option (quiz) and the spotlight
    /// on the first answer, named only when the question shows who was first.
    /// </summary>
    public async Task<ResultsView> ResultsAsync(PresentationSession session, CancellationToken ct = default)
    {
        var slide = LiveSession.Current(session);
        var answers = await db.SessionAnswers.AsNoTracking()
            .Where(a => a.SessionId == session.Id && a.SlideId == slide.SlideId)
            .Select(a => new AnswerRow(a.Seq, a.MemberId, a.Options, a.FirstReceivedAt, a.Correct))
            .ToListAsync(ct);
        if (!LiveSession.Revealed(session))
        {
            return ResultsBuilder.Build(slide, [.. answers.Select(a => a.Options)]);
        }
        var ids = answers.Select(a => a.MemberId).ToList();
        var members = await db.CircleMembers.AsNoTracking().Where(m => ids.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id, m => (m.Name, m.Character), ct);
        return ResultsBuilder.Reveal(slide, answers, session.OpenedAt, members);
    }

    /// <summary>
    /// A member of a circle presenting this deck may load a slide once it has been shown there (up to <c>MaxPosition</c>),
    /// so nobody peeks ahead; guests included.
    /// </summary>
    public async Task<bool> MayViewAsync(ClaimsPrincipal user, Guid presentationId, Guid slideId, CancellationToken ct)
    {
        var sessions = await db.PresentationSessions.AsNoTracking()
            .Where(s => s.PresentationId == presentationId && s.EndedAt == null)
            .ToListAsync(ct);
        foreach (var session in sessions.Where(s => LiveSession.HasShown(s, slideId)))
        {
            if (await CircleAccess.ResolveAsync(db, user, session.CircleId, ct) is { } member && member.Circle!.IsOpen(clock.GetUtcNow()))
            {
                return true;
            }
        }
        return false;
    }

    /// <summary>The presentation is being deleted or purged: circles presenting it leave it together.</summary>
    public Task EndForPresentationAsync(Guid presentationId, Guid? userId, CancellationToken ct) =>
        EndAsync(s => s.PresentationId == presentationId, userId, "presentation-deleted", clearActivity: true, ct);

    /// <summary>The circle closed: its presentation ends with it.</summary>
    public Task EndForCircleAsync(Guid circleId, Guid? userId, CancellationToken ct) =>
        EndAsync(s => s.CircleId == circleId, userId, "circle-closed", clearActivity: true, ct);

    /// <summary>
    /// Ends the matching running sessions, audits them and tells each circle which session ended (screens ignore a late
    /// event about another session). With <paramref name="clearActivity"/>, circles still on the presentation activity
    /// go back to none; the hub clears it itself when the animator ends or switches.
    /// </summary>
    public async Task<IReadOnlyList<EndedSession>> EndAsync(Expression<Func<PresentationSession, bool>> which, Guid? userId, string reason,
        bool clearActivity, CancellationToken ct)
    {
        var running = await db.PresentationSessions.Where(s => s.EndedAt == null).Where(which)
            .Select(s => new EndedSession(s.Id, s.CircleId))
            .ToListAsync(ct);
        if (running.Count == 0)
        {
            return running;
        }
        var now = clock.GetUtcNow();
        var ids = running.Select(r => r.SessionId).ToList();
        var circles = running.Select(r => r.CircleId).Distinct().ToList();
        await db.PresentationSessions.Where(s => ids.Contains(s.Id))
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.EndedAt, now).SetProperty(x => x.Version, x => x.Version + 1), ct);
        List<Guid> cleared = [];
        if (clearActivity)
        {
            cleared = await db.Circles.Where(c => circles.Contains(c.Id) && c.CurrentActivity == ActivityCatalog.Presentation).Select(c => c.Id).ToListAsync(ct);
            await db.Circles.Where(c => cleared.Contains(c.Id)).ExecuteUpdateAsync(s => s.SetProperty(c => c.CurrentActivity, (string?)null), ct);
        }
        foreach (var r in running)
        {
            audit.Add(AuditTypes.SessionEnded, userId, detail: new { circleId = r.CircleId, sessionId = r.SessionId, reason });
        }
        await db.SaveChangesAsync(ct);
        foreach (var r in running)
        {
            await hub.Clients.Group(CircleHub.Group(r.CircleId)).PresentationEnded(r.SessionId);
        }
        foreach (var circleId in cleared)
        {
            await hub.Clients.Group(CircleHub.Group(circleId)).Activity(new ActivityState(null, null));
        }
        return running;
    }
}
