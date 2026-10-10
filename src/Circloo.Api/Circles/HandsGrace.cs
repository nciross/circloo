using System.Collections.Concurrent;
using Circloo.Api.Data;
using Circloo.Api.Discussion;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

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

    /// <summary>Whether a grace timer is waiting for this member (their last connection closed and they are not back yet).</summary>
    public bool IsPending(Guid memberId) => _timers.ContainsKey(memberId);

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
            var hadFloor = await db.RaisedHands.AnyAsync(h => h.CircleId == circleId && h.MemberId == memberId && h.HasFloor);
            var removed = await db.RaisedHands.Where(h => h.CircleId == circleId && h.MemberId == memberId).ExecuteDeleteAsync();
            if (removed > 0)
            {
                var hub = scope.ServiceProvider.GetRequiredService<IHubContext<CircleHub, ICircleClient>>();
                await hub.Clients.Group(CircleHub.Group(circleId)).Hands(await Hands.LoadAsync(db, circleId));
                if (hadFloor)
                {
                    await TakeMicrophoneAsync(scope.ServiceProvider, db, hub, circleId, memberId);
                }
            }
        }
        catch (Exception e)
        {
            LowerFailed(e, memberId);
        }
    }

    /// <summary>
    /// The floor holder's hand went with the grace period: in a call in Hand to speak their microphone permission goes
    /// too (spec 009 contracts/hub.md, time-based rules), at best effort since nobody is waiting for an answer.
    /// </summary>
    private static async Task TakeMicrophoneAsync(IServiceProvider services, CirclooDbContext db, IHubContext<CircleHub, ICircleClient> hub,
        Guid circleId, Guid memberId)
    {
        var circle = await db.Circles.AsNoTracking().FirstOrDefaultAsync(c => c.Id == circleId);
        if (circle is null || !services.GetRequiredService<IOptions<LiveKitOptions>>().Value.Available || !CallRules.FloorGivesMicrophone(circle))
        {
            return;
        }
        await services.GetRequiredService<CallPermissions>().TryApplyAsync(circle, [memberId]);
        await hub.Clients.Group(CircleHub.MemberGroup(memberId)).CallNotice(CallNoticeKinds.FloorTaken, null, memberId);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Lowering the hand of {MemberId} after the grace period failed")]
    private partial void LowerFailed(Exception exception, Guid memberId);
}
