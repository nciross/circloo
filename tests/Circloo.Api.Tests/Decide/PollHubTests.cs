using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Channels;
using Circloo.Api.Data;
using Circloo.Api.Decide;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Circloo.Api.Tests.Decide;

/// <summary>Issue #142: live polls over the circle hub (spec 007 US1, contracts/hub.md).</summary>
[Collection(ApiCollection.Name)]
public sealed class PollHubTests(PostgresFixture pg) : IAsyncLifetime
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(10);
    private ApiFactory _factory = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString());
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private (HttpClient Http, CookieContainerHandler Cookies) Browser()
    {
        var cookies = new CookieContainerHandler();
        return (_factory.CreateDefaultClient(new Uri("https://localhost"), cookies), cookies);
    }

    private HubConnection Hub(CookieContainerHandler cookies) =>
        new HubConnectionBuilder()
            .WithUrl("https://localhost/hubs/circle", o =>
            {
                o.Transports = Microsoft.AspNetCore.Http.Connections.HttpTransportType.LongPolling;
                o.HttpMessageHandlerFactory = _ => new CookieContainerHandler(cookies.Container) { InnerHandler = _factory.Server.CreateHandler() };
            })
            .Build();

    private sealed class Inbox<T>
    {
        private readonly Channel<T> _items = Channel.CreateUnbounded<T>();

        public Inbox(Action<Action<T>> register) => register(x => _items.Writer.TryWrite(x));

        public async Task<T> NextAsync(Func<T, bool>? match = null)
        {
            using var cts = new CancellationTokenSource(Wait);
            while (true)
            {
                var item = await _items.Reader.ReadAsync(cts.Token);
                if (match is null || match(item))
                {
                    return item;
                }
            }
        }

        public bool Any() => _items.Reader.TryPeek(out _);
    }

    private sealed class Room : IAsyncDisposable
    {
        public required Guid CircleId { get; init; }
        public required HubConnection Animator { get; init; }
        public required HubConnection Guest { get; init; }
        public required HubConnection Guest2 { get; init; }
        public required CookieContainerHandler GuestCookies { get; init; }
        public required HttpClient GuestHttp { get; init; }
        public required HttpClient AnimatorHttp { get; init; }
        public required Guid GuestId { get; init; }

        public async ValueTask DisposeAsync()
        {
            await Animator.DisposeAsync();
            await Guest.DisposeAsync();
            await Guest2.DisposeAsync();
        }
    }

    private static Inbox<PollResultsView> Results(HubConnection hub) => new(add => hub.On<PollResultsView>("PollResults", add));
    private static Inbox<PollView> Changes(HubConnection hub) => new(add => hub.On<PollView>("PollChanged", add));
    private static Inbox<(Guid, int)> Counts(HubConnection hub) => new(add => hub.On<Guid, int>("PollCount", (id, n) => add((id, n))));

    /// <summary>An animator with a circle running the Poll activity, and two guests in the room.</summary>
    private async Task<Room> RoomAsync(Action<HubConnection>? beforeAnimator = null, Action<HubConnection>? beforeGuest = null, Action<HubConnection>? beforeGuest2 = null)
    {
        var (http, cookies) = Browser();
        var csrf = await http.SignInAsync(_factory, $"poll-{Guid.NewGuid():N}@example.test");
        (await http.PutJsonAsync("/api/me/profile", new { displayName = "Amina", locale = "en" }, csrf)).EnsureSuccessStatusCode();
        var res = await http.PostJsonAsync("/api/circles", new { name = "Lunch", activities = new[] { "poll", "qa" }, character = "panda", locale = "en" }, csrf);
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        var id = body.GetProperty("id").GetGuid();
        var code = body.GetProperty("joinCode").GetString()!;

        async Task<(HttpClient, CookieContainerHandler)> Guest(string name, string character)
        {
            var (guest, guestCookies) = Browser();
            (await guest.PostJsonAsync($"/api/join/{code}", new { name, character }, await guest.CsrfAsync())).EnsureSuccessStatusCode();
            return (guest, guestCookies);
        }
        var (guestHttp, guestCookies) = await Guest("Kenji", "fox");
        var (_, guest2Cookies) = await Guest("Lucía", "owl");
        var animator = Hub(cookies);
        var guest = Hub(guestCookies);
        var guest2 = Hub(guest2Cookies);
        beforeAnimator?.Invoke(animator);
        beforeGuest?.Invoke(guest);
        beforeGuest2?.Invoke(guest2);
        foreach (var h in new[] { animator, guest, guest2 })
        {
            await h.StartAsync();
            await h.InvokeAsync<Guid[]>("Enter", id);
        }
        await animator.InvokeAsync("StartActivity", "poll");
        var guestId = (await guestHttp.GetFromJsonAsync<JsonElement>($"/api/circles/{id}")).GetProperty("me").GetProperty("id").GetGuid();
        return new Room { CircleId = id, Animator = animator, Guest = guest, Guest2 = guest2, GuestCookies = guestCookies, GuestHttp = guestHttp, AnimatorHttp = http, GuestId = guestId };
    }

    private static async Task<string> RefusedAsync(Func<Task> call) =>
        (await Assert.ThrowsAsync<Microsoft.AspNetCore.SignalR.HubException>(call)).Message;

    private static PollInput Lunch(bool live = true, bool multiple = false) => new("Where do we eat?", ["Pizza", "Sushi", "Tacos"], multiple, live);

    private async Task<T> DbAsync<T>(Func<CirclooDbContext, Task<T>> query)
    {
        using var scope = _factory.Services.CreateScope();
        return await query(scope.ServiceProvider.GetRequiredService<CirclooDbContext>());
    }

    [Fact]
    public async Task Only_the_animator_runs_polls_and_participants_vote_once_each()
    {
        Inbox<PollResultsView>? guestResults = null;
        Inbox<PollView>? guestChanges = null;
        await using var room = await RoomAsync(beforeGuest: g => { guestResults = Results(g); guestChanges = Changes(g); });

        Assert.Contains("animator-only", await RefusedAsync(() => room.Guest.InvokeAsync<PollView>("CreatePoll", Lunch())));
        Assert.StartsWith("poll-invalid:options", (await Assert.ThrowsAsync<Microsoft.AspNetCore.SignalR.HubException>(
            () => room.Animator.InvokeAsync<PollView>("CreatePoll", new PollInput("Q?", ["Only one"])))).Message.Split("HubException: ").Last());

        var poll = await room.Animator.InvokeAsync<PollView>("CreatePoll", Lunch());
        Assert.Equal("draft", poll.State);
        // A draft is the animator's own; members cannot vote on it.
        Assert.Contains("poll-not-open", await RefusedAsync(() => room.Guest.InvokeAsync("VotePoll", poll.Id, new[] { "a" })));

        await room.Animator.InvokeAsync("OpenPoll", poll.Id);
        Assert.Equal("open", (await guestChanges!.NextAsync()).State);
        Assert.Contains("animator-cannot-answer", await RefusedAsync(() => room.Animator.InvokeAsync("VotePoll", poll.Id, new[] { "a" })));
        Assert.Contains("invalid-options", await RefusedAsync(() => room.Guest.InvokeAsync("VotePoll", poll.Id, new[] { "a", "b" })));
        Assert.Contains("invalid-options", await RefusedAsync(() => room.Guest.InvokeAsync("VotePoll", poll.Id, new[] { "z" })));

        await room.Guest.InvokeAsync("VotePoll", poll.Id, new[] { "a" });
        await room.Guest2.InvokeAsync("VotePoll", poll.Id, new[] { "b" });
        var both = await guestResults!.NextAsync(r => r.Votes == 2);
        Assert.Equal([50, 50, 0], both.Options.Select(o => o.Percent));
        // Changing a vote replaces it.
        await room.Guest2.InvokeAsync("VotePoll", poll.Id, new[] { "a" });
        var changed = await guestResults.NextAsync(r => r.Options[0].Count == 2);
        Assert.Equal((2, 100, true), (changed.Votes, changed.Options[0].Percent, changed.Options[0].Winner));

        await room.Animator.InvokeAsync("ClosePoll", poll.Id);
        Assert.Equal("closed", (await guestChanges.NextAsync(p => p.State == "closed")).State);
        Assert.Contains("poll-not-open", await RefusedAsync(() => room.Guest.InvokeAsync("VotePoll", poll.Id, new[] { "b" })));
        Assert.Equal(2, await DbAsync(db => db.PollVotes.CountAsync(v => v.PollId == poll.Id)));
    }

    [Fact]
    public async Task Parallel_votes_from_one_member_leave_one_row()
    {
        await using var room = await RoomAsync();
        var poll = await room.Animator.InvokeAsync<PollView>("CreatePoll", Lunch());
        await room.Animator.InvokeAsync("OpenPoll", poll.Id);
        await using var tab = Hub(room.GuestCookies);
        await tab.StartAsync();
        await tab.InvokeAsync<Guid[]>("Enter", room.CircleId);

        await Task.WhenAll(
            room.Guest.InvokeAsync("VotePoll", poll.Id, new[] { "a" }), tab.InvokeAsync("VotePoll", poll.Id, new[] { "b" }),
            room.Guest.InvokeAsync("VotePoll", poll.Id, new[] { "c" }), tab.InvokeAsync("VotePoll", poll.Id, new[] { "a" }));
        Assert.Equal(1, await DbAsync(db => db.PollVotes.CountAsync(v => v.PollId == poll.Id && v.MemberId == room.GuestId)));
    }

    [Fact]
    public async Task Hidden_results_reach_only_the_animator_until_the_vote_closes()
    {
        Inbox<PollResultsView>? animatorResults = null, guestResults = null;
        Inbox<(Guid, int)>? guestCounts = null;
        await using var room = await RoomAsync(
            beforeAnimator: a => animatorResults = Results(a),
            beforeGuest: g => { guestResults = Results(g); guestCounts = Counts(g); });
        var poll = await room.Animator.InvokeAsync<PollView>("CreatePoll", Lunch(live: false));
        await room.Animator.InvokeAsync("OpenPoll", poll.Id);
        await room.Guest2.InvokeAsync("VotePoll", poll.Id, new[] { "c" });

        Assert.Equal(1, (await animatorResults!.NextAsync(r => r.Votes == 1)).Options[2].Count);
        Assert.Equal(1, (await guestCounts!.NextAsync(c => c.Item2 == 1)).Item2);
        Assert.False(guestResults!.Any());
        // The circle view gives members the count, not the results.
        var view = await room.GuestHttp.GetFromJsonAsync<JsonElement>($"/api/circles/{room.CircleId}");
        Assert.Equal(JsonValueKind.Null, view.GetProperty("decide").GetProperty("pollResults").ValueKind);
        Assert.Equal(1, view.GetProperty("decide").GetProperty("pollVotes").GetInt32());

        await room.Animator.InvokeAsync("ClosePoll", poll.Id);
        Assert.Equal(100, (await guestResults.NextAsync()).Options[2].Percent);
    }

    [Fact]
    public async Task A_late_joiner_sees_the_open_poll_with_their_vote_and_switching_activity_closes_it()
    {
        await using var room = await RoomAsync();
        var poll = await room.Animator.InvokeAsync<PollView>("CreatePoll", Lunch(multiple: true));
        await room.Animator.InvokeAsync("OpenPoll", poll.Id);
        await room.Guest.InvokeAsync("VotePoll", poll.Id, new[] { "c", "a" });

        var decide = (await room.GuestHttp.GetFromJsonAsync<JsonElement>($"/api/circles/{room.CircleId}")).GetProperty("decide");
        Assert.Equal(poll.Id, decide.GetProperty("poll").GetProperty("id").GetGuid());
        Assert.Equal(["a", "c"], decide.GetProperty("poll").GetProperty("myVote").EnumerateArray().Select(e => e.GetString()));
        Assert.Equal(1, decide.GetProperty("pollResults").GetProperty("votes").GetInt32());

        await room.Animator.InvokeAsync("StartActivity", "qa");
        var after = (await room.GuestHttp.GetFromJsonAsync<JsonElement>($"/api/circles/{room.CircleId}")).GetProperty("decide");
        Assert.Equal(JsonValueKind.Null, after.GetProperty("poll").ValueKind);
        var finished = Assert.Single(after.GetProperty("polls").EnumerateArray());
        Assert.Equal(poll.Id, finished.GetProperty("id").GetGuid());
    }
}
