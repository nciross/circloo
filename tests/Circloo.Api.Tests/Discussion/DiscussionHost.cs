using Circloo.Api.Data;
using Circloo.Api.Tests.Infrastructure;
using Circloo.Api.Tests.LiveRoom;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Tests.Discussion;

/// <summary>Shared plumbing for the spec 009 tests, on top of the live room's <see cref="RoomHost"/>.</summary>
public sealed class DiscussionHost(ApiFactory factory)
{
    public ApiFactory Factory => factory;

    public RoomHost Room { get; } = new(factory);

    /// <summary>A started hub connection that has entered the circle.</summary>
    public async Task<HubConnection> EnteredAsync(CookieContainerHandler cookies, Guid circleId)
    {
        var hub = Room.Hub(cookies);
        await hub.StartAsync();
        await hub.InvokeAsync<Guid[]>("Enter", circleId);
        return hub;
    }

    /// <summary>A started hub connection that has not entered any circle.</summary>
    public async Task<HubConnection> ConnectedAsync(CookieContainerHandler cookies)
    {
        var hub = Room.Hub(cookies);
        await hub.StartAsync();
        return hub;
    }

    /// <summary>The animator's second window: the audience screen, read only.</summary>
    public async Task<HubConnection> AudienceAsync(CookieContainerHandler animatorCookies, Guid circleId)
    {
        var hub = Room.Hub(animatorCookies);
        await hub.StartAsync();
        await hub.InvokeAsync<object?>("EnterAudience", circleId);
        return hub;
    }

    /// <summary>A signed-in account that joins the circle as a participant.</summary>
    public async Task<(HttpClient Http, CookieContainerHandler Cookies, Guid UserId)> SignedInParticipantAsync(string code, string character)
    {
        var (http, cookies) = Room.Browser();
        var email = $"member-{Guid.NewGuid():N}@example.test";
        var csrf = await http.SignInAsync(factory, email);
        (await http.PutJsonAsync("/api/me/profile", new { displayName = "Kenji", locale = "en" }, csrf)).EnsureSuccessStatusCode();
        (await http.PostJsonAsync($"/api/join/{code}", new { name = "Kenji", character }, csrf)).EnsureSuccessStatusCode();
        var userId = await Room.DbAsync(db => db.Users.Where(u => u.Email == email).Select(u => u.Id).SingleAsync());
        return (http, cookies, userId);
    }

    /// <summary>A signed-in account that is not in the circle.</summary>
    public async Task<(HttpClient Http, CookieContainerHandler Cookies, Guid UserId)> SignedInStrangerAsync()
    {
        var (http, cookies) = Room.Browser();
        var email = $"stranger-{Guid.NewGuid():N}@example.test";
        await http.SignInAsync(factory, email);
        var userId = await Room.DbAsync(db => db.Users.Where(u => u.Email == email).Select(u => u.Id).SingleAsync());
        return (http, cookies, userId);
    }

    public Task<Circle> CircleRowAsync(Guid circleId) => Room.DbAsync(db => db.Circles.AsNoTracking().SingleAsync(c => c.Id == circleId));

    public Task<List<AuditEvent>> RefusalsAsync() =>
        Room.DbAsync(db => db.AuditEvents.AsNoTracking().Where(a => a.Type == "discussion.refused").OrderBy(a => a.Id).ToListAsync());

    /// <summary>The audit rows of one type for one circle: the test database is shared by every test of the collection.</summary>
    public async Task<List<AuditEvent>> AuditAsync(string type, Guid circleId)
    {
        var rows = await Room.DbAsync(db => db.AuditEvents.AsNoTracking().Where(a => a.Type == type).OrderBy(a => a.Id).ToListAsync());
        return [.. rows.Where(a => a.Detail is not null && a.Detail.Contains(circleId.ToString(), StringComparison.Ordinal))];
    }

    /// <summary>Moves the fake clock, for the time rules of later tasks.</summary>
    public void Advance(TimeSpan by) => factory.Clock.Advance(by);
}
