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

/// <summary>Issue #144: Q&A over the circle hub (spec 007 US2, contracts/hub.md).</summary>
[Collection(ApiCollection.Name)]
public sealed class QaHubTests(PostgresFixture pg) : IAsyncLifetime
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

        public List<T> Drain()
        {
            var all = new List<T>();
            while (_items.Reader.TryRead(out var item))
            {
                all.Add(item);
            }
            return all;
        }
    }

    private static Inbox<QaQuestionView> Changes(HubConnection hub) => new(add => hub.On<QaQuestionView>("QaChanged", add));

    private sealed class Room : IAsyncDisposable
    {
        public required Guid CircleId { get; init; }
        public required HubConnection Animator { get; init; }
        public required HubConnection Guest { get; init; }
        public required HubConnection Guest2 { get; init; }
        public required CookieContainerHandler Guest2Cookies { get; init; }
        public required HttpClient AnimatorHttp { get; init; }
        public required HttpClient GuestHttp { get; init; }

        public async ValueTask DisposeAsync()
        {
            await Animator.DisposeAsync();
            await Guest.DisposeAsync();
            await Guest2.DisposeAsync();
        }
    }

    private async Task<Room> RoomAsync(Action<HubConnection>? beforeAnimator = null, Action<HubConnection>? beforeGuest = null, Action<HubConnection>? beforeGuest2 = null)
    {
        var (http, cookies) = Browser();
        var csrf = await http.SignInAsync(_factory, $"qa-{Guid.NewGuid():N}@example.test");
        (await http.PutJsonAsync("/api/me/profile", new { displayName = "Amina", locale = "en" }, csrf)).EnsureSuccessStatusCode();
        var res = await http.PostJsonAsync("/api/circles", new { name = "All hands", activities = new[] { "qa", "poll" }, character = "panda", locale = "en" }, csrf);
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
        await animator.InvokeAsync("StartActivity", "qa");
        return new Room { CircleId = id, Animator = animator, Guest = guest, Guest2 = guest2, Guest2Cookies = guest2Cookies, AnimatorHttp = http, GuestHttp = guestHttp };
    }

    private static async Task<string> RefusedAsync(Func<Task> call) =>
        (await Assert.ThrowsAsync<Microsoft.AspNetCore.SignalR.HubException>(call)).Message;

    private async Task<T> DbAsync<T>(Func<CirclooDbContext, Task<T>> query)
    {
        using var scope = _factory.Services.CreateScope();
        return await query(scope.ServiceProvider.GetRequiredService<CirclooDbContext>());
    }

    [Fact]
    public async Task Members_ask_and_the_animator_answers_while_unsafe_text_never_appears()
    {
        Inbox<QaQuestionView>? guest2Changes = null;
        await using var room = await RoomAsync(beforeGuest2: g => guest2Changes = Changes(g));

        Assert.Contains("animator-cannot-answer", await RefusedAsync(() => room.Animator.InvokeAsync<QaQuestionView>("Ask", "Mine?", false)));
        Assert.Contains("message-unsafe", await RefusedAsync(() => room.Guest.InvokeAsync<QaQuestionView>("Ask", "Why is Kenji such an idiot?", false)));
        Assert.Contains("text-length", await RefusedAsync(() => room.Guest.InvokeAsync<QaQuestionView>("Ask", new string('x', 201), false)));
        Assert.Equal(0, await DbAsync(db => db.QaQuestions.CountAsync()) - await DbAsync(db => db.QaQuestions.CountAsync(q => q.CircleId != room.CircleId)));

        var asked = await room.Guest.InvokeAsync<QaQuestionView>("Ask", "Can we move the retro to Friday?", false);
        Assert.True(asked.Mine);
        var seen = await guest2Changes!.NextAsync(q => q.Id == asked.Id);
        Assert.Equal(("Kenji", false), (seen.Author!.Name, seen.Mine));

        Assert.Contains("animator-only", await RefusedAsync(() => room.Guest.InvokeAsync("AnswerQuestion", asked.Id, "Yes")));
        Assert.Contains("message-unsafe", await RefusedAsync(() => room.Animator.InvokeAsync("AnswerQuestion", asked.Id, "Ask an idiot")));
        await room.Animator.InvokeAsync("AnswerQuestion", asked.Id, "Yes, Friday 10:00");
        var answered = await guest2Changes.NextAsync(q => q.Id == asked.Id && q.State == QaStates.Answered);
        Assert.Equal("Yes, Friday 10:00", answered.Answer);
        await room.Animator.InvokeAsync("ReopenQuestion", asked.Id);
        Assert.Equal(QaStates.Open, (await guest2Changes.NextAsync(q => q.Id == asked.Id && q.State == QaStates.Open)).State);
    }

    [Fact]
    public async Task Anonymous_questions_never_name_their_author_to_anyone()
    {
        Inbox<QaQuestionView>? animatorChanges = null, guest2Changes = null;
        await using var room = await RoomAsync(beforeAnimator: a => animatorChanges = Changes(a), beforeGuest2: g => guest2Changes = Changes(g));

        Assert.Contains("anonymous-off", await RefusedAsync(() => room.Guest.InvokeAsync<QaQuestionView>("Ask", "Who owns the budget?", true)));
        await room.Animator.InvokeAsync("SetQaAnonymous", true);
        var asked = await room.Guest.InvokeAsync<QaQuestionView>("Ask", "Who owns the budget?", true);
        Assert.Null(asked.Author);
        Assert.Null((await animatorChanges!.NextAsync(q => q.Id == asked.Id)).Author);
        Assert.Null((await guest2Changes!.NextAsync(q => q.Id == asked.Id)).Author);

        foreach (var http in new[] { room.AnimatorHttp, room.GuestHttp })
        {
            var json = await http.GetStringAsync($"/api/circles/{room.CircleId}");
            var question = JsonDocument.Parse(json).RootElement.GetProperty("decide").GetProperty("qa").GetProperty("questions").EnumerateArray().Single(q => q.GetProperty("id").GetInt64() == asked.Id);
            Assert.Equal(JsonValueKind.Null, question.GetProperty("author").ValueKind);
            Assert.DoesNotContain("Kenji", question.GetRawText());
        }
        // The author is kept for moderation only.
        var stored = await DbAsync(db => db.QaQuestions.SingleAsync(q => q.Id == asked.Id));
        Assert.NotEqual(Guid.Empty, stored.AuthorMemberId);
    }

    [Fact]
    public async Task One_upvote_per_member_never_on_ones_own_question_and_the_count_stays_right()
    {
        await using var room = await RoomAsync();
        var asked = await room.Guest.InvokeAsync<QaQuestionView>("Ask", "Coffee machine?", false);
        Assert.Contains("own-question", await RefusedAsync(() => room.Guest.InvokeAsync("Upvote", asked.Id)));

        await using var tab = Hub(room.Guest2Cookies);
        await tab.StartAsync();
        await tab.InvokeAsync<Guid[]>("Enter", room.CircleId);
        // Two tabs of the same member toggling at once: the count always equals the rows.
        await Task.WhenAll(room.Guest2.InvokeAsync("Upvote", asked.Id), tab.InvokeAsync("Upvote", asked.Id), room.Guest2.InvokeAsync("Upvote", asked.Id));
        var rows = await DbAsync(db => db.QaUpvotes.CountAsync(u => u.QuestionId == asked.Id));
        Assert.InRange(rows, 0, 1);
        Assert.Equal(rows, await DbAsync(db => db.QaQuestions.Where(q => q.Id == asked.Id).Select(q => q.Upvotes).SingleAsync()));

        // A clean toggle on and off.
        if (rows == 1)
        {
            await room.Guest2.InvokeAsync("Upvote", asked.Id);
        }
        await room.Guest2.InvokeAsync("Upvote", asked.Id);
        Assert.Equal(1, await DbAsync(db => db.QaQuestions.Where(q => q.Id == asked.Id).Select(q => q.Upvotes).SingleAsync()));
        var view = await room.GuestHttp.GetFromJsonAsync<JsonElement>($"/api/circles/{room.CircleId}");
        Assert.Equal(1, view.GetProperty("decide").GetProperty("qa").GetProperty("questions")[0].GetProperty("upvotes").GetInt32());
    }

    [Fact]
    public async Task Hidden_questions_disappear_for_members_and_stay_with_the_animator()
    {
        Inbox<long>? guestRemoved = null;
        Inbox<QaQuestionView>? animatorChanges = null;
        await using var room = await RoomAsync(beforeAnimator: a => animatorChanges = Changes(a), beforeGuest2: g => guestRemoved = new Inbox<long>(add => g.On<long>("QaRemoved", add)));
        var asked = await room.Guest.InvokeAsync<QaQuestionView>("Ask", "Is this okay to ask?", false);
        await room.Animator.InvokeAsync("HideQuestion", asked.Id, true);

        Assert.Equal(asked.Id, await guestRemoved!.NextAsync());
        Assert.Equal(QaStates.Hidden, (await animatorChanges!.NextAsync(q => q.Id == asked.Id && q.State == QaStates.Hidden)).State);
        Assert.Contains("question-closed", await RefusedAsync(() => room.Guest2.InvokeAsync("Upvote", asked.Id)));
        var memberView = await room.GuestHttp.GetFromJsonAsync<JsonElement>($"/api/circles/{room.CircleId}");
        Assert.Empty(memberView.GetProperty("decide").GetProperty("qa").GetProperty("questions").EnumerateArray());
        var animatorView = await room.AnimatorHttp.GetFromJsonAsync<JsonElement>($"/api/circles/{room.CircleId}");
        Assert.Single(animatorView.GetProperty("decide").GetProperty("qa").GetProperty("questions").EnumerateArray());

        await room.Animator.InvokeAsync("HideQuestion", asked.Id, false);
        Assert.Equal(QaStates.Open, (await animatorChanges.NextAsync(q => q.Id == asked.Id && q.State == QaStates.Open)).State);
        var hiddenEvents = await DbAsync(db => db.AuditEvents.Where(e => e.Type == "qa.hidden").Select(e => e.Detail).ToListAsync());
        Assert.Single(hiddenEvents, d => d != null && d.Contains(room.CircleId.ToString(), StringComparison.OrdinalIgnoreCase));
    }
}
