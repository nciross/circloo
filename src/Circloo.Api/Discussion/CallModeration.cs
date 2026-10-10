using System.Collections.Concurrent;

namespace Circloo.Api.Discussion;

/// <summary>
/// The animator's decisions about people in the current call of each circle: removals and per-source mutes (spec 009
/// research R22, R31). In memory only, by design: nothing about a call is stored, and an API restart forgets them
/// (one replica, accepted in the plan's Complexity Tracking). Every new pass and every live permission update read it,
/// the animator's hub methods (<c>MuteMember</c>, <c>AllowMember</c>, <c>RemoveFromCall</c>, <c>AllowBack</c>) change
/// it, and opening or ending a call clears it. It also holds the roster: who is in each call right now, as the call
/// server's webhooks tell it (research R24). Never stored either.
/// </summary>
public sealed class CallModeration
{
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, MemberModeration>> _circles = new();

    /// <summary>Per circle, the members in the call with the call server's participant and room ids of their connection.</summary>
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, RosterEntry>> _rosters = new();

    /// <summary>Hands out each join's place in the order (issue #277): increasing, never reused, shared by every circle.</summary>
    private long _joins;

    /// <param name="Joined">The join's place in the order. A connection that replaces another keeps it.</param>
    private sealed record RosterEntry(string? ParticipantSid, string? RoomSid, long Joined);

    public MemberModeration Of(Guid circleId, Guid memberId) =>
        _circles.TryGetValue(circleId, out var members) && members.TryGetValue(memberId, out var state) ? state : MemberModeration.None;

    public bool IsRemoved(Guid circleId, Guid memberId) => Of(circleId, memberId).Removed;

    /// <summary>Keeps the member out of this call until <see cref="AllowBack"/> or the end of the call.</summary>
    public void Remove(Guid circleId, Guid memberId) => Change(circleId, memberId, s => s with { Removed = true });

    public void AllowBack(Guid circleId, Guid memberId) => Change(circleId, memberId, s => s with { Removed = false });

    /// <summary>Takes one source away (<c>microphone</c> or <c>camera</c>) until <see cref="Allow"/>.</summary>
    public void Mute(Guid circleId, Guid memberId, string source) => Change(circleId, memberId, s => With(s, source, true));

    public void Allow(Guid circleId, Guid memberId, string source) => Change(circleId, memberId, s => With(s, source, false));

    /// <summary>Forgets everything about the circle's call, the roster included: called when a call starts or ends.</summary>
    public void Clear(Guid circleId)
    {
        _circles.TryRemove(circleId, out _);
        _rosters.TryRemove(circleId, out _);
    }

    /// <summary>
    /// Who is in the circle's call now, as the call server last told us, in the order they joined (issue #277): the
    /// same list for everyone, so the grid's join order is too. Someone who leaves and comes back joined last. Empty
    /// when nobody is.
    /// </summary>
    public Guid[] Roster(Guid circleId) =>
        _rosters.TryGetValue(circleId, out var people) ? [.. people.OrderBy(p => p.Value.Joined).Select(p => p.Key)] : [];

    /// <summary>
    /// The member's connection joined the call. True when the roster changed (they were not in it). A second
    /// connection with the same identity replaces the first on the call server, so it replaces it here too, in the
    /// same place of the join order.
    /// </summary>
    public bool Joined(Guid circleId, Guid memberId, string? participantSid, string? roomSid)
    {
        var people = _rosters.GetOrAdd(circleId, _ => new ConcurrentDictionary<Guid, RosterEntry>());
        var added = true;
        people.AddOrUpdate(memberId, _ => new RosterEntry(participantSid, roomSid, Interlocked.Increment(ref _joins)), (_, current) =>
        {
            added = false;
            return new RosterEntry(participantSid, roomSid, current.Joined);
        });
        return added;
    }

    /// <summary>
    /// The member's connection left the call. True when the roster changed. A late "left" for an earlier connection
    /// (another participant id) does not take out the connection that replaced it.
    /// </summary>
    public bool Left(Guid circleId, Guid memberId, string? participantSid)
    {
        if (!_rosters.TryGetValue(circleId, out var people) || !people.TryGetValue(memberId, out var entry))
        {
            return false;
        }
        if (participantSid is not null && entry.ParticipantSid is not null && participantSid != entry.ParticipantSid)
        {
            return false;
        }
        return people.TryRemove(new KeyValuePair<Guid, RosterEntry>(memberId, entry));
    }

    /// <summary>
    /// The call server closed the room: nobody is in it any more. Only the people of that room go, so the late close
    /// of a previous room does not empty the roster of the next call. True when the roster changed.
    /// </summary>
    public bool RoomFinished(Guid circleId, string? roomSid)
    {
        if (!_rosters.TryGetValue(circleId, out var people))
        {
            return false;
        }
        var changed = false;
        foreach (var (memberId, entry) in people)
        {
            if ((roomSid is null || entry.RoomSid is null || entry.RoomSid == roomSid)
                && people.TryRemove(new KeyValuePair<Guid, RosterEntry>(memberId, entry)))
            {
                changed = true;
            }
        }
        return changed;
    }

    private static MemberModeration With(MemberModeration state, string source, bool muted) => source switch
    {
        CallRights.MicrophoneSource => state with { MicrophoneMuted = muted },
        CallRights.CameraSource => state with { CameraStopped = muted },
        _ => throw new ArgumentOutOfRangeException(nameof(source), "Only the microphone and the camera can be muted."),
    };

    private void Change(Guid circleId, Guid memberId, Func<MemberModeration, MemberModeration> change)
    {
        var members = _circles.GetOrAdd(circleId, _ => new ConcurrentDictionary<Guid, MemberModeration>());
        members.AddOrUpdate(memberId, _ => change(MemberModeration.None), (_, current) => change(current));
    }
}
