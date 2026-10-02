using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Circloo.Api.Circles;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;

namespace Circloo.Api.Tests;

/// <summary>Spec 003: animator creates, guests join by link, live room, circloo coach (seed, zero cost).</summary>
[Collection(ApiCollection.Name)]
public sealed class CircleTests(PostgresFixture pg) : IAsyncLifetime
{
    private ApiFactory _factory = null!;
    private (HttpClient Http, CookieContainerHandler Cookies) _animator;
    private string _animatorCsrf = null!;

    public async Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString());
        _animator = NewBrowser();
        _animatorCsrf = await _animator.Http.SignInAsync(_factory, $"animator-{Guid.NewGuid():N}@example.test");
        (await _animator.Http.PutJsonAsync("/api/me/profile", new { displayName = "Nadia", locale = "en" }, _animatorCsrf)).EnsureSuccessStatusCode();
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private (HttpClient Http, CookieContainerHandler Cookies) NewBrowser()
    {
        var cookies = new CookieContainerHandler();
        var http = _factory.CreateDefaultClient(new Uri("https://localhost"), cookies);
        return (http, cookies);
    }

    private async Task<(Guid Id, string Code)> CreateAsync(params string[] activities)
    {
        var res = await _animator.Http.PostJsonAsync("/api/circles",
            new { name = "Monday retro", activities = activities.Length > 0 ? activities : ["quick-question", "start-stop-continue"], character = "panda", locale = "en" },
            _animatorCsrf);
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        return (body.GetProperty("id").GetGuid(), body.GetProperty("joinCode").GetString()!);
    }

    private async Task<(HttpClient Http, CookieContainerHandler Cookies, string Csrf)> JoinAsGuestAsync(string code, string name, string character)
    {
        var (http, cookies) = NewBrowser();
        var csrf = await http.CsrfAsync();
        var res = await http.PostJsonAsync($"/api/join/{code}", new { name, character }, csrf);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (http, cookies, await http.CsrfAsync());
    }

    private HubConnection Hub(CookieContainerHandler cookies) =>
        new HubConnectionBuilder()
            .WithUrl("https://localhost/hubs/circle", o =>
            {
                o.Transports = Microsoft.AspNetCore.Http.Connections.HttpTransportType.LongPolling;
                o.HttpMessageHandlerFactory = _ => new CookieContainerHandler(cookies.Container) { InnerHandler = _factory.Server.CreateHandler() };
            })
            .Build();

    [Theory]
    [InlineData("abcde-fghjk", "ABCDEFGHJK")]
    [InlineData("o1i2l 3m4n5", "011213M4N5")]
    [InlineData("UUUUU-UUUUU", null)]
    [InlineData("ABC", null)]
    [InlineData("", null)]
    public void Join_codes_forgive_case_separators_and_look_alikes(string input, string? expected)
    {
        Assert.Equal(expected, JoinCodes.Normalize(input));
        var fresh = JoinCodes.New();
        Assert.Equal(fresh, JoinCodes.Normalize(JoinCodes.Display(fresh)));
    }

    [Fact]
    public async Task Creating_a_circle_validates_name_activities_character_and_locale()
    {
        var bad = await _animator.Http.PostJsonAsync("/api/circles", new { name = " ", activities = new[] { "nope" }, character = "unicorn", locale = "de" }, _animatorCsrf);
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        var errors = (await bad.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors");
        foreach (var field in new[] { "name", "activities", "character", "locale" })
        {
            Assert.True(errors.TryGetProperty(field, out _), field);
        }

        var (id, code) = await CreateAsync();
        Assert.Matches("^[0-9A-Z]{5}-[0-9A-Z]{5}$", code);
        var mine = await _animator.Http.GetFromJsonAsync<JsonElement>("/api/circles");
        Assert.Contains(mine.EnumerateArray(), c => c.GetProperty("id").GetGuid() == id && c.GetProperty("role").GetString() == "animator");
    }

    [Fact]
    public async Task A_guest_joins_with_a_name_and_a_free_character_and_stays_a_guest()
    {
        var (id, code) = await CreateAsync();
        var (http, _) = NewBrowser();
        var info = await http.GetFromJsonAsync<JsonElement>($"/api/join/{code.ToLowerInvariant()}");
        Assert.Equal("Monday retro", info.GetProperty("name").GetString());
        Assert.Equal("Nadia", info.GetProperty("animatorName").GetString());
        Assert.Contains("panda", info.GetProperty("taken").EnumerateArray().Select(e => e.GetString()));

        var csrf = await http.CsrfAsync();
        var noCharacter = await http.PostJsonAsync($"/api/join/{code}", new { name = "Théo" }, csrf);
        Assert.Equal(HttpStatusCode.BadRequest, noCharacter.StatusCode);
        var taken = await http.PostJsonAsync($"/api/join/{code}", new { name = "Théo", character = "panda" }, csrf);
        Assert.Equal(HttpStatusCode.Conflict, taken.StatusCode);
        Assert.Equal("character-taken", (await taken.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("type").GetString());
        var spoof = await http.PostJsonAsync($"/api/join/{code}", new { name = "‮admin", character = "fox" }, csrf);
        Assert.Equal(HttpStatusCode.BadRequest, spoof.StatusCode);

        var ok = await http.PostJsonAsync($"/api/join/{code}", new { name = "Théo", character = "fox" }, csrf);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);

        // The guest sees the circle, but never an account resource, and never another circle.
        var view = await http.GetFromJsonAsync<JsonElement>($"/api/circles/{id}");
        Assert.Equal("participant", view.GetProperty("me").GetProperty("role").GetString());
        Assert.Equal(JsonValueKind.Null, view.GetProperty("joinCode").ValueKind);
        Assert.Equal(2, view.GetProperty("members").GetArrayLength());
        Assert.Equal(HttpStatusCode.Unauthorized, (await http.GetAsync(new Uri("/api/me", UriKind.Relative))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await http.GetAsync(new Uri("/api/circles", UriKind.Relative))).StatusCode);
        var (otherId, _) = await CreateAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync(new Uri($"/api/circles/{otherId}", UriKind.Relative))).StatusCode);
        var guestCsrf = await http.CsrfAsync();
        var create = await http.PostJsonAsync("/api/circles", new { name = "x", activities = new[] { "kudos" }, character = "cat", locale = "en" }, guestCsrf);
        Assert.Equal(HttpStatusCode.Unauthorized, create.StatusCode);

        // Joining again with the same cookie keeps the same membership.
        var again = await http.PostJsonAsync($"/api/join/{code}", new { name = "Other", character = "cat" }, guestCsrf);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal(2, (await http.GetFromJsonAsync<JsonElement>($"/api/circles/{id}")).GetProperty("members").GetArrayLength());
    }

    [Fact]
    public async Task A_closed_circle_cannot_be_joined_and_only_its_owner_can_close_it()
    {
        var (id, code) = await CreateAsync();
        var guest = await JoinAsGuestAsync(code, "Lucía", "octopus");
        var notOwner = await guest.Http.PostJsonAsync($"/api/circles/{id}/close", new { }, guest.Csrf);
        Assert.Equal(HttpStatusCode.Unauthorized, notOwner.StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await _animator.Http.PostJsonAsync($"/api/circles/{id}/close", new { }, _animatorCsrf)).StatusCode);
        var (late, _) = NewBrowser();
        var info = await late.GetAsync(new Uri($"/api/join/{code}", UriKind.Relative));
        Assert.Equal(HttpStatusCode.NotFound, info.StatusCode);
        Assert.Equal("closed", (await _animator.Http.GetFromJsonAsync<JsonElement>($"/api/circles/{id}")).GetProperty("status").GetString());
    }

    [Fact]
    public async Task The_live_room_shares_presence_messages_and_circloo_with_animator_only_controls()
    {
        var (id, code) = await CreateAsync("quick-question", "start-stop-continue");
        var guest = await JoinAsGuestAsync(code, "Youssef", "robot");

        await using var animatorHub = Hub(_animator.Cookies);
        await using var guestHub = Hub(guest.Cookies);
        var animatorMessages = new List<MessageDto>();
        var activities = new List<ActivityState>();
        var guestSawAi = new TaskCompletionSource<MessageDto>(TaskCreationOptions.RunContinuationsAsynchronously);
        animatorHub.On<MessageDto>("Message", m => { lock (animatorMessages) { animatorMessages.Add(m); } });
        guestHub.On<ActivityState>("Activity", a => { lock (activities) { activities.Add(a); } });
        guestHub.On<MessageDto>("Message", m => { if (m.Kind == "ai") guestSawAi.TrySetResult(m); });

        await animatorHub.StartAsync();
        await guestHub.StartAsync();
        await animatorHub.InvokeAsync<Guid[]>("Enter", id);
        var online = await guestHub.InvokeAsync<Guid[]>("Enter", id);
        Assert.Equal(2, online.Length);

        // Guests can talk but never steer the activity or the AI.
        var steer = await Assert.ThrowsAsync<HubException>(() => guestHub.InvokeAsync("StartActivity", "quick-question"));
        Assert.Contains("animator-only", steer.Message, StringComparison.Ordinal);
        await Assert.ThrowsAsync<HubException>(() => guestHub.InvokeAsync("AskCircloo", "hello"));
        await Assert.ThrowsAsync<HubException>(() => animatorHub.InvokeAsync("StartActivity", "kudos")); // not chosen for this circle

        await animatorHub.InvokeAsync("StartActivity", "quick-question");
        var opening = await guestSawAi.Task.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.False(string.IsNullOrWhiteSpace(opening.Text));
        Assert.Contains(activities, a => a.ActivityId == "quick-question");

        await guestHub.InvokeAsync("Say", "I would be a cat for a day!");
        await Assert.ThrowsAsync<HubException>(() => guestHub.InvokeAsync("Say", new string('x', 400)));

        var runner = _factory.Services.GetRequiredService<CoachRunner>();
        await animatorHub.InvokeAsync("AskCircloo", "Please summarise what people said");
        await Task.Delay(100);
        await runner.Running(id).WaitAsync(TimeSpan.FromSeconds(10));
        await Task.Delay(200);
        lock (animatorMessages)
        {
            Assert.Contains(animatorMessages, m => m.Kind == "member" && m.Text.Contains("cat", StringComparison.Ordinal));
            Assert.Contains(animatorMessages, m => m.Kind == "ai" && m.Text.Contains("Youssef", StringComparison.Ordinal));
        }

        // Everything said is in the room's history for late joiners.
        var view = await _animator.Http.GetFromJsonAsync<JsonElement>($"/api/circles/{id}");
        Assert.Equal("quick-question", view.GetProperty("currentActivity").GetString());
        Assert.True(view.GetProperty("messages").GetArrayLength() >= 4);
    }

    [Fact]
    public async Task Someone_outside_the_circle_cannot_enter_its_room()
    {
        var (id, _) = await CreateAsync();
        var (_, otherCode) = await CreateAsync();
        var stranger = await JoinAsGuestAsync(otherCode, "Mia", "frog");
        await using var hub = Hub(stranger.Cookies);
        await hub.StartAsync();
        var denied = await Assert.ThrowsAsync<HubException>(() => hub.InvokeAsync<Guid[]>("Enter", id));
        Assert.Contains("not-a-member", denied.Message, StringComparison.Ordinal);
    }
}
