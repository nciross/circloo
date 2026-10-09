using System.Net;
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
/// Issue #261 (T921): the floor, the animator's mutes and removals in a call (spec 009 US3, research R22,
/// contracts/hub.md). The rules live in each person's permissions on the call server, here
/// <see cref="FakeLiveKitRooms"/>, which records every request and drops a revoked source's tracks like LiveKit v1.13.7.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class CallModerationTests(PostgresFixture pg) : IAsyncLifetime
{
    private readonly FakeLiveKitRooms _rooms = new();
    private readonly List<HubConnection> _open = [];
    private ApiFactory _factory = null!;
    private DiscussionHost _host = null!;

    private static readonly CallRights Everything = new(true, true);
    private static readonly CallRights CameraOnly = new(false, true);

    private sealed record Person(Guid Id, HttpClient Http, HubConnection Hub, Inbox<(string Kind, Guid? By, Guid? Subject)> Notices);

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString(), FakeLiveKitRooms.Settings()) { Configure = _rooms.Install };
        _host = new DiscussionHost(_factory);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        foreach (var hub in _open)
        {
            await hub.DisposeAsync();
        }
        await _factory.DisposeAsync();
    }

    private CallModeration Moderation => _factory.Services.GetRequiredService<CallModeration>();

    private static async Task<string> RefusedAsync(Func<Task> call) =>
        (await Assert.ThrowsAsync<HubException>(call)).Message;

    private async Task<(HubConnection Hub, Inbox<(string Kind, Guid? By, Guid? Subject)> Notices)> EnterAsync(CookieContainerHandler cookies, Guid circleId)
    {
        var hub = _host.Room.Hub(cookies);
        var notices = new Inbox<(string Kind, Guid? By, Guid? Subject)>(push =>
            hub.On<string, Guid?, Guid?>("CallNotice", (kind, by, subject) => push((kind, by, subject))));
        await hub.StartAsync();
        _open.Add(hub);
        await hub.InvokeAsync<Guid[]>("Enter", circleId);
        return (hub, notices);
    }

    private async Task<Person> GuestAsync(Guid circleId, string code, string name, string character)
    {
        var (res, http, cookies) = await _host.Room.JoinAsync(code, name, character);
        res.EnsureSuccessStatusCode();
        var id = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("memberId").GetGuid();
        var (hub, notices) = await EnterAsync(cookies, circleId);
        return new Person(id, http, hub, notices);
    }

    private async Task<Guid> AnimatorIdAsync(Guid circleId) =>
        (await _host.Room.MembersAsync(circleId)).Single(m => m.Role == Roles.Animator).Id;

    private static async Task<HttpResponseMessage> PassAsync(Person person, Guid circleId)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, $"/api/circles/{circleId}/call/token");
        req.Headers.Add("X-XSRF-TOKEN", await person.Http.CsrfAsync());
        return await person.Http.SendAsync(req);
    }

    private static async Task<CallPassView> GrantedPassAsync(Person person, Guid circleId)
    {
        var res = await PassAsync(person, circleId);
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<CallPassView>())!;
    }

    private Task<List<RaisedHand>> HandsAsync(Guid circleId) =>
        _host.Room.DbAsync(db => db.RaisedHands.AsNoTracking().Where(h => h.CircleId == circleId).ToListAsync());

    /// <summary>
    /// Every audit type written about this circle except the set-up rows (the circle created, guests joining), which
    /// are not about the call. jsonb: filtered here, not in SQL.
    /// </summary>
    private async Task<string[]> AuditTypesAsync(Guid circleId)
    {
        var rows = await _host.Room.DbAsync(db => db.AuditEvents.AsNoTracking().Where(a => a.Detail != null).Select(a => new { a.Type, a.Detail }).ToListAsync());
        return [.. rows.Where(r => r.Detail!.Contains(circleId.ToString(), StringComparison.Ordinal) && r.Type is not ("circle.created" or "circle.joined"))
            .Select(r => r.Type).Distinct().Order()];
    }

    private Task<int> ChatRowsAsync(Guid circleId) => _host.Room.DbAsync(db => db.CircleMessages.CountAsync(m => m.CircleId == circleId));

    private static string? Field(AuditEvent row, string name)
    {
        using var doc = JsonDocument.Parse(row.Detail!);
        return doc.RootElement.TryGetProperty(name, out var value) ? value.ToString() : null;
    }

    /// <summary>Every notice kind a connection received up to and including <paramref name="kind"/>, in order.</summary>
    private static async Task<List<string>> KindsUntilAsync(Inbox<(string Kind, Guid? By, Guid? Subject)> notices, string kind)
    {
        var seen = new List<string>();
        await notices.NextAsync(n =>
        {
            seen.Add(n.Kind);
            return n.Kind == kind;
        });
        return seen;
    }

    private static CallTrack Mic(string sid, bool muted = false) => new(sid, CallRights.MicrophoneSource, muted);

    private static CallTrack Camera(string sid) => new(sid, CallRights.CameraSource, false);

    [Theory]
    [InlineData("MuteMember")]
    [InlineData("AllowMember")]
    [InlineData("MuteEveryone")]
    [InlineData("RemoveFromCall")]
    [InlineData("AllowBack")]
    public async Task Each_method_is_refused_for_a_participant_a_guest_a_non_member_and_the_audience_and_audited(string method)
    {
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "open");
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");
        _rooms.Join(room, ana.Id, new CallRights(true, false), Mic("TR_ana_mic"));
        // Something for each method to change: Ana's camera is stopped and she is removed.
        Moderation.Mute(circle.Id, ana.Id, CallRights.CameraSource);
        Moderation.Remove(circle.Id, ana.Id);
        var before = Moderation.Of(circle.Id, ana.Id);

        var attempts = new List<(string Who, string Code, HubConnection Hub)>
        {
            ("guest", "animator-only", ana.Hub),
        };
        var (_, memberCookies, _) = await _host.SignedInParticipantAsync(circle.Code, "owl");
        attempts.Add(("member", "animator-only", (await EnterAsync(memberCookies, circle.Id)).Hub));
        var (_, strangerCookies, _) = await _host.SignedInStrangerAsync();
        var stranger = await _host.ConnectedAsync(strangerCookies);
        _open.Add(stranger);
        attempts.Add(("stranger", "not-entered", stranger));
        var audience = await _host.AudienceAsync(circle.Cookies, circle.Id);
        _open.Add(audience);
        attempts.Add(("audience", "audience-read-only", audience));

        object[] args = method switch
        {
            "MuteMember" => [ana.Id, CallRights.MicrophoneSource],
            "AllowMember" => [ana.Id, CallRights.CameraSource],
            "MuteEveryone" => [],
            _ => [ana.Id],
        };
        foreach (var (who, code, hub) in attempts)
        {
            var refusals = (await _host.RefusalsAsync()).Count;
            Assert.Contains(code, await RefusedAsync(() => hub.InvokeCoreAsync(method, args)));
            var rows = await _host.RefusalsAsync();
            Assert.True(rows.Count == refusals + 1, $"{who}: one audit row per refusal");
            Assert.Equal(method, Field(rows[^1], "method"));
        }

        // Nothing changed, in memory or on the call server.
        Assert.Equal(before, Moderation.Of(circle.Id, ana.Id));
        Assert.Empty(_rooms.UpdatesIn(room));
        Assert.Empty(_rooms.TrackMutes);
        Assert.Empty(_rooms.Removals);
        Assert.Equal(new CallRights(true, false), _rooms.PermissionOf(room, ana.Id));
    }

    [Fact]
    public async Task The_methods_need_a_call_a_known_participant_and_a_known_source_and_are_limited_to_thirty_every_ten_seconds()
    {
        var circle = await _host.Room.CircleAsync();
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");
        (string Method, object[] Args)[] all =
        [
            ("MuteMember", [ana.Id, "microphone"]), ("AllowMember", [ana.Id, "microphone"]), ("MuteEveryone", []),
            ("RemoveFromCall", [ana.Id]), ("AllowBack", [ana.Id]),
        ];
        foreach (var (method, args) in all)
        {
            Assert.Contains("call-off", await RefusedAsync(() => animator.InvokeCoreAsync(method, args)));
        }

        await animator.InvokeAsync("EnableDiscussion", true, "hand");
        var other = await _host.Room.CircleAsync();
        (await _host.Room.JoinAsync(other.Code, "Zed", "owl")).Response.EnsureSuccessStatusCode();
        var stranger = (await _host.Room.MembersAsync(other.Id)).Single(m => m.Name == "Zed").Id;
        var animatorId = await AnimatorIdAsync(circle.Id);

        Assert.Contains("source-invalid", await RefusedAsync(() => animator.InvokeAsync("MuteMember", ana.Id, "screen_share")));
        Assert.Contains("source-invalid", await RefusedAsync(() => animator.InvokeAsync("AllowMember", ana.Id, "MICROPHONE")));
        foreach (var nobody in new[] { Guid.NewGuid(), stranger, animatorId })
        {
            Assert.Contains("member-invalid", await RefusedAsync(() => animator.InvokeAsync("MuteMember", nobody, "camera")));
            Assert.Contains("member-invalid", await RefusedAsync(() => animator.InvokeAsync("RemoveFromCall", nobody)));
            Assert.Contains("member-invalid", await RefusedAsync(() => animator.InvokeAsync("AllowBack", nobody)));
        }
        Assert.Contains("mode-invalid", await RefusedAsync(() => animator.InvokeAsync("MuteEveryone")));
        Assert.Equal(MemberModeration.None, Moderation.Of(circle.Id, ana.Id));

        // A fresh window: 30 animator actions across methods (the speaking mode counts too), then slow-down.
        _host.Advance(TimeSpan.FromSeconds(10));
        for (var i = 0; i < 14; i++)
        {
            await animator.InvokeAsync("MuteMember", ana.Id, "camera");
            await animator.InvokeAsync("AllowMember", ana.Id, "camera");
        }
        await animator.InvokeAsync("MuteMember", ana.Id, "camera");
        await animator.InvokeAsync("SetSpeakingMode", "open");
        Assert.Contains("slow-down", await RefusedAsync(() => animator.InvokeAsync("AllowMember", ana.Id, "camera")));
        Assert.Contains("slow-down", await RefusedAsync(() => animator.InvokeAsync("RemoveFromCall", ana.Id)));
        Assert.True(Moderation.Of(circle.Id, ana.Id).CameraStopped);
        Assert.False(Moderation.IsRemoved(circle.Id, ana.Id));

        _host.Advance(TimeSpan.FromSeconds(10));
        await animator.InvokeAsync("AllowMember", ana.Id, "camera");
        Assert.False(Moderation.Of(circle.Id, ana.Id).CameraStopped);
    }

    [Fact]
    public async Task Handing_the_floor_over_updates_two_people_and_tells_them_and_nothing_is_written()
    {
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        var animatorId = await AnimatorIdAsync(circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "hand");
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");
        var ben = await GuestAsync(circle.Id, circle.Code, "Ben", "owl");
        _rooms.Join(room, ana.Id, CameraOnly, Camera("TR_ana_cam"));
        _rooms.Join(room, ben.Id, CameraOnly, Camera("TR_ben_cam"));
        await ana.Hub.InvokeAsync("RaiseHand");
        await ben.Hub.InvokeAsync("RaiseHand");
        Assert.False((await GrantedPassAsync(ana, circle.Id)).CanSpeak);

        await animator.InvokeAsync("GiveFloor", ana.Id);

        Assert.Equal(Everything, _rooms.PermissionOf(room, ana.Id));
        Assert.Equal(CameraOnly, _rooms.PermissionOf(room, ben.Id));
        Assert.Equal(new[] { (ana.Id.ToString(), Everything) }, _rooms.UpdatesIn(room));
        Assert.Equal((CallNoticeKinds.FloorGiven, (Guid?)animatorId, (Guid?)ana.Id), await ana.Notices.NextAsync(n => n.Kind.StartsWith("floor", StringComparison.Ordinal)));
        Assert.True((await GrantedPassAsync(ana, circle.Id)).CanSpeak);
        // Ana switches her microphone on herself: the server never does it for her.
        Assert.DoesNotContain(_rooms.TracksOf(room, ana.Id), t => t.Source == CallRights.MicrophoneSource);
        _rooms.Join(room, ana.Id, Everything, Mic("TR_ana_mic"), Camera("TR_ana_cam"));

        await animator.InvokeAsync("GiveFloor", ben.Id);

        // Ana's microphone goes before Ben's comes, and her published microphone stops with it.
        Assert.Equal(CameraOnly, _rooms.PermissionOf(room, ana.Id));
        Assert.Equal(Everything, _rooms.PermissionOf(room, ben.Id));
        Assert.Equal(new[] { (ana.Id.ToString(), CameraOnly), (ben.Id.ToString(), Everything) }, _rooms.UpdatesIn(room).Skip(1));
        Assert.Equal(new[] { "TR_ana_cam" }, _rooms.TracksOf(room, ana.Id).Select(t => t.Sid));
        Assert.Equal((CallNoticeKinds.FloorTaken, (Guid?)animatorId, (Guid?)ana.Id), await ana.Notices.NextAsync(n => n.Kind.StartsWith("floor", StringComparison.Ordinal)));
        Assert.Equal((CallNoticeKinds.FloorGiven, (Guid?)animatorId, (Guid?)ben.Id), await ben.Notices.NextAsync(n => n.Kind.StartsWith("floor", StringComparison.Ordinal)));
        Assert.False((await GrantedPassAsync(ana, circle.Id)).CanSpeak);

        // Ben ends his own turn.
        await ben.Hub.InvokeAsync("LowerHand", (Guid?)null);
        Assert.Equal(CameraOnly, _rooms.PermissionOf(room, ben.Id));
        Assert.Equal((CallNoticeKinds.FloorTaken, (Guid?)ben.Id, (Guid?)ben.Id), await ben.Notices.NextAsync(n => n.Kind.StartsWith("floor", StringComparison.Ordinal)));

        // In Open mic the floor only marks the person: no permission changes, no floor notices.
        await animator.InvokeAsync("SetSpeakingMode", "open");
        var updates = _rooms.UpdatesIn(room).Count;
        await ana.Hub.InvokeAsync("RaiseHand");
        await animator.InvokeAsync("GiveFloor", ana.Id);
        await animator.InvokeAsync("LowerHand", (Guid?)ana.Id);
        Assert.Equal(updates, _rooms.UpdatesIn(room).Count);
        await animator.InvokeAsync("SetSpeakingMode", "hand");
        Assert.DoesNotContain(await KindsUntilAsync(ana.Notices, CallNoticeKinds.ModeHand), k => k.StartsWith("floor", StringComparison.Ordinal));

        Assert.Empty(_rooms.TrackMutes);
        Assert.Equal(new[] { "call.mode", "discussion.on" }, await AuditTypesAsync(circle.Id));
        Assert.Equal(0, await ChatRowsAsync(circle.Id));
    }

    [Fact]
    public async Task Lowering_all_hands_an_activity_change_and_the_hand_grace_take_the_speakers_microphone()
    {
        var circle = await _host.Room.CircleAsync(["poll", "presentation"]);
        var room = CallRules.RoomName(circle.Id);
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        var animatorId = await AnimatorIdAsync(circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "hand");
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");
        _rooms.Join(room, ana.Id, CameraOnly);

        await ana.Hub.InvokeAsync("RaiseHand");
        await animator.InvokeAsync("GiveFloor", ana.Id);
        Assert.Equal(Everything, _rooms.PermissionOf(room, ana.Id));
        await animator.InvokeAsync("LowerAllHands");
        Assert.Equal(CameraOnly, _rooms.PermissionOf(room, ana.Id));
        Assert.Empty(await HandsAsync(circle.Id));
        await ana.Notices.NextAsync(n => n.Kind == CallNoticeKinds.FloorGiven);
        Assert.Equal((CallNoticeKinds.FloorTaken, (Guid?)animatorId, (Guid?)ana.Id), await ana.Notices.NextAsync());

        await ana.Hub.InvokeAsync("RaiseHand");
        await animator.InvokeAsync("GiveFloor", ana.Id);
        await animator.InvokeAsync("StartActivity", "poll");
        Assert.Equal(CameraOnly, _rooms.PermissionOf(room, ana.Id));
        await ana.Notices.NextAsync(n => n.Kind == CallNoticeKinds.FloorGiven);
        Assert.Equal(CallNoticeKinds.FloorTaken, (await ana.Notices.NextAsync()).Kind);

        // The speaker's last tab closes: after the grace period the hand, the floor and the microphone go.
        await ana.Hub.InvokeAsync("RaiseHand");
        await animator.InvokeAsync("GiveFloor", ana.Id);
        Assert.Equal(Everything, _rooms.PermissionOf(room, ana.Id));
        var grace = _factory.Services.GetRequiredService<HandsGrace>();
        await ana.Hub.StopAsync();
        await RoomHost.UntilAsync(() => grace.IsPending(ana.Id), "Ana's grace timer");
        _host.Advance(HandsGrace.Period);
        await RoomHost.UntilAsync(() => _rooms.PermissionOf(room, ana.Id) == CameraOnly, "Ana's microphone to go");
        Assert.Empty(await HandsAsync(circle.Id));
    }

    [Fact]
    public async Task When_the_call_server_fails_the_floor_mutes_and_removals_stay_as_they_were()
    {
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "hand");
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");
        var ben = await GuestAsync(circle.Id, circle.Code, "Ben", "owl");
        _rooms.Join(room, ana.Id, CameraOnly);
        _rooms.Join(room, ben.Id, CameraOnly);
        await ana.Hub.InvokeAsync("RaiseHand");
        await ben.Hub.InvokeAsync("RaiseHand");
        await animator.InvokeAsync("GiveFloor", ana.Id);

        // Ana's microphone went, then Ben's update failed: Ana gets hers back and keeps the floor.
        _rooms.FailUpdatesFor[ben.Id.ToString()] = true;
        Assert.Contains("try-again", await RefusedAsync(() => animator.InvokeAsync("GiveFloor", ben.Id)));
        _rooms.FailUpdatesFor.Clear();
        Assert.Equal(Everything, _rooms.PermissionOf(room, ana.Id));
        Assert.Equal(CameraOnly, _rooms.PermissionOf(room, ben.Id));
        var hands = await HandsAsync(circle.Id);
        Assert.True(hands.Single(h => h.MemberId == ana.Id).HasFloor);
        Assert.False(hands.Single(h => h.MemberId == ben.Id).HasFloor);

        _rooms.Down = true;
        try
        {
            Assert.Contains("try-again", await RefusedAsync(() => animator.InvokeAsync("LowerHand", (Guid?)ana.Id)));
            Assert.Contains("try-again", await RefusedAsync(() => ana.Hub.InvokeAsync("LowerHand", (Guid?)null)));
            Assert.Contains("try-again", await RefusedAsync(() => animator.InvokeAsync("LowerAllHands")));
            Assert.Contains("try-again", await RefusedAsync(() => animator.InvokeAsync("MuteMember", ben.Id, "camera")));
            Assert.Contains("try-again", await RefusedAsync(() => animator.InvokeAsync("RemoveFromCall", ben.Id)));
        }
        finally
        {
            _rooms.Down = false;
        }
        Assert.Equal(2, (await HandsAsync(circle.Id)).Count);
        Assert.True((await HandsAsync(circle.Id)).Single(h => h.MemberId == ana.Id).HasFloor);
        Assert.Equal(MemberModeration.None, Moderation.Of(circle.Id, ben.Id));
        (await PassAsync(ben, circle.Id)).EnsureSuccessStatusCode();
        Assert.Empty(await _host.AuditAsync("call.removed", circle.Id));

        // Ben was told nothing of what did not happen (the mode change below is the next thing he hears).
        await animator.InvokeAsync("SetSpeakingMode", "open");
        Assert.DoesNotContain(await KindsUntilAsync(ben.Notices, CallNoticeKinds.ModeOpen),
            k => k is CallNoticeKinds.FloorGiven or CallNoticeKinds.CameraStopped or CallNoticeKinds.Removed);

        // Mute everyone, in Open mic, with the call server down.
        _rooms.Join(room, ben.Id, Everything, Mic("TR_ben_mic"));
        _rooms.Down = true;
        try
        {
            Assert.Contains("try-again", await RefusedAsync(() => animator.InvokeAsync("MuteEveryone")));
        }
        finally
        {
            _rooms.Down = false;
        }
        Assert.False(_rooms.TracksOf(room, ben.Id).Single().Muted);
    }

    [Fact]
    public async Task A_mute_survives_a_new_pass_and_allowing_switches_nothing_on()
    {
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        var animatorId = await AnimatorIdAsync(circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "open");
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");
        _rooms.Join(room, ana.Id, Everything, Mic("TR_ana_mic"), Camera("TR_ana_cam"));

        await animator.InvokeAsync("MuteMember", ana.Id, "microphone");

        Assert.Equal(CameraOnly, _rooms.PermissionOf(room, ana.Id));
        Assert.Equal(new[] { "TR_ana_cam" }, _rooms.TracksOf(room, ana.Id).Select(t => t.Sid));
        Assert.Equal((CallNoticeKinds.MicMuted, (Guid?)animatorId, (Guid?)ana.Id), await ana.Notices.NextAsync(n => n.Kind == CallNoticeKinds.MicMuted));
        var pass = await GrantedPassAsync(ana, circle.Id);
        Assert.Equal((false, true), (pass.CanSpeak, pass.CanVideo));
        // A speaking-mode round trip keeps the animator's mute.
        await animator.InvokeAsync("SetSpeakingMode", "hand");
        await animator.InvokeAsync("SetSpeakingMode", "open");
        Assert.Equal(CameraOnly, _rooms.PermissionOf(room, ana.Id));
        Assert.False((await GrantedPassAsync(ana, circle.Id)).CanSpeak);

        await animator.InvokeAsync("MuteMember", ana.Id, "camera");
        Assert.Equal(CallRights.Nothing, _rooms.PermissionOf(room, ana.Id));
        Assert.Empty(_rooms.TracksOf(room, ana.Id));
        Assert.Equal(CallNoticeKinds.CameraStopped, (await ana.Notices.NextAsync(n => n.Kind == CallNoticeKinds.CameraStopped)).Kind);
        pass = await GrantedPassAsync(ana, circle.Id);
        Assert.Equal((false, false), (pass.CanSpeak, pass.CanVideo));

        // Muting again changes nothing.
        var updates = _rooms.UpdatesIn(room).Count;
        await animator.InvokeAsync("MuteMember", ana.Id, "camera");
        Assert.Equal(updates, _rooms.UpdatesIn(room).Count);

        await animator.InvokeAsync("AllowMember", ana.Id, "microphone");
        await animator.InvokeAsync("AllowMember", ana.Id, "camera");

        // The permissions come back; the devices stay off until Ana switches them on.
        Assert.Equal(Everything, _rooms.PermissionOf(room, ana.Id));
        Assert.Empty(_rooms.TracksOf(room, ana.Id));
        Assert.Empty(_rooms.TrackMutes);
        Assert.Equal((CallNoticeKinds.MicAllowed, (Guid?)animatorId, (Guid?)ana.Id), await ana.Notices.NextAsync(n => n.Kind == CallNoticeKinds.MicAllowed));
        Assert.Equal(CallNoticeKinds.CameraAllowed, (await ana.Notices.NextAsync(n => n.Kind == CallNoticeKinds.CameraAllowed)).Kind);
        pass = await GrantedPassAsync(ana, circle.Id);
        Assert.Equal((true, true), (pass.CanSpeak, pass.CanVideo));

        // Allowing only goes as far as the mode does: in Hand to speak without the floor, no microphone.
        await animator.InvokeAsync("SetSpeakingMode", "hand");
        await animator.InvokeAsync("MuteMember", ana.Id, "microphone");
        await animator.InvokeAsync("AllowMember", ana.Id, "microphone");
        Assert.Equal(CameraOnly, _rooms.PermissionOf(room, ana.Id));
        Assert.Equal(new[] { "call.mode", "discussion.on" }, await AuditTypesAsync(circle.Id));
        Assert.Equal(0, await ChatRowsAsync(circle.Id));
    }

    [Fact]
    public async Task Mute_everyone_is_an_open_mic_reset_of_published_microphones()
    {
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        var animatorId = await AnimatorIdAsync(circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "hand");
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");
        var ben = await GuestAsync(circle.Id, circle.Code, "Ben", "owl");

        Assert.Contains("mode-invalid", await RefusedAsync(() => animator.InvokeAsync("MuteEveryone")));

        await animator.InvokeAsync("SetSpeakingMode", "open");
        _rooms.Join(room, animatorId, Everything, Mic("TR_host_mic"));
        _rooms.Join(room, ana.Id, Everything, Mic("TR_ana_mic"), Camera("TR_ana_cam"));
        _rooms.Join(room, ben.Id, Everything, Mic("TR_ben_mic", muted: true));
        var updates = _rooms.UpdatesIn(room).Count;

        await animator.InvokeAsync("MuteEveryone");

        // Only Ana's live microphone: not the animator's, not a camera, not one already muted.
        Assert.Equal(new[] { (room, ana.Id.ToString(), "TR_ana_mic", true) }, _rooms.TrackMutes);
        Assert.True(_rooms.TracksOf(room, ana.Id).Single(t => t.Sid == "TR_ana_mic").Muted);
        Assert.False(_rooms.TracksOf(room, ana.Id).Single(t => t.Sid == "TR_ana_cam").Muted);
        Assert.False(_rooms.TracksOf(room, animatorId).Single().Muted);
        // Permissions stay: anyone may unmute again.
        Assert.Equal(updates, _rooms.UpdatesIn(room).Count);
        Assert.Equal(Everything, _rooms.PermissionOf(room, ana.Id));
        Assert.Equal(MemberModeration.None, Moderation.Of(circle.Id, ana.Id));
        Assert.Equal((CallNoticeKinds.MutedEveryone, (Guid?)animatorId, (Guid?)null), await ana.Notices.NextAsync(n => n.Kind == CallNoticeKinds.MutedEveryone));
        Assert.Equal(CallNoticeKinds.MutedEveryone, (await ben.Notices.NextAsync(n => n.Kind == CallNoticeKinds.MutedEveryone)).Kind);
        Assert.Equal(new[] { "call.mode", "discussion.on" }, await AuditTypesAsync(circle.Id));
    }

    [Fact]
    public async Task Removal_keeps_a_participant_out_of_this_call_lowers_their_hand_and_is_audited_until_allowed_back()
    {
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        var animatorHands = new Inbox<HandsView>(animator, "Hands");
        var animatorId = await AnimatorIdAsync(circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "hand");
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");
        _rooms.Join(room, ana.Id, CameraOnly, Camera("TR_ana_cam"));
        await ana.Hub.InvokeAsync("RaiseHand");
        await animator.InvokeAsync("GiveFloor", ana.Id);
        await animatorHands.NextAsync(h => h.Floor == ana.Id);

        await animator.InvokeAsync("RemoveFromCall", ana.Id);

        Assert.Equal(new[] { (room, ana.Id.ToString()) }, _rooms.Removals);
        Assert.Null(_rooms.PermissionOf(room, ana.Id));
        Assert.True(Moderation.IsRemoved(circle.Id, ana.Id));
        Assert.Empty(await HandsAsync(circle.Id));
        var lowered = await animatorHands.NextAsync(h => h.Floor is null);
        Assert.Empty(lowered.Queue);
        Assert.Equal((CallNoticeKinds.Removed, (Guid?)animatorId, (Guid?)ana.Id), await ana.Notices.NextAsync(n => n.Kind == CallNoticeKinds.Removed));
        var audit = Assert.Single(await _host.AuditAsync("call.removed", circle.Id));
        Assert.Equal((animatorId.ToString(), ana.Id.ToString()), (Field(audit, "member"), Field(audit, "subject")));

        // No new pass, but still in the circle.
        var refused = await PassAsync(ana, circle.Id);
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        Assert.Equal("removed-from-call", (await refused.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("type").GetString());
        Assert.Contains(await _host.Room.MembersAsync(circle.Id), m => m.Id == ana.Id);
        await ana.Hub.InvokeAsync("Say", "Still here");

        // Removing again disconnects again (an earlier pass), but writes and says nothing more.
        await animator.InvokeAsync("RemoveFromCall", ana.Id);
        Assert.Equal(2, _rooms.Removals.Count);
        Assert.Single(await _host.AuditAsync("call.removed", circle.Id));

        await animator.InvokeAsync("AllowBack", ana.Id);

        Assert.Equal((CallNoticeKinds.AllowedBack, (Guid?)animatorId, (Guid?)ana.Id), await ana.Notices.NextAsync(n => n.Kind is CallNoticeKinds.AllowedBack or CallNoticeKinds.Removed));
        Assert.False(Moderation.IsRemoved(circle.Id, ana.Id));
        var pass = await GrantedPassAsync(ana, circle.Id);
        Assert.Equal((false, true), (pass.CanSpeak, pass.CanVideo));
        // Allowed back already: nothing happens.
        await animator.InvokeAsync("AllowBack", ana.Id);
        // The refused pass is audited as a refusal (founder decision D10).
        Assert.Equal(new[] { "call.removed", "discussion.on", "discussion.refused" }, await AuditTypesAsync(circle.Id));
    }

    [Fact]
    public async Task A_removal_takes_the_person_off_everyone_s_roster_at_once_without_waiting_for_the_call_server()
    {
        // Issue #275: the other screens drop the tile when the roster stops listing the person; the call server's
        // "left" may take seconds to reach them, so the hub does not wait for its webhook.
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        var animatorRoster = new Inbox<Guid[]>(animator, "CallRoster");
        await animator.InvokeAsync("EnableDiscussion", true, "open");
        var animatorId = await AnimatorIdAsync(circle.Id);
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");
        var ben = await GuestAsync(circle.Id, circle.Code, "Ben", "owl");
        var benRoster = new Inbox<Guid[]>(ben.Hub, "CallRoster");
        // In the call, as the call server's webhooks would have said.
        foreach (var id in new[] { animatorId, ana.Id, ben.Id })
        {
            _rooms.Join(room, id, Everything);
            Moderation.Joined(circle.Id, id, $"PA_{id:N}", "RM_current");
        }

        // The call server is down: nothing happened, so the roster stays as it is.
        _rooms.Down = true;
        try
        {
            Assert.Contains("try-again", await RefusedAsync(() => animator.InvokeAsync("RemoveFromCall", ana.Id)));
        }
        finally
        {
            _rooms.Down = false;
        }
        Assert.Equal(new[] { animatorId, ana.Id, ben.Id }, Moderation.Roster(circle.Id));

        await animator.InvokeAsync("RemoveFromCall", ana.Id);

        // No webhook was sent: the hub's own roster already went to everyone in the room.
        Assert.Equal(new[] { animatorId, ben.Id }, Moderation.Roster(circle.Id));
        Assert.Equal(new[] { animatorId, ben.Id }, await benRoster.NextAsync(r => !r.Contains(ana.Id)));
        Assert.Equal(new[] { animatorId, ben.Id }, await animatorRoster.NextAsync(r => !r.Contains(ana.Id)));
        Assert.Equal(CallNoticeKinds.Removed, (await ana.Notices.NextAsync(n => n.Kind == CallNoticeKinds.Removed)).Kind);

        // The call server's late "left" for her connection changes nothing more.
        Assert.False(Moderation.Left(circle.Id, ana.Id, $"PA_{ana.Id:N}"));
    }

    [Fact]
    public async Task Ending_the_call_forgets_every_mute_and_removal()
    {
        var circle = await _host.Room.CircleAsync();
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "open");
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");
        var ben = await GuestAsync(circle.Id, circle.Code, "Ben", "owl");
        var cleo = await GuestAsync(circle.Id, circle.Code, "Cleo", "cat");
        await animator.InvokeAsync("MuteMember", ana.Id, "microphone");
        await animator.InvokeAsync("MuteMember", ben.Id, "camera");
        await animator.InvokeAsync("RemoveFromCall", cleo.Id);
        Assert.Equal(HttpStatusCode.Forbidden, (await PassAsync(cleo, circle.Id)).StatusCode);

        await animator.InvokeAsync("DisableDiscussion");
        foreach (var person in new[] { ana, ben, cleo })
        {
            Assert.Equal(MemberModeration.None, Moderation.Of(circle.Id, person.Id));
        }
        await animator.InvokeAsync("EnableDiscussion", true, "open");

        Assert.Equal((true, true), Rights(await GrantedPassAsync(ana, circle.Id)));
        Assert.Equal((true, true), Rights(await GrantedPassAsync(ben, circle.Id)));
        Assert.Equal((true, true), Rights(await GrantedPassAsync(cleo, circle.Id)));
        Assert.Equal(new[] { "call.removed", "discussion.off", "discussion.on", "discussion.refused" }, await AuditTypesAsync(circle.Id));

        static (bool, bool) Rights(CallPassView pass) => (pass.CanSpeak, pass.CanVideo);
    }

    [Fact]
    public async Task A_participant_raises_or_lowers_their_hand_six_times_every_ten_seconds()
    {
        var circle = await _host.Room.CircleAsync();
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");

        for (var i = 0; i < 3; i++)
        {
            await ana.Hub.InvokeAsync("RaiseHand");
            await ana.Hub.InvokeAsync("LowerHand", (Guid?)null);
        }
        Assert.Contains("slow-down", await RefusedAsync(() => ana.Hub.InvokeAsync("RaiseHand")));
        Assert.Contains("slow-down", await RefusedAsync(() => ana.Hub.InvokeAsync("LowerHand", (Guid?)null)));
        Assert.Empty(await HandsAsync(circle.Id));

        _host.Advance(TimeSpan.FromSeconds(10));
        await ana.Hub.InvokeAsync("RaiseHand");
        Assert.Single(await HandsAsync(circle.Id));
        // The animator lowering someone's hand is not the person's own toggle.
        await animator.InvokeAsync("LowerHand", (Guid?)ana.Id);
        Assert.Empty(await HandsAsync(circle.Id));
    }
}
