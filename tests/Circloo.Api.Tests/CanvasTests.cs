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

/// <summary>Issue #93: the live canvas, with notes anywhere, styles and live cursors.</summary>
[Collection(ApiCollection.Name)]
public sealed class CanvasTests(PostgresFixture pg) : IAsyncLifetime
{
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

    /// <summary>An animator with a canvas circle, and a guest in it; both entered in the live room.</summary>
    private async Task<(Guid Id, HttpClient Animator, string Csrf, HubConnection AnimatorHub, HubConnection GuestHub, Guid GuestId)> RoomAsync()
    {
        var (http, cookies) = Browser();
        var csrf = await http.SignInAsync(_factory, $"canvas-{Guid.NewGuid():N}@example.test");
        (await http.PutJsonAsync("/api/me/profile", new { displayName = "Nadia", locale = "en" }, csrf)).EnsureSuccessStatusCode();
        var res = await http.PostJsonAsync("/api/circles", new { name = "Trip plan", activities = new[] { "canvas", "quick-question" }, character = "panda", locale = "en" }, csrf);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        var id = body.GetProperty("id").GetGuid();

        var (guest, guestCookies) = Browser();
        (await guest.PostJsonAsync($"/api/join/{body.GetProperty("joinCode").GetString()}", new { name = "Kenji", character = "axolotl" }, await guest.CsrfAsync())).EnsureSuccessStatusCode();
        var guestId = (await guest.GetFromJsonAsync<JsonElement>($"/api/circles/{id}")).GetProperty("me").GetProperty("id").GetGuid();

        var animatorHub = Hub(cookies);
        var guestHub = Hub(guestCookies);
        await animatorHub.StartAsync();
        await guestHub.StartAsync();
        await animatorHub.InvokeAsync<Guid[]>("Enter", id);
        await guestHub.InvokeAsync<Guid[]>("Enter", id);
        return (id, http, csrf, animatorHub, guestHub, guestId);
    }

    [Fact]
    public async Task Notes_go_anywhere_live_with_styles_for_their_author_and_the_animator()
    {
        var (id, animator, _, animatorHub, guestHub, guestId) = await RoomAsync();
        await using var a = animatorHub;
        await using var g = guestHub;
        var seen = new List<CanvasNoteDto>();
        animatorHub.On<CanvasNoteDto>("CanvasChanged", n => { lock (seen) { seen.Add(n); } });

        // Only while the canvas is the current activity.
        await Assert.ThrowsAsync<HubException>(() => guestHub.InvokeAsync("AddCanvasNote", 10.0, 20.0, "Beach day", "yellow", "m", "square"));
        await animatorHub.InvokeAsync("StartActivity", "canvas");

        // Off the canvas, unknown styles and over-long or unkind text are refused.
        await Assert.ThrowsAsync<HubException>(() => guestHub.InvokeAsync("AddCanvasNote", 99999.0, 0.0, "Far away", "yellow", "m", "square"));
        await Assert.ThrowsAsync<HubException>(() => guestHub.InvokeAsync("AddCanvasNote", 0.0, 0.0, "Neon", "neon", "m", "square"));
        await Assert.ThrowsAsync<HubException>(() => guestHub.InvokeAsync("AddCanvasNote", 0.0, 0.0, "Huge", "yellow", "xl", "square"));
        await Assert.ThrowsAsync<HubException>(() => guestHub.InvokeAsync("AddCanvasNote", 0.0, 0.0, new string('x', 141), "yellow", "m", "square"));
        var unkind = await Assert.ThrowsAsync<HubException>(() => guestHub.InvokeAsync("AddCanvasNote", 0.0, 0.0, "You idiot", "yellow", "m", "square"));
        Assert.Contains("message-unsafe", unkind.Message, StringComparison.Ordinal);

        await guestHub.InvokeAsync("AddCanvasNote", -120.5, 340.26, "Beach day", "pink", "l", "round");
        await Task.Delay(200);
        CanvasNoteDto note;
        lock (seen) { note = Assert.Single(seen); }
        Assert.Equal((-120.5, 340.3, "pink", "l", "round", guestId), (note.X, note.Y, note.Color, note.Size, note.Shape, note.AuthorId));

        // Anyone moves; only the author edits; the author or the animator restyles and deletes.
        await animatorHub.InvokeAsync("MoveCanvasNote", note.Id, 400.0, -80.0);
        await Assert.ThrowsAsync<HubException>(() => animatorHub.InvokeAsync("EditCanvasNote", note.Id, "Hijacked"));
        await guestHub.InvokeAsync("EditCanvasNote", note.Id, "Beach day, with a picnic");
        await animatorHub.InvokeAsync("StyleCanvasNote", note.Id, "white", "s", "square", "star");
        await Assert.ThrowsAsync<HubException>(() => guestHub.InvokeAsync("StyleCanvasNote", note.Id, "white", "s", "square", "rocket"));

        var view = await animator.GetFromJsonAsync<JsonElement>($"/api/circles/{id}");
        var saved = Assert.Single(view.GetProperty("canvas").EnumerateArray());
        Assert.Equal("Beach day, with a picnic", saved.GetProperty("text").GetString());
        Assert.Equal((400.0, -80.0), (saved.GetProperty("x").GetDouble(), saved.GetProperty("y").GetDouble()));
        Assert.Equal(("white", "s", "square", "star"), (saved.GetProperty("color").GetString(), saved.GetProperty("size").GetString(),
            saved.GetProperty("shape").GetString(), saved.GetProperty("sticker").GetString()));

        // circloo sums up the canvas.
        var runner = _factory.Services.GetRequiredService<CoachRunner>();
        await runner.Running(id).WaitAsync(TimeSpan.FromSeconds(10));
        await animatorHub.InvokeAsync("AskCircloo", "Summarise the canvas");
        await Task.Delay(100);
        await runner.Running(id).WaitAsync(TimeSpan.FromSeconds(10));
        var after = await animator.GetFromJsonAsync<JsonElement>($"/api/circles/{id}");
        var summary = after.GetProperty("messages").EnumerateArray().Last(m => m.GetProperty("kind").GetString() == "ai").GetProperty("text").GetString()!;
        Assert.Contains("Canvas: Beach day, with a picnic", summary, StringComparison.Ordinal);

        await animatorHub.InvokeAsync("DeleteCanvasNote", note.Id);
        Assert.Equal(0, (await animator.GetFromJsonAsync<JsonElement>($"/api/circles/{id}")).GetProperty("canvas").GetArrayLength());
    }

    [Fact]
    public async Task Cursors_reach_the_others_only_throttled_and_stop_when_the_circle_closes()
    {
        var (id, animator, csrf, animatorHub, guestHub, guestId) = await RoomAsync();
        await using var a = animatorHub;
        await using var g = guestHub;
        var animatorSaw = new List<(Guid, double, double)>();
        var guestSaw = new List<Guid>();
        animatorHub.On<Guid, double, double>("Cursor", (m, x, y) => { lock (animatorSaw) { animatorSaw.Add((m, x, y)); } });
        guestHub.On<Guid, double, double>("Cursor", (m, _, _) => { lock (guestSaw) { guestSaw.Add(m); } });

        await guestHub.InvokeAsync("Cursor", 12.345, -6.0);
        await guestHub.InvokeAsync("Cursor", 13.0, -6.0); // too soon: dropped
        await guestHub.InvokeAsync("Cursor", 99999.0, 0.0); // off the canvas: ignored
        _factory.Clock.Advance(TimeSpan.FromMilliseconds(80));
        await guestHub.InvokeAsync("Cursor", 20.0, 30.0);
        await Task.Delay(300);
        lock (animatorSaw) { Assert.Equal(new[] { (guestId, 12.3, -6.0), (guestId, 20.0, 30.0) }, animatorSaw); }
        lock (guestSaw) { Assert.Empty(guestSaw); }

        // Membership is re-checked every few seconds: a closed circle stops the cursors.
        Assert.Equal(HttpStatusCode.NoContent, (await animator.PostJsonAsync($"/api/circles/{id}/close", new { }, csrf)).StatusCode);
        _factory.Clock.Advance(CircleHub.CursorRecheck + TimeSpan.FromSeconds(1));
        await Assert.ThrowsAsync<HubException>(() => guestHub.InvokeAsync("Cursor", 1.0, 1.0));

        await using var lonely = Hub(Browser().Cookies);
        await Assert.ThrowsAnyAsync<Exception>(() => lonely.StartAsync()); // no identity, no room
    }
}
