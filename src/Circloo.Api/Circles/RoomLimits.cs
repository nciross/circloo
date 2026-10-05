using System.Collections.Concurrent;

namespace Circloo.Api.Circles;

/// <summary>
/// Sliding-window limits per member and kind (chat messages, reactions; spec 008): one person with several tabs or
/// devices shares one budget. In memory, like presence and the live throttles (one replica, plan R12).
/// </summary>
public sealed class RoomLimits(TimeProvider clock)
{
    private readonly ConcurrentDictionary<(Guid Member, string Kind), Queue<DateTimeOffset>> _windows = new();
    private long _takes;

    /// <summary>Takes one slot if fewer than <paramref name="max"/> were taken in the last <paramref name="window"/>.</summary>
    public bool TryTake(Guid memberId, string kind, int max, TimeSpan window)
    {
        // Now and then, forget people who stopped sending long ago.
        if (Interlocked.Increment(ref _takes) % 1000 == 0)
        {
            Sweep(TimeSpan.FromMinutes(10));
        }
        var now = clock.GetUtcNow();
        var queue = _windows.GetOrAdd((memberId, kind), _ => new Queue<DateTimeOffset>());
        lock (queue)
        {
            while (queue.Count > 0 && now - queue.Peek() >= window)
            {
                queue.Dequeue();
            }
            if (queue.Count >= max)
            {
                return false;
            }
            queue.Enqueue(now);
            return true;
        }
    }

    /// <summary>Forgets windows idle for longer than <paramref name="idle"/>, so memory stays bounded.</summary>
    public int Sweep(TimeSpan idle)
    {
        var now = clock.GetUtcNow();
        var removed = 0;
        foreach (var (key, queue) in _windows)
        {
            bool stale;
            lock (queue)
            {
                stale = queue.Count == 0 || now - queue.Last() >= idle;
            }
            if (stale && _windows.TryRemove(new KeyValuePair<(Guid, string), Queue<DateTimeOffset>>(key, queue)))
            {
                removed++;
            }
        }
        return removed;
    }

    public int Count => _windows.Count;
}
