using Circloo.Api.Data;
using Circloo.Api.Security;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Circloo.Api.Circles;

/// <summary>
/// Raised hands in the live room (spec 008 US5): a queue ordered by <c>RaisedAt</c> then <c>Id</c>, and at most one
/// person with the floor. The animator's role is read from the database on every call; the audience screen only reads.
/// </summary>
public sealed partial class CircleHub
{
    private const int GiveFloorAttempts = 3;

    public async Task RaiseHand()
    {
        var (circleId, me) = await HandsMemberAsync();
        if (me.Role == Roles.Animator)
        {
            throw new HubException("animator-cannot-raise");
        }
        // One row per member: parallel raises from several tabs leave one, and the first keeps the place.
        var added = await db.Database.ExecuteSqlAsync($"""
            INSERT INTO "RaisedHands" ("CircleId", "MemberId", "RaisedAt", "HasFloor")
            VALUES ({circleId}, {me.Id}, {clock.GetUtcNow()}, false)
            ON CONFLICT DO NOTHING
            """);
        if (added > 0)
        {
            await BroadcastHandsAsync(circleId);
        }
    }

    /// <summary>Lowers the caller's own hand, or (animator only) another member's. Lowering the speaker's hand ends their turn.</summary>
    public async Task LowerHand(Guid? memberId)
    {
        var (circleId, me) = await HandsMemberAsync();
        var target = memberId ?? me.Id;
        if (target != me.Id && me.Role != Roles.Animator)
        {
            throw new HubException("animator-only");
        }
        var removed = await db.RaisedHands.Where(h => h.CircleId == circleId && h.MemberId == target).ExecuteDeleteAsync();
        if (removed > 0)
        {
            await BroadcastHandsAsync(circleId);
        }
    }

    public async Task LowerAllHands()
    {
        var (circleId, me) = await HandsMemberAsync(animatorOnly: true);
        await ClearHandsAsync(circleId, me.UserId, "lower-all");
    }

    /// <summary>
    /// The previous speaker's hand goes down and <paramref name="memberId"/> gets the floor, in one transaction. Two
    /// animator tabs racing hit the one-floor index: the loser tries again.
    /// </summary>
    public async Task GiveFloor(Guid memberId)
    {
        var (circleId, _) = await HandsMemberAsync(animatorOnly: true);
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
                {
                    await using var tx = await db.Database.BeginTransactionAsync();
                    var hand = await db.RaisedHands.AsNoTracking()
                        .Where(h => h.CircleId == circleId && h.MemberId == memberId && db.CircleMembers.Any(m => m.Id == h.MemberId && m.LeftAt == null))
                        .Select(h => new { h.HasFloor }).FirstOrDefaultAsync() ?? throw new HubException("hand-invalid");
                    if (hand.HasFloor)
                    {
                        return;
                    }
                    await db.RaisedHands.Where(h => h.CircleId == circleId && h.HasFloor).ExecuteDeleteAsync();
                    var marked = await db.RaisedHands.Where(h => h.CircleId == circleId && h.MemberId == memberId)
                        .ExecuteUpdateAsync(s => s.SetProperty(h => h.HasFloor, true));
                    if (marked == 0)
                    {
                        throw new HubException("hand-invalid");
                    }
                    await tx.CommitAsync();
                });
                break;
            }
            catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                if (attempt == GiveFloorAttempts)
                {
                    throw new HubException("try-again");
                }
            }
        }
        await BroadcastHandsAsync(circleId);
    }

    /// <summary>Removes every hand and the floor, audits it and tells the circle. Does nothing when no hand is up.</summary>
    private async Task ClearHandsAsync(Guid circleId, Guid? userId, string reason)
    {
        var cleared = await db.RaisedHands.Where(h => h.CircleId == circleId).ExecuteDeleteAsync();
        if (cleared == 0)
        {
            return;
        }
        await audit.WriteAsync(AuditTypes.HandsCleared, userId, detail: new { circle = circleId, reason, count = cleared });
        await BroadcastHandsAsync(circleId);
    }

    private async Task BroadcastHandsAsync(Guid circleId) =>
        await Clients.Group(Group(circleId)).Hands(await Circloo.Api.Circles.Hands.LoadAsync(db, circleId));

    /// <summary>The gate of every hands method: the audience screen is read only, and the caller must be a current member.</summary>
    private async Task<(Guid CircleId, CircleMember Me)> HandsMemberAsync(bool animatorOnly = false)
    {
        if (Context.Items.ContainsKey(AudienceKey))
        {
            throw new HubException("audience-read-only");
        }
        return await CurrentAsync(animatorOnly);
    }
}
