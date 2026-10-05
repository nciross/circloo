using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Channels;
using Circloo.Api.Data;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Circloo.Api.Tests.LiveRoom;

/// <summary>Shared plumbing for the spec 008 tests: browsers with cookies, hub connections, a circle and its guests.</summary>
public sealed class RoomHost(ApiFactory factory)
{
    public static readonly TimeSpan Wait = TimeSpan.FromSeconds(10);

    public ApiFactory Factory => factory;

    public (HttpClient Http, CookieContainerHandler Cookies) Browser()
    {
        var cookies = new CookieContainerHandler();
        return (factory.CreateDefaultClient(new Uri("https://localhost"), cookies), cookies);
    }

    public HubConnection Hub(CookieContainerHandler cookies) =>
        new HubConnectionBuilder()
            .WithUrl("https://localhost/hubs/circle", o =>
            {
                o.Transports = Microsoft.AspNetCore.Http.Connections.HttpTransportType.LongPolling;
                o.HttpMessageHandlerFactory = _ => new CookieContainerHandler(cookies.Container) { InnerHandler = factory.Server.CreateHandler() };
            })
            .Build();

    /// <summary>An animator signed in with a new circle; returns its id, join code and the animator's browser.</summary>
    public async Task<(Guid Id, string Code, HttpClient Http, CookieContainerHandler Cookies, string Csrf)> CircleAsync(string[]? activities = null)
    {
        var (http, cookies) = Browser();
        var csrf = await http.SignInAsync(factory, $"room-{Guid.NewGuid():N}@example.test");
        (await http.PutJsonAsync("/api/me/profile", new { displayName = "Amina", locale = "en" }, csrf)).EnsureSuccessStatusCode();
        var res = await http.PostJsonAsync("/api/circles", new { name = "All hands", activities = activities ?? ["presentation", "quick-question"], character = "panda", locale = "en" }, csrf);
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        return (body.GetProperty("id").GetGuid(), body.GetProperty("joinCode").GetString()!, http, cookies, csrf);
    }

    /// <summary>Joins as a guest; returns the response so tests can check refusals.</summary>
    public async Task<(HttpResponseMessage Response, HttpClient Http, CookieContainerHandler Cookies)> JoinAsync(string code, string name, string character, int? ring = null)
    {
        var (guest, cookies) = Browser();
        object body = ring is null ? new { name, character } : new { name, character, ring };
        var res = await guest.PostJsonAsync($"/api/join/{code}", body, await guest.CsrfAsync());
        return (res, guest, cookies);
    }

    public async Task<T> DbAsync<T>(Func<CirclooDbContext, Task<T>> query)
    {
        using var scope = factory.Services.CreateScope();
        return await query(scope.ServiceProvider.GetRequiredService<CirclooDbContext>());
    }

    public Task<List<CircleMember>> MembersAsync(Guid circleId) =>
        DbAsync(db => db.CircleMembers.AsNoTracking().Where(m => m.CircleId == circleId && m.LeftAt == null).ToListAsync());
}

/// <summary>Every event of one kind a connection receives, to await in order.</summary>
public sealed class Inbox<T>
{
    private readonly Channel<T> _items = Channel.CreateUnbounded<T>();

    public Inbox(HubConnection hub, string method) => hub.On<T>(method, x => _items.Writer.TryWrite(x));

    public Inbox(Action<Action<T>> register) => register(x => _items.Writer.TryWrite(x));

    public async Task<T> NextAsync(Func<T, bool>? match = null)
    {
        using var cts = new CancellationTokenSource(RoomHost.Wait);
        while (true)
        {
            var item = await _items.Reader.ReadAsync(cts.Token);
            if (match is null || match(item))
            {
                return item;
            }
        }
    }

    /// <summary>Everything received so far, without waiting.</summary>
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
