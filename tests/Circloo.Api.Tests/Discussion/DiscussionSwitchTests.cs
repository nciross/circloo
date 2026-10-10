using System.Net.Http.Json;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Discussion;
using Circloo.Api.Tests.Infrastructure;
using Circloo.Api.Tests.LiveRoom;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Tests.Discussion;

/// <summary>Issues #216 (T901) and #258 (T918): the call switch of spec 009. Off by default, animator only, audited, never written to the chat.</summary>
[Collection(ApiCollection.Name)]
public sealed class DiscussionSwitchTests(PostgresFixture pg) : IAsyncLifetime
{
    private ApiFactory _factory = null!;
    private DiscussionHost _host = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString());
        _host = new DiscussionHost(_factory);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private static async Task<string> RefusedAsync(Func<Task> call) =>
        (await Assert.ThrowsAsync<HubException>(call)).Message;

    [Fact]
    public async Task A_new_circle_has_the_call_off_with_video_and_hand_to_speak_for_later()
    {
        var circle = await _host.Room.CircleAsync();
        var row = await _host.CircleRowAsync(circle.Id);
        Assert.Equal((false, true, "hand"), (row.DiscussionOn, row.DiscussionVideo, row.DiscussionSpeaking));

        // The test host has no call server: the view says so (FR-935).
        var view = await circle.Http.GetFromJsonAsync<CircleView>($"/api/circles/{circle.Id}");
        Assert.Equal(new DiscussionState(false, false, "hand", false, "none", null), view!.Discussion);
        Assert.All(view.Messages, m => Assert.Null(m.ReplyToId));

        var json = await circle.Http.GetStringAsync(new Uri($"/api/circles/{circle.Id}", UriKind.Relative));
        Assert.DoesNotContain("\"recording\"", json, StringComparison.Ordinal);
        Assert.Contains("\"discussion\":{\"on\":false,\"videoAllowed\":false,\"speaking\":\"hand\",\"available\":false,\"away\":\"none\",\"awayEndsAt\":null}", json, StringComparison.Ordinal);

        var hub = _host.Room.Hub(circle.Cookies);
        var pushed = new Inbox<DiscussionState>(hub, "Discussion");
        await hub.StartAsync();
        await hub.InvokeAsync<Guid[]>("Enter", circle.Id);
        Assert.False((await pushed.NextAsync()).On);
    }

    [Fact]
    public async Task The_view_says_calls_are_available_when_a_call_server_is_configured()
    {
        await using var factory = new ApiFactory(pg.Container.GetConnectionString(), new Dictionary<string, string?>
        {
            ["LiveKit:Url"] = "ws://localhost:7880",
            ["LiveKit:ApiUrl"] = "http://localhost:7880",
            ["LiveKit:ApiKey"] = "circloo-test",
            ["LiveKit:ApiSecret"] = new string('s', 40),
        });
        var circle = await new DiscussionHost(factory).Room.CircleAsync();

        var view = await circle.Http.GetFromJsonAsync<CircleView>($"/api/circles/{circle.Id}");

        Assert.True(view!.Discussion.Available);
    }

    [Theory]
    [InlineData("EnableDiscussion")]
    [InlineData("DisableDiscussion")]
    public async Task Only_the_animator_can_switch_and_every_refusal_is_audited(string method)
    {
        var circle = await _host.Room.CircleAsync();
        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true);
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

        foreach (var (who, code, hub) in attempts)
        {
            await using var connection = hub;
            var before = (await _host.RefusalsAsync()).Count;
            object[] args = method == "EnableDiscussion" ? [false] : [];
            Assert.Contains(code, await RefusedAsync(() => hub.InvokeCoreAsync(method, args)));
            var rows = await _host.RefusalsAsync();
            Assert.True(rows.Count == before + 1, $"{who}: one audit row per refusal");
            Assert.Contains(method, rows[^1].Detail!);
        }

        // Nothing changed: still on, cameras still allowed, set by the animator only.
        var row = await _host.CircleRowAsync(circle.Id);
        Assert.Equal((true, true), (row.DiscussionOn, row.DiscussionVideo));
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
            Assert.Contains("animator-only", await RefusedAsync(() => guest.InvokeAsync("EnableDiscussion", true)));
        }
        var rows = await _host.RefusalsAsync();
        Assert.Equal(before + 5, rows.Count);
        var member = (await _host.Room.MembersAsync(circle.Id)).Single(m => m.Name == "Guest");
        Assert.Contains(member.Id.ToString(), rows[^1].Detail!);

        _factory.Clock.Advance(TimeSpan.FromMinutes(2));
        await RefusedAsync(() => guest.InvokeAsync("EnableDiscussion", true));
        Assert.Equal(before + 6, (await _host.RefusalsAsync()).Count);
    }

    [Fact]
    public async Task The_switch_reaches_a_member_at_once_and_survives_a_new_connection()
    {
        var circle = await _host.Room.CircleAsync();
        var (_, _, guestCookies) = await _host.Room.JoinAsync(circle.Code, "Guest", "fox");
        var guest = _host.Room.Hub(guestCookies);
        var pushed = new Inbox<DiscussionState>(guest, "Discussion");
        await guest.StartAsync();
        await guest.InvokeAsync<Guid[]>("Enter", circle.Id);
        Assert.False((await pushed.NextAsync()).On);

        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true);
        var on = await pushed.NextAsync().WaitAsync(TimeSpan.FromSeconds(1));
        Assert.Equal((true, true, "hand"), (on.On, on.VideoAllowed, on.Speaking));
        Assert.True((await _host.CircleRowAsync(circle.Id)).DiscussionOn);
        Assert.Single(await _host.AuditAsync("discussion.on", circle.Id));

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
    public async Task Cameras_can_change_while_on_and_a_repeat_changes_nothing()
    {
        var circle = await _host.Room.CircleAsync();
        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        var states = new Inbox<DiscussionState>(animator, "Discussion");

        await animator.InvokeAsync("EnableDiscussion", true);
        await animator.InvokeAsync("EnableDiscussion", true);
        await animator.InvokeAsync("EnableDiscussion", false);
        Assert.True((await states.NextAsync(s => s.On)).VideoAllowed);
        Assert.False((await states.NextAsync(s => s.On)).VideoAllowed);
        Assert.Empty(states.Drain());

        var row = await _host.CircleRowAsync(circle.Id);
        Assert.Equal((true, false), (row.DiscussionOn, row.DiscussionVideo));
        Assert.Equal(2, (await _host.AuditAsync("discussion.on", circle.Id)).Count);
        Assert.Equal(0, await _host.Room.DbAsync(db => db.CircleMessages.CountAsync(m => m.CircleId == circle.Id)));
    }

    [Fact]
    public async Task Switching_off_clears_the_hands_and_the_setting_for_everyone_within_two_seconds()
    {
        var circle = await _host.Room.CircleAsync();
        var (_, _, guestCookies) = await _host.Room.JoinAsync(circle.Code, "Guest", "fox");
        var guest = _host.Room.Hub(guestCookies);
        var pushed = new Inbox<DiscussionState>(guest, "Discussion");
        await guest.StartAsync();
        await guest.InvokeAsync<Guid[]>("Enter", circle.Id);
        await pushed.NextAsync();

        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true);
        await pushed.NextAsync(s => s.On);
        var member = (await _host.Room.MembersAsync(circle.Id)).Single(m => m.Name == "Guest");
        await _host.Room.DbAsync(async db =>
        {
            db.RaisedHands.Add(new RaisedHand { CircleId = circle.Id, MemberId = member.Id, RaisedAt = _factory.Clock.GetUtcNow() });
            return await db.SaveChangesAsync();
        });

        await animator.InvokeAsync("DisableDiscussion");
        var off = await pushed.NextAsync(s => !s.On).WaitAsync(TimeSpan.FromSeconds(2));
        Assert.False(off.VideoAllowed);
        Assert.Equal(0, await _host.Room.DbAsync(db => db.RaisedHands.CountAsync(h => h.CircleId == circle.Id)));
        var row = await _host.CircleRowAsync(circle.Id);
        Assert.False(row.DiscussionOn);
        Assert.Single(await _host.AuditAsync("discussion.off", circle.Id));

        // Off again: nothing more is written.
        await animator.InvokeAsync("DisableDiscussion");
        Assert.Single(await _host.AuditAsync("discussion.off", circle.Id));
        await guest.DisposeAsync();
    }

    [Fact]
    public async Task The_audience_screen_is_told_the_setting_but_cannot_change_it()
    {
        var circle = await _host.Room.CircleAsync();
        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true);

        var audience = _host.Room.Hub(circle.Cookies);
        var pushed = new Inbox<DiscussionState>(audience, "Discussion");
        await audience.StartAsync();
        await audience.InvokeAsync<object?>("EnterAudience", circle.Id);
        Assert.True((await pushed.NextAsync()).On);
        await audience.DisposeAsync();
    }
}
