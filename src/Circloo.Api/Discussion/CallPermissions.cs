using Circloo.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Discussion;

/// <summary>
/// Puts the permission table (<see cref="CallRules"/>) on the call server for people already in the call (spec 009
/// research R22). Passes carry the same rules for people who join later. The circle is read as given, so a caller can
/// apply a change before it saves it and keep nothing when the call server fails (contracts/hub.md rule 5). The role,
/// the floor and membership come from the database, mutes and removals from <see cref="CallModeration"/>.
/// </summary>
public sealed partial class CallPermissions(CirclooDbContext db, ILiveKitRooms rooms, CallModeration moderation, ILogger<CallPermissions> log)
{
    /// <summary>Updates in flight at once for a whole-room change, so 100 people are done well within 2 s (FR-902).</summary>
    public const int Concurrency = 8;

    /// <summary>
    /// Recomputes one member's permission and applies it. False when they are not in the call (nothing to do: their
    /// next pass carries it). Throws <see cref="LiveKitException"/> when the call server fails.
    /// </summary>
    public async Task<bool> ApplyAsync(Circle circle, Guid memberId, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(circle);
        var rights = await RightsAsync(circle, [memberId], ct);
        return await rooms.UpdateParticipantAsync(CallRules.RoomName(circle.Id), memberId.ToString(), rights[memberId], ct);
    }

    /// <summary>
    /// Recomputes everyone in the call and updates those whose permission changes (a video or speaking-mode switch).
    /// Someone the call server lists who is not a current member may publish nothing. If any update fails, the ones
    /// already made are put back as they were and <see cref="LiveKitException"/> is thrown, so the caller keeps nothing.
    /// Returns how many people were updated.
    /// </summary>
    public async Task<int> ApplyEveryoneAsync(Circle circle, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(circle);
        var room = CallRules.RoomName(circle.Id);
        var people = await rooms.ListParticipantsAsync(room, ct);
        if (people.Count == 0)
        {
            return 0;
        }
        var rights = await RightsAsync(circle, [.. people.Select(p => MemberId(p.Identity)).OfType<Guid>()], ct);
        var changes = people
            .Select(p => (Person: p, Next: MemberId(p.Identity) is { } id ? rights[id] : CallRights.Nothing))
            .Where(c => c.Next != c.Person.Permission)
            .ToList();

        var done = new List<CallParticipant>();
        var failed = false;
        using var gate = new SemaphoreSlim(Concurrency);
        await Task.WhenAll(changes.Select(async c =>
        {
            await gate.WaitAsync(ct);
            try
            {
                if (await rooms.UpdateParticipantAsync(room, c.Person.Identity, c.Next, ct))
                {
                    lock (done)
                    {
                        done.Add(c.Person);
                    }
                }
            }
            catch (LiveKitException)
            {
                failed = true;
            }
            finally
            {
                gate.Release();
            }
        }));
        if (failed)
        {
            await RestoreAsync(room, done);
            throw new LiveKitException("The call server did not take the new permissions.");
        }
        return done.Count;
    }

    /// <summary>Best effort: what the call server said before the change. A failure here is logged; the room's next change or pass repairs it.</summary>
    private async Task RestoreAsync(string room, IReadOnlyList<CallParticipant> changed)
    {
        foreach (var person in changed)
        {
            try
            {
                await rooms.UpdateParticipantAsync(room, person.Identity, person.Permission, CancellationToken.None);
            }
            catch (LiveKitException)
            {
                LogRestoreFailed(log);
            }
        }
    }

    private async Task<Dictionary<Guid, CallRights>> RightsAsync(Circle circle, Guid[] memberIds, CancellationToken ct)
    {
        var ids = memberIds.Distinct().ToArray();
        var members = await db.CircleMembers.AsNoTracking()
            .Where(m => m.CircleId == circle.Id && m.LeftAt == null && ids.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id, ct);
        var floor = await db.RaisedHands.AsNoTracking()
            .Where(h => h.CircleId == circle.Id && h.HasFloor)
            .Select(h => h.MemberId)
            .ToListAsync(ct);
        return ids.ToDictionary(id => id, id => members.TryGetValue(id, out var member)
            ? CallRules.Permissions(circle, member, floor.Contains(id), moderation.Of(circle.Id, id)) ?? CallRights.Nothing
            : CallRights.Nothing);
    }

    /// <summary>Identities are member ids (research R21). Anything else is nobody we know.</summary>
    private static Guid? MemberId(string identity) => Guid.TryParse(identity, out var id) ? id : null;

    [LoggerMessage(Level = LogLevel.Warning, Message = "Putting a call permission back after a failed change did not work")]
    private static partial void LogRestoreFailed(ILogger logger);
}
