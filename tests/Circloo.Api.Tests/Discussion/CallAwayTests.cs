using System.Net.Http.Json;
using System.Text.Json;
using Circloo.Api.Data;
using Circloo.Api.Discussion;
using Circloo.Api.Tests.Infrastructure;
using Circloo.Api.Tests.LiveRoom;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Circloo.Api.Tests.Discussion;

/// <summary>
/// Issue #262 (T922): the animator-away rule (spec 009 research R34, founder decision D6) on the fake clock. When the
/// circle's last animator connection closes during a call, everyone sees when the call will end; an animator back
/// within 5 minutes changes nothing, otherwise the call ends as if the animator ended it (reason <c>animator-away</c>).
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class CallAwayTests(PostgresFixture pg) : IAsyncLifetime
{
    private static readonly TimeSpan AwayEnd = TimeSpan.FromSeconds(300);

    private readonly FakeLiveKitRooms _rooms = new();
    private readonly List<HubConnection> _open = [];
    private ApiFactory _factory = null!;
    private DiscussionHost _host = null!;

    private sealed record Watcher(HubConnection Hub, Inbox<DiscussionState> States, Inbox<(string Kind, Guid? By, Guid? Subject)> Notices);

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

    private CallAway Away => _factory.Services.GetRequiredService<CallAway>();

    private async Task<Watcher> EnterAsync(CookieContainerHandler cookies, Guid circleId)
    {
        var hub = _host.Room.Hub(cookies);
        var states = new Inbox<DiscussionState>(hub, "Discussion");
        var notices = new Inbox<(string Kind, Guid? By, Guid? Subject)>(push =>
            hub.On<string, Guid?, Guid?>("CallNotice", (kind, by, subject) => push((kind, by, subject))));
        await hub.StartAsync();
        _open.Add(hub);
        await hub.InvokeAsync<Guid[]>("Enter", circleId);
        return new Watcher(hub, states, notices);
    }

    private async Task<(Guid Id, Watcher Watcher)> GuestAsync(Guid circleId, string code)
    {
        var (res, _, cookies) = await _host.Room.JoinAsync(code, "Ana", "fox");
        res.EnsureSuccessStatusCode();
        var id = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("memberId").GetGuid();
        return (id, await EnterAsync(cookies, circleId));
    }

    /// <summary>Closes a connection the way a closed tab does, and waits until the server has seen it go.</summary>
    private async Task CloseAsync(Watcher watcher)
    {
        _open.Remove(watcher.Hub);
        await watcher.Hub.DisposeAsync();
    }

    private Task<List<AuditEvent>> OffRowsAsync(Guid circleId) => _host.AuditAsync("discussion.off", circleId);

    private static string? Field(AuditEvent row, string name)
    {
        using var doc = JsonDocument.Parse(row.Detail!);
        return doc.RootElement.TryGetProperty(name, out var value) ? value.ToString() : null;
    }

    [Fact]
    public async Task An_animator_back_within_five_minutes_changes_nothing()
    {
        var circle = await _host.Room.CircleAsync();
        var animator = await EnterAsync(circle.Cookies, circle.Id);
        await animator.Hub.InvokeAsync("EnableDiscussion", true, "hand");
        var (_, ana) = await GuestAsync(circle.Id, circle.Code);
        await ana.States.NextAsync(s => s.On);
        var started = _factory.Clock.GetUtcNow();

        await CloseAsync(animator);

        // Everyone sees the countdown and when the call would end.
        var away = await ana.States.NextAsync(s => s.Away == DiscussionRules.AwayAway);
        Assert.Equal(new DiscussionState(true, true, "hand", true, "away", started + AwayEnd), away);
        Assert.Equal(started + AwayEnd, Away.EndsAt(circle.Id));

        _host.Advance(AwayEnd - TimeSpan.FromSeconds(1));
        var back = await EnterAsync(circle.Cookies, circle.Id);

        Assert.Equal(new DiscussionState(true, true, "hand", true, "none", null), await ana.States.NextAsync());
        Assert.Equal(new DiscussionState(true, true, "hand", true, "none", null), await back.States.NextAsync());
        Assert.Null(Away.EndsAt(circle.Id));
        _host.Advance(TimeSpan.FromMinutes(10));
        await Task.Delay(200);
        Assert.True((await _host.CircleRowAsync(circle.Id)).DiscussionOn);
        Assert.Empty(await OffRowsAsync(circle.Id));
        Assert.Empty(_rooms.Deleted);
        Assert.DoesNotContain(ana.Notices.Drain(), n => n.Kind == CallNoticeKinds.CallEnded);
    }

    [Fact]
    public async Task After_five_minutes_away_the_call_ends_for_everyone_with_the_reason_animator_away()
    {
        var circle = await _host.Room.CircleAsync();
        var animator = await EnterAsync(circle.Cookies, circle.Id);
        await animator.Hub.InvokeAsync("EnableDiscussion", false, "hand");
        var (_, ana) = await GuestAsync(circle.Id, circle.Code);
        await ana.Hub.InvokeAsync("RaiseHand");
        await CloseAsync(animator);
        await ana.States.NextAsync(s => s.Away == DiscussionRules.AwayAway);

        // Not yet: a second before the end, the call is on.
        _host.Advance(AwayEnd - TimeSpan.FromSeconds(1));
        await Task.Delay(100);
        Assert.True((await _host.CircleRowAsync(circle.Id)).DiscussionOn);

        _host.Advance(TimeSpan.FromSeconds(1));

        Assert.Equal(CallNoticeKinds.CallEnded, (await ana.Notices.NextAsync(n => n.Kind == CallNoticeKinds.CallEnded)).Kind);
        Assert.Equal(new DiscussionState(false, false, "hand", true, "none", null), await ana.States.NextAsync(s => !s.On));
        Assert.False((await _host.CircleRowAsync(circle.Id)).DiscussionOn);
        Assert.Contains(CallRules.RoomName(circle.Id), _rooms.Deleted);
        Assert.Empty(await _host.Room.DbAsync(db => db.RaisedHands.Where(h => h.CircleId == circle.Id).ToListAsync()));
        Assert.Null(Away.EndsAt(circle.Id));
        var off = Assert.Single(await OffRowsAsync(circle.Id));
        Assert.Equal(CallLifecycle.AnimatorAway, Field(off, "reason"));
        Assert.Null(off.UserId);
        Assert.True(string.IsNullOrEmpty(Field(off, "member")));
    }

    [Fact]
    public async Task A_second_animator_tab_keeps_the_call_and_the_countdown_starts_when_the_last_one_closes()
    {
        var circle = await _host.Room.CircleAsync();
        var first = await EnterAsync(circle.Cookies, circle.Id);
        var second = await EnterAsync(circle.Cookies, circle.Id);
        await first.Hub.InvokeAsync("EnableDiscussion", true, "open");
        var (_, ana) = await GuestAsync(circle.Id, circle.Code);

        await CloseAsync(first);
        // The other tab keeps the animator online, so nothing on the server shows the first one go: give it time.
        await Task.Delay(500);
        Assert.Null(Away.EndsAt(circle.Id));
        _host.Advance(TimeSpan.FromMinutes(10));
        await Task.Delay(200);
        Assert.True((await _host.CircleRowAsync(circle.Id)).DiscussionOn);
        Assert.DoesNotContain(ana.States.Drain(), s => s.Away == DiscussionRules.AwayAway);

        await CloseAsync(second);
        await ana.States.NextAsync(s => s.Away == DiscussionRules.AwayAway);
        Assert.NotNull(Away.EndsAt(circle.Id));
    }

    [Fact]
    public async Task No_countdown_starts_without_a_call_and_ending_the_call_stops_it()
    {
        var circle = await _host.Room.CircleAsync();
        var animator = await EnterAsync(circle.Cookies, circle.Id);
        var (_, ana) = await GuestAsync(circle.Id, circle.Code);

        // No call: the animator closing their tab starts nothing.
        await CloseAsync(animator);
        await RoomHost.UntilAsync(() => _factory.Services.GetRequiredService<Circloo.Api.Circles.CirclePresence>().Online(circle.Id).Length == 1, "the tab to close");
        await Task.Delay(200);
        Assert.Null(Away.EndsAt(circle.Id));

        // A call whose animator left, then the circle is closed: the countdown goes with the call.
        animator = await EnterAsync(circle.Cookies, circle.Id);
        await animator.Hub.InvokeAsync("EnableDiscussion", true, "open");
        await CloseAsync(animator);
        await ana.States.NextAsync(s => s.Away == DiscussionRules.AwayAway);
        var (http, csrf) = (circle.Http, circle.Csrf);
        (await http.PostJsonAsync($"/api/circles/{circle.Id}/close", new { }, csrf)).EnsureSuccessStatusCode();
        await RoomHost.UntilAsync(() => Away.EndsAt(circle.Id) is null, "the countdown to stop");
        _host.Advance(TimeSpan.FromMinutes(10));
        await Task.Delay(200);
        var off = Assert.Single(await OffRowsAsync(circle.Id));
        Assert.Equal(CallLifecycle.CircleClosed, Field(off, "reason"));
    }
}
