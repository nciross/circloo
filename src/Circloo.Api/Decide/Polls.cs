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
    public Task<Poll?> CloseOpenAsync(Guid circleId, Guid? userId, CancellationToken ct = default) =>
        CloseAsync(circleId, null, userId, ct);

    /// <summary>
    /// Closes an open poll (<paramref name="pollId"/>, or the circle's open one) exactly once, then broadcasts it. The row
    /// is locked first: votes in flight (they hold it <c>FOR SHARE</c>) finish before <c>ClosedAt</c> is stamped and later
    /// votes see it closed, so results announced as final never change. Null when nothing was open (another tab won).
    /// </summary>
    public async Task<Poll?> CloseAsync(Guid circleId, Guid? pollId, Guid? userId, CancellationToken ct = default)
    {
        FormattableString open = pollId is { } id
            ? (FormattableString)$"""SELECT "Id" AS "Value" FROM "Polls" WHERE "Id" = {id} AND "CircleId" = {circleId} AND "OpenedAt" IS NOT NULL AND "ClosedAt" IS NULL FOR UPDATE"""
            : $"""SELECT "Id" AS "Value" FROM "Polls" WHERE "CircleId" = {circleId} AND "OpenedAt" IS NOT NULL AND "ClosedAt" IS NULL FOR UPDATE""";
        // The retrying execution strategy only accepts a transaction it can replay as a whole.
        var closed = await db.Database.CreateExecutionStrategy().ExecuteAsync(async token =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(token);
            var ids = await db.Database.SqlQuery<Guid>(open).ToListAsync(token);
            if (ids.Count == 0)
            {
                return (Guid?)null;
            }
            var closedId = ids[0];
            var now = clock.GetUtcNow();
            await db.Polls.Where(p => p.Id == closedId)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.ClosedAt, now).SetProperty(p => p.Version, p => p.Version + 1), token);
            audit.Add(AuditTypes.PollClosed, userId, detail: new { circleId, pollId = closedId });
            await db.SaveChangesAsync(token);
            await tx.CommitAsync(token);
            return closedId;
        }, ct);
        if (closed is null)
        {
            return null;
        }
        var poll = await db.Polls.AsNoTracking().FirstAsync(p => p.Id == closed, ct);
        await BroadcastAsync(poll, ct);
        return poll;
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
/// Coalesces live updates per key (a poll, a question, a form) to at most one send every 250 ms (or the window the
/// request asks for), always sending the latest state last (trailing edge), so a burst of votes costs a few broadcasts.
/// Sends for one key never overlap: a request while one runs waits for it and the window, so an older state can't
/// arrive after a newer one. A key is dropped once a window passes with nothing to send. Per replica, like hub groups.
/// </summary>
public sealed partial class LiveThrottle(IServiceScopeFactory scopes, ILogger<LiveThrottle> log)
{
    public static readonly TimeSpan Window = TimeSpan.FromMilliseconds(250);
    private readonly ConcurrentDictionary<string, Slot> _slots = new();

    /// <summary>One key's latest pending send; in <see cref="_slots"/> while its send loop runs.</summary>
    private sealed class Slot
    {
        public Func<IServiceProvider, Task>? Pending;
        public TimeSpan Window = LiveThrottle.Window;
        public bool Running;
        public bool Removed;
    }

    /// <param name="window">The pause between two sends of this key; 250 ms when not given (reactions use 400 ms).</param>
    public void Request(string key, Func<IServiceProvider, Task> send, TimeSpan? window = null)
    {
        while (true)
        {
            var slot = _slots.GetOrAdd(key, _ => new Slot());
            lock (slot)
            {
                if (slot.Removed)
                {
                    continue; // its loop just ended: take a fresh slot
                }
                slot.Pending = send; // the latest request wins
                slot.Window = window ?? Window;
                if (slot.Running)
                {
                    return; // the running loop sends it after the current send and the window
                }
                slot.Running = true;
            }
            _ = Task.Run(() => RunAsync(key, slot));
            return;
        }
    }

    private async Task RunAsync(string key, Slot slot)
    {
        while (true)
        {
            Func<IServiceProvider, Task>? send;
            TimeSpan window;
            lock (slot)
            {
                (send, slot.Pending, window) = (slot.Pending, null, slot.Window);
                if (send is null)
                {
                    slot.Removed = true;
                    _slots.TryRemove(new KeyValuePair<string, Slot>(key, slot));
                    return;
                }
            }
            var started = Environment.TickCount64;
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await send(scope.ServiceProvider);
            }
            catch (Exception e)
            {
                UpdateFailed(e, key);
            }
            var rest = (long)window.TotalMilliseconds - (Environment.TickCount64 - started);
            if (rest > 0)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(rest));
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Live update for {Key} failed")]
    private partial void UpdateFailed(Exception exception, string key);
}
