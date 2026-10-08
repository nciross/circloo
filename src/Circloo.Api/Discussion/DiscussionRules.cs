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
