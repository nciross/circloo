using Circloo.Api.Data;

namespace Circloo.Api.Discussion;

/// <summary>
/// The group call as everyone sees it (spec 009, contracts/hub.md). <c>Speaking</c> is <c>hand</c> or <c>open</c>;
/// <c>Available</c> is false when this environment has no call server; <c>Away</c> is <c>none</c> or <c>away</c>.
/// </summary>
public sealed record DiscussionState(bool On, bool VideoAllowed, string Speaking, bool Available, string Away, DateTimeOffset? AwayEndsAt);

public static class DiscussionRules
{
    public const string AwayNone = "none";
    public const string AwayAway = "away";

    public static DiscussionState State(Circle circle, LiveKitOptions livekit) =>
        new(circle.DiscussionOn, VideoAllowed(circle), circle.DiscussionSpeaking, livekit.Available, AwayNone, null);

    /// <summary>Cameras are allowed only while the call is on and it is a video call (kids-safe path).</summary>
    public static bool VideoAllowed(Circle circle) => circle.DiscussionOn && circle.DiscussionVideo;
}

/// <summary>
/// The kinds of <c>CallNotice</c> (contracts/hub.md). The first group goes to the whole circle, the second to one
/// member's connections. The client words them. They are never stored (FR-930).
/// </summary>
public static class CallNoticeKinds
{
    public const string CallStarted = "call-started";
    public const string CallEnded = "call-ended";
    public const string VideoOn = "video-on";
    public const string VideoOff = "video-off";
    public const string ModeOpen = "mode-open";
    public const string ModeHand = "mode-hand";
    public const string MutedEveryone = "muted-everyone";

    public const string FloorGiven = "floor-given";
    public const string FloorTaken = "floor-taken";
    public const string MicMuted = "mic-muted";
    public const string MicAllowed = "mic-allowed";
    public const string CameraStopped = "camera-stopped";
    public const string CameraAllowed = "camera-allowed";
    public const string Removed = "removed";
    public const string AllowedBack = "allowed-back";
}
