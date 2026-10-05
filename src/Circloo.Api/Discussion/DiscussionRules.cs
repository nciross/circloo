using Circloo.Api.Data;

namespace Circloo.Api.Discussion;

/// <summary>The discussion setting as everyone sees it (spec 009, contracts/hub.md). <c>Away</c> is <c>none</c> or <c>frozen</c>.</summary>
public sealed record DiscussionState(bool On, bool VideoAllowed, int StageMax, int ListenersMax, string Away, DateTimeOffset? AwayEndsAt);

/// <summary>One seat on the stage. States: <c>invited</c>, <c>onStage</c>, <c>reconnecting</c>.</summary>
public sealed record Seat(Guid MemberId, string State, bool AudioOn, bool VideoOn, bool MutedByAnimator);

/// <summary>The stage: seats listed, viewers only counted.</summary>
public sealed record StageView(IReadOnlyList<Seat> Seats, int Watching);

/// <summary>The running recording, if any. Phases: <c>notice</c>, <c>capturing</c>.</summary>
public sealed record RecordingState(Guid Id, string Phase, DateTimeOffset StartedAt, DateTimeOffset CaptureFrom, DateTimeOffset MaxAt, Guid ByMemberId);

public static class DiscussionRules
{
    public const string AwayNone = "none";
    public const string AwayFrozen = "frozen";

    public static DiscussionState State(Circle circle, DiscussionOptions options) =>
        new(circle.DiscussionOn, VideoAllowed(circle), options.StageMax, options.ListenersMax, AwayNone, null);

    /// <summary>Cameras are allowed only while the discussion is on and the animator allowed them (kids-safe path).</summary>
    public static bool VideoAllowed(Circle circle) => circle.DiscussionOn && circle.DiscussionVideo;
}
