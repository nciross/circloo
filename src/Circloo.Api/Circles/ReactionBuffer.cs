using System.Collections.Concurrent;
using System.Text.Json;
using Circloo.Api.Data;
using Circloo.Api.Decide;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Circles;

/// <summary>
/// Reactions on their way out (spec 008 R7): counted per circle and kind, never per person, and flushed through
/// <see cref="LiveThrottle"/> (<c>reactions:{circleId}</c>) at most every <see cref="FlushEvery"/>. Each flush sends one
/// <c>Reactions</c> burst to the circle group, the audience screen included, and adds it to the running presentation's
/// totals. In memory, like presence and the room limits (one replica, plan R12): a restart loses at most one burst.
/// </summary>
public sealed class ReactionBuffer(LiveThrottle throttle)
{
    /// <summary>At most one burst per circle this often: 100 people tapping cost about 2.5 broadcasts a second (plan).</summary>
    public static readonly TimeSpan FlushEvery = TimeSpan.FromMilliseconds(400);

    private readonly ConcurrentDictionary<Guid, Pending> _circles = new();

    /// <summary>One circle's counts since the last flush; <see cref="Taken"/> once a flush removed it from the buffer.</summary>
    private sealed class Pending
    {
        public readonly int[] Counts = new int[ReactionKinds.All.Length];
        public bool Taken;
    }

    /// <summary>Counts one reaction (the kind is already checked) and asks for a flush.</summary>
    public void Add(Guid circleId, string kind)
    {
        var index = Array.IndexOf(ReactionKinds.All, kind);
        if (index < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(kind));
        }
        while (true)
        {
            var pending = _circles.GetOrAdd(circleId, _ => new Pending());
            lock (pending)
            {
                if (pending.Taken)
                {
                    continue; // a flush just took it: count on a fresh one
                }
                pending.Counts[index]++;
                break;
            }
        }
        throttle.Request($"reactions:{circleId}", services => FlushAsync(services, circleId), FlushEvery);
    }

    /// <summary>Takes everything counted for a circle so far, kinds with no reaction left out. The next reaction starts afresh.</summary>
    public ReactionBurst Take(Guid circleId)
    {
        var burst = new ReactionBurst();
        if (!_circles.TryRemove(circleId, out var pending))
        {
            return burst;
        }
        lock (pending)
        {
            pending.Taken = true;
            for (var i = 0; i < ReactionKinds.All.Length; i++)
            {
                if (pending.Counts[i] > 0)
                {
                    burst[ReactionKinds.All[i]] = pending.Counts[i];
                }
            }
        }
        return burst;
    }

    /// <summary>Circles with reactions waiting; empty once every burst went out.</summary>
    public int Waiting => _circles.Count;

    private async Task FlushAsync(IServiceProvider services, Guid circleId)
    {
        var burst = Take(circleId);
        if (burst.Count == 0)
        {
            return;
        }
        var hub = services.GetRequiredService<IHubContext<CircleHub, ICircleClient>>();
        await Task.WhenAll(
            hub.Clients.Group(CircleHub.Group(circleId)).Reactions(burst),
            AddToTotalsAsync(services.GetRequiredService<CirclooDbContext>(), circleId, burst));
    }

    /// <summary>
    /// Adds a burst to the circle's running presentation with one SQL update, so parallel flushes and animator actions
    /// never lose a count (the session's <c>Version</c> is left alone). No running presentation: nothing is stored.
    /// </summary>
    public static async Task<int> AddToTotalsAsync(CirclooDbContext db, Guid circleId, ReactionBurst burst)
    {
        var json = JsonSerializer.Serialize(burst);
        return await db.Database.ExecuteSqlAsync($$"""
            UPDATE "PresentationSessions" AS s
            SET "ReactionTotals" = (
                SELECT COALESCE(jsonb_object_agg(t.key, t.total), '{}'::jsonb)
                FROM (
                    SELECT e.key, SUM(e.value::bigint) AS total
                    FROM (
                        SELECT key, value FROM jsonb_each_text(s."ReactionTotals")
                        UNION ALL
                        SELECT key, value FROM jsonb_each_text({{json}}::jsonb)
                    ) AS e
                    GROUP BY e.key
                ) AS t)
            WHERE s."CircleId" = {{circleId}} AND s."EndedAt" IS NULL
            """);
    }
}
