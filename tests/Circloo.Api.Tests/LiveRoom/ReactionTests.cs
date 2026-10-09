using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Integrations;
using Circloo.Api.Presentations;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Circloo.Api.Tests.LiveRoom;

/// <summary>
/// Issue #181 (T807): emoji reactions of spec 008 US4. Grouped bursts, the per-person limit, the switch, the totals per
/// presentation in the circle view and "Send results", and no trace of who reacted.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class ReactionTests(PostgresFixture pg) : IAsyncLifetime
{
    private ApiFactory _factory = null!;
    private RoomHost _host = null!;
    private readonly List<HubConnection> _open = [];

    private sealed record Guest(Guid Id, string Name, CookieContainerHandler Cookies, HubConnection Hub);

    private sealed record Room(Guid CircleId, Guid DeckId, HttpClient AnimatorHttp, CookieContainerHandler AnimatorCookies, HubConnection Animator,
        Inbox<JsonElement> AnimatorReactions, List<Guest> Guests);

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

    private async Task<HubConnection> EnterAsync(CookieContainerHandler cookies, Guid circleId, Action<HubConnection>? listen = null)
    {
        var hub = _host.Hub(cookies);
        listen?.Invoke(hub);
        await hub.StartAsync();
        _open.Add(hub);
        await hub.InvokeAsync<Guid[]>("Enter", circleId);
        return hub;
    }

    /// <summary>A circle with <paramref name="guests"/> people in the live room and, unless told otherwise, a presentation running.</summary>
    private async Task<Room> RoomAsync(int guests = 2, bool presenting = true)
    {
        var circle = await _host.CircleAsync();
        Inbox<JsonElement> animatorReactions = null!;
        var animator = await EnterAsync(circle.Cookies, circle.Id, h => animatorReactions = new Inbox<JsonElement>(h, "Reactions"));
        var joined = await Task.WhenAll(Enumerable.Range(0, guests).Select(async i =>
        {
            var name = $"Guest {i}";
            var (res, _, cookies) = await _host.JoinAsync(circle.Code, name, Characters.All[1 + i]);
            res.EnsureSuccessStatusCode();
            return (Name: name, Cookies: cookies, Hub: await EnterAsync(cookies, circle.Id));
        }));
        var members = await _host.MembersAsync(circle.Id);
        var deckId = await DeckAsync(members.Single(m => m.Role == Roles.Animator).UserId!.Value, "Team kickoff");
        if (presenting)
        {
            await animator.InvokeAsync("StartPresentation", deckId);
        }
        return new Room(circle.Id, deckId, circle.Http, circle.Cookies, animator, animatorReactions,
            [.. joined.Select(g => new Guest(members.Single(m => m.Name == g.Name).Id, g.Name, g.Cookies, g.Hub))]);
    }

    private Task<Guid> DeckAsync(Guid ownerUserId, string name) => _host.DbAsync(async db =>
    {
        var deck = new Presentation { OwnerUserId = ownerUserId, Name = name, SourceFileName = "deck.pptx", Status = PresentationStatus.Ready, SlideCount = 1, AutoOpen = false };
        db.Presentations.Add(deck);
        db.Slides.Add(new Slide { PresentationId = deck.Id, Kind = SlideKinds.Deck, Position = 0, SourceIndex = 0 });
        await db.SaveChangesAsync();
        return deck.Id;
    });

    private static async Task<string> RefusedAsync(Func<Task> call) => (await Assert.ThrowsAsync<HubException>(call)).Message;

    private static Dictionary<string, int> Counts(JsonElement burst) =>
        burst.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetInt32());

    /// <summary>Bursts as they arrive until <paramref name="total"/> reactions have come in.</summary>
    private static async Task<List<JsonElement>> BurstsAsync(Inbox<JsonElement> inbox, int total)
    {
        var bursts = new List<JsonElement>();
        while (bursts.Sum(b => Counts(b).Values.Sum()) < total)
        {
            bursts.Add(await inbox.NextAsync());
        }
        return bursts;
    }

    private static Dictionary<string, int> Sum(IEnumerable<JsonElement> bursts) =>
        bursts.SelectMany(b => Counts(b)).GroupBy(kv => kv.Key).ToDictionary(g => g.Key, g => g.Sum(kv => kv.Value));

    private Task<string?> StoredTotalsAsync(Guid circleId) =>
        _host.DbAsync(db => db.PresentationSessions.AsNoTracking().Where(s => s.CircleId == circleId)
            .OrderByDescending(s => s.StartedAt).Select(s => s.ReactionTotals).FirstOrDefaultAsync());

    /// <summary>The flush stores the totals alongside the broadcast: wait until they hold <paramref name="expected"/>.</summary>
    private async Task<ReactionBurst> TotalsAsync(Guid circleId, int expected)
    {
        var waited = Stopwatch.StartNew();
        while (true)
        {
            var totals = ReactionKinds.Totals(await StoredTotalsAsync(circleId));
            if (totals.Values.Sum() >= expected || waited.Elapsed > RoomHost.Wait)
            {
                return totals;
            }
            await Task.Delay(20);
        }
    }

    [Fact]
    public async Task A_hundred_reactions_from_twenty_people_arrive_as_a_few_bursts_that_add_up_without_names()
    {
        var room = await RoomAsync(guests: 20);
        await using var screen = _host.Hub(room.AnimatorCookies);
        var screenReactions = new Inbox<JsonElement>(screen, "Reactions");
        await screen.StartAsync();
        await screen.InvokeAsync<object?>("EnterAudience", room.CircleId);

        // Each person sends their limit of 5, guest i always the same kind.
        var watch = Stopwatch.StartNew();
        await Task.WhenAll(room.Guests.Select((g, i) => Task.WhenAll(Enumerable.Range(0, 5)
            .Select(_ => g.Hub.InvokeAsync("React", ReactionKinds.All[i % ReactionKinds.All.Length])))));
        var sending = watch.Elapsed;

        var bursts = await BurstsAsync(room.AnimatorReactions, 100);
        var expected = ReactionKinds.All.ToDictionary(k => k, k => 5 * Enumerable.Range(0, 20).Count(i => ReactionKinds.All[i % ReactionKinds.All.Length] == k));
        Assert.Equal(expected, Sum(bursts));
        // One burst per 400 ms at most while the taps arrive, plus the first and the trailing one.
        var most = (int)Math.Ceiling(sending.TotalMilliseconds / ReactionBuffer.FlushEvery.TotalMilliseconds) + 2;
        Assert.True(bursts.Count <= most, $"{bursts.Count} bursts for {sending.TotalMilliseconds:F0} ms of taps (at most {most}).");
        // The projector gets the very same bursts.
        Assert.Equal(expected, Sum(await BurstsAsync(screenReactions, 100)));

        // Counts only: the kinds as keys, numbers as values, and no member id or name anywhere.
        var ids = room.Guests.Select(g => g.Id.ToString()).Concat(room.Guests.Select(g => g.Name)).ToList();
        foreach (var burst in bursts)
        {
            Assert.All(burst.EnumerateObject(), p =>
            {
                Assert.Contains(p.Name, ReactionKinds.All);
                Assert.Equal(JsonValueKind.Number, p.Value.ValueKind);
            });
            var raw = burst.GetRawText();
            Assert.DoesNotContain(ids, id => raw.Contains(id, StringComparison.OrdinalIgnoreCase));
        }

        // The running presentation keeps the sum, and only the sum.
        Assert.Equal(expected, new Dictionary<string, int>(await TotalsAsync(room.CircleId, 100)));
        var stored = (await StoredTotalsAsync(room.CircleId))!;
        Assert.DoesNotContain(ids, id => stored.Contains(id, StringComparison.OrdinalIgnoreCase));
        Assert.Equal(0, _factory.Services.GetRequiredService<ReactionBuffer>().Waiting);
    }

    [Fact]
    public async Task A_person_gets_five_reactions_per_ten_seconds_across_their_tabs_and_extra_ones_vanish()
    {
        var room = await RoomAsync(guests: 1);
        var kenji = room.Guests[0];
        var tab = await EnterAsync(kenji.Cookies, room.CircleId);

        // Eight taps from two tabs at once: no error, five count.
        await Task.WhenAll(Enumerable.Range(0, 8).Select(i => (i % 2 == 0 ? kenji.Hub : tab).InvokeAsync("React", "clap")));
        Assert.Equal(new Dictionary<string, int> { ["clap"] = 5 }, Sum(await BurstsAsync(room.AnimatorReactions, 5)));

        // Still inside the window: dropped. Ten seconds later: counted again, and the next burst is that one alone.
        await kenji.Hub.InvokeAsync("React", "heart");
        _factory.Clock.Advance(TimeSpan.FromSeconds(10));
        await tab.InvokeAsync("React", "party");
        Assert.Equal(new Dictionary<string, int> { ["party"] = 1 }, Counts(await room.AnimatorReactions.NextAsync()));
        Assert.Equal(new Dictionary<string, int> { ["clap"] = 5, ["party"] = 1 }, new Dictionary<string, int>(await TotalsAsync(room.CircleId, 6)));
    }

    [Fact]
    public async Task Nothing_is_sent_while_reactions_are_off_and_those_taps_do_not_use_the_budget()
    {
        var room = await RoomAsync(guests: 1);
        var kenji = room.Guests[0];

        await room.Animator.InvokeAsync("SetRoomSettings", new RoomSettings(RoomChatModes.Open, false, false));
        foreach (var _ in Enumerable.Range(0, 5))
        {
            await kenji.Hub.InvokeAsync("React", "clap");
        }
        await room.Animator.InvokeAsync("SetRoomSettings", RoomSettings.Default);
        foreach (var _ in Enumerable.Range(0, 5))
        {
            await kenji.Hub.InvokeAsync("React", "wow");
        }

        Assert.Equal(new Dictionary<string, int> { ["wow"] = 5 }, Sum(await BurstsAsync(room.AnimatorReactions, 5)));
        Assert.Equal(new Dictionary<string, int> { ["wow"] = 5 }, new Dictionary<string, int>(await TotalsAsync(room.CircleId, 5)));
    }

    [Fact]
    public async Task Nothing_is_sent_or_kept_without_a_running_presentation()
    {
        var room = await RoomAsync(guests: 1, presenting: false);
        var kenji = room.Guests[0];

        await kenji.Hub.InvokeAsync("React", "clap");
        await room.Animator.InvokeAsync("StartPresentation", room.DeckId);
        await kenji.Hub.InvokeAsync("React", "laugh");
        Assert.Equal(new Dictionary<string, int> { ["laugh"] = 1 }, Counts(await room.AnimatorReactions.NextAsync()));

        await room.Animator.InvokeAsync("EndPresentation");
        await kenji.Hub.InvokeAsync("React", "clap");
        await room.Animator.InvokeAsync("StartPresentation", room.DeckId);
        await kenji.Hub.InvokeAsync("React", "like");
        Assert.Equal(new Dictionary<string, int> { ["like"] = 1 }, Counts(await room.AnimatorReactions.NextAsync()));
    }

    [Fact]
    public async Task Totals_are_kept_per_presentation_shown_in_the_view_and_sent_as_one_line_without_names()
    {
        var room = await RoomAsync(guests: 2);
        var (kenji, lucia) = (room.Guests[0], room.Guests[1]);
        await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => kenji.Hub.InvokeAsync("React", "clap"))
            .Concat(Enumerable.Range(0, 2).Select(_ => lucia.Hub.InvokeAsync("React", "heart"))));
        await BurstsAsync(room.AnimatorReactions, 5);
        await TotalsAsync(room.CircleId, 5);
        await room.Animator.InvokeAsync("EndPresentation");

        // The circle view shows the latest presentation's totals.
        var view = await room.AnimatorHttp.GetFromJsonAsync<JsonElement>($"/api/circles/{room.CircleId}");
        Assert.Equal(new Dictionary<string, int> { ["clap"] = 3, ["heart"] = 2 }, Counts(view.GetProperty("reactionTotals")));

        // A second presentation without reactions: the view follows it, the report keeps one line for the first only.
        var second = await DeckAsync((await _host.MembersAsync(room.CircleId)).Single(m => m.Role == Roles.Animator).UserId!.Value, "Q4 plans");
        await room.Animator.InvokeAsync("StartPresentation", second);
        await room.Animator.InvokeAsync("EndPresentation");
        view = await room.AnimatorHttp.GetFromJsonAsync<JsonElement>($"/api/circles/{room.CircleId}");
        Assert.Empty(view.GetProperty("reactionTotals").EnumerateObject());

        var report = await _host.DbAsync(async db => await CircleReports.BuildAsync(db, await db.Circles.SingleAsync(c => c.Id == room.CircleId),
            new Dictionary<string, string>(), _factory.Clock.GetUtcNow(), CancellationToken.None));
        Assert.Equal(["Reactions (Team kickoff): 👏 3 · ❤️ 2"], report.ReactionLines);

        // Every service gets the line; nobody's name or id goes with it.
        var stub = new StubServices();
        var sender = new IntegrationSender(new StubClients(stub));
        await sender.SendAsync(Providers.Teams, new IntegrationConfig { WebhookUrl = "https://prod-01.westeurope.logic.azure.com/workflows/x" }, report, CancellationToken.None);
        await sender.SendAsync(Providers.Confluence, new IntegrationConfig { Site = "https://team.atlassian.net", Email = "a@b.co", ApiToken = "token", SpaceId = "98304" }, report, CancellationToken.None);
        await sender.SendAsync(Providers.Notion, new IntegrationConfig { Token = "ntn_x", ParentPageId = "0123456789abcdef0123456789abcdef" }, report, CancellationToken.None);
        await sender.SendAsync(Providers.Jira, new IntegrationConfig { Site = "https://team.atlassian.net", Email = "a@b.co", ApiToken = "token", ProjectKey = "TEAM" }, report, CancellationToken.None);
        var bodies = stub.Calls.Select(c => string.Join('\n', Texts(JsonDocument.Parse(c.Body).RootElement))).ToList();
        Assert.Equal(4, bodies.Count);
        Assert.All(bodies, body =>
        {
            Assert.Contains("Reactions (Team kickoff): 👏 3 · ❤️ 2", body, StringComparison.Ordinal);
            Assert.DoesNotContain("Q4 plans", body, StringComparison.Ordinal);
            foreach (var g in room.Guests)
            {
                Assert.DoesNotContain(g.Name, body, StringComparison.Ordinal);
                Assert.DoesNotContain(g.Id.ToString(), body, StringComparison.OrdinalIgnoreCase);
            }
        });
    }

    [Fact]
    public async Task Only_people_in_the_circle_react_and_only_with_a_known_kind()
    {
        var room = await RoomAsync(guests: 1);
        var kenji = room.Guests[0];

        Assert.Contains("reaction-invalid", await RefusedAsync(() => kenji.Hub.InvokeAsync("React", "poop")));
        Assert.Contains("reaction-invalid", await RefusedAsync(() => kenji.Hub.InvokeAsync("React", "CLAP")));

        // Never entered this circle.
        var other = await _host.CircleAsync();
        await using var stranger = _host.Hub(other.Cookies);
        await stranger.StartAsync();
        Assert.Contains("not-entered", await RefusedAsync(() => stranger.InvokeAsync("React", "clap")));

        // The projector only listens.
        await using var screen = _host.Hub(room.AnimatorCookies);
        await screen.StartAsync();
        await screen.InvokeAsync<object?>("EnterAudience", room.CircleId);
        Assert.Contains("audience-read-only", await RefusedAsync(() => screen.InvokeAsync("React", "clap")));

        // Someone who left after entering loses access at once (FR-830).
        await _host.DbAsync(db => db.CircleMembers.Where(m => m.Id == kenji.Id).ExecuteUpdateAsync(s => s.SetProperty(m => m.LeftAt, _factory.Clock.GetUtcNow())));
        Assert.Contains("not-a-member", await RefusedAsync(() => kenji.Hub.InvokeAsync("React", "clap")));
    }

    [Fact]
    public void Stored_totals_read_known_kinds_only_and_print_in_a_fixed_order()
    {
        Assert.Empty(ReactionKinds.Totals(null));
        Assert.Empty(ReactionKinds.Totals("not json"));
        Assert.Empty(ReactionKinds.Totals("[1,2]"));
        var totals = ReactionKinds.Totals("""{"party":2,"clap":42,"heart":0,"member":"x","laugh":"9","wow":3}""");
        Assert.Equal(new Dictionary<string, int> { ["clap"] = 42, ["wow"] = 3, ["party"] = 2 }, new Dictionary<string, int>(totals));
        Assert.Equal("👏 42 · 😮 3 · 🎉 2", ReactionKinds.Line(totals));
    }

    /// <summary>Every string in a request body, unescaped (Confluence's HTML too), to search as people would read it.</summary>
    private static IEnumerable<string> Texts(JsonElement e) => e.ValueKind switch
    {
        JsonValueKind.Object => e.EnumerateObject().SelectMany(p => Texts(p.Value)),
        JsonValueKind.Array => e.EnumerateArray().SelectMany(Texts),
        JsonValueKind.String => [System.Net.WebUtility.HtmlDecode(e.GetString()!)],
        _ => [],
    };

    /// <summary>Hands the senders a client that records instead of calling out.</summary>
    private sealed class StubClients(StubServices stub) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(stub, disposeHandler: false);
    }
}
