using Circloo.Api.Circles;
using Circloo.Api.Data;

namespace Circloo.Api.Discussion;

/// <summary>
/// What one person may send in the call. Screen sharing and data messages are never allowed (research R22), so a
/// permission only ever names the microphone and the camera.
/// </summary>
public sealed record CallRights(bool Microphone, bool Camera)
{
    public const string MicrophoneSource = "microphone";
    public const string CameraSource = "camera";

    public static readonly CallRights Nothing = new(false, false);

    /// <summary>
    /// False whenever no source is allowed. LiveKit reads an <b>empty</b> source list as "every source", so a pass or
    /// an update must never say <c>canPublish: true</c> with no source (research R20).
    /// </summary>
    public bool CanPublish => Microphone || Camera;

    /// <summary>The allowed sources in LiveKit's token spelling (<c>microphone</c>, <c>camera</c>). Empty when <see cref="CanPublish"/> is false.</summary>
    public IReadOnlyList<string> Sources =>
        (Microphone, Camera) switch
        {
            (true, true) => [MicrophoneSource, CameraSource],
            (true, false) => [MicrophoneSource],
            (false, true) => [CameraSource],
            _ => [],
        };
}

/// <summary>What the animator decided about one person in the current call (kept in memory by <see cref="CallModeration"/>).</summary>
public sealed record MemberModeration(bool Removed, bool MicrophoneMuted, bool CameraStopped)
{
    public static readonly MemberModeration None = new(false, false, false);
}

/// <summary>The rules of the group call (spec 009, research R22), as pure functions of what the database and memory say.</summary>
public static class CallRules
{
    /// <summary>The call server's room of a circle: one call per circle at a time (research R21).</summary>
    public static string RoomName(Guid circleId) => $"circle-{circleId:N}";

    /// <summary>The circle of a call server room named by <see cref="RoomName"/>; null for any other name.</summary>
    public static Guid? CircleOf(string? room) =>
        room is { Length: 39 } && room.StartsWith("circle-", StringComparison.Ordinal) && Guid.TryParseExact(room.AsSpan(7), "N", out var id)
            ? id
            : null;

    /// <summary>
    /// Whether the floor decides who may speak right now: a call is on in Hand to speak. Then giving or taking the
    /// floor changes a microphone permission on the call server; in Open mic the floor only marks the person.
    /// </summary>
    public static bool FloorGivesMicrophone(Circle circle)
    {
        ArgumentNullException.ThrowIfNull(circle);
        return circle.DiscussionOn && circle.DiscussionSpeaking == CallSpeakingModes.Hand;
    }

    /// <summary>
    /// The permission table of research R22, used for every pass and every live update. Null means "no pass at all":
    /// the call is off or the person was removed from it.
    /// <list type="table">
    /// <item>Animator: microphone always, camera if video is on.</item>
    /// <item>Participant, Open mic: microphone unless muted; camera if video is on and not stopped.</item>
    /// <item>Participant, Hand to speak, with the floor: microphone unless muted; camera if video is on and not stopped.</item>
    /// <item>Participant, Hand to speak, without the floor: no microphone; camera if video is on and not stopped.</item>
    /// <item>Removed from this call: no pass.</item>
    /// </list>
    /// </summary>
    public static CallRights? Permissions(Circle circle, CircleMember member, bool hasFloor, MemberModeration moderation)
    {
        ArgumentNullException.ThrowIfNull(circle);
        ArgumentNullException.ThrowIfNull(member);
        ArgumentNullException.ThrowIfNull(moderation);
        if (!circle.DiscussionOn || moderation.Removed)
        {
            return null;
        }
        var video = DiscussionRules.VideoAllowed(circle);
        if (member.Role == Roles.Animator)
        {
            return new CallRights(Microphone: true, Camera: video);
        }
        var mayTalk = circle.DiscussionSpeaking == CallSpeakingModes.Open || hasFloor;
        return new CallRights(Microphone: mayTalk && !moderation.MicrophoneMuted, Camera: video && !moderation.CameraStopped);
    }
}
