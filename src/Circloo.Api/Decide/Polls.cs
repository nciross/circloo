using System.Collections.Concurrent;
using Circloo.Api.Circles;
using Circloo.Api.Common;
using Circloo.Api.Data;
using Circloo.Api.Security;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Decide;

/// <summary>
/// Live polls seen from outside one hub call (spec 007 US1, contracts/hub.md): results, who may see them, and closing.
/// No raw vote ever leaves the server; while results are hidden, members only learn how many voted.
/// </summary>
public sealed class Polls(CirclooDbContext db, IHubContext<CircleHub, ICircleClient> hub, AuditLog audit, TimeProvider clock)
{
    public static PollView View(Poll p, IReadOnlyList<string>? myVote = null) =>
        new(p.Id, p.Question, [.. p.Options.Select(ChoiceView.From)], p.MultipleChoice, p.ResultsLive, PollView.StateOf(p), myVote);

    /// <summary>Counts and percentages (adding up to 100) per option; the most chosen are winners, ties included.</summary>
    public static PollResultsView Results(Poll poll, IReadOnlyCollection<IReadOnlyList<string>> votes)
    {
        var counts = poll.Options.Select(o => votes.Count(v => v.Contains(o.Id))).ToArray();
        var percents = Percentages.Of(counts);
        var max = counts.Length == 0 ? 0 : counts.Max();
        return new PollResultsView(poll.Id, votes.Count, [.. poll.Options.Select((o, i) => new PollOptionResult(o.Id, counts[i], percents[i], max > 0 && counts[i] == max))]);
    }

    public async Task<PollResultsView> ResultsAsync(Poll poll, CancellationToken ct = default)
    {
        var votes = await db.PollVotes.AsNoTracking().Where(v => v.PollId == poll.Id).Select(v => v.Options).ToListAsync(ct);
        return Results(poll, [.. votes.Select(v => (IReadOnlyList<string>)v)]);
    }

    /// <summary>Whether members see the results now: live polls while open, every poll once closed.</summary>
    public static bool ResultsVisible(Poll p) => p.ClosedAt is not null || (p.OpenedAt is not null && p.ResultsLive);

    /// <summary>The poll's state to everyone (a draft only to the animator), then its results to whoever may see them.</summary>
    public async Task BroadcastAsync(Poll poll, CancellationToken ct = default)
    {
        var view = View(poll);
        if (poll.OpenedAt is null)
        {
            await hub.Clients.Group(CircleHub.AnimatorGroup(poll.CircleId)).PollChanged(view);
            return;
        }
        await hub.Clients.Group(CircleHub.Group(poll.CircleId)).PollChanged(view);
        await SendResultsAsync(poll, ct);
    }

    /// <summary>After votes: results to the circle when visible, else to the animator, with the vote count for members.</summary>
    public async Task SendResultsAsync(Poll poll, CancellationToken ct = default)
    {
        var results = await ResultsAsync(poll, ct);
        if (ResultsVisible(poll))
        {
            await hub.Clients.Group(CircleHub.Group(poll.CircleId)).PollResults(results);
            return;
        }
        await hub.Clients.Group(CircleHub.AnimatorGroup(poll.CircleId)).PollResults(results);
        await hub.Clients.Group(CircleHub.Group(poll.CircleId)).PollCount(poll.Id, results.Votes);
    }

    /// <summary>Closes the circle's open poll, if any (the animator switched or ended the activity), keeping its votes.</summary>
    public async Task CloseOpenAsync(Guid circleId, Guid? userId, CancellationToken ct = default)
    {
        var open = await db.Polls.FirstOrDefaultAsync(p => p.CircleId == circleId && p.OpenedAt != null && p.ClosedAt == null, ct);
        if (open is null)
        {
            return;
        }
        open.ClosedAt = clock.GetUtcNow();
        open.Version++;
        audit.Add(AuditTypes.PollClosed, userId, detail: new { circleId, pollId = open.Id });
        await db.SaveChangesAsync(ct);
        await BroadcastAsync(open, ct);
    }

    /// <summary>
    /// The circle view's poll part (contracts/rest.md): the open poll (or, for the animator, the latest draft) with the
    /// member's own vote and the results they may see, and the finished polls newest first.
    /// </summary>
    public async Task<(PollView? Poll, PollResultsView? Results, int? Votes, IReadOnlyList<FinishedPollView> Finished)> ForMemberAsync(
        Guid circleId, CircleMember me, CancellationToken ct = default)
    {
        var polls = await db.Polls.AsNoTracking().Where(p => p.CircleId == circleId).OrderByDescending(p => p.CreatedAt).ToListAsync(ct);
        var ids = polls.Select(p => p.Id).ToList();
        var votes = await db.PollVotes.AsNoTracking().Where(v => ids.Contains(v.PollId)).Select(v => new { v.PollId, v.MemberId, v.Options }).ToListAsync(ct);
        IReadOnlyList<IReadOnlyList<string>> Of(Guid id) => [.. votes.Where(v => v.PollId == id).Select(v => (IReadOnlyList<string>)v.Options)];

        var animator = me.Role == Roles.Animator;
        var current = polls.FirstOrDefault(p => p.OpenedAt is not null && p.ClosedAt is null)
            ?? (animator ? polls.FirstOrDefault(p => p.OpenedAt is null) : null);
        PollView? view = null;
        PollResultsView? results = null;
        int? count = null;
        if (current is not null)
        {
            view = View(current, votes.FirstOrDefault(v => v.PollId == current.Id && v.MemberId == me.Id)?.Options);
            var all = Of(current.Id);
            if (current.OpenedAt is not null && (ResultsVisible(current) || animator))
            {
                results = Results(current, [.. all]);
            }
            count = all.Count;
        }
        var finished = polls.Where(p => p.ClosedAt is not null)
            .OrderByDescending(p => p.ClosedAt)
            .Select(p => new FinishedPollView(p.Id, p.Question, p.ClosedAt!.Value, Results(p, [.. Of(p.Id)])))
            .ToList();
        return (view, results, count, finished);
    }
}

/// <summary>
/// Coalesces live updates per key (a poll, a question, a form) to at most one send every 250 ms, always sending the
/// latest state last (trailing edge), so a burst of votes costs a few broadcasts. Per replica, like hub groups.
/// </summary>
public sealed partial class LiveThrottle(IServiceScopeFactory scopes, ILogger<LiveThrottle> log)
{
    public static readonly TimeSpan Window = TimeSpan.FromMilliseconds(250);
    private readonly ConcurrentDictionary<string, long> _lastSent = new();
    private readonly ConcurrentDictionary<string, byte> _scheduled = new();

    public void Request(string key, Func<IServiceProvider, Task> send)
    {
        if (!_scheduled.TryAdd(key, 0))
        {
            return; // a send is already on its way and will carry the latest state
        }
        var now = Environment.TickCount64;
        var wait = _lastSent.TryGetValue(key, out var last) ? Math.Max(0, last + (long)Window.TotalMilliseconds - now) : 0;
        _ = Task.Run(async () =>
        {
            try
            {
                if (wait > 0)
                {
                    await Task.Delay(TimeSpan.FromMilliseconds(wait));
                }
                _scheduled.TryRemove(key, out _);
                _lastSent[key] = Environment.TickCount64;
                await using var scope = scopes.CreateAsyncScope();
                await send(scope.ServiceProvider);
            }
            catch (Exception e)
            {
                _scheduled.TryRemove(key, out _);
                UpdateFailed(e, key);
            }
        });
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Live update for {Key} failed")]
    private partial void UpdateFailed(Exception exception, string key);
}
