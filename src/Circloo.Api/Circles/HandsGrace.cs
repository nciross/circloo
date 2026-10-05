using System.Collections.Concurrent;
using Circloo.Api.Data;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Circles;

/// <summary>
/// Lowers a member's hand a little after their last connection closed, unless they came back (spec 008 US5): a
/// reload or a network blip keeps their place in the queue. Timers live in memory, like presence.
/// </summary>
public sealed partial class HandsGrace(IServiceScopeFactory scopes, CirclePresence presence, TimeProvider clock, ILogger<HandsGrace> log)
{
    public static readonly TimeSpan Period = TimeSpan.FromSeconds(30);

    private readonly ConcurrentDictionary<Guid, ITimer> _timers = new();

    public void Schedule(Guid circleId, Guid memberId)
    {
        ITimer timer = null!;
        timer = clock.CreateTimer(_ => _ = FireAsync(circleId, memberId, timer), null, Period, Timeout.InfiniteTimeSpan);
        _timers.AddOrUpdate(memberId, timer, (_, previous) =>
        {
            previous.Dispose();
            return timer;
        });
    }

    /// <summary>The member is back: their hand stays.</summary>
    public void Cancel(Guid memberId)
    {
        if (_timers.TryRemove(memberId, out var timer))
        {
            timer.Dispose();
        }
    }

    private async Task FireAsync(Guid circleId, Guid memberId, ITimer timer)
    {
        _timers.TryRemove(new KeyValuePair<Guid, ITimer>(memberId, timer));
        timer.Dispose();
        try
        {
            if (presence.Online(circleId).Contains(memberId))
            {
                return;
            }
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
            var removed = await db.RaisedHands.Where(h => h.CircleId == circleId && h.MemberId == memberId).ExecuteDeleteAsync();
            if (removed > 0)
            {
                var hub = scope.ServiceProvider.GetRequiredService<IHubContext<CircleHub, ICircleClient>>();
                await hub.Clients.Group(CircleHub.Group(circleId)).Hands(await Hands.LoadAsync(db, circleId));
            }
        }
        catch (Exception e)
        {
            LowerFailed(e, memberId);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Lowering the hand of {MemberId} after the grace period failed")]
    private partial void LowerFailed(Exception exception, Guid memberId);
}
