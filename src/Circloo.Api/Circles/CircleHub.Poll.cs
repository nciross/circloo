using Circloo.Api.Data;
using Circloo.Api.Decide;
using Circloo.Api.Security;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Circloo.Api.Circles;

/// <summary>
/// Live polls (spec 007 US1, contracts/hub.md): the animator creates, opens and closes; participants vote once each,
/// changing their vote until it closes. Results are aggregates sent to whoever may see them (see <see cref="Polls"/>).
/// </summary>
public sealed partial class CircleHub
{
    /// <summary>All connections of one member: their own vote, upvotes and answers reach every tab and device.</summary>
    public static string MemberGroup(Guid memberId) => $"member:{memberId}";

    private const string VotesKey = "votes";

    /// <summary>At most this many votes per connection per second (spec 007 FR-720).</summary>
    private const int VotesPerSecond = 10;

    public async Task<PollView> CreatePoll(PollInput input)
    {
        var (circleId, me) = await PollAnimatorAsync();
        var (poll, errors) = DecideRules.ValidatePoll(input, safety.IsMessageSafe);
        if (poll is null)
        {
            throw new HubException(PollError(errors));
        }
        poll.CircleId = circleId;
        poll.CreatedByMemberId = me.Id;
        poll.CreatedAt = clock.GetUtcNow();
        db.Polls.Add(poll);
        await db.SaveChangesAsync();
        await polls.BroadcastAsync(poll);
        return Polls.View(poll);
    }

    public async Task<PollView> UpdatePoll(Guid pollId, PollInput input)
    {
        var (circleId, _) = await PollAnimatorAsync();
        var poll = await PollAsync(circleId, pollId);
        if (poll.OpenedAt is not null)
        {
            throw new HubException("poll-not-draft");
        }
        var (valid, errors) = DecideRules.ValidatePoll(input, safety.IsMessageSafe);
        if (valid is null)
        {
            throw new HubException(PollError(errors));
        }
        (poll.Question, poll.Options, poll.MultipleChoice, poll.ResultsLive) = (valid.Question, valid.Options, valid.MultipleChoice, valid.ResultsLive);
        poll.Version++;
        await db.SaveChangesAsync();
        await polls.BroadcastAsync(poll);
        return Polls.View(poll);
    }

    public async Task OpenPoll(Guid pollId)
    {
        var (circleId, me) = await PollAnimatorAsync();
        var poll = await PollAsync(circleId, pollId);
        if (poll.OpenedAt is not null)
        {
            throw new HubException("poll-not-draft");
        }
        // One open poll per circle: the previous one closes with its result kept.
        await polls.CloseOpenAsync(circleId, me.UserId);
        poll.OpenedAt = clock.GetUtcNow();
        poll.Version++;
        audit.Add(AuditTypes.PollOpened, me.UserId, detail: new { circleId, pollId });
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new HubException("poll-conflict");
        }
        await polls.BroadcastAsync(poll);
    }

    public async Task ClosePoll(Guid pollId)
    {
        var (circleId, me) = await PollAnimatorAsync();
        var poll = await PollAsync(circleId, pollId);
        if (poll.OpenedAt is null || poll.ClosedAt is not null)
        {
            throw new HubException("poll-not-open");
        }
        poll.ClosedAt = clock.GetUtcNow();
        poll.Version++;
        audit.Add(AuditTypes.PollClosed, me.UserId, detail: new { circleId, pollId });
        await db.SaveChangesAsync();
        await polls.BroadcastAsync(poll);
    }

    /// <summary>A participant's vote: one per poll, replaced (never added) until the poll closes.</summary>
    public async Task VotePoll(Guid pollId, string[] options)
    {
        ThrottleVotes();
        var (circleId, me) = await CurrentAsync();
        if (me.Role == Roles.Animator)
        {
            throw new HubException("animator-cannot-answer");
        }
        var poll = await db.Polls.AsNoTracking().FirstOrDefaultAsync(p => p.Id == pollId && p.CircleId == circleId)
            ?? throw new HubException("poll-not-open");
        if (poll.OpenedAt is null || poll.ClosedAt is not null)
        {
            throw new HubException("poll-not-open");
        }
        var chosen = CleanVote(poll, options) ?? throw new HubException("invalid-options");
        var now = clock.GetUtcNow();
        await UpsertVoteAsync(pollId, me.Id, chosen, now);
        await Clients.Group(MemberGroup(me.Id)).MyVote(pollId, chosen);
        throttle.Request($"poll:{pollId}", async services =>
        {
            var scoped = services.GetRequiredService<Polls>();
            var db2 = services.GetRequiredService<CirclooDbContext>();
            var fresh = await db2.Polls.AsNoTracking().FirstOrDefaultAsync(p => p.Id == pollId);
            if (fresh is not null)
            {
                await scoped.SendResultsAsync(fresh);
            }
        });
    }

    /// <summary>Known, distinct option ids; one unless the poll takes several.</summary>
    private static string[]? CleanVote(Poll poll, string[]? options)
    {
        if (options is null || options.Length == 0)
        {
            return null;
        }
        var known = poll.Options.Select(o => o.Id).ToHashSet(StringComparer.Ordinal);
        var distinct = options.Distinct(StringComparer.Ordinal).ToArray();
        if (distinct.Length != options.Length || distinct.Any(o => !known.Contains(o)) || (distinct.Length > 1 && !poll.MultipleChoice))
        {
            return null;
        }
        return [.. distinct.Order(StringComparer.Ordinal)];
    }

    /// <summary>Insert or replace the member's vote; two tabs voting at once still leave one row (unique index).</summary>
    private async Task UpsertVoteAsync(Guid pollId, Guid memberId, string[] chosen, DateTimeOffset now)
    {
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var updated = await db.PollVotes.Where(v => v.PollId == pollId && v.MemberId == memberId)
                .ExecuteUpdateAsync(s => s.SetProperty(v => v.Options, chosen).SetProperty(v => v.UpdatedAt, now));
            if (updated > 0)
            {
                return;
            }
            db.PollVotes.Add(new PollVote { PollId = pollId, MemberId = memberId, Options = chosen, CreatedAt = now, UpdatedAt = now });
            try
            {
                await db.SaveChangesAsync();
                return;
            }
            catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                // Another tab inserted first: replace that row instead.
                db.ChangeTracker.Clear();
            }
        }
        throw new HubException("busy");
    }

    private void ThrottleVotes()
    {
        var now = clock.GetUtcNow();
        var recent = Context.Items[VotesKey] as Queue<DateTimeOffset> ?? new Queue<DateTimeOffset>();
        while (recent.Count > 0 && now - recent.Peek() >= TimeSpan.FromSeconds(1))
        {
            recent.Dequeue();
        }
        if (recent.Count >= VotesPerSecond)
        {
            throw new HubException("slow-down");
        }
        recent.Enqueue(now);
        Context.Items[VotesKey] = recent;
    }

    /// <summary>The animator, with the Poll activity running (its tools only exist there).</summary>
    private async Task<(Guid CircleId, CircleMember Me)> PollAnimatorAsync()
    {
        var (circleId, me) = await CurrentAsync(animatorOnly: true);
        if (me.Circle!.CurrentActivity != ActivityCatalog.Poll)
        {
            throw new HubException("activity-invalid");
        }
        return (circleId, me);
    }

    private async Task<Poll> PollAsync(Guid circleId, Guid pollId) =>
        await db.Polls.FirstOrDefaultAsync(p => p.Id == pollId && p.CircleId == circleId) ?? throw new HubException("poll-invalid");

    /// <summary>The first field code, as "field:code" so the editor can point at the field (e.g. "options[1]:option-length").</summary>
    private static string PollError(Dictionary<string, string[]> errors)
    {
        var (field, codes) = errors.First();
        return $"poll-invalid:{field}:{codes[0]}";
    }
}
