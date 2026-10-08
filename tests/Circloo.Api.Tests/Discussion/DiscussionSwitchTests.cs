using System.Net.Http.Json;
using System.Text.Json;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Discussion;
using Circloo.Api.Tests.Infrastructure;
using Circloo.Api.Tests.LiveRoom;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Circloo.Api.Tests.Discussion;

/// <summary>
/// Issues #216 (T901), #258 (T918) and #260 (T920): the call's switches and speaking mode (spec 009 US1, US3,
/// contracts/hub.md). Animator only, put on the call server before they are kept, audited, never written to the chat.
/// The call server is <see cref="FakeLiveKitRooms"/>, which records every request.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class DiscussionSwitchTests(PostgresFixture pg) : IAsyncLifetime
{
    private readonly FakeLiveKitRooms _rooms = new();
    private ApiFactory _factory = null!;
    private DiscussionHost _host = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString(), FakeLiveKitRooms.Settings()) { Configure = _rooms.Install };
        _host = new DiscussionHost(_factory);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private CallModeration Moderation => _factory.Services.GetRequiredService<CallModeration>();

    private static async Task<string> RefusedAsync(Func<Task> call) =>
        (await Assert.ThrowsAsync<HubException>(call)).Message;

    private static Inbox<(string Kind, Guid? By, Guid? Subject)> Notices(HubConnection hub) =>
        new(push => hub.On<string, Guid?, Guid?>("CallNotice", (kind, by, subject) => push((kind, by, subject))));

    /// <summary>One field of an audit row's detail (jsonb: Postgres re-spaces it, so it is parsed, not searched).</summary>
    private static string? Field(AuditEvent row, string name)
    {
        using var doc = JsonDocument.Parse(row.Detail!);
        return doc.RootElement.TryGetProperty(name, out var value) ? value.ToString() : null;
    }

    private async Task<Guid> MemberIdAsync(Guid circleId, string name) =>
        (await _host.Room.MembersAsync(circleId)).Single(m => m.Name == name).Id;

    private async Task<Guid> AnimatorIdAsync(Guid circleId) =>
        (await _host.Room.MembersAsync(circleId)).Single(m => m.Role == Roles.Animator).Id;

    private async Task<CookieContainerHandler> GuestAsync(string code, string name, string character)
    {
        var (res, _, cookies) = await _host.Room.JoinAsync(code, name, character);
        res.EnsureSuccessStatusCode();
        return cookies;
    }

    private Task<int> GiveFloorAsync(Guid circleId, Guid memberId) => _host.Room.DbAsync(async db =>
    {
        db.RaisedHands.Add(new RaisedHand { CircleId = circleId, MemberId = memberId, RaisedAt = _factory.Clock.GetUtcNow(), HasFloor = true });
        return await db.SaveChangesAsync();
    });

    private Task<int> ChatRowsAsync(Guid circleId) => _host.Room.DbAsync(db => db.CircleMessages.CountAsync(m => m.CircleId == circleId));

    [Fact]
    public async Task A_new_circle_has_the_call_off_with_video_and_hand_to_speak_for_later()
    {
        // A host without a call server: the view says so (FR-935).
        await using var factory = new ApiFactory(pg.Container.GetConnectionString());
        var host = new DiscussionHost(factory);
        var circle = await host.Room.CircleAsync();
        var row = await host.CircleRowAsync(circle.Id);
        Assert.Equal((false, true, "hand"), (row.DiscussionOn, row.DiscussionVideo, row.DiscussionSpeaking));

        var view = await circle.Http.GetFromJsonAsync<CircleView>($"/api/circles/{circle.Id}");
        Assert.Equal(new DiscussionState(false, false, "hand", false, "none", null), view!.Discussion);
        Assert.All(view.Messages, m => Assert.Null(m.ReplyToId));

        var json = await circle.Http.GetStringAsync(new Uri($"/api/circles/{circle.Id}", UriKind.Relative));
        Assert.DoesNotContain("\"recording\"", json, StringComparison.Ordinal);
        Assert.Contains("\"discussion\":{\"on\":false,\"videoAllowed\":false,\"speaking\":\"hand\",\"available\":false,\"away\":\"none\",\"awayEndsAt\":null}", json, StringComparison.Ordinal);

        var hub = host.Room.Hub(circle.Cookies);
        var pushed = new Inbox<DiscussionState>(hub, "Discussion");
        await hub.StartAsync();
        await hub.InvokeAsync<Guid[]>("Enter", circle.Id);
        Assert.False((await pushed.NextAsync()).On);
        await hub.DisposeAsync();
    }

    [Fact]
    public async Task Without_a_call_server_starting_a_call_answers_calls_unavailable_and_changes_nothing()
    {
        await using var factory = new ApiFactory(pg.Container.GetConnectionString());
        var host = new DiscussionHost(factory);
        var circle = await host.Room.CircleAsync();
        await using var animator = await host.EnteredAsync(circle.Cookies, circle.Id);

        Assert.Contains("calls-unavailable", await RefusedAsync(() => animator.InvokeAsync("EnableDiscussion", true, "hand")));

        Assert.False((await host.CircleRowAsync(circle.Id)).DiscussionOn);
        Assert.Empty(await host.AuditAsync("discussion.on", circle.Id));
        // Ending a call that never started is fine without a call server too.
        await animator.InvokeAsync("DisableDiscussion");
    }

    [Fact]
    public async Task The_view_says_calls_are_available_when_a_call_server_is_configured()
    {
        var circle = await _host.Room.CircleAsync();

        var view = await circle.Http.GetFromJsonAsync<CircleView>($"/api/circles/{circle.Id}");

        Assert.True(view!.Discussion.Available);
    }

    [Theory]
    [InlineData("EnableDiscussion")]
    [InlineData("DisableDiscussion")]
    [InlineData("SetSpeakingMode")]
    public async Task Each_method_is_refused_for_a_participant_a_guest_a_non_member_and_the_audience_and_audited(string method)
    {
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "hand");
        var attempts = new List<(string Who, string Code, HubConnection Hub)>();

        var (_, _, guestCookies) = await _host.Room.JoinAsync(circle.Code, "Guest", "fox");
        attempts.Add(("guest", "animator-only", await _host.EnteredAsync(guestCookies, circle.Id)));

        var (_, memberCookies, _) = await _host.SignedInParticipantAsync(circle.Code, "owl");
        attempts.Add(("member", "animator-only", await _host.EnteredAsync(memberCookies, circle.Id)));

        var (_, strangerCookies, _) = await _host.SignedInStrangerAsync();
        var stranger = await _host.ConnectedAsync(strangerCookies);
        Assert.Contains("not-a-member", await RefusedAsync(() => stranger.InvokeAsync<Guid[]>("Enter", circle.Id)));
        attempts.Add(("stranger", "not-entered", stranger));

        attempts.Add(("audience", "audience-read-only", await _host.AudienceAsync(circle.Cookies, circle.Id)));

        object[] args = method switch
        {
            "EnableDiscussion" => [false, "open"],
            "SetSpeakingMode" => ["open"],
            _ => [],
        };
        foreach (var (who, code, hub) in attempts)
        {
            await using var connection = hub;
            var before = (await _host.RefusalsAsync()).Count;
            Assert.Contains(code, await RefusedAsync(() => hub.InvokeCoreAsync(method, args)));
            var rows = await _host.RefusalsAsync();
            Assert.True(rows.Count == before + 1, $"{who}: one audit row per refusal");
            Assert.Equal(method, Field(rows[^1], "method"));
        }

        // Nothing changed, here or on the call server: still on, a video call in Hand to speak.
        var row = await _host.CircleRowAsync(circle.Id);
        Assert.Equal((true, true, "hand"), (row.DiscussionOn, row.DiscussionVideo, row.DiscussionSpeaking));
        Assert.Single(_rooms.Created, r => r.Room == room);
        Assert.DoesNotContain(room, _rooms.Deleted);
        Assert.Empty(_rooms.UpdatesIn(room));
    }

    [Fact]
    public async Task A_refusal_names_ids_only_and_audits_at_most_five_rows_a_minute_per_member()
    {
        var circle = await _host.Room.CircleAsync();
        var (_, _, guestCookies) = await _host.Room.JoinAsync(circle.Code, "Guest", "fox");
        await using var guest = await _host.EnteredAsync(guestCookies, circle.Id);
        var before = (await _host.RefusalsAsync()).Count;
        for (var i = 0; i < 8; i++)
        {
            Assert.Contains("animator-only", await RefusedAsync(() => guest.InvokeAsync("EnableDiscussion", true, "hand")));
        }
        var rows = await _host.RefusalsAsync();
        Assert.Equal(before + 5, rows.Count);
        var member = (await _host.Room.MembersAsync(circle.Id)).Single(m => m.Name == "Guest");
        Assert.Equal(member.Id.ToString(), Field(rows[^1], "member"));

        _factory.Clock.Advance(TimeSpan.FromMinutes(2));
        await RefusedAsync(() => guest.InvokeAsync("EnableDiscussion", true, "hand"));
        Assert.Equal(before + 6, (await _host.RefusalsAsync()).Count);
    }

    [Fact]
    public async Task Starting_opens_the_room_tells_everyone_at_once_and_survives_a_new_connection()
    {
        var circle = await _host.Room.CircleAsync();
        var (_, _, guestCookies) = await _host.Room.JoinAsync(circle.Code, "Guest", "fox");
        var guest = _host.Room.Hub(guestCookies);
        var pushed = new Inbox<DiscussionState>(guest, "Discussion");
        var notices = Notices(guest);
        await guest.StartAsync();
        await guest.InvokeAsync<Guid[]>("Enter", circle.Id);
        Assert.False((await pushed.NextAsync()).On);

        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "open");
        var on = await pushed.NextAsync().WaitAsync(TimeSpan.FromSeconds(1));
        Assert.Equal((true, true, "open"), (on.On, on.VideoAllowed, on.Speaking));
        var animatorId = await AnimatorIdAsync(circle.Id);
        Assert.Equal((CallNoticeKinds.CallStarted, (Guid?)animatorId, (Guid?)null), await notices.NextAsync().WaitAsync(TimeSpan.FromSeconds(1)));

        // The API opened the room itself, with the circle's size as the limit.
        Assert.Contains((CallRules.RoomName(circle.Id), 100), _rooms.Created);
        var row = await _host.CircleRowAsync(circle.Id);
        Assert.Equal((true, true, "open"), (row.DiscussionOn, row.DiscussionVideo, row.DiscussionSpeaking));
        var audit = Assert.Single(await _host.AuditAsync("discussion.on", circle.Id));
        Assert.Equal((animatorId.ToString(), "True", "open"), (Field(audit, "member"), Field(audit, "videoAllowed"), Field(audit, "speaking")));
        Assert.Equal(0, await ChatRowsAsync(circle.Id));

        // A reload: the new connection and the page load both see it.
        await guest.StopAsync();
        var again = _host.Room.Hub(guestCookies);
        var replay = new Inbox<DiscussionState>(again, "Discussion");
        await again.StartAsync();
        await again.InvokeAsync<Guid[]>("Enter", circle.Id);
        Assert.True((await replay.NextAsync()).On);
        var view = await (await _host.Room.JoinAsync(circle.Code, "Other", "owl")).Http.GetFromJsonAsync<CircleView>($"/api/circles/{circle.Id}");
        Assert.True(view!.Discussion.On);
        await again.DisposeAsync();
        await guest.DisposeAsync();
    }

    [Fact]
    public async Task An_unknown_mode_is_refused_and_the_mode_changes_only_while_the_call_is_on()
    {
        var circle = await _host.Room.CircleAsync();
        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);

        Assert.Contains("mode-invalid", await RefusedAsync(() => animator.InvokeAsync("EnableDiscussion", true, "shout")));
        Assert.False((await _host.CircleRowAsync(circle.Id)).DiscussionOn);
        Assert.DoesNotContain(_rooms.Created, r => r.Room == CallRules.RoomName(circle.Id));
        Assert.Contains("call-off", await RefusedAsync(() => animator.InvokeAsync("SetSpeakingMode", "open")));

        await animator.InvokeAsync("EnableDiscussion", true, "hand");
        var notices = Notices(animator);
        Assert.Contains("mode-invalid", await RefusedAsync(() => animator.InvokeAsync("SetSpeakingMode", "HAND")));
        // The same mode again changes nothing and tells nobody.
        await animator.InvokeAsync("SetSpeakingMode", "hand");
        await animator.InvokeAsync("EnableDiscussion", true, "hand");
        Assert.Equal("hand", (await _host.CircleRowAsync(circle.Id)).DiscussionSpeaking);
        Assert.Empty(await _host.AuditAsync("call.mode", circle.Id));
        Assert.Single(await _host.AuditAsync("discussion.on", circle.Id));
        Assert.Empty(notices.Drain());
    }

    [Fact]
    public async Task Video_off_takes_every_camera_away_on_the_call_server_and_video_on_gives_back_the_ones_not_stopped()
    {
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        await GuestAsync(circle.Code, "Ana", "fox");
        await GuestAsync(circle.Code, "Ben", "owl");
        var (animatorId, ana, ben) = (await AnimatorIdAsync(circle.Id), await MemberIdAsync(circle.Id, "Ana"), await MemberIdAsync(circle.Id, "Ben"));
        var stranger = Guid.NewGuid();
        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        var states = new Inbox<DiscussionState>(animator, "Discussion");
        var notices = Notices(animator);
        await animator.InvokeAsync("EnableDiscussion", true, "open");
        await notices.NextAsync(n => n.Kind == CallNoticeKinds.CallStarted);

        // In the room: the animator, Ana, Ben whose camera the animator stopped, and an identity that is nobody here.
        Moderation.Mute(circle.Id, ben, CallRights.CameraSource);
        _rooms.Join(room, animatorId, new CallRights(true, true));
        _rooms.Join(room, ana, new CallRights(true, true));
        _rooms.Join(room, ben, new CallRights(true, false));
        _rooms.Join(room, stranger, new CallRights(true, true));

        await animator.InvokeAsync("EnableDiscussion", false, "open");

        Assert.Equal(new CallRights(true, false), _rooms.PermissionOf(room, animatorId));
        Assert.Equal(new CallRights(true, false), _rooms.PermissionOf(room, ana));
        Assert.Equal(new CallRights(true, false), _rooms.PermissionOf(room, ben));
        Assert.Equal(CallRights.Nothing, _rooms.PermissionOf(room, stranger));
        // Ben had no camera already: only the people whose permission changed were updated.
        Assert.Equal(new[] { animatorId.ToString(), ana.ToString(), stranger.ToString() }.Order(), _rooms.UpdatesIn(room).Select(u => u.Identity).Order());
        Assert.Equal((CallNoticeKinds.VideoOff, (Guid?)animatorId, (Guid?)null), await notices.NextAsync(n => n.Kind != CallNoticeKinds.CallStarted));
        Assert.False((await states.NextAsync(s => s.On && !s.VideoAllowed)).VideoAllowed);
        var audits = await _host.AuditAsync("discussion.on", circle.Id);
        Assert.Equal(2, audits.Count);
        Assert.Equal("False", Field(audits[^1], "videoAllowed"));
        Assert.Empty(await _host.AuditAsync("call.mode", circle.Id));

        await animator.InvokeAsync("EnableDiscussion", true, "open");

        Assert.Equal(new CallRights(true, true), _rooms.PermissionOf(room, ana));
        Assert.Equal(new CallRights(true, false), _rooms.PermissionOf(room, ben));
        Assert.Equal(CallRights.Nothing, _rooms.PermissionOf(room, stranger));
        Assert.Equal(CallNoticeKinds.VideoOn, (await notices.NextAsync()).Kind);
        Assert.Equal(0, await ChatRowsAsync(circle.Id));
    }

    [Fact]
    public async Task The_speaking_mode_changes_microphones_on_the_call_server_and_keeps_the_animators_mutes()
    {
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        await GuestAsync(circle.Code, "Ana", "fox");
        await GuestAsync(circle.Code, "Ben", "owl");
        await GuestAsync(circle.Code, "Cleo", "cat");
        var animatorId = await AnimatorIdAsync(circle.Id);
        var (ana, ben, cleo) = (await MemberIdAsync(circle.Id, "Ana"), await MemberIdAsync(circle.Id, "Ben"), await MemberIdAsync(circle.Id, "Cleo"));
        var (_, _, guestCookies) = await _host.Room.JoinAsync(circle.Code, "Dan", "bear");
        await using var guest = await _host.EnteredAsync(guestCookies, circle.Id);
        var states = new Inbox<DiscussionState>(guest, "Discussion");
        var notices = Notices(guest);
        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "hand");
        await notices.NextAsync(n => n.Kind == CallNoticeKinds.CallStarted);

        // Hand to speak: Ana listens, Ben was muted by the animator, Cleo has the floor.
        Moderation.Mute(circle.Id, ben, CallRights.MicrophoneSource);
        await GiveFloorAsync(circle.Id, cleo);
        _rooms.Join(room, animatorId, new CallRights(true, true));
        _rooms.Join(room, ana, new CallRights(false, true));
        _rooms.Join(room, ben, new CallRights(false, true));
        _rooms.Join(room, cleo, new CallRights(true, true));

        await animator.InvokeAsync("SetSpeakingMode", "open");

        Assert.Equal(new CallRights(true, true), _rooms.PermissionOf(room, ana));
        Assert.Equal(new CallRights(false, true), _rooms.PermissionOf(room, ben));
        Assert.Equal(new CallRights(true, true), _rooms.PermissionOf(room, cleo));
        Assert.Equal(new CallRights(true, true), _rooms.PermissionOf(room, animatorId));
        Assert.Equal(new[] { (ana.ToString(), new CallRights(true, true)) }, _rooms.UpdatesIn(room));
        Assert.Equal("open", (await states.NextAsync(s => s.Speaking == "open")).Speaking);
        Assert.Equal((CallNoticeKinds.ModeOpen, (Guid?)animatorId, (Guid?)null), await notices.NextAsync());
        var mode = Assert.Single(await _host.AuditAsync("call.mode", circle.Id));
        Assert.Equal(("open", animatorId.ToString()), (Field(mode, "speaking"), Field(mode, "member")));

        // Back to Hand to speak through the main switch: Ana listens again, Cleo keeps the floor, Ben stays muted.
        await animator.InvokeAsync("EnableDiscussion", true, "hand");

        Assert.Equal(new CallRights(false, true), _rooms.PermissionOf(room, ana));
        Assert.Equal(new CallRights(false, true), _rooms.PermissionOf(room, ben));
        Assert.Equal(new CallRights(true, true), _rooms.PermissionOf(room, cleo));
        Assert.Equal(2, _rooms.UpdatesIn(room).Count);
        Assert.Equal(CallNoticeKinds.ModeHand, (await notices.NextAsync()).Kind);
        Assert.Equal(2, (await _host.AuditAsync("call.mode", circle.Id)).Count);
        // Only the mode changed: no video audit.
        Assert.Single(await _host.AuditAsync("discussion.on", circle.Id));
        Assert.True(Moderation.Of(circle.Id, ben).MicrophoneMuted);
        Assert.Equal(0, await ChatRowsAsync(circle.Id));
    }

    [Fact]
    public async Task Speaking_mode_changes_are_limited_to_thirty_every_ten_seconds()
    {
        var circle = await _host.Room.CircleAsync();
        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", false, "hand");

        for (var i = 0; i < 30; i++)
        {
            await animator.InvokeAsync("SetSpeakingMode", i % 2 == 0 ? "open" : "hand");
        }
        Assert.Contains("slow-down", await RefusedAsync(() => animator.InvokeAsync("SetSpeakingMode", "open")));
        Assert.Equal("hand", (await _host.CircleRowAsync(circle.Id)).DiscussionSpeaking);

        _host.Advance(TimeSpan.FromSeconds(10));
        await animator.InvokeAsync("SetSpeakingMode", "open");
        Assert.Equal("open", (await _host.CircleRowAsync(circle.Id)).DiscussionSpeaking);
    }

    [Fact]
    public async Task When_the_call_server_fails_nothing_is_kept()
    {
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        await GuestAsync(circle.Code, "Ana", "fox");
        await GuestAsync(circle.Code, "Ben", "owl");
        var (ana, ben) = (await MemberIdAsync(circle.Id, "Ana"), await MemberIdAsync(circle.Id, "Ben"));
        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        var notices = Notices(animator);

        // Starting: the room could not be opened, so the call stays off.
        _rooms.Down = true;
        try
        {
            Assert.Contains("try-again", await RefusedAsync(() => animator.InvokeAsync("EnableDiscussion", true, "hand")));
        }
        finally
        {
            _rooms.Down = false;
        }
        Assert.False((await _host.CircleRowAsync(circle.Id)).DiscussionOn);
        Assert.Empty(await _host.AuditAsync("discussion.on", circle.Id));

        await animator.InvokeAsync("EnableDiscussion", true, "hand");
        _rooms.Join(room, ana, new CallRights(false, true));
        _rooms.Join(room, ben, new CallRights(false, true));

        // Halfway through a change, the call server refuses Ben: whoever was already changed is put back.
        _rooms.FailUpdatesFor[ben.ToString()] = true;
        Assert.Contains("try-again", await RefusedAsync(() => animator.InvokeAsync("SetSpeakingMode", "open")));
        Assert.Contains("try-again", await RefusedAsync(() => animator.InvokeAsync("EnableDiscussion", false, "open")));

        var row = await _host.CircleRowAsync(circle.Id);
        Assert.Equal((true, true, "hand"), (row.DiscussionOn, row.DiscussionVideo, row.DiscussionSpeaking));
        Assert.Equal(new CallRights(false, true), _rooms.PermissionOf(room, ana));
        Assert.Equal(new CallRights(false, true), _rooms.PermissionOf(room, ben));
        Assert.Empty(await _host.AuditAsync("call.mode", circle.Id));
        Assert.Single(await _host.AuditAsync("discussion.on", circle.Id));
        Assert.Equal(new[] { CallNoticeKinds.CallStarted }, notices.Drain().Select(n => n.Kind));

        // Once the call server answers again, the same change goes through.
        _rooms.FailUpdatesFor.Clear();
        await animator.InvokeAsync("SetSpeakingMode", "open");
        Assert.Equal(new CallRights(true, true), _rooms.PermissionOf(room, ben));
        Assert.Equal("open", (await _host.CircleRowAsync(circle.Id)).DiscussionSpeaking);
    }

    [Fact]
    public async Task Cameras_can_change_while_on_and_a_repeat_changes_nothing()
    {
        var circle = await _host.Room.CircleAsync();
        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        var states = new Inbox<DiscussionState>(animator, "Discussion");

        await animator.InvokeAsync("EnableDiscussion", true, "hand");
        await animator.InvokeAsync("EnableDiscussion", true, "hand");
        await animator.InvokeAsync("EnableDiscussion", false, "hand");
        Assert.True((await states.NextAsync(s => s.On)).VideoAllowed);
        Assert.False((await states.NextAsync(s => s.On)).VideoAllowed);
        Assert.Empty(states.Drain());

        var row = await _host.CircleRowAsync(circle.Id);
        Assert.Equal((true, false), (row.DiscussionOn, row.DiscussionVideo));
        Assert.Equal(2, (await _host.AuditAsync("discussion.on", circle.Id)).Count);
        Assert.Equal(0, await ChatRowsAsync(circle.Id));
    }

    [Fact]
    public async Task Ending_deletes_the_room_clears_hands_and_mutes_and_tells_everyone_within_two_seconds()
    {
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        var (_, _, guestCookies) = await _host.Room.JoinAsync(circle.Code, "Guest", "fox");
        var guest = _host.Room.Hub(guestCookies);
        var pushed = new Inbox<DiscussionState>(guest, "Discussion");
        var hands = new Inbox<HandsView>(guest, "Hands");
        var notices = Notices(guest);
        await guest.StartAsync();
        await guest.InvokeAsync<Guid[]>("Enter", circle.Id);
        await pushed.NextAsync();
        await hands.NextAsync();

        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "hand");
        await pushed.NextAsync(s => s.On);
        var member = await MemberIdAsync(circle.Id, "Guest");
        await GiveFloorAsync(circle.Id, member);
        Moderation.Mute(circle.Id, member, CallRights.MicrophoneSource);
        Moderation.Remove(circle.Id, Guid.NewGuid());
        _rooms.Join(room, member, new CallRights(false, true));

        var started = DateTimeOffset.UtcNow;
        await animator.InvokeAsync("DisableDiscussion");
        var off = await pushed.NextAsync(s => !s.On).WaitAsync(TimeSpan.FromSeconds(2));
        var cleared = await hands.NextAsync(h => h.Floor is null && h.Queue.Count == 0).WaitAsync(TimeSpan.FromSeconds(2));
        var ended = await notices.NextAsync(n => n.Kind == CallNoticeKinds.CallEnded).WaitAsync(TimeSpan.FromSeconds(2));
        Assert.True(DateTimeOffset.UtcNow - started < TimeSpan.FromSeconds(2));

        Assert.False(off.VideoAllowed);
        Assert.Empty(cleared.Queue);
        Assert.Equal(await AnimatorIdAsync(circle.Id), ended.By);
        Assert.Contains(room, _rooms.Deleted);
        Assert.Null(_rooms.PermissionOf(room, member));
        Assert.Equal(MemberModeration.None, Moderation.Of(circle.Id, member));
        Assert.Equal(0, await _host.Room.DbAsync(db => db.RaisedHands.CountAsync(h => h.CircleId == circle.Id)));
        Assert.False((await _host.CircleRowAsync(circle.Id)).DiscussionOn);
        var audit = Assert.Single(await _host.AuditAsync("discussion.off", circle.Id));
        Assert.Equal("animator", Field(audit, "reason"));
        Assert.Equal(0, await ChatRowsAsync(circle.Id));

        // Off again: nothing more is written or deleted.
        await animator.InvokeAsync("DisableDiscussion");
        Assert.Single(await _host.AuditAsync("discussion.off", circle.Id));
        Assert.Single(_rooms.Deleted, r => r == room);
        await guest.DisposeAsync();
    }

    [Fact]
    public async Task Ending_does_not_wait_for_a_call_server_that_does_not_answer()
    {
        var circle = await _host.Room.CircleAsync();
        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "hand");

        _rooms.Down = true;
        try
        {
            await animator.InvokeAsync("DisableDiscussion");
        }
        finally
        {
            _rooms.Down = false;
        }

        Assert.False((await _host.CircleRowAsync(circle.Id)).DiscussionOn);
        Assert.Single(await _host.AuditAsync("discussion.off", circle.Id));
    }

    [Fact]
    public async Task Closing_the_circle_ends_its_call()
    {
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        var (_, _, guestCookies) = await _host.Room.JoinAsync(circle.Code, "Guest", "fox");
        await using var guest = await _host.EnteredAsync(guestCookies, circle.Id);
        var notices = Notices(guest);
        await using (var animator = await _host.EnteredAsync(circle.Cookies, circle.Id))
        {
            await animator.InvokeAsync("EnableDiscussion", true, "open");
        }
        await notices.NextAsync(n => n.Kind == CallNoticeKinds.CallStarted);
        var member = await MemberIdAsync(circle.Id, "Guest");
        Moderation.Mute(circle.Id, member, CallRights.CameraSource);

        (await circle.Http.PostJsonAsync($"/api/circles/{circle.Id}/close", new { }, circle.Csrf)).EnsureSuccessStatusCode();

        Assert.Equal(CallNoticeKinds.CallEnded, (await notices.NextAsync()).Kind);
        Assert.False((await _host.CircleRowAsync(circle.Id)).DiscussionOn);
        Assert.Contains(room, _rooms.Deleted);
        Assert.Equal(MemberModeration.None, Moderation.Of(circle.Id, member));
        var audit = Assert.Single(await _host.AuditAsync("discussion.off", circle.Id));
        Assert.Equal("circle-closed", Field(audit, "reason"));
        Assert.Equal(await AnimatorIdAsync(circle.Id), Guid.Parse(Field(audit, "member")!));

        // A circle closed with the call off writes nothing about calls.
        var quiet = await _host.Room.CircleAsync();
        (await quiet.Http.PostJsonAsync($"/api/circles/{quiet.Id}/close", new { }, quiet.Csrf)).EnsureSuccessStatusCode();
        Assert.Empty(await _host.AuditAsync("discussion.off", quiet.Id));
        Assert.DoesNotContain(CallRules.RoomName(quiet.Id), _rooms.Deleted);
    }

    [Fact]
    public async Task The_audience_screen_is_told_the_setting_but_cannot_change_it()
    {
        var circle = await _host.Room.CircleAsync();
        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "hand");

        var audience = _host.Room.Hub(circle.Cookies);
        var pushed = new Inbox<DiscussionState>(audience, "Discussion");
        await audience.StartAsync();
        await audience.InvokeAsync<object?>("EnterAudience", circle.Id);
        Assert.True((await pushed.NextAsync()).On);
        Assert.Contains("audience-read-only", await RefusedAsync(() => audience.InvokeAsync("SetSpeakingMode", "open")));
        await audience.DisposeAsync();
    }
}
