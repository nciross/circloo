using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Circloo.Api.Circles;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Tests.LiveRoom;

/// <summary>Issue #176 (T802): joining big circles with shared characters (spec 008 US1, contracts/rest.md).</summary>
[Collection(ApiCollection.Name)]
public sealed class JoinTests(PostgresFixture pg) : IAsyncLifetime
{
    private ApiFactory _factory = null!;
    private RoomHost _host = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString());
        _host = new RoomHost(_factory);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    /// <summary>A fresh server with these settings (the test server sees every request from one address).</summary>
    private async Task RestartAsync(Dictionary<string, string?> settings)
    {
        await _factory.DisposeAsync();
        _factory = new ApiFactory(pg.Container.GetConnectionString(), settings);
        _host = new RoomHost(_factory);
    }

    private static async Task<string?> TypeAsync(HttpResponseMessage res) =>
        res.IsSuccessStatusCode ? null : (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("type").GetString();

    private static async Task<int> RingAsync(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("ring").GetInt32();

    [Fact]
    public async Task A_hundred_people_join_at_once_and_the_circle_never_goes_past_its_capacity()
    {
        // Every request comes from one address here: lift the join limits so only the capacity decides.
        await RestartAsync(new() { ["RateLimits:CircleJoinsPerIpPer10Min"] = "1000", ["RateLimits:CircleJoinsPerIpAndCodePer10Min"] = "1000" });
        var circle = await _host.CircleAsync();
        // 110 people press Join together; the animator is already in, so 99 places are left.
        var joins = await Task.WhenAll(Enumerable.Range(0, 110).Select(async i =>
        {
            var (res, _, _) = await _host.JoinAsync(circle.Code, $"Guest {i}", Characters.All[i % Characters.All.Length]);
            return (res.StatusCode, Type: await TypeAsync(res));
        }));

        Assert.Equal(99, joins.Count(j => j.StatusCode == HttpStatusCode.OK));
        Assert.All(joins.Where(j => j.StatusCode != HttpStatusCode.OK), j => Assert.Equal((HttpStatusCode.Conflict, "circle-full"), j));
        var members = await _host.MembersAsync(circle.Id);
        Assert.Equal(100, members.Count);
        // Nobody shares a character and a ring.
        Assert.Equal(members.Count, members.Select(m => (m.Character, m.Ring)).Distinct().Count());

        var info = await circle.Http.GetFromJsonAsync<JoinInfo>($"/api/join/{circle.Code}");
        Assert.True(info!.Full);
    }

    [Fact]
    public async Task Six_people_share_the_fox_on_their_own_rings_and_a_seventh_must_pick_another()
    {
        var circle = await _host.CircleAsync();
        var rings = new List<int>();
        for (var i = 0; i < 6; i++)
        {
            var (res, _, _) = await _host.JoinAsync(circle.Code, $"Fox {i}", "fox");
            res.EnsureSuccessStatusCode();
            rings.Add(await RingAsync(res));
        }
        Assert.Equal([0, 1, 2, 3, 4, 5], rings);

        var (seventh, _, _) = await _host.JoinAsync(circle.Code, "Fox 6", "fox");
        Assert.Equal((HttpStatusCode.Conflict, "character-full"), (seventh.StatusCode, await TypeAsync(seventh)));

        var info = await circle.Http.GetFromJsonAsync<JoinInfo>($"/api/join/{circle.Code}");
        var fox = info!.Characters.Single(c => c.Id == "fox");
        Assert.Equal((6, 0), (fox.Used, fox.FreeRings.Length));
        Assert.Contains("fox", info.Taken);
        Assert.Equal((1, 5), (info.Characters.Single(c => c.Id == "panda").Used, info.Characters.Single(c => c.Id == "panda").FreeRings.Length));

        // Someone leaves: their ring is free again for the next fox.
        await _host.DbAsync(db => db.CircleMembers.Where(m => m.CircleId == circle.Id && m.Name == "Fox 3")
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.LeftAt, _factory.Clock.GetUtcNow())));
        var (again, _, _) = await _host.JoinAsync(circle.Code, "Fox 7", "fox");
        again.EnsureSuccessStatusCode();
        Assert.Equal(3, await RingAsync(again));
    }

    [Fact]
    public async Task Seven_people_racing_for_the_same_fox_ring_end_on_six_rings_and_one_must_pick_another()
    {
        var circle = await _host.CircleAsync();
        var joins = await Task.WhenAll(Enumerable.Range(0, 7).Select(async i =>
        {
            var (res, _, _) = await _host.JoinAsync(circle.Code, $"Fox {i}", "fox", ring: 0);
            return (res.StatusCode, Type: await TypeAsync(res), Ring: res.IsSuccessStatusCode ? await RingAsync(res) : -1);
        }));
        Assert.Equal([0, 1, 2, 3, 4, 5], joins.Where(j => j.StatusCode == HttpStatusCode.OK).Select(j => j.Ring).Order());
        Assert.Equal((HttpStatusCode.Conflict, "character-full"), joins.Where(j => j.StatusCode != HttpStatusCode.OK).Select(j => (j.StatusCode, j.Type)).Single());
    }

    [Fact]
    public async Task The_same_person_joining_from_two_tabs_at_once_is_one_member()
    {
        var circle = await _host.CircleAsync();
        var (http, _) = _host.Browser();
        var csrf = await http.SignInAsync(_factory, $"kenji-{Guid.NewGuid():N}@example.test");
        var tabs = await Task.WhenAll(Enumerable.Range(0, 2).Select(i =>
            http.PostJsonAsync($"/api/join/{circle.Code}", new { name = "Kenji", character = i == 0 ? "fox" : "owl" }, csrf)));
        Assert.All(tabs, t => Assert.Equal(HttpStatusCode.OK, t.StatusCode));
        Assert.Single(await _host.DbAsync(db => db.CircleMembers.Where(m => m.CircleId == circle.Id && m.Name == "Kenji").ToListAsync()));
        // Joining again answers with the same membership and its ring.
        var again = await http.PostJsonAsync($"/api/join/{circle.Code}", new { name = "Kenji", character = "bee" }, csrf);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal(0, await RingAsync(again));
    }

    [Fact]
    public async Task A_ring_asked_for_is_used_when_free_and_replaced_by_a_free_one_when_taken()
    {
        var circle = await _host.CircleAsync();
        var (first, _, _) = await _host.JoinAsync(circle.Code, "Kenji", "owl", ring: 4);
        Assert.Equal(4, await RingAsync(first));
        var (second, _, _) = await _host.JoinAsync(circle.Code, "Lucía", "owl", ring: 4);
        Assert.Equal(0, await RingAsync(second));

        var (bad, _, _) = await _host.JoinAsync(circle.Code, "Théo", "owl", ring: 6);
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
    }

    [Fact]
    public async Task Joins_of_one_circle_from_one_address_are_limited_and_the_refusal_says_when_to_retry()
    {
        await RestartAsync(new() { ["RateLimits:CircleJoinsPerIpAndCodePer10Min"] = "3" });
        var circle = await _host.CircleAsync();
        var other = await _host.CircleAsync();

        for (var i = 0; i < 3; i++)
        {
            (await _host.JoinAsync(circle.Code, $"Guest {i}", Characters.All[i + 1])).Response.EnsureSuccessStatusCode();
        }
        var (limited, _, _) = await _host.JoinAsync(circle.Code, "Guest 3", "bee");
        Assert.Equal((HttpStatusCode.TooManyRequests, "rate-limited"), (limited.StatusCode, await TypeAsync(limited)));
        Assert.NotNull(limited.Headers.RetryAfter);
        Assert.True(await _host.DbAsync(db => db.AuditEvents.AnyAsync(e => e.Type == "otp.rate_limited")));
        // Another circle from the same address is not affected.
        (await _host.JoinAsync(other.Code, "Guest 4", "bee")).Response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task One_address_may_join_up_to_300_times_in_ten_minutes_by_default()
    {
        Assert.Equal(300, new Circloo.Api.Security.RateLimitOptions().CircleJoinsPerIpPer10Min);
        await RestartAsync(new() { ["RateLimits:CircleJoinsPerIpPer10Min"] = "5" });
        var first = await _host.CircleAsync();
        var second = await _host.CircleAsync();
        var codes = new[] { first.Code, second.Code, first.Code, second.Code, first.Code, second.Code };
        var statuses = new List<HttpStatusCode>();
        foreach (var (code, i) in codes.Select((c, i) => (c, i)))
        {
            statuses.Add((await _host.JoinAsync(code, $"Guest {i}", Characters.All[i + 1])).Response.StatusCode);
        }
        // Five joins pass across both circles; the sixth from the same address is refused.
        Assert.Equal([.. Enumerable.Repeat(HttpStatusCode.OK, 5), HttpStatusCode.TooManyRequests], statuses);
    }

    [Fact]
    public async Task The_cap_follows_configuration_and_the_full_circle_says_so()
    {
        await RestartAsync(new() { ["Circles:MaxPeople"] = "3" });
        var circle = await _host.CircleAsync();
        (await _host.JoinAsync(circle.Code, "Kenji", "fox")).Response.EnsureSuccessStatusCode();
        (await _host.JoinAsync(circle.Code, "Lucía", "fox")).Response.EnsureSuccessStatusCode();
        var (full, _, _) = await _host.JoinAsync(circle.Code, "Théo", "owl");
        Assert.Equal((HttpStatusCode.Conflict, "circle-full"), (full.StatusCode, await TypeAsync(full)));
        Assert.True((await circle.Http.GetFromJsonAsync<JoinInfo>($"/api/join/{circle.Code}"))!.Full);
        Assert.Equal(3, await _host.DbAsync(db => db.CircleMembers.CountAsync(m => m.CircleId == circle.Id && m.LeftAt == null)));
    }
}
