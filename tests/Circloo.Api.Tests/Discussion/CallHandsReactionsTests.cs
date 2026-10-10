using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Discussion;
using Circloo.Api.Presentations;
using Circloo.Api.Tests.Infrastructure;
using Circloo.Api.Tests.LiveRoom;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Circloo.Api.Tests.Discussion;

/// <summary>
/// Issue #267 (T927): spec 008's reactions and hands inside a call (spec 009 US3, US8, contracts/hub.md). Reactions go
/// out while a call is on even with no presentation, and then nothing is stored; a presentation running inside the call
/// keeps them in its anonymous totals (D11). However a call ends, everyone gets the empty queue.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class CallHandsReactionsTests(PostgresFixture pg) : IAsyncLifetime
{
    private readonly FakeLiveKitRooms _rooms = new();
    private readonly List<HubConnection> _open = [];
    private ApiFactory _factory = null!;
    private DiscussionHost _host = null!;

    private sealed record Room(Guid CircleId, string Code, HttpClient Http, string Csrf, CookieContainerHandler AnimatorCookies, HubConnection Animator,
        Inbox<JsonElement> Bursts, HubConnection Guest, Guid GuestId);

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

    private async Task<HubConnection> EnterAsync(CookieContainerHandler cookies, Guid circleId, Action<HubConnection>? listen = null)
    {
        var hub = _host.Room.Hub(cookies);
        listen?.Invoke(hub);
        await hub.StartAsync();
        _open.Add(hub);
        await hub.InvokeAsync<Guid[]>("Enter", circleId);
        return hub;
    }

    /// <summary>A circle with its animator and one guest in the room, the call off and nothing presented.</summary>
    private async Task<Room> RoomAsync()
    {
        var circle = await _host.Room.CircleAsync();
        Inbox<JsonElement> bursts = null!;
        var animator = await EnterAsync(circle.Cookies, circle.Id, h => bursts = new Inbox<JsonElement>(h, "Reactions"));
        var (res, _, cookies) = await _host.Room.JoinAsync(circle.Code, "Lucía", "fox");
        res.EnsureSuccessStatusCode();
        var guestId = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("memberId").GetGuid();
        var guest = await EnterAsync(cookies, circle.Id);
        return new Room(circle.Id, circle.Code, circle.Http, circle.Csrf, circle.Cookies, animator, bursts, guest, guestId);
    }

    private Task<Guid> DeckAsync(Guid circleId) => _host.Room.DbAsync(async db =>
    {
        var owner = await db.CircleMembers.Where(m => m.CircleId == circleId && m.Role == Roles.Animator).Select(m => m.UserId!.Value).SingleAsync();
        var deck = new Presentation { OwnerUserId = owner, Name = "Team kickoff", SourceFileName = "deck.pptx", Status = PresentationStatus.Ready, SlideCount = 1, AutoOpen = false };
        db.Presentations.Add(deck);
        db.Slides.Add(new Slide { PresentationId = deck.Id, Kind = SlideKinds.Deck, Position = 0, SourceIndex = 0 });
        await db.SaveChangesAsync();
        return deck.Id;
    });

    private static Dictionary<string, int> Counts(JsonElement burst) =>
        burst.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetInt32());

    /// <summary>Bursts as they arrive until <paramref name="total"/> reactions have come in, summed per kind.</summary>
    private static async Task<Dictionary<string, int>> ReceivedAsync(Inbox<JsonElement> inbox, int total)
    {
        var sum = new Dictionary<string, int>();
        while (sum.Values.Sum() < total)
        {
            foreach (var (kind, n) in Counts(await inbox.NextAsync()))
            {
                sum[kind] = sum.GetValueOrDefault(kind) + n;
            }
        }
        return sum;
    }

    /// <summary>Every presentation of the circle with its stored totals, oldest first.</summary>
    private Task<List<(Guid Id, DateTimeOffset? EndedAt, string Totals)>> SessionsAsync(Guid circleId) => _host.Room.DbAsync(async db =>
        (await db.PresentationSessions.AsNoTracking().Where(s => s.CircleId == circleId).OrderBy(s => s.StartedAt)
            .Select(s => new { s.Id, s.EndedAt, s.ReactionTotals }).ToListAsync())
        .Select(s => (s.Id, s.EndedAt, s.ReactionTotals)).ToList());

    /// <summary>The flush writes the totals beside the broadcast: wait until the running presentation holds <paramref name="expected"/>.</summary>
    private async Task<Dictionary<string, int>> RunningTotalsAsync(Guid circleId, int expected)
    {
        var waited = Stopwatch.StartNew();
        while (true)
        {
            var running = (await SessionsAsync(circleId)).Single(s => s.EndedAt is null);
            var totals = new Dictionary<string, int>(ReactionKinds.Totals(running.Totals));
            if (totals.Values.Sum() >= expected || waited.Elapsed > RoomHost.Wait)
            {
                return totals;
            }
            await Task.Delay(20);
        }
    }

    private ReactionBuffer Buffer => _factory.Services.GetRequiredService<ReactionBuffer>();

    [Fact]
    public async Task With_a_call_on_and_nothing_presented_reactions_reach_everyone_and_nothing_is_stored()
    {
        var room = await RoomAsync();
        await using var screen = await _host.AudienceAsync(room.AnimatorCookies, room.CircleId);
        var screenBursts = new Inbox<JsonElement>(screen, "Reactions");

        // An earlier presentation, ended, with its own totals: the call must leave them as they are.
        var deck = await DeckAsync(room.CircleId);
        await room.Animator.InvokeAsync("StartPresentation", deck);
        await room.Guest.InvokeAsync("React", "heart");
        Assert.Equal(new Dictionary<string, int> { ["heart"] = 1 }, await ReceivedAsync(room.Bursts, 1));
        await RunningTotalsAsync(room.CircleId, 1);
        await room.Animator.InvokeAsync("EndPresentation");
        var before = await SessionsAsync(room.CircleId);
        Assert.Equal("heart", Assert.Single(ReactionKinds.Totals(Assert.Single(before).Totals)).Key);
        await ReceivedAsync(screenBursts, 1);

        // No call and nothing presented: dropped without a word.
        await room.Guest.InvokeAsync("React", "wow");

        // A call is on: the next burst is the call's alone, on every screen, the projector included.
        await room.Animator.InvokeAsync("EnableDiscussion", false, "hand");
        await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => room.Guest.InvokeAsync("React", "clap")).Append(room.Animator.InvokeAsync("React", "party")));
        var expected = new Dictionary<string, int> { ["clap"] = 3, ["party"] = 1 };
        Assert.Equal(expected, await ReceivedAsync(room.Bursts, 4));
        Assert.Equal(expected, await ReceivedAsync(screenBursts, 4));

        // Reactions switched off during the call: nothing goes out.
        await room.Animator.InvokeAsync("SetRoomSettings", new RoomSettings(RoomChatModes.Open, false, false));
        await room.Guest.InvokeAsync("React", "laugh");
        await room.Animator.InvokeAsync("SetRoomSettings", RoomSettings.Default);

        // The call ends: dropped again. A presentation then shows that the laugh and the like never went out.
        await room.Animator.InvokeAsync("DisableDiscussion");
        await room.Guest.InvokeAsync("React", "like");
        await RoomHost.UntilAsync(() => Buffer.Waiting == 0, "the call's burst to flush");

        // Nothing of the call was kept: the same one presentation, its totals untouched, and the view says so.
        Assert.Equal(before, await SessionsAsync(room.CircleId));
        var view = await room.Http.GetFromJsonAsync<JsonElement>($"/api/circles/{room.CircleId}");
        Assert.Equal(new Dictionary<string, int> { ["heart"] = 1 }, Counts(view.GetProperty("reactionTotals")));

        await room.Animator.InvokeAsync("StartPresentation", deck);
        await room.Guest.InvokeAsync("React", "clap");
        Assert.Equal(new Dictionary<string, int> { ["clap"] = 1 }, Counts(await room.Bursts.NextAsync()));
    }

    [Fact]
    public async Task A_presentation_running_inside_a_call_keeps_the_calls_reactions_in_its_anonymous_totals()
    {
        var room = await RoomAsync();
        await room.Animator.InvokeAsync("EnableDiscussion", true, "open");
        var deck = await DeckAsync(room.CircleId);
        await room.Animator.InvokeAsync("StartPresentation", deck);

        await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => room.Guest.InvokeAsync("React", "clap")).Append(room.Animator.InvokeAsync("React", "heart")));
        var expected = new Dictionary<string, int> { ["clap"] = 4, ["heart"] = 1 };
        Assert.Equal(expected, await ReceivedAsync(room.Bursts, 5));
        Assert.Equal(expected, await RunningTotalsAsync(room.CircleId, 5));

        // Counts only: nobody's id or name in what is kept.
        var stored = (await SessionsAsync(room.CircleId)).Single().Totals;
        Assert.DoesNotContain(room.GuestId.ToString(), stored, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Lucía", stored, StringComparison.Ordinal);

        // The presentation ends, the call goes on: reactions still go out, its totals stay as they were.
        await room.Animator.InvokeAsync("EndPresentation");
        await room.Guest.InvokeAsync("React", "wow");
        Assert.Equal(new Dictionary<string, int> { ["wow"] = 1 }, Counts(await room.Bursts.NextAsync()));
        await RoomHost.UntilAsync(() => Buffer.Waiting == 0, "the burst to flush");
        Assert.Equal(expected, new Dictionary<string, int>(ReactionKinds.Totals((await SessionsAsync(room.CircleId)).Single().Totals)));
    }

    [Fact]
    public async Task However_a_call_ends_everyone_gets_the_empty_queue()
    {
        // The animator stays away: the hand in the queue and the floor go, and the room hears it.
        var away = await RoomAsync();
        var awayHands = new Inbox<HandsView>(away.Guest, "Hands");
        await away.Animator.InvokeAsync("EnableDiscussion", false, "hand");
        await away.Guest.InvokeAsync("RaiseHand");
        Assert.Single((await awayHands.NextAsync(h => h.Queue.Count == 1)).Queue);
        _open.Remove(away.Animator);
        await away.Animator.DisposeAsync();
        await RoomHost.UntilAsync(() => _factory.Services.GetRequiredService<CallAway>().EndsAt(away.CircleId) is not null, "the countdown to start");
        _host.Advance(TimeSpan.FromMinutes(5));
        var emptied = await awayHands.NextAsync(h => h.Queue.Count == 0);
        Assert.Null(emptied.Floor);
        Assert.False((await _host.CircleRowAsync(away.CircleId)).DiscussionOn);

        // The circle is closed during a call, with someone holding the floor.
        var closed = await RoomAsync();
        var closedHands = new Inbox<HandsView>(closed.Guest, "Hands");
        await closed.Animator.InvokeAsync("EnableDiscussion", false, "hand");
        await closed.Guest.InvokeAsync("RaiseHand");
        await closedHands.NextAsync(h => h.Queue.Count == 1);
        await closed.Animator.InvokeAsync("GiveFloor", closed.GuestId);
        Assert.Equal(closed.GuestId, (await closedHands.NextAsync(h => h.Floor is not null)).Floor);
        (await closed.Http.PostJsonAsync($"/api/circles/{closed.CircleId}/close", new { }, closed.Csrf)).EnsureSuccessStatusCode();
        var cleared = await closedHands.NextAsync(h => h.Floor is null);
        Assert.Empty(cleared.Queue);
        Assert.Empty(await _host.Room.DbAsync(db => db.RaisedHands.Where(h => h.CircleId == closed.CircleId).ToListAsync()));
    }
}
