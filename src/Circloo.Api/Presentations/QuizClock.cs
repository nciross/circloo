using System.Collections.Concurrent;
using Circloo.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Presentations;

/// <summary>
/// Locks a quiz when its time is up (spec 006 US4, FR-611): the server's deadline is the only one that counts, so a
/// phone with a wrong clock can neither answer late nor be cut short. Timers live in memory; on start the open quizzes
/// are scheduled again, so a restart never leaves one answering forever.
/// </summary>
public sealed partial class QuizClock(IServiceScopeFactory scopes, TimeProvider clock, ILogger<QuizClock> log) : BackgroundService
{
    private const int LockAttempts = 5;

    /// <summary>The database keeps microseconds; a deadline read back may differ from the one scheduled by less than this.</summary>
    private static readonly TimeSpan Tolerance = TimeSpan.FromMilliseconds(1);

    private readonly ConcurrentDictionary<Guid, (ITimer Timer, DateTimeOffset Deadline)> _timers = new();

    /// <summary>Locks the session's quiz at <paramref name="deadline"/> (at once when it has passed). Replaces an earlier timer.</summary>
    public void Schedule(Guid sessionId, DateTimeOffset deadline)
    {
        // Stored before it is started, so even a deadline already passed (due at once) finds its own entry to remove.
        var timer = clock.CreateTimer(_ => _ = FireAsync(sessionId, deadline), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
        _timers.AddOrUpdate(sessionId, (timer, deadline), (_, previous) =>
        {
            previous.Timer.Dispose();
            return (timer, deadline);
        });
        var due = deadline - clock.GetUtcNow();
        timer.Change(due > TimeSpan.Zero ? due : TimeSpan.Zero, Timeout.InfiniteTimeSpan);
    }

    /// <summary>
    /// Locks the quiz if it is still answering on that deadline (the animator may have locked it or moved on) and tells
    /// every screen. Returns whether it locked.
    /// </summary>
    public async Task<bool> LockDueAsync(Guid sessionId, DateTimeOffset deadline, CancellationToken ct = default)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        for (var attempt = 1; attempt <= LockAttempts; attempt++)
        {
            var session = await db.PresentationSessions.FirstOrDefaultAsync(s => s.Id == sessionId && s.EndedAt == null, ct);
            if (session is null || session.Phase != SessionPhases.Answering || session.Deadline is not { } stored || (stored - deadline).Duration() > Tolerance)
            {
                return false;
            }
            LiveSession.Lock(session, clock.GetUtcNow());
            session.Version++;
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateConcurrencyException)
            {
                db.ChangeTracker.Clear();
                continue;
            }
            await scope.ServiceProvider.GetRequiredService<LiveSessions>().BroadcastAsync(session, ct: ct);
            return true;
        }
        return false;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
            var open = await db.PresentationSessions.AsNoTracking()
                .Where(s => s.EndedAt == null && s.Phase == SessionPhases.Answering && s.Deadline != null)
                .Select(s => new { s.Id, Deadline = s.Deadline!.Value })
                .ToListAsync(stoppingToken);
            foreach (var s in open)
            {
                Schedule(s.Id, s.Deadline);
            }
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogReloadFailed(log, e);
        }
    }

    public override void Dispose()
    {
        foreach (var (timer, _) in _timers.Values)
        {
            timer.Dispose();
        }
        _timers.Clear();
        base.Dispose();
    }

    private async Task FireAsync(Guid sessionId, DateTimeOffset deadline)
    {
        // Forget this timer unless a newer deadline replaced it.
        if (_timers.TryGetValue(sessionId, out var entry) && entry.Deadline == deadline && _timers.TryRemove(new KeyValuePair<Guid, (ITimer, DateTimeOffset)>(sessionId, entry)))
        {
            entry.Timer.Dispose();
        }
        try
        {
            await LockDueAsync(sessionId, deadline);
        }
        catch (Exception e)
        {
            LogLockFailed(log, e, sessionId);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Reloading open quizzes failed")]
    private static partial void LogReloadFailed(ILogger logger, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Locking the quiz of session {SessionId} failed")]
    private static partial void LogLockFailed(ILogger logger, Exception exception, Guid sessionId);
}
