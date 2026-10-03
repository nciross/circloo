using System.Net.Http.Json;
using System.Text.Json;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Presentations;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Circloo.Api.Tests.Presentations;

/// <summary>Issue #101: the database guarantees spec 006 relies on (SC-606), and the presentation activity in the room.</summary>
[Collection(ApiCollection.Name)]
public sealed class PresentationDataTests(PostgresFixture pg) : IAsyncLifetime
{
    private ApiFactory _factory = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString());
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private async Task SaveAsync(params object[] entities)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        db.AddRange(entities);
        await db.SaveChangesAsync();
    }

    private static PresentationSession Session(Guid circle, Guid? presentation, Guid member) =>
        new() { CircleId = circle, PresentationId = presentation, StartedByMemberId = member, Snapshot = "[]", Phase = SessionPhases.Idle };

    [Fact]
    public async Task One_active_session_per_circle_one_answer_per_member_and_sessions_outlive_their_deck()
    {
        var user = new User { Email = $"pres-{Guid.NewGuid():N}@example.test", Locale = "en" };
        var circle = new Circle { OwnerUserId = user.Id, Name = "Team", JoinCode = Guid.NewGuid().ToString("N")[..10], Locale = "en", ExpiresAt = DateTimeOffset.UtcNow.AddDays(1) };
        var member = new CircleMember { CircleId = circle.Id, UserId = user.Id, Role = Roles.Animator, Name = "Nadia", Character = "panda" };
        var deck = new Presentation { OwnerUserId = user.Id, Name = "Q3", SourceFileName = "q3.pptx", Status = PresentationStatus.Ready };
        var session = Session(circle.Id, deck.Id, member.Id);
        await SaveAsync(user, circle, member, deck, session);

        // A second running presentation in the same circle is refused; once the first ends, a new one may start.
        await Assert.ThrowsAsync<DbUpdateException>(() => SaveAsync(Session(circle.Id, deck.Id, member.Id)));

        // One answer per participant per question, whatever the tabs or devices.
        var slide = Guid.NewGuid();
        await SaveAsync(new SessionAnswer { SessionId = session.Id, SlideId = slide, MemberId = member.Id, Options = ["a"] });
        await Assert.ThrowsAsync<DbUpdateException>(() =>
            SaveAsync(new SessionAnswer { SessionId = session.Id, SlideId = slide, MemberId = member.Id, Options = ["b"] }));

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        await db.PresentationSessions.Where(s => s.Id == session.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.EndedAt, DateTimeOffset.UtcNow));
        await SaveAsync(Session(circle.Id, deck.Id, member.Id));

        // Deleting the deck keeps past sessions (and their answers), detached from it.
        await db.Presentations.Where(p => p.Id == deck.Id).ExecuteDeleteAsync();
        Assert.All(await db.PresentationSessions.Where(s => s.CircleId == circle.Id).ToListAsync(), s => Assert.Null(s.PresentationId));
        Assert.Equal(1, await db.SessionAnswers.CountAsync(a => a.SessionId == session.Id));
    }

    [Fact]
    public async Task Starting_a_presentation_keeps_circloo_quiet_until_asked()
    {
        var cookies = new CookieContainerHandler();
        var http = _factory.CreateDefaultClient(new Uri("https://localhost"), cookies);
        var csrf = await http.SignInAsync(_factory, $"present-{Guid.NewGuid():N}@example.test");
        (await http.PutJsonAsync("/api/me/profile", new { displayName = "Nadia", locale = "en" }, csrf)).EnsureSuccessStatusCode();
        var res = await http.PostJsonAsync("/api/circles", new { name = "All hands", activities = new[] { "presentation" }, character = "panda", locale = "en" }, csrf);
        var id = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        await using var hub = new HubConnectionBuilder()
            .WithUrl("https://localhost/hubs/circle", o =>
            {
                o.Transports = Microsoft.AspNetCore.Http.Connections.HttpTransportType.LongPolling;
                o.HttpMessageHandlerFactory = _ => new CookieContainerHandler(cookies.Container) { InnerHandler = _factory.Server.CreateHandler() };
            })
            .Build();
        await hub.StartAsync();
        await hub.InvokeAsync<Guid[]>("Enter", id);
        var runner = _factory.Services.GetRequiredService<CoachRunner>();

        await hub.InvokeAsync("StartActivity", "presentation");
        await runner.Running(id).WaitAsync(TimeSpan.FromSeconds(10));
        async Task<string[]> AiSaid() => [.. (await http.GetFromJsonAsync<JsonElement>($"/api/circles/{id}")).GetProperty("messages").EnumerateArray()
            .Where(m => m.GetProperty("kind").GetString() == "ai").Select(m => m.GetProperty("text").GetString()!)];
        Assert.Empty(await AiSaid());

        // Asked, the free dev responder answers instead of failing on an activity without a spark deck.
        await hub.InvokeAsync("AskCircloo", "Can you help?");
        await Task.Delay(100);
        await runner.Running(id).WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal(["I'm here. Ask me whenever you want help explaining the results."], await AiSaid());
    }
}
