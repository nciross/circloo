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
public sealed class LiveSessions(CirclooDbContext db, IHubContext<CircleHub, ICircleClient> hub, AuditLog audit, TimeProvider clock)
{
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
