using System.Security.Claims;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Security;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Presentations;

/// <summary>Running sessions seen from outside the hub: who may load a slide picture, and ending sessions when a deck goes.</summary>
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

    /// <summary>Ends every session running this presentation (it is being deleted) and takes those circles out of it.</summary>
    public async Task EndForPresentationAsync(Guid presentationId, Guid? userId, CancellationToken ct)
    {
        var running = await db.PresentationSessions
            .Where(s => s.PresentationId == presentationId && s.EndedAt == null)
            .Select(s => new { s.Id, s.CircleId })
            .ToListAsync(ct);
        if (running.Count == 0)
        {
            return;
        }
        var now = clock.GetUtcNow();
        var ids = running.Select(r => r.Id).ToList();
        var circles = running.Select(r => r.CircleId).ToList();
        await db.PresentationSessions.Where(s => ids.Contains(s.Id))
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.EndedAt, now).SetProperty(x => x.Version, x => x.Version + 1), ct);
        await db.Circles.Where(c => circles.Contains(c.Id) && c.CurrentActivity == ActivityCatalog.Presentation)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.CurrentActivity, (string?)null), ct);
        foreach (var r in running)
        {
            audit.Add("session.ended", userId, detail: new { circleId = r.CircleId, sessionId = r.Id, reason = "presentation-deleted" });
        }
        await db.SaveChangesAsync(ct);
        foreach (var circleId in circles)
        {
            await hub.Clients.Group(CircleHub.Group(circleId)).PresentationEnded();
            await hub.Clients.Group(CircleHub.Group(circleId)).Activity(new ActivityState(null, null));
        }
    }
}
