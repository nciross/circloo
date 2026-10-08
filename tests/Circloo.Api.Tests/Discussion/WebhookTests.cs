using System.Buffers.Text;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Circloo.Api.Data;
using Circloo.Api.Discussion;
using Circloo.Api.Tests.Infrastructure;
using Circloo.Api.Tests.LiveRoom;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Circloo.Api.Tests.Discussion;

/// <summary>
/// Issue #262 (T922): the call server's webhook (spec 009 research R24, contracts/rest.md). Only requests signed like
/// LiveKit signs them are believed; a believed join is enforced (removed member, former member, call off) and feeds
/// the live roster, which reaches people and never the audience screen. The real call server's own signature is
/// checked against the same verifier in <see cref="LiveKitWebhookTests"/>.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class WebhookTests(PostgresFixture pg) : IAsyncLifetime
{
    private const string Path = "/api/livekit/webhook";
    private const string RoomSid = "RM_current";

    private readonly FakeLiveKitRooms _rooms = new();
    private readonly CapturingLoggerProvider _logs = new();
    private readonly List<HubConnection> _open = [];
    private ApiFactory _factory = null!;
    private DiscussionHost _host = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString(), FakeLiveKitRooms.Settings())
        {
            Configure = b =>
            {
                _rooms.Install(b);
                b.ConfigureLogging(l => l.AddProvider(_logs).AddFilter<CapturingLoggerProvider>(null, LogLevel.Trace));
            },
        };
        _host = new DiscussionHost(_factory);
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

    private CallModeration Moderation => _factory.Services.GetRequiredService<CallModeration>();

    private LiveKitWebhook Webhook => _factory.Services.GetRequiredService<LiveKitWebhook>();

    /// <summary>The call server's client: plain HTTP, no cookie, no CSRF header, redirects not followed.</summary>
    private HttpClient CallServer() =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("http://localhost"), AllowAutoRedirect = false, HandleCookies = false });

    /// <summary>A LiveKit webhook token (livekit/protocol auth.AccessToken with SetSha256), with parts to break on purpose.</summary>
    private string Token(byte[] body, string? iss = null, string? secret = null, TimeSpan? expiresIn = null, string? sha256 = null, string alg = "HS256",
        TimeSpan? notBeforeIn = null)
    {
        var now = _factory.Clock.GetUtcNow();
        var claims = new JsonObject
        {
            ["iss"] = iss ?? LiveKitFixture.ApiKey,
            ["nbf"] = (now + (notBeforeIn ?? TimeSpan.Zero)).ToUnixTimeSeconds(),
            ["exp"] = (now + (expiresIn ?? TimeSpan.FromMinutes(5))).ToUnixTimeSeconds(),
            ["sha256"] = sha256 ?? Convert.ToBase64String(SHA256.HashData(body)),
            ["video"] = new JsonObject(),
        };
        var head = Base64Url.EncodeToString(Encoding.UTF8.GetBytes($$"""{"alg":"{{alg}}","typ":"JWT"}"""));
        var input = $"{head}.{Base64Url.EncodeToString(Encoding.UTF8.GetBytes(claims.ToJsonString()))}";
        var signature = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret ?? LiveKitFixture.ApiSecret), Encoding.ASCII.GetBytes(input));
        return $"{input}.{Base64Url.EncodeToString(signature)}";
    }

    /// <summary>A LiveKit event body in protobuf JSON, as v1.13.7 sends it.</summary>
    private static byte[] Event(string kind, Guid circleId, string? identity = null, string? participantSid = null, string roomSid = RoomSid,
        string name = "Ana", string? roomName = null)
    {
        var body = new JsonObject
        {
            ["event"] = kind,
            ["room"] = new JsonObject { ["sid"] = roomSid, ["name"] = roomName ?? CallRules.RoomName(circleId), ["emptyTimeout"] = 300 },
            ["id"] = $"EV_{Guid.NewGuid():N}",
            ["createdAt"] = "1791497395",
        };
        if (identity is not null)
        {
            body["participant"] = new JsonObject
            {
                ["sid"] = participantSid ?? $"PA_{identity}",
                ["identity"] = identity,
                ["state"] = "ACTIVE",
                ["name"] = name,
                ["joinedAt"] = "1791497395",
            };
        }
        return Encoding.UTF8.GetBytes(body.ToJsonString());
    }

    private async Task<HttpResponseMessage> PostAsync(byte[] body, string? authorization)
    {
        using var http = CallServer();
        using var req = new HttpRequestMessage(HttpMethod.Post, Path) { Content = new ByteArrayContent(body) };
        req.Content.Headers.ContentType = new MediaTypeHeaderValue("application/webhook+json");
        if (authorization is not null)
        {
            req.Headers.TryAddWithoutValidation("Authorization", authorization);
        }
        return await http.SendAsync(req);
    }

    /// <summary>Sends a correctly signed event and waits until the circle's events are handled.</summary>
    private async Task SendAsync(Guid circleId, byte[] body)
    {
        using var res = await PostAsync(body, Token(body));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        await Webhook.IdleAsync(circleId);
    }

    private async Task<(HubConnection Hub, Inbox<Guid[]> Roster)> EnterAsync(CookieContainerHandler cookies, Guid circleId)
    {
        var hub = _host.Room.Hub(cookies);
        var roster = new Inbox<Guid[]>(hub, "CallRoster");
        await hub.StartAsync();
        _open.Add(hub);
        await hub.InvokeAsync<Guid[]>("Enter", circleId);
        return (hub, roster);
    }

    private async Task<Guid> GuestAsync(Guid circleId, string code, string name, string character)
    {
        var (res, _, _) = await _host.Room.JoinAsync(code, name, character);
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("memberId").GetGuid();
    }

    private int RemovalsOf(Guid circleId, string identity) =>
        _rooms.Removals.Count(r => r.Room == CallRules.RoomName(circleId) && r.Identity == identity);

    private static string? Field(AuditEvent row, string name)
    {
        using var doc = JsonDocument.Parse(row.Detail!);
        return doc.RootElement.TryGetProperty(name, out var value) ? value.ToString() : null;
    }

    [Fact]
    public async Task A_signed_event_is_accepted_over_plain_http_without_cookie_or_csrf_and_other_events_are_ignored()
    {
        var circle = await _host.Room.CircleAsync();

        foreach (var body in new[]
        {
            Event("room_started", circle.Id),
            Event("track_published", circle.Id, Guid.NewGuid().ToString()),
            Event("participant_joined", circle.Id, Guid.NewGuid().ToString(), roomName: "lobby"),
            Encoding.UTF8.GetBytes("""{"event":"egress_started","egressInfo":{}}"""),
        })
        {
            using var res = await PostAsync(body, Token(body));
            // 200, not a redirect to HTTPS: the local call server posts over plain HTTP.
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        }
        var bearer = Event("room_started", circle.Id);
        using (var res = await PostAsync(bearer, $"Bearer {Token(bearer)}"))
        {
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        }
        await Webhook.IdleAsync(circle.Id);

        // None of them is ours to act on: nobody removed, nobody in the roster, nothing written.
        Assert.Empty(_rooms.Removals);
        Assert.Empty(Moderation.Roster(circle.Id));
        Assert.Empty(await _host.AuditAsync("discussion.refused", circle.Id));
    }

    [Fact]
    public async Task Bad_signature_wrong_iss_wrong_body_hash_expired_token_and_oversized_body_are_refused_without_detail()
    {
        var circle = await _host.Room.CircleAsync();
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "open");
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");
        await animator.InvokeAsync("RemoveFromCall", ana);
        var removals = RemovalsOf(circle.Id, ana.ToString());
        // The marker sits in the body: it must never reach a log line.
        var body = Event("participant_joined", circle.Id, ana.ToString(), name: "MARKER-7f3a");
        var other = Event("participant_joined", circle.Id, Guid.NewGuid().ToString());
        var huge = Encoding.UTF8.GetBytes($$"""{"event":"participant_joined","pad":"{{new string('x', LiveKitWebhook.MaxBodyBytes)}}"}""");

        (string Case, byte[] Body, string? Authorization, HttpStatusCode Status)[] attempts =
        [
            ("no token", body, null, HttpStatusCode.Unauthorized),
            ("garbage", body, "not-a-token", HttpStatusCode.Unauthorized),
            ("bad signature", body, Token(body, secret: new string('s', 46)), HttpStatusCode.Unauthorized),
            ("tampered signature", body, Token(body)[..^3] + "AAA", HttpStatusCode.Unauthorized),
            ("wrong iss", body, Token(body, iss: "someone-else"), HttpStatusCode.Unauthorized),
            ("wrong body hash", body, Token(other), HttpStatusCode.Unauthorized),
            ("hash of nothing", body, Token(body, sha256: ""), HttpStatusCode.Unauthorized),
            ("expired", body, Token(body, expiresIn: TimeSpan.FromMinutes(-2)), HttpStatusCode.Unauthorized),
            ("not yet valid", body, Token(body, notBeforeIn: TimeSpan.FromMinutes(5)), HttpStatusCode.Unauthorized),
            ("alg none", body, Token(body, alg: "none"), HttpStatusCode.Unauthorized),
            ("oversized", huge, Token(huge), HttpStatusCode.RequestEntityTooLarge),
        ];
        foreach (var (name, payload, authorization, status) in attempts)
        {
            using var res = await PostAsync(payload, authorization);
            Assert.True(res.StatusCode == status, $"{name}: {res.StatusCode}");
            var answer = await res.Content.ReadAsStringAsync();
            foreach (var hint in new[] { "signature", "sha256", "hash", "issuer", "\"iss\"", "expired", "secret", "token", "LiveKit" })
            {
                Assert.False(answer.Contains(hint, StringComparison.OrdinalIgnoreCase), $"{name}: the answer says '{hint}'");
            }
        }
        await Webhook.IdleAsync(circle.Id);

        // Nothing was acted on, and each refusal left a warning without the body.
        Assert.Equal(removals, RemovalsOf(circle.Id, ana.ToString()));
        Assert.Empty(await _host.AuditAsync("discussion.refused", circle.Id));
        Assert.True(_logs.Lines.Count(l => l.Contains("webhook was refused", StringComparison.Ordinal)) >= attempts.Length);
        Assert.DoesNotContain(_logs.Lines, l => l.Contains("MARKER-7f3a", StringComparison.Ordinal));

        // The same body, correctly signed, is believed.
        await SendAsync(circle.Id, body);
        Assert.Equal(removals + 1, RemovalsOf(circle.Id, ana.ToString()));
    }

    [Fact]
    public async Task A_removed_member_a_former_member_and_a_call_that_is_off_are_removed_again_and_only_refusals_are_audited()
    {
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "open");
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");
        var ben = await GuestAsync(circle.Id, circle.Code, "Ben", "owl");
        var cleo = await GuestAsync(circle.Id, circle.Code, "Cleo", "cat");
        var zed = await GuestAsync(circle.Id, circle.Code, "Zed", "panda");

        // Ana was removed by the animator and comes back with a pass she got before.
        await animator.InvokeAsync("RemoveFromCall", ana);
        _rooms.Join(room, ana, new CallRights(true, true));
        await SendAsync(circle.Id, Event("participant_joined", circle.Id, ana.ToString()));
        Assert.Equal(2, RemovalsOf(circle.Id, ana.ToString()));
        Assert.Null(_rooms.PermissionOf(room, ana));

        // Ben left the circle; his pass is still valid for a few minutes.
        await _host.Room.DbAsync(db => db.CircleMembers.Where(m => m.Id == ben).ExecuteUpdateAsync(s => s.SetProperty(m => m.LeftAt, _factory.Clock.GetUtcNow())));
        await SendAsync(circle.Id, Event("participant_joined", circle.Id, ben.ToString()));
        Assert.Equal(1, RemovalsOf(circle.Id, ben.ToString()));

        // An identity that is nobody we know, and a member of another circle in this room.
        await SendAsync(circle.Id, Event("participant_joined", circle.Id, "not-a-member-id"));
        Assert.Equal(1, RemovalsOf(circle.Id, "not-a-member-id"));
        var elsewhere = await _host.Room.CircleAsync();
        var stranger = await GuestAsync(elsewhere.Id, elsewhere.Code, "Sam", "owl");
        await SendAsync(circle.Id, Event("participant_joined", circle.Id, stranger.ToString()));
        Assert.Equal(1, RemovalsOf(circle.Id, stranger.ToString()));

        // Cleo is welcome: she stays and is in the roster.
        await SendAsync(circle.Id, Event("participant_joined", circle.Id, cleo.ToString()));
        Assert.Equal(0, RemovalsOf(circle.Id, cleo.ToString()));
        Assert.Equal(new[] { cleo }, Moderation.Roster(circle.Id));

        // The call ends; Zed connects with a pass from before the end.
        await animator.InvokeAsync("DisableDiscussion");
        await SendAsync(circle.Id, Event("participant_joined", circle.Id, zed.ToString()));
        Assert.Equal(1, RemovalsOf(circle.Id, zed.ToString()));
        Assert.Empty(Moderation.Roster(circle.Id));

        var refused = await _host.AuditAsync("discussion.refused", circle.Id);
        Assert.All(refused, r => Assert.Equal(LiveKitWebhook.JoinMethod, Field(r, "method")));
        Assert.Equal(
            new[] { "removed-from-call", "not-a-member", "not-a-member", "not-a-member", "call-off" },
            refused.Select(r => Field(r, "code")).ToArray());
        Assert.Equal(new[] { ana.ToString(), ben.ToString(), "", stranger.ToString(), zed.ToString() }, refused.Select(r => Field(r, "member") ?? "").ToArray());

        // Joins are never audited: only the animator's actions and the refusals are about this call.
        var types = (await _host.Room.DbAsync(db => db.AuditEvents.AsNoTracking().Where(a => a.Detail != null).Select(a => new { a.Type, a.Detail }).ToListAsync()))
            .Where(a => a.Detail!.Contains(circle.Id.ToString(), StringComparison.Ordinal) && a.Type is not ("circle.created" or "circle.joined"))
            .Select(a => a.Type).Distinct().Order().ToArray();
        Assert.Equal(new[] { "call.removed", "discussion.off", "discussion.on", "discussion.refused" }, types);
        Assert.Equal(0, await _host.Room.DbAsync(db => db.CircleMessages.CountAsync(m => m.CircleId == circle.Id)));
    }

    [Fact]
    public async Task A_join_gets_the_permission_of_now_not_the_one_of_its_pass()
    {
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        var (animator, _) = await EnterAsync(circle.Cookies, circle.Id);
        await animator.InvokeAsync("EnableDiscussion", true, "open");
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");

        // Ana's pass was minted in an Open mic video call; the animator switched to an audio call in Hand to speak
        // before she connected, so the switch could not update her.
        await animator.InvokeAsync("EnableDiscussion", false, "hand");
        _rooms.Join(room, ana, new CallRights(true, true));
        await SendAsync(circle.Id, Event("participant_joined", circle.Id, ana.ToString()));

        Assert.Equal(CallRights.Nothing, _rooms.PermissionOf(room, ana));
        Assert.Equal(0, RemovalsOf(circle.Id, ana.ToString()));
        Assert.Equal(new[] { ana }, Moderation.Roster(circle.Id));
    }

    [Fact]
    public async Task The_roster_follows_joins_and_leaves_reaches_people_and_never_the_audience_screen()
    {
        var circle = await _host.Room.CircleAsync();
        var (animator, roster) = await EnterAsync(circle.Cookies, circle.Id);
        var audience = await _host.AudienceAsync(circle.Cookies, circle.Id);
        _open.Add(audience);
        var projector = new Inbox<Guid[]>(audience, "CallRoster");
        Assert.Empty(await roster.NextAsync());
        await animator.InvokeAsync("EnableDiscussion", true, "open");
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");
        var ben = await GuestAsync(circle.Id, circle.Code, "Ben", "owl");

        await SendAsync(circle.Id, Event("participant_joined", circle.Id, ana.ToString(), "PA_ana1"));
        await SendAsync(circle.Id, Event("participant_joined", circle.Id, ben.ToString(), "PA_ben1"));
        await roster.NextAsync(r => r.Order().SequenceEqual(new[] { ana, ben }.Order()));

        // A leave of Ana's earlier connection does not take out the one that replaced it; her own leave does.
        await SendAsync(circle.Id, Event("participant_left", circle.Id, ana.ToString(), "PA_ana0"));
        Assert.Equal(2, Moderation.Roster(circle.Id).Length);
        await SendAsync(circle.Id, Event("participant_left", circle.Id, ana.ToString(), "PA_ana1"));
        await roster.NextAsync(r => r.SequenceEqual(new[] { ben }));

        // Someone who enters the room later gets the roster at once.
        var (_, laterCookies, _) = await _host.SignedInParticipantAsync(circle.Code, "cat");
        var (_, later) = await EnterAsync(laterCookies, circle.Id);
        Assert.Equal(new[] { ben }, await later.NextAsync());

        // The close of an older room changes nothing; the close of this one empties the roster.
        await SendAsync(circle.Id, Event("room_finished", circle.Id, roomSid: "RM_previous"));
        Assert.Equal(new[] { ben }, Moderation.Roster(circle.Id));
        await SendAsync(circle.Id, Event("room_finished", circle.Id));
        await roster.NextAsync(r => r.Length == 0);
        await later.NextAsync(r => r.Length == 0);

        // The projector got none of it, and nothing about the roster was written.
        Assert.Empty(projector.Drain());
        Assert.Empty(await _host.AuditAsync("discussion.refused", circle.Id));
    }

    [Fact]
    public async Task The_webhook_is_limited_per_source_address_and_a_flood_writes_nothing()
    {
        await using var factory = new ApiFactory(pg.Container.GetConnectionString(),
            new Dictionary<string, string?>(FakeLiveKitRooms.Settings()) { ["RateLimits:LiveKitWebhooksPerIpPerMinute"] = "3" })
        {
            Configure = _rooms.Install,
        };
        using var http = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("http://localhost"), AllowAutoRedirect = false });
        var audits = await _host.Room.DbAsync(db => db.AuditEvents.CountAsync());

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 5; i++)
        {
            using var content = new ByteArrayContent("{}"u8.ToArray());
            using var res = await http.PostAsync(new Uri(Path, UriKind.Relative), content);
            statuses.Add(res.StatusCode);
        }

        Assert.Equal(
            new[] { HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.TooManyRequests, HttpStatusCode.TooManyRequests },
            statuses);
        Assert.Equal(audits, await _host.Room.DbAsync(db => db.AuditEvents.CountAsync()));
    }
}
