using System.Text.Json;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Discussion;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;

namespace Circloo.Api.Tests.Discussion;

/// <summary>Issue #259 (T919): every row of the permission table of research R22, and the empty-sources rule of R20.</summary>
public sealed class CallPermissionTests
{
    private static Circle Circle(bool on = true, bool video = true, string speaking = CallSpeakingModes.Hand) => new()
    {
        Name = "All hands",
        JoinCode = "ABCDEFGHJK",
        Locale = "en",
        DiscussionOn = on,
        DiscussionVideo = video,
        DiscussionSpeaking = speaking,
    };

    private static CircleMember Member(string role) => new() { Role = role, Name = "Kenji", Character = "owl" };

    private static readonly MemberModeration Muted = MemberModeration.None with { MicrophoneMuted = true };
    private static readonly MemberModeration Stopped = MemberModeration.None with { CameraStopped = true };
    private static readonly MemberModeration Removed = MemberModeration.None with { Removed = true };

    public static TheoryData<string, string, bool, bool, MemberModeration, bool, bool> Table => new()
    {
        // Animator: microphone always, camera if video is on. Animator mutes never apply to the animator.
        { Roles.Animator, CallSpeakingModes.Hand, true, false, MemberModeration.None, true, true },
        { Roles.Animator, CallSpeakingModes.Hand, false, false, MemberModeration.None, true, false },
        { Roles.Animator, CallSpeakingModes.Open, true, false, MemberModeration.None, true, true },
        { Roles.Animator, CallSpeakingModes.Open, false, false, MemberModeration.None, true, false },
        // Participant, Open mic: microphone unless muted; camera if video is on and not stopped.
        { Roles.Participant, CallSpeakingModes.Open, true, false, MemberModeration.None, true, true },
        { Roles.Participant, CallSpeakingModes.Open, true, false, Muted, false, true },
        { Roles.Participant, CallSpeakingModes.Open, true, false, Stopped, true, false },
        { Roles.Participant, CallSpeakingModes.Open, false, false, MemberModeration.None, true, false },
        // Participant, Hand to speak, with the floor: same as Open mic.
        { Roles.Participant, CallSpeakingModes.Hand, true, true, MemberModeration.None, true, true },
        { Roles.Participant, CallSpeakingModes.Hand, true, true, Muted, false, true },
        { Roles.Participant, CallSpeakingModes.Hand, true, true, Stopped, true, false },
        { Roles.Participant, CallSpeakingModes.Hand, false, true, MemberModeration.None, true, false },
        // Participant, Hand to speak, without the floor: no microphone at all.
        { Roles.Participant, CallSpeakingModes.Hand, true, false, MemberModeration.None, false, true },
        { Roles.Participant, CallSpeakingModes.Hand, true, false, Stopped, false, false },
        { Roles.Participant, CallSpeakingModes.Hand, false, false, MemberModeration.None, false, false },
    };

    [Theory]
    [MemberData(nameof(Table))]
    public void Every_row_of_the_permission_table(string role, string speaking, bool video, bool hasFloor, MemberModeration moderation,
        bool microphone, bool camera)
    {
        var rights = CallRules.Permissions(Circle(video: video, speaking: speaking), Member(role), hasFloor, moderation);

        Assert.Equal(new CallRights(microphone, camera), rights);
    }

    [Theory]
    [InlineData(Roles.Participant)]
    [InlineData(Roles.Animator)]
    public void Someone_removed_from_the_call_gets_no_pass_at_all(string role) =>
        Assert.Null(CallRules.Permissions(Circle(), Member(role), hasFloor: true, Removed));

    [Fact]
    public void Nobody_gets_a_pass_while_the_call_is_off() =>
        Assert.Null(CallRules.Permissions(Circle(on: false, speaking: CallSpeakingModes.Open), Member(Roles.Animator), hasFloor: false, MemberModeration.None));

    [Fact]
    public void The_sources_follow_the_rights_and_are_never_empty_while_publishing()
    {
        Assert.Equal(["microphone", "camera"], new CallRights(true, true).Sources);
        Assert.Equal(["microphone"], new CallRights(true, false).Sources);
        Assert.Equal(["camera"], new CallRights(false, true).Sources);
        Assert.Empty(CallRights.Nothing.Sources);
        foreach (var rights in new[] { new CallRights(true, true), new CallRights(true, false), new CallRights(false, true), CallRights.Nothing })
        {
            Assert.Equal(rights.Sources.Count > 0, rights.CanPublish);
        }
    }

    /// <summary>
    /// The trap of research R20: LiveKit reads an empty <c>canPublishSources</c> as "every source". A person who may
    /// publish nothing must get <c>canPublish: false</c>, and no pass may ever say true with no source.
    /// </summary>
    [Fact]
    public void A_pass_with_nothing_to_publish_says_canPublish_false_and_never_an_empty_source_list()
    {
        var tokens = Tokens();

        var nothing = Grants(tokens.JoinPass("circle-x", Guid.NewGuid(), "Kenji", CallRights.Nothing).Token);
        Assert.False(nothing.GetProperty("canPublish").GetBoolean());
        Assert.False(nothing.TryGetProperty("canPublishSources", out _));

        // An audio call in Hand to speak, without the floor: the participant may publish nothing.
        var listener = CallRules.Permissions(Circle(video: false), Member(Roles.Participant), hasFloor: false, MemberModeration.None)!;
        Assert.False(Grants(tokens.JoinPass("circle-x", Guid.NewGuid(), "Kenji", listener).Token).GetProperty("canPublish").GetBoolean());

        foreach (var rights in new[] { new CallRights(true, true), new CallRights(true, false), new CallRights(false, true) })
        {
            var grants = Grants(tokens.JoinPass("circle-x", Guid.NewGuid(), "Kenji", rights).Token);
            Assert.True(grants.GetProperty("canPublish").GetBoolean());
            Assert.Equal(rights.Sources, grants.GetProperty("canPublishSources").EnumerateArray().Select(s => s.GetString()!).ToArray());
        }
    }

    [Fact]
    public void A_join_pass_never_carries_admin_rights_data_or_metadata()
    {
        var grants = Grants(Tokens().JoinPass("circle-x", Guid.NewGuid(), "Kenji", new CallRights(true, true)).Token);

        Assert.True(grants.GetProperty("roomJoin").GetBoolean());
        Assert.True(grants.GetProperty("canSubscribe").GetBoolean());
        Assert.False(grants.GetProperty("canPublishData").GetBoolean());
        Assert.False(grants.GetProperty("canUpdateOwnMetadata").GetBoolean());
        foreach (var admin in new[] { "roomAdmin", "roomCreate", "roomList", "roomRecord", "hidden", "recorder" })
        {
            Assert.False(grants.TryGetProperty(admin, out _), admin);
        }
    }

    [Fact]
    public void The_room_of_a_circle_is_named_after_its_id() =>
        Assert.Equal("circle-6f1c1b9e7a534c1e9a7d2f3f4a5b6c7d", CallRules.RoomName(Guid.Parse("6f1c1b9e-7a53-4c1e-9a7d-2f3f4a5b6c7d")));

    internal static LiveKitTokens Tokens(TimeProvider? clock = null) =>
        new(Options.Create(new LiveKitOptions
        {
            Url = "ws://localhost:7880",
            ApiKey = Infrastructure.LiveKitFixture.ApiKey,
            ApiSecret = Infrastructure.LiveKitFixture.ApiSecret,
        }), clock ?? new FakeTimeProvider(DateTimeOffset.Parse("2026-10-08T10:00:00Z", System.Globalization.CultureInfo.InvariantCulture)));

    private static JsonElement Grants(string token) => CallPassReader.Claims(token).GetProperty("video");
}
