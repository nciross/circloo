using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Channels;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Presentations;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.Azurite;

namespace Circloo.Api.Tests.Presentations;

/// <summary>Issue #106: presenting in a circle over the hub (spec 006 US3, contracts/hub.md).</summary>
[Collection(ApiCollection.Name)]
public sealed partial class PresentingHubTests(PostgresFixture pg) : IAsyncLifetime
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(10);
    private readonly AzuriteContainer _azurite = new AzuriteBuilder("mcr.microsoft.com/azure-storage/azurite:3.35.0")
        .WithInMemoryPersistence().WithCommand("--skipApiVersionCheck").Build();
    private ApiFactory _factory = null!;

    public async Task InitializeAsync()
    {
        await _azurite.StartAsync();
        _factory = new ApiFactory(pg.Container.GetConnectionString(), new Dictionary<string, string?> { ["ConnectionStrings:blobs"] = _azurite.GetConnectionString() });
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _azurite.DisposeAsync();
    }

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

    /// <summary>Every event of one kind a connection receives, to await in order.</summary>
    private sealed class Inbox<T>
    {
        private readonly Channel<T> _items = Channel.CreateUnbounded<T>();

        public Inbox(HubConnection hub, string method) => hub.On<T>(method, x => _items.Writer.TryWrite(x));

        /// <summary>For events with several arguments or none: <paramref name="register"/> wires the handler to <c>Add</c>.</summary>
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

    private sealed record Notes(Guid SlideId, string? Text, NextSlideView? Upcoming);

    private static Inbox<Notes> NotesOf(HubConnection hub) =>
        new(add => hub.On<Guid, string?, NextSlideView?>("PresenterNotes", (id, text, upcoming) => add(new Notes(id, text, upcoming))));

    private sealed class Room : IAsyncDisposable
    {
        public required Guid CircleId { get; init; }
        public required string JoinCode { get; init; }
        public required HubConnection Animator { get; init; }
        public required HttpClient AnimatorHttp { get; init; }
        public required string AnimatorCsrf { get; init; }
        public required CookieContainerHandler AnimatorCookies { get; init; }
        public required HubConnection Guest { get; init; }
        public required Guid AnimatorUserId { get; init; }
        public required HttpClient GuestHttp { get; init; }
        public required CookieContainerHandler GuestCookies { get; init; }

        public async ValueTask DisposeAsync()
        {
            await Animator.DisposeAsync();
            await Guest.DisposeAsync();
        }
    }

    /// <summary>An animator with a presentation circle and a guest in it, both in the live room.</summary>
    private async Task<Room> RoomAsync(Action<HubConnection>? beforeAnimatorEnters = null, Action<HubConnection>? beforeGuestEnters = null,
        string[]? activities = null)
    {
        var (http, cookies) = Browser();
        var csrf = await http.SignInAsync(_factory, $"present-{Guid.NewGuid():N}@example.test");
        (await http.PutJsonAsync("/api/me/profile", new { displayName = "Amina", locale = "en" }, csrf)).EnsureSuccessStatusCode();
        var res = await http.PostJsonAsync("/api/circles", new { name = "Kickoff", activities = activities ?? ["presentation", "quick-question"], character = "panda", locale = "en" }, csrf);
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        var id = body.GetProperty("id").GetGuid();
        var joinCode = body.GetProperty("joinCode").GetString()!;

        var (guest, guestCookies) = await GuestAsync(joinCode, "Kenji");
        var animatorHub = Hub(cookies);
        var guestHub = Hub(guestCookies);
        beforeAnimatorEnters?.Invoke(animatorHub);
        beforeGuestEnters?.Invoke(guestHub);
        await animatorHub.StartAsync();
        await guestHub.StartAsync();
        await animatorHub.InvokeAsync<Guid[]>("Enter", id);
        await guestHub.InvokeAsync<Guid[]>("Enter", id);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        var userId = await db.CircleMembers.Where(m => m.CircleId == id && m.Role == Roles.Animator).Select(m => m.UserId!.Value).SingleAsync();
        return new Room { CircleId = id, JoinCode = joinCode, Animator = animatorHub, AnimatorHttp = http, AnimatorCsrf = csrf, AnimatorCookies = cookies, Guest = guestHub, AnimatorUserId = userId, GuestHttp = guest, GuestCookies = guestCookies };
    }

    /// <summary>Joins as a guest; each one picks a character of their own (characters are unique in a circle).</summary>
    private async Task<(HttpClient Http, CookieContainerHandler Cookies)> GuestAsync(string joinCode, string name, string character = "axolotl")
    {
        var (guest, cookies) = Browser();
        (await guest.PostJsonAsync($"/api/join/{joinCode}", new { name, character }, await guest.CsrfAsync())).EnsureSuccessStatusCode();
        return (guest, cookies);
    }

    /// <summary>A ready deck: slide 1 with notes, a hidden slide, a poll, a last slide.</summary>
    private async Task<(Guid Id, Slide[] Slides)> DeckAsync(Guid ownerUserId, string status = PresentationStatus.Ready, bool allHidden = false)
    {
        var deck = new Presentation { OwnerUserId = ownerUserId, Name = "Team kickoff", SourceFileName = "kickoff.pptx", Status = status, SlideCount = 3 };
        Slide[] slides =
        [
            new() { PresentationId = deck.Id, Kind = SlideKinds.Deck, Position = 0, SourceIndex = 0, Notes = "Welcome everyone", Hidden = allHidden },
            new() { PresentationId = deck.Id, Kind = SlideKinds.Deck, Position = 1, SourceIndex = 1, Hidden = true },
            new()
            {
                PresentationId = deck.Id, Kind = SlideKinds.Poll, Position = 2, Question = "Lunch?",
                Options = [new SlideOption { Id = "a", Text = "Pizza" }, new SlideOption { Id = "b", Text = "Sushi" }],
            },
            new() { PresentationId = deck.Id, Kind = SlideKinds.Deck, Position = 3, SourceIndex = 2, Hidden = allHidden },
        ];
        if (allHidden)
        {
            slides = [slides[0], slides[1], slides[3]];
        }
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        db.Presentations.Add(deck);
        db.Slides.AddRange(slides);
        await db.SaveChangesAsync();
        return (deck.Id, slides);
    }

    private async Task<T> DbAsync<T>(Func<CirclooDbContext, Task<T>> query)
    {
        using var scope = _factory.Services.CreateScope();
        return await query(scope.ServiceProvider.GetRequiredService<CirclooDbContext>());
    }

    private static async Task<string> RefusedAsync(Func<Task> call) =>
        (await Assert.ThrowsAsync<Microsoft.AspNetCore.SignalR.HubException>(call)).Message;

    [Fact]
    public async Task Only_the_animator_presents_and_only_their_ready_presentations()
    {
        await using var room = await RoomAsync();
        var (deckId, _) = await DeckAsync(room.AnimatorUserId);

        foreach (var call in new Func<Task>[]
        {
            () => room.Guest.InvokeAsync("StartPresentation", deckId),
            () => room.Guest.InvokeAsync("GoToSlide", 1),
            () => room.Guest.InvokeAsync("SetBlank", true),
            () => room.Guest.InvokeAsync("EndPresentation"),
            () => room.Guest.InvokeAsync<PresentationStateView?>("EnterAudience", room.CircleId),
        })
        {
            Assert.Contains("animator-only", await RefusedAsync(call));
        }

        Assert.Contains("no-session", await RefusedAsync(() => room.Animator.InvokeAsync("GoToSlide", 1)));
        Assert.Contains("no-session", await RefusedAsync(() => room.Animator.InvokeAsync("EndPresentation")));

        var (converting, _) = await DeckAsync(room.AnimatorUserId, PresentationStatus.Processing);
        Assert.Contains("presentation-not-ready", await RefusedAsync(() => room.Animator.InvokeAsync("StartPresentation", converting)));
        var (other, _) = Browser();
        var otherEmail = $"other-{Guid.NewGuid():N}@example.test";
        await other.SignInAsync(_factory, otherEmail);
        var (someoneElses, _) = await DeckAsync(await DbAsync(db => db.Users.Where(u => u.Email == otherEmail).Select(u => u.Id).SingleAsync()));
        Assert.Contains("presentation-not-ready", await RefusedAsync(() => room.Animator.InvokeAsync("StartPresentation", someoneElses)));
        var (empty, _) = await DeckAsync(room.AnimatorUserId, allHidden: true);
        Assert.Contains("presentation-empty", await RefusedAsync(() => room.Animator.InvokeAsync("StartPresentation", empty)));
    }

    [Fact]
    public async Task Everyone_follows_the_animator_and_notes_reach_only_the_animator()
    {
        Inbox<PresentationStateView>? guestStates = null;
        Inbox<Notes>? guestNotes = null;
        Inbox<PresentationStateView>? animatorStates = null;
        Inbox<Notes>? animatorNotes = null;
        Inbox<ActivityState>? guestActivity = null;
        await using var room = await RoomAsync(
            a =>
            {
                animatorStates = new Inbox<PresentationStateView>(a, "PresentationState");
                animatorNotes = NotesOf(a);
            },
            g =>
            {
                guestStates = new Inbox<PresentationStateView>(g, "PresentationState");
                guestNotes = NotesOf(g);
                guestActivity = new Inbox<ActivityState>(g, "Activity");
            });
        var (deckId, slides) = await DeckAsync(room.AnimatorUserId);

        await room.Animator.InvokeAsync("StartPresentation", deckId);
        Assert.Equal(ActivityCatalog.Presentation, (await guestActivity!.NextAsync()).ActivityId);
        var first = await guestStates!.NextAsync();
        Assert.Equal(("Team kickoff", 0, 3, "deck"), (first.PresentationName, first.Position, first.Count, first.Slide.Kind));
        Assert.Equal($"/api/slides/{slides[0].Id}/image", first.Slide.Image);
        var notes = await animatorNotes!.NextAsync();
        Assert.Equal(("Welcome everyone", SlideKinds.Poll), (notes.Text, notes.Upcoming!.Kind));

        // The hidden slide is skipped: position 1 is the poll, with its question and options but no correct answer.
        await room.Animator.InvokeAsync("GoToSlide", 1);
        var poll = await guestStates.NextAsync();
        Assert.Equal(("poll", "Lunch?", SessionPhases.Idle), (poll.Slide.Kind, poll.Slide.Question, poll.Phase));
        Assert.Equal(["Pizza", "Sushi"], poll.Slide.Options!.Select(o => o.Text));
        Assert.Null((await animatorNotes.NextAsync()).Text);

        await room.Animator.InvokeAsync("SetBlank", true);
        Assert.True((await guestStates.NextAsync()).Blank);
        await room.Animator.InvokeAsync("GoToSlide", 2);
        var last = await guestStates.NextAsync();
        Assert.Equal((2, false), (last.Position, last.Blank));
        Assert.Contains("out-of-range", await RefusedAsync(() => room.Animator.InvokeAsync("GoToSlide", 3)));

        // Every animator tab follows too; participants never got notes.
        Assert.Equal(2, (await animatorStates!.NextAsync(s => s.Position == 2)).Position);
        Assert.False(guestNotes!.Any());

        var session = await DbAsync(db => db.PresentationSessions.SingleAsync(s => s.CircleId == room.CircleId));
        Assert.Equal((2, 2, deckId), (session.Position, session.MaxPosition, session.PresentationId!.Value));
    }

    [Fact]
    public async Task A_late_joiner_and_a_reload_land_on_the_current_slide()
    {
        await using var room = await RoomAsync();
        var (deckId, _) = await DeckAsync(room.AnimatorUserId);
        await room.Animator.InvokeAsync("StartPresentation", deckId);
        await room.Animator.InvokeAsync("GoToSlide", 1);

        var (_, lateCookies) = await GuestAsync(room.JoinCode, "Lucía", "fox");
        await using var late = Hub(lateCookies);
        var states = new Inbox<PresentationStateView>(late, "PresentationState");
        var notes = NotesOf(late);
        await late.StartAsync();
        await late.InvokeAsync<Guid[]>("Enter", room.CircleId);
        var landed = await states.NextAsync();
        Assert.Equal((1, "Lunch?"), (landed.Position, landed.Slide.Question));
        Assert.False(notes.Any());
    }

    [Fact]
    public async Task Ending_or_switching_activity_takes_everyone_out_together()
    {
        Inbox<bool>? ended = null;
        await using var room = await RoomAsync(beforeGuestEnters: g => ended = new Inbox<bool>(add => g.On<Guid>("PresentationEnded", _ => add(true))));
        var (deckId, _) = await DeckAsync(room.AnimatorUserId);

        await room.Animator.InvokeAsync("StartPresentation", deckId);
        await room.Animator.InvokeAsync("EndPresentation");
        await ended!.NextAsync();
        Assert.Null(await DbAsync(db => db.Circles.Where(c => c.Id == room.CircleId).Select(c => c.CurrentActivity).SingleAsync()));

        // Starting again, then another activity: the presentation ends for everyone.
        await room.Animator.InvokeAsync("StartPresentation", deckId);
        await room.Animator.InvokeAsync("StartActivity", "quick-question");
        await ended.NextAsync();
        Assert.Equal(0, await DbAsync(db => db.PresentationSessions.CountAsync(s => s.CircleId == room.CircleId && s.EndedAt == null)));
        Assert.Equal(2, await DbAsync(db => db.AuditEvents.CountAsync(e => e.Type == "session.ended" && e.UserId == room.AnimatorUserId)));
        Assert.Equal(2, await DbAsync(db => db.AuditEvents.CountAsync(e => e.Type == "session.started" && e.UserId == room.AnimatorUserId)));
    }

    [Fact]
    public async Task The_audience_screen_follows_without_notes_or_presence()
    {
        await using var room = await RoomAsync();
        var (deckId, _) = await DeckAsync(room.AnimatorUserId);

        // The audience screen is the animator's own session in another window.
        await using var audience = Hub(room.AnimatorCookies);
        var states = new Inbox<PresentationStateView>(audience, "PresentationState");
        var notes = NotesOf(audience);
        await audience.StartAsync();
        Assert.Null(await audience.InvokeAsync<PresentationStateView?>("EnterAudience", room.CircleId));

        await room.Animator.InvokeAsync("StartPresentation", deckId);
        Assert.Equal(0, (await states.NextAsync()).Position);
        await room.Animator.InvokeAsync("GoToSlide", 2);
        Assert.Equal(2, (await states.NextAsync(st => st.Position == 2)).Position);
        Assert.False(notes.Any());

        // Reopening it lands in place.
        await using var reopened = Hub(room.AnimatorCookies);
        await reopened.StartAsync();
        Assert.Equal(2, (await reopened.InvokeAsync<PresentationStateView?>("EnterAudience", room.CircleId))!.Position);

        // It never counts as someone in the room.
        Assert.Equal(2, (await room.Guest.InvokeAsync<Guid[]>("Enter", room.CircleId)).Length);
    }

    /// <summary>Stores a picture for each deck slide, as the converter would.</summary>
    private async Task PicturesAsync(Guid ownerUserId, Guid presentationId, IEnumerable<Slide> slides)
    {
        var store = _factory.Services.GetRequiredService<SlideStore>();
        await store.EnsureContainerAsync(CancellationToken.None);
        foreach (var slide in slides.Where(x => x.Kind == SlideKinds.Deck))
        {
            await store.PutSlideAsync(ownerUserId, presentationId, slide.Id, thumb: false, new MemoryStream([1, 2, 3]), CancellationToken.None);
        }
    }

    private static async Task<HttpStatusCode> ImageAsync(HttpClient client, Guid slideId) =>
        (await client.GetAsync($"/api/slides/{slideId}/image")).StatusCode;

    [Fact]
    public async Task Members_load_only_slides_already_shown_and_strangers_none()
    {
        await using var room = await RoomAsync();
        var (deckId, slides) = await DeckAsync(room.AnimatorUserId);
        await PicturesAsync(room.AnimatorUserId, deckId, slides);
        var (stranger, _) = Browser();
        await stranger.SignInAsync(_factory, $"stranger-{Guid.NewGuid():N}@example.test");

        // Before the session, only the owner.
        Assert.Equal(HttpStatusCode.OK, await ImageAsync(room.AnimatorHttp, slides[1].Id));
        Assert.Equal(HttpStatusCode.NotFound, await ImageAsync(room.GuestHttp, slides[0].Id));

        await room.Animator.InvokeAsync("StartPresentation", deckId);
        Assert.Equal(HttpStatusCode.OK, await ImageAsync(room.GuestHttp, slides[0].Id));
        // Nobody peeks ahead, hidden slides never show, and people outside the circle see nothing.
        Assert.Equal(HttpStatusCode.NotFound, await ImageAsync(room.GuestHttp, slides[3].Id));
        Assert.Equal(HttpStatusCode.NotFound, await ImageAsync(room.GuestHttp, slides[1].Id));
        Assert.Equal(HttpStatusCode.NotFound, await ImageAsync(stranger, slides[0].Id));

        await room.Animator.InvokeAsync("GoToSlide", 2);
        await room.Animator.InvokeAsync("GoToSlide", 0);
        Assert.Equal(HttpStatusCode.OK, await ImageAsync(room.GuestHttp, slides[3].Id));

        await room.Animator.InvokeAsync("EndPresentation");
        Assert.Equal(HttpStatusCode.NotFound, await ImageAsync(room.GuestHttp, slides[0].Id));
    }

    [Fact]
    public async Task Deleting_the_presentation_ends_its_session_for_everyone()
    {
        Inbox<bool>? ended = null;
        await using var room = await RoomAsync(beforeGuestEnters: g => ended = new Inbox<bool>(add => g.On<Guid>("PresentationEnded", _ => add(true))));
        var (deckId, slides) = await DeckAsync(room.AnimatorUserId);
        await PicturesAsync(room.AnimatorUserId, deckId, slides);
        await room.Animator.InvokeAsync("StartPresentation", deckId);

        (await room.AnimatorHttp.DeleteAsync($"/api/presentations/{deckId}", room.AnimatorCsrf)).EnsureSuccessStatusCode();
        await ended!.NextAsync();
        var session = await DbAsync(db => db.PresentationSessions.SingleAsync(x => x.CircleId == room.CircleId));
        Assert.NotNull(session.EndedAt);
        Assert.Null(session.PresentationId);
        Assert.Null(await DbAsync(db => db.Circles.Where(c => c.Id == room.CircleId).Select(c => c.CurrentActivity).SingleAsync()));
        Assert.Contains("no-session", await RefusedAsync(() => room.Animator.InvokeAsync("GoToSlide", 1)));
    }

    [Fact]
    public async Task A_circle_that_does_not_offer_presentations_cannot_start_one()
    {
        await using var room = await RoomAsync(activities: ["quick-question"]);
        var (deckId, _) = await DeckAsync(room.AnimatorUserId);
        Assert.Contains("activity-invalid", await RefusedAsync(() => room.Animator.InvokeAsync("StartPresentation", deckId)));
    }

    [Fact]
    public async Task Every_animator_tab_gets_the_state_and_notes_and_versions_only_grow()
    {
        await using var room = await RoomAsync();
        var (deckId, _) = await DeckAsync(room.AnimatorUserId);
        await using var tab = Hub(room.AnimatorCookies);
        var states = new Inbox<PresentationStateView>(tab, "PresentationState");
        var notes = NotesOf(tab);
        await tab.StartAsync();
        await tab.InvokeAsync<Guid[]>("Enter", room.CircleId);

        await room.Animator.InvokeAsync("StartPresentation", deckId);
        var first = await states.NextAsync();
        Assert.Equal("Welcome everyone", (await notes.NextAsync()).Text);

        // Two tabs moving at the same time: every move lands (last write wins), and versions only grow.
        await Task.WhenAll(
            room.Animator.InvokeAsync("GoToSlide", 1), tab.InvokeAsync("GoToSlide", 2),
            room.Animator.InvokeAsync("GoToSlide", 0), tab.InvokeAsync("GoToSlide", 1));
        var session = await DbAsync(db => db.PresentationSessions.SingleAsync(x => x.CircleId == room.CircleId && x.EndedAt == null));
        // The order is up to the server; two moves to the same slide in a row count once.
        Assert.InRange(session.Version, first.Version + 2, first.Version + 4);

        // Moving to the slide already shown changes nothing and sends nothing.
        var before = session.Version;
        await room.Animator.InvokeAsync("GoToSlide", session.Position);
        Assert.Equal(before, await DbAsync(db => db.PresentationSessions.Where(x => x.Id == session.Id).Select(x => x.Version).SingleAsync()));
    }

    [Fact]
    public async Task The_audience_screen_only_listens()
    {
        await using var room = await RoomAsync();
        var (deckId, _) = await DeckAsync(room.AnimatorUserId);
        await room.Animator.InvokeAsync("StartPresentation", deckId);
        await using var audience = Hub(room.AnimatorCookies);
        await audience.StartAsync();
        await audience.InvokeAsync<PresentationStateView?>("EnterAudience", room.CircleId);

        Assert.Contains("audience-read-only", await RefusedAsync(() => audience.InvokeAsync<Guid[]>("Enter", room.CircleId)));
        Assert.Contains("not-entered", await RefusedAsync(() => audience.InvokeAsync("GoToSlide", 1)));
        Assert.Contains("not-entered", await RefusedAsync(() => audience.InvokeAsync("Say", "hello")));
    }

    [Fact]
    public async Task Signed_in_members_load_shown_slides_until_the_circle_closes()
    {
        Inbox<bool>? ended = null;
        await using var room = await RoomAsync(beforeGuestEnters: g => ended = new Inbox<bool>(add => g.On<Guid>("PresentationEnded", _ => add(true))));
        var (deckId, slides) = await DeckAsync(room.AnimatorUserId);
        await PicturesAsync(room.AnimatorUserId, deckId, slides);
        var (member, _) = Browser();
        var memberCsrf = await member.SignInAsync(_factory, $"member-{Guid.NewGuid():N}@example.test");
        (await member.PostJsonAsync($"/api/join/{room.JoinCode}", new { name = "Youssef", character = "owl" }, memberCsrf)).EnsureSuccessStatusCode();

        await room.Animator.InvokeAsync("StartPresentation", deckId);
        Assert.Equal(HttpStatusCode.OK, await ImageAsync(member, slides[0].Id));

        // Closing the circle ends its presentation; nobody keeps loading its slides.
        (await room.AnimatorHttp.PostJsonAsync($"/api/circles/{room.CircleId}/close", new { }, room.AnimatorCsrf)).EnsureSuccessStatusCode();
        await ended!.NextAsync();
        Assert.Equal(HttpStatusCode.NotFound, await ImageAsync(member, slides[0].Id));
        Assert.Equal(HttpStatusCode.NotFound, await ImageAsync(room.GuestHttp, slides[0].Id));
        Assert.Equal(0, await DbAsync(db => db.PresentationSessions.CountAsync(x => x.CircleId == room.CircleId && x.EndedAt == null)));
    }

    [Fact]
    public async Task The_janitor_ends_a_session_whose_presentation_it_purges()
    {
        Inbox<bool>? ended = null;
        await using var room = await RoomAsync(beforeGuestEnters: g => ended = new Inbox<bool>(add => g.On<Guid>("PresentationEnded", _ => add(true))));
        var (deckId, _) = await DeckAsync(room.AnimatorUserId);
        await room.Animator.InvokeAsync("StartPresentation", deckId);

        var old = _factory.Clock.GetUtcNow().AddDays(-(PresentationRules.IdleDeleteDays + 1));
        await DbAsync(db => db.Presentations.Where(x => x.Id == deckId).ExecuteUpdateAsync(u => u.SetProperty(x => x.LastUsedAt, old)));
        await _factory.Services.GetRequiredService<PresentationJanitor>().SweepAsync(default);

        await ended!.NextAsync();
        Assert.Null(await DbAsync(db => db.Circles.Where(c => c.Id == room.CircleId).Select(c => c.CurrentActivity).SingleAsync()));
        Assert.Contains("no-session", await RefusedAsync(() => room.Animator.InvokeAsync("GoToSlide", 1)));
    }
}
