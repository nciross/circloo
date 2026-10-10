using Circloo.Api.Circles;
using Circloo.Api.Data;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Circloo.Api.Discussion;

/// <summary>
/// The animator-away rule (spec 009 research R34, founder decision D6): when the circle's last animator connection
/// closes during a call, the call ends <c>Discussion:AwayEndSeconds</c> later (5 minutes by default) unless an
/// animator comes back. Built like spec 008's <see cref="HandsGrace"/>: one timer per circle on
/// <see cref="TimeProvider"/>, in memory only (an API restart forgets it, like the rest of the call's live state).
/// </summary>
public sealed partial class CallAway(IServiceScopeFactory scopes, CirclePresence presence, TimeProvider clock, IOptions<DiscussionOptions> options,
    ILogger<CallAway> log)
{
    private sealed record Pending(ITimer Timer, DateTimeOffset EndsAt);

    private readonly Dictionary<Guid, Pending> _timers = [];
    private readonly Lock _gate = new();

    public TimeSpan Period => TimeSpan.FromSeconds(options.Value.AwayEndSeconds);

    /// <summary>When the circle's call ends if no animator returns; null when no animator-away timer runs.</summary>
    public DateTimeOffset? EndsAt(Guid circleId)
    {
        lock (_gate)
        {
            return _timers.TryGetValue(circleId, out var pending) ? pending.EndsAt : null;
        }
    }

    /// <summary>
    /// Starts the countdown for the circle. A countdown already running keeps its end time, so the animator's tabs
    /// closing one after the other never push the end further away. True when it started now.
    /// </summary>
    public bool Start(Guid circleId)
    {
        lock (_gate)
        {
            if (_timers.ContainsKey(circleId))
            {
                return false;
            }
            ITimer timer = null!;
            timer = clock.CreateTimer(_ => _ = FireAsync(circleId, timer), null, Period, Timeout.InfiniteTimeSpan);
            _timers[circleId] = new Pending(timer, clock.GetUtcNow() + Period);
            return true;
        }
    }

    /// <summary>An animator is back, or the call ended another way. True when a countdown was running.</summary>
    public bool Cancel(Guid circleId)
    {
        Pending? pending;
        lock (_gate)
        {
            if (!_timers.Remove(circleId, out pending))
            {
                return false;
            }
        }
        pending.Timer.Dispose();
        return true;
    }

    private async Task FireAsync(Guid circleId, ITimer timer)
    {
        lock (_gate)
        {
            // Cancelled or replaced meanwhile: this timer no longer decides anything.
            if (!_timers.TryGetValue(circleId, out var pending) || pending.Timer != timer)
            {
                return;
            }
            _timers.Remove(circleId);
        }
        timer.Dispose();
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var services = scope.ServiceProvider;
            var db = services.GetRequiredService<CirclooDbContext>();
            var circle = await db.Circles.FirstOrDefaultAsync(c => c.Id == circleId);
            if (circle is null)
            {
                return;
            }
            var animators = await db.CircleMembers.AsNoTracking()
                .Where(m => m.CircleId == circleId && m.LeftAt == null && m.Role == Roles.Animator)
                .Select(m => m.Id)
                .ToListAsync();
            // An animator who came back at this very moment keeps the call; anything else ends it as if they ended it.
            var back = presence.Online(circleId).Intersect(animators).Any();
            if (back || !await services.GetRequiredService<CallLifecycle>().EndAsync(circle, null, null, CallLifecycle.AnimatorAway))
            {
                // Nothing ended here: everyone still showing the countdown is told it stopped.
                await services.GetRequiredService<IHubContext<CircleHub, ICircleClient>>().Clients.Group(CircleHub.Group(circleId))
                    .Discussion(DiscussionRules.State(circle, services.GetRequiredService<IOptions<LiveKitOptions>>().Value));
            }
        }
        catch (Exception e)
        {
            LogEndFailed(log, e, circleId);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Ending the call of circle {CircleId} after the animator left failed")]
    private static partial void LogEndFailed(ILogger logger, Exception exception, Guid circleId);
}
