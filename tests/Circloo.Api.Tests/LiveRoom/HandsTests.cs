using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Circloo.Api.Tests.LiveRoom;

/// <summary>Issue #183 (T809): raised hands of spec 008. The queue, the floor, clean-up and who may do what.</summary>
[Collection(ApiCollection.Name)]
public sealed class HandsTests(PostgresFixture pg) : IAsyncLifetime
{
    private ApiFactory _factory = null!;
    private RoomHost _host = null!;
    private readonly List<HubConnection> _open = [];

    private sealed record Guest(Guid Id, CookieContainerHandler Cookies, HubConnection Hub, Inbox<HandsView> Hands);

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString());
        _host = new RoomHost(_factory);
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

    private async Task<(HubConnection Hub, Inbox<HandsView> Hands)> EnterAsync(CookieContainerHandler cookies, Guid circleId)
    {
        var hub = _host.Hub(cookies);
        var hands = new Inbox<HandsView>(hub, "Hands");
        await hub.StartAsync();
        _open.Add(hub);
        await hub.InvokeAsync<Guid[]>("Enter", circleId);
        return (hub, hands);
    }

    private async Task<Guest> JoinedAsync(Guid circleId, string code, string name, string character)
    {
        var (res, _, cookies) = await _host.JoinAsync(code, name, character);
        res.EnsureSuccessStatusCode();
        var (hub, hands) = await EnterAsync(cookies, circleId);
        var member = (await _host.MembersAsync(circleId)).Single(m => m.Name == name);
        return new Guest(member.Id, cookies, hub, hands);
    }

    private static async Task<string> RefusedAsync(Func<Task> call) => (await Assert.ThrowsAsync<HubException>(call)).Message;

    private Task<List<RaisedHand>> RowsAsync(Guid circleId) =>
        _host.DbAsync(db => db.RaisedHands.AsNoTracking().Where(h => h.CircleId == circleId).OrderBy(h => h.Id).ToListAsync());

    /// <summary>The database is shared by the whole collection: count only this circle's rows (filtered in memory, never in SQL on jsonb).</summary>
    private async Task<int> ClearAuditsAsync(Guid circleId) => (await _host.AuditsAsync("hands.cleared", circleId)).Count;

    [Fact]
    public async Task Parallel_raises_by_one_member_leave_one_row()
    {
        var circle = await _host.CircleAsync();
        var a = await JoinedAsync(circle.Id, circle.Code, "Kenji", "fox");
        var (tab, _) = await EnterAsync(a.Cookies, circle.Id);

        await Task.WhenAll(Enumerable.Range(0, 6).Select(i => (i % 2 == 0 ? a.Hub : tab).InvokeAsync("RaiseHand")));

        var rows = await RowsAsync(circle.Id);
        Assert.Equal(a.Id, Assert.Single(rows).MemberId);
        var view = await a.Hands.NextAsync(v => v.Queue.Count == 1);
        Assert.Equal([a.Id], view.Queue.Select(h => h.MemberId));
        Assert.Null(view.Floor);
    }

    [Fact]
    public async Task The_order_is_kept_and_a_late_joiner_gets_the_queue_when_entering()
    {
        var circle = await _host.CircleAsync();
        var (_, animatorHands) = await EnterAsync(circle.Cookies, circle.Id);
        var a = await JoinedAsync(circle.Id, circle.Code, "Kenji", "fox");
        var b = await JoinedAsync(circle.Id, circle.Code, "Lea", "owl");
        var c = await JoinedAsync(circle.Id, circle.Code, "Omar", "cat");

        foreach (var g in new[] { b, c, a })
        {
            await g.Hub.InvokeAsync("RaiseHand");
        }
        var seen = await animatorHands.NextAsync(v => v.Queue.Count == 3);
        Assert.Equal([b.Id, c.Id, a.Id], seen.Queue.Select(h => h.MemberId));

        // Raising again changes nothing: the place stays.
        await b.Hub.InvokeAsync("RaiseHand");
        Assert.Equal([b.Id, c.Id, a.Id], (await RowsAsync(circle.Id)).Select(h => h.MemberId));

        var late = await JoinedAsync(circle.Id, circle.Code, "Sara", "frog");
        var pushed = await late.Hands.NextAsync(v => v.Queue.Count == 3);
        Assert.Equal([b.Id, c.Id, a.Id], pushed.Queue.Select(h => h.MemberId));
    }

    [Fact]
    public async Task Giving_the_floor_lowers_the_speakers_hand_and_moves_the_floor()
    {
        var circle = await _host.CircleAsync();
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        var a = await JoinedAsync(circle.Id, circle.Code, "Kenji", "fox");
        var b = await JoinedAsync(circle.Id, circle.Code, "Lea", "owl");
        await a.Hub.InvokeAsync("RaiseHand");
        await b.Hub.InvokeAsync("RaiseHand");

        await animator.InvokeAsync("GiveFloor", a.Id);
        var first = await b.Hands.NextAsync(v => v.Floor == a.Id);
        Assert.Equal([b.Id], first.Queue.Select(h => h.MemberId));

        await animator.InvokeAsync("GiveFloor", b.Id);
        var second = await b.Hands.NextAsync(v => v.Floor == b.Id);
        Assert.Empty(second.Queue);

        var rows = await RowsAsync(circle.Id);
        var row = Assert.Single(rows);
        Assert.Equal((b.Id, true), (row.MemberId, row.HasFloor));

        // Giving the floor to the speaker again changes nothing.
        await animator.InvokeAsync("GiveFloor", b.Id);
        Assert.Single(await RowsAsync(circle.Id));

        // The speaker lowers their own hand: nobody has the floor.
        await b.Hub.InvokeAsync("LowerHand", (Guid?)null);
        var none = await b.Hands.NextAsync(v => v.Floor is null);
        Assert.Empty(none.Queue);
        Assert.Empty(await RowsAsync(circle.Id));
    }

    [Fact]
    public async Task Giving_the_floor_to_someone_whose_hand_is_down_gets_hand_invalid()
    {
        var circle = await _host.CircleAsync();
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        var a = await JoinedAsync(circle.Id, circle.Code, "Kenji", "fox");
        await a.Hub.InvokeAsync("RaiseHand");
        await a.Hub.InvokeAsync("LowerHand", (Guid?)null);

        Assert.Contains("hand-invalid", await RefusedAsync(() => animator.InvokeAsync("GiveFloor", a.Id)));
        Assert.Contains("hand-invalid", await RefusedAsync(() => animator.InvokeAsync("GiveFloor", Guid.NewGuid())));
        Assert.Empty(await RowsAsync(circle.Id));
    }

    [Fact]
    public async Task A_disconnect_lowers_the_hand_after_the_grace_period_and_a_reconnect_keeps_the_place()
    {
        var circle = await _host.CircleAsync();
        var animator = _host.Hub(circle.Cookies);
        var presence = new Inbox<Guid[]>(animator, "Presence");
        var animatorHands = new Inbox<HandsView>(animator, "Hands");
        await animator.StartAsync();
        _open.Add(animator);
        await animator.InvokeAsync<Guid[]>("Enter", circle.Id);

        var gone = await JoinedAsync(circle.Id, circle.Code, "Kenji", "fox");
        var back = await JoinedAsync(circle.Id, circle.Code, "Lea", "owl");
        await presence.NextAsync(p => p.Contains(gone.Id) && p.Contains(back.Id));
        await gone.Hub.InvokeAsync("RaiseHand");
        await back.Hub.InvokeAsync("RaiseHand");
        var placeBefore = (await RowsAsync(circle.Id)).Single(h => h.MemberId == back.Id).Id;

        var grace = _factory.Services.GetRequiredService<HandsGrace>();
        await gone.Hub.StopAsync();
        await back.Hub.StopAsync();
        // The timers start when the server handles the disconnects: wait for them, not for wall time.
        await RoomHost.UntilAsync(() => grace.IsPending(gone.Id) && grace.IsPending(back.Id), "both grace timers");

        // The fake clock runs due timers inside Advance: none is due yet, so both hands are still up.
        _factory.Clock.Advance(HandsGrace.Period - TimeSpan.FromSeconds(5));
        Assert.True(grace.IsPending(gone.Id) && grace.IsPending(back.Id));
        Assert.Equal(2, (await RowsAsync(circle.Id)).Count);

        // Lea is back in time: Enter has cancelled her timer when it returns.
        await EnterAsync(back.Cookies, circle.Id);
        Assert.False(grace.IsPending(back.Id));
        _factory.Clock.Advance(TimeSpan.FromSeconds(10));
        // Kenji's hand is deleted before the Hands event goes out.
        var lowered = await animatorHands.NextAsync(v => v.Queue.Count == 1 && v.Queue[0].MemberId == back.Id);
        Assert.Equal([back.Id], lowered.Queue.Select(h => h.MemberId));
        Assert.False(grace.IsPending(gone.Id));

        var rows = await RowsAsync(circle.Id);
        var kept = Assert.Single(rows);
        Assert.Equal((back.Id, placeBefore), (kept.MemberId, kept.Id));
    }

    [Fact]
    public async Task A_connection_that_is_not_a_member_or_is_the_audience_screen_is_refused_on_every_hands_method()
    {
        var circle = await _host.CircleAsync();
        var a = await JoinedAsync(circle.Id, circle.Code, "Kenji", "fox");
        await a.Hub.InvokeAsync("RaiseHand");

        var (strangerBrowser, strangerCookies) = _host.Browser();
        await strangerBrowser.SignInAsync(_factory, $"stranger-{Guid.NewGuid():N}@example.test");
        var stranger = _host.Hub(strangerCookies);
        await stranger.StartAsync();
        _open.Add(stranger);
        Assert.Contains("not-a-member", await RefusedAsync(() => stranger.InvokeAsync<Guid[]>("Enter", circle.Id)));

        var audience = _host.Hub(circle.Cookies);
        await audience.StartAsync();
        _open.Add(audience);
        await audience.InvokeAsync<object?>("EnterAudience", circle.Id);

        (string Method, object?[] Args)[] methods = [("RaiseHand", []), ("LowerHand", [a.Id]), ("LowerAllHands", []), ("GiveFloor", [a.Id])];
        foreach (var (method, args) in methods)
        {
            Assert.Contains("not-entered", await RefusedAsync(() => stranger.InvokeCoreAsync(method, args)));
            Assert.Contains("audience-read-only", await RefusedAsync(() => audience.InvokeCoreAsync(method, args)));
        }
        Assert.Equal(a.Id, Assert.Single(await RowsAsync(circle.Id)).MemberId);
    }

    [Fact]
    public async Task An_activity_change_and_the_end_of_a_presentation_clear_the_hands()
    {
        var circle = await _host.CircleAsync(["poll", "presentation"]);
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        var a = await JoinedAsync(circle.Id, circle.Code, "Kenji", "fox");
        var b = await JoinedAsync(circle.Id, circle.Code, "Lea", "owl");

        await a.Hub.InvokeAsync("RaiseHand");
        await b.Hub.InvokeAsync("RaiseHand");
        await animator.InvokeAsync("GiveFloor", a.Id);
        await animator.InvokeAsync("StartActivity", "poll");
        Assert.Empty(await RowsAsync(circle.Id));
        Assert.Equal(1, await ClearAuditsAsync(circle.Id));

        await a.Hub.InvokeAsync("RaiseHand");
        await animator.InvokeAsync("EndActivity");
        Assert.Empty(await RowsAsync(circle.Id));
        Assert.Equal(2, await ClearAuditsAsync(circle.Id));

        var animatorMember = (await _host.MembersAsync(circle.Id)).Single(m => m.Role == Roles.Animator);
        await _host.DbAsync(async db =>
        {
            db.PresentationSessions.Add(new PresentationSession
            {
                CircleId = circle.Id, StartedByMemberId = animatorMember.Id, Snapshot = "[]", Phase = "idle", StartedAt = _factory.Clock.GetUtcNow(),
            });
            return await db.SaveChangesAsync();
        });
        await b.Hub.InvokeAsync("RaiseHand");
        await animator.InvokeAsync("EndPresentation");
        Assert.Empty(await RowsAsync(circle.Id));
        Assert.Equal(3, await ClearAuditsAsync(circle.Id));
    }

    [Fact]
    public async Task Only_the_animator_lowers_other_hands_and_clears_the_queue()
    {
        var circle = await _host.CircleAsync();
        var (animator, animatorHands) = await EnterAsync(circle.Cookies, circle.Id);
        var a = await JoinedAsync(circle.Id, circle.Code, "Kenji", "fox");
        var b = await JoinedAsync(circle.Id, circle.Code, "Lea", "owl");
        await a.Hub.InvokeAsync("RaiseHand");
        await b.Hub.InvokeAsync("RaiseHand");

        Assert.Contains("animator-only", await RefusedAsync(() => b.Hub.InvokeAsync("LowerHand", (Guid?)a.Id)));
        Assert.Contains("animator-only", await RefusedAsync(() => b.Hub.InvokeAsync("LowerAllHands")));
        Assert.Contains("animator-only", await RefusedAsync(() => b.Hub.InvokeAsync("GiveFloor", a.Id)));
        Assert.Contains("animator-cannot-raise", await RefusedAsync(() => animator.InvokeAsync("RaiseHand")));
        Assert.Equal(2, (await RowsAsync(circle.Id)).Count);

        await animator.InvokeAsync("LowerHand", (Guid?)a.Id);
        var after = await animatorHands.NextAsync(v => v.Queue.Count == 1 && v.Queue[0].MemberId == b.Id);
        Assert.Equal([b.Id], after.Queue.Select(h => h.MemberId));

        await a.Hub.InvokeAsync("RaiseHand");
        await animator.InvokeAsync("LowerAllHands");
        await animatorHands.NextAsync(v => v.Queue.Count == 0 && v.Floor is null);
        Assert.Empty(await RowsAsync(circle.Id));
        Assert.Equal(1, await ClearAuditsAsync(circle.Id));
    }
}
