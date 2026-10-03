using Circloo.Api.Data;
using Circloo.Api.Presentations;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Circles;

/// <summary>
/// Presenting in a circle (spec 006 US3, contracts/hub.md). The animator steers; everyone in the circle group gets the
/// full state on every change, so a reload or a late join lands in place. Notes and the next slide go only to the
/// animator's own connections; the audience screen is the animator's extra window, without presence or notes.
/// </summary>
public sealed partial class CircleHub
{
    /// <summary>The animator's connections: notes and the next slide (never participants or the audience screen).</summary>
    public static string AnimatorGroup(Guid circleId) => $"animator:{circleId}";

    /// <summary>The audience screen(s): answer counts and pending people, like the animator, but no notes.</summary>
    public static string AudienceGroup(Guid circleId) => $"audience:{circleId}";

    /// <summary>Animator actions are last-write-wins: on a concurrent change the action re-applies to the fresh row.</summary>
    private const int ActAttempts = 3;

    public async Task StartPresentation(Guid presentationId)
    {
        var (circleId, me) = await CurrentAsync(animatorOnly: true);
        if (me.UserId is not { } userId)
        {
            throw new HubException("animator-only");
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
        await EndSessionAsync(circleId, me, announce: false);
        db.PresentationSessions.Add(session);
        audit.Add("session.started", userId, detail: new { circleId, sessionId = session.Id, slides = LiveSession.Slides(session).Count });
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Another tab started one at the same moment; that one runs.
            throw new HubException("session-conflict");
        }
        await db.Presentations.Where(p => p.Id == deck.Id).ExecuteUpdateAsync(s => s.SetProperty(p => p.LastUsedAt, now));
        await db.Circles.Where(c => c.Id == circleId).ExecuteUpdateAsync(s => s.SetProperty(c => c.CurrentActivity, ActivityCatalog.Presentation));

        var started = await AddMessageAsync(circleId, ActivityCatalog.Presentation, me.Id, "system", $"start:{ActivityCatalog.Presentation}");
        await Clients.Group(Group(circleId)).Activity(new ActivityState(ActivityCatalog.Presentation, me.Id));
        await Clients.Group(Group(circleId)).Message(MessageDto.From(started));
        await BroadcastAsync(circleId, session, deck.Name);
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

    public async Task EndPresentation()
    {
        var (circleId, me) = await CurrentAsync(animatorOnly: true);
        if (!await EndSessionAsync(circleId, me))
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
    /// as present, and joins the audience group for answer counts; it never receives notes.
    /// </summary>
    public async Task<PresentationStateView?> EnterAudience(Guid circleId)
    {
        var me = await MemberAsync(circleId);
        if (me.Role != Roles.Animator)
        {
            throw new HubException("animator-only");
        }
        Context.Items[CircleKey] = circleId;
        await Groups.AddToGroupAsync(Context.ConnectionId, Group(circleId));
        await Groups.AddToGroupAsync(Context.ConnectionId, AudienceGroup(circleId));
        var active = await ActiveSessionAsync(circleId);
        return active is null ? null : LiveSession.View(active.Value.Session, active.Value.Name, clock.GetUtcNow());
    }

    private async Task<Guid> AnimatorCircleAsync() => (await CurrentAsync(animatorOnly: true)).CircleId;

    /// <summary>Applies an animator action to the active session and broadcasts the result to every screen.</summary>
    private async Task ActAsync(Guid circleId, Action<PresentationSession, DateTimeOffset> act)
    {
        for (var attempt = 1; ; attempt++)
        {
            var session = await db.PresentationSessions.FirstOrDefaultAsync(s => s.CircleId == circleId && s.EndedAt == null)
                ?? throw new HubException("no-session");
            try
            {
                act(session, clock.GetUtcNow());
            }
            catch (LiveSessionException e)
            {
                throw new HubException(e.Code);
            }
            session.Version++;
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException) when (attempt < ActAttempts)
            {
                // Another animator tab acted first: apply this action on top of its result.
                db.ChangeTracker.Clear();
                continue;
            }
            var name = await db.Presentations.Where(p => p.Id == session.PresentationId).Select(p => p.Name).FirstOrDefaultAsync() ?? "";
            await BroadcastAsync(circleId, session, name);
            return;
        }
    }

    private async Task BroadcastAsync(Guid circleId, PresentationSession session, string name)
    {
        await Clients.Group(Group(circleId)).PresentationState(LiveSession.View(session, name, clock.GetUtcNow()));
        await SendNotesAsync(Clients.Group(AnimatorGroup(circleId)), session);
    }

    private async Task SendPresentationAsync(Guid circleId, ICircleClient to, bool notes)
    {
        if (await ActiveSessionAsync(circleId) is not { } active)
        {
            return;
        }
        await to.PresentationState(LiveSession.View(active.Session, active.Name, clock.GetUtcNow()));
        if (notes)
        {
            await SendNotesAsync(to, active.Session);
        }
    }

    private async Task SendNotesAsync(ICircleClient to, PresentationSession session)
    {
        var slide = LiveSession.Current(session);
        var notes = slide.HasNotes ? await db.Slides.Where(s => s.Id == slide.SlideId).Select(s => s.Notes).FirstOrDefaultAsync() : null;
        await to.PresenterNotes(slide.SlideId, notes, LiveSession.Next(session));
    }

    private async Task<(PresentationSession Session, string Name)?> ActiveSessionAsync(Guid circleId)
    {
        var row = await db.PresentationSessions.AsNoTracking()
            .Where(s => s.CircleId == circleId && s.EndedAt == null)
            .Select(s => new { Session = s, Name = db.Presentations.Where(p => p.Id == s.PresentationId).Select(p => p.Name).FirstOrDefault() })
            .FirstOrDefaultAsync();
        return row is null ? null : (row.Session, row.Name ?? "");
    }

    /// <summary>Ends the circle's running presentation, if any, and tells every screen. Returns whether one was running.</summary>
    private async Task<bool> EndSessionAsync(Guid circleId, CircleMember me, bool announce = true)
    {
        var now = clock.GetUtcNow();
        var ended = await db.PresentationSessions.Where(s => s.CircleId == circleId && s.EndedAt == null)
            .Select(s => s.Id).ToListAsync();
        if (ended.Count == 0)
        {
            return false;
        }
        await db.PresentationSessions.Where(s => ended.Contains(s.Id))
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.EndedAt, now).SetProperty(x => x.Version, x => x.Version + 1));
        foreach (var id in ended)
        {
            audit.Add("session.ended", me.UserId, detail: new { circleId, sessionId = id });
        }
        await db.SaveChangesAsync();
        if (announce)
        {
            await Clients.Group(Group(circleId)).PresentationEnded();
        }
        return true;
    }
}
