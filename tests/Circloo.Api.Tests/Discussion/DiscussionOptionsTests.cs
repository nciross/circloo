using Circloo.Api.Discussion;

namespace Circloo.Api.Tests.Discussion;

/// <summary>Issue #216 (T901): the <c>Discussion:*</c> settings and their start-up checks (spec 009 data-model).</summary>
public sealed class DiscussionOptionsTests
{
    private static string[] Problems(DiscussionOptions o) =>
        new DiscussionOptionsValidator().Validate(null, o).Failures?.ToArray() ?? [];

    [Fact]
    public void The_defaults_are_valid_and_hand_out_the_public_stun_server()
    {
        var o = new DiscussionOptions();
        Assert.Empty(Problems(o));
        Assert.Equal(new[] { "stun:stun.cloudflare.com:3478" }, o.IceServers);
    }

    [Fact]
    public void Blank_entries_are_dropped_so_a_single_blank_leaves_host_candidates_only()
    {
        var o = new DiscussionOptions { IceUrls = ["", "  ", " turn:turn.example.test:3478 "] };
        Assert.Equal(new[] { "turn:turn.example.test:3478" }, o.IceServers);
        Assert.Empty(Problems(o));
        Assert.Empty(new DiscussionOptions { IceUrls = [""] }.IceServers);
    }

    [Theory]
    [InlineData("https://stun.example.test")]
    [InlineData("stun:")]
    [InlineData("stun.example.test:3478")]
    [InlineData("stun:bad host")]
    public void An_ice_address_needs_a_stun_or_turn_scheme(string url) =>
        Assert.Single(Problems(new DiscussionOptions { IceUrls = [url] }));

    [Fact]
    public void The_away_end_must_follow_the_freeze_and_the_warning_must_come_before_the_cap()
    {
        Assert.Single(Problems(new DiscussionOptions { AwayFreezeSeconds = 300, AwayEndSeconds = 300 }));
        Assert.Single(Problems(new DiscussionOptions { RecordingWarnMinutes = 20, RecordingMaxMinutes = 20 }));
    }
}
