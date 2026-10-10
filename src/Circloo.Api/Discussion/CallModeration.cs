using System.Collections.Concurrent;

namespace Circloo.Api.Discussion;

/// <summary>
/// The animator's decisions about people in the current call of each circle: removals and per-source mutes (spec 009
/// research R22, R31). In memory only, by design: nothing about a call is stored, and an API restart forgets them
/// (one replica, accepted in the plan's Complexity Tracking). Every new pass reads it; the hub methods that change it
/// come with T921, and ending a call clears it.
/// </summary>
public sealed class CallModeration
{
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, MemberModeration>> _circles = new();

    public MemberModeration Of(Guid circleId, Guid memberId) =>
        _circles.TryGetValue(circleId, out var members) && members.TryGetValue(memberId, out var state) ? state : MemberModeration.None;

    public bool IsRemoved(Guid circleId, Guid memberId) => Of(circleId, memberId).Removed;

    /// <summary>Keeps the member out of this call until <see cref="AllowBack"/> or the end of the call.</summary>
    public void Remove(Guid circleId, Guid memberId) => Change(circleId, memberId, s => s with { Removed = true });

    public void AllowBack(Guid circleId, Guid memberId) => Change(circleId, memberId, s => s with { Removed = false });

    /// <summary>Takes one source away (<c>microphone</c> or <c>camera</c>) until <see cref="Allow"/>.</summary>
    public void Mute(Guid circleId, Guid memberId, string source) => Change(circleId, memberId, s => With(s, source, true));

    public void Allow(Guid circleId, Guid memberId, string source) => Change(circleId, memberId, s => With(s, source, false));

    /// <summary>Forgets everything about the circle's call: called when the call ends.</summary>
    public void Clear(Guid circleId) => _circles.TryRemove(circleId, out _);

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
