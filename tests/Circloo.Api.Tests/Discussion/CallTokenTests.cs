using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Circloo.Api.Data;
using Circloo.Api.Discussion;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;

namespace Circloo.Api.Tests.Discussion;

/// <summary>
/// Issue #259 (T919): <c>POST /api/circles/{id}/call/token</c> exactly per contracts/rest.md, against a fake call
/// server. The pass itself is checked against the real server in <see cref="LiveKitRoomsTests"/>.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class CallTokenTests(PostgresFixture pg) : IAsyncLifetime
{
    private const string CallUrl = "wss://lk-test.example.com";

    private readonly FakeLiveKitRooms _rooms = new();
    private readonly CapturingLoggerProvider _logs = new();
    private ApiFactory _factory = null!;
    private DiscussionHost _host = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString(), CallServer())
        {
            Configure = b => b
                .ConfigureLogging(l => l.AddProvider(_logs).AddFilter<CapturingLoggerProvider>(null, LogLevel.Trace))
                .ConfigureTestServices(s =>
                {
                    s.RemoveAll<ILiveKitRooms>();
                    s.AddSingleton<ILiveKitRooms>(_rooms);
                }),
        };
        _host = new DiscussionHost(_factory);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private static Dictionary<string, string?> CallServer() => new()
    {
        ["LiveKit:Url"] = CallUrl,
        ["LiveKit:ApiUrl"] = "https://lk-test.example.com",
        ["LiveKit:ApiKey"] = LiveKitFixture.ApiKey,
        ["LiveKit:ApiSecret"] = LiveKitFixture.ApiSecret,
    };

    private static string TokenUrl(Guid circleId) => $"/api/circles/{circleId}/call/token";

    private static async Task<HttpResponseMessage> PassAsync(HttpClient http, Guid circleId, string? csrf)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, TokenUrl(circleId));
        if (csrf is not null)
        {
            req.Headers.Add("X-XSRF-TOKEN", csrf);
        }
        return await http.SendAsync(req);
    }

    private Task<int> SetCallAsync(Guid circleId, bool on, bool video = true, string speaking = CallSpeakingModes.Hand) =>
        _host.Room.DbAsync(db => db.Circles.Where(c => c.Id == circleId).ExecuteUpdateAsync(c => c
            .SetProperty(x => x.DiscussionOn, on).SetProperty(x => x.DiscussionVideo, video).SetProperty(x => x.DiscussionSpeaking, speaking)));

    private async Task<(HttpClient Http, string Csrf, CircleMember Member)> GuestAsync(string code, string name = "Guest", string character = "fox")
    {
        var (res, http, _) = await _host.Room.JoinAsync(code, name, character);
        res.EnsureSuccessStatusCode();
        var memberId = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("memberId").GetGuid();
        var member = await _host.Room.DbAsync(db => db.CircleMembers.AsNoTracking().SingleAsync(m => m.Id == memberId));
        return (http, await http.CsrfAsync(), member);
    }

    private static async Task<string> ProblemTypeAsync(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("type").GetString()!;

    [Fact]
    public async Task A_participant_gets_a_pass_for_this_circle_with_their_identity_room_expiry_and_rights()
    {
        var circle = await _host.Room.CircleAsync();
        await SetCallAsync(circle.Id, on: true, video: true, speaking: CallSpeakingModes.Hand);
        var (http, csrf, member) = await GuestAsync(circle.Code, "Kenji");
        var now = _factory.Clock.GetUtcNow();

        using var res = await PassAsync(http, circle.Id, csrf);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.True(res.Headers.CacheControl!.NoStore);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(CallUrl, body.GetProperty("url").GetString());
        Assert.Equal(member.Id.ToString(), body.GetProperty("identity").GetString());
        Assert.Equal(now.AddMinutes(5), body.GetProperty("expiresAt").GetDateTimeOffset());
        // Hand to speak without the floor: listen and show a camera, no microphone.
        Assert.False(body.GetProperty("canSpeak").GetBoolean());
        Assert.True(body.GetProperty("canVideo").GetBoolean());

        var token = body.GetProperty("token").GetString()!;
        Assert.True(CallPassReader.SignedWith(token, LiveKitFixture.ApiSecret));
        Assert.Equal("HS256", CallPassReader.Header(token).GetProperty("alg").GetString());
        var claims = CallPassReader.Claims(token);
        Assert.Equal(LiveKitFixture.ApiKey, claims.GetProperty("iss").GetString());
        Assert.Equal(member.Id.ToString(), claims.GetProperty("sub").GetString());
        Assert.Equal("Kenji", claims.GetProperty("name").GetString());
        Assert.Equal(now.AddMinutes(5).ToUnixTimeSeconds(), claims.GetProperty("exp").GetInt64());
        Assert.Equal(now.AddSeconds(-10).ToUnixTimeSeconds(), claims.GetProperty("nbf").GetInt64());
        Assert.False(string.IsNullOrEmpty(claims.GetProperty("jti").GetString()));
        Assert.False(claims.TryGetProperty("metadata", out _));
        var video = claims.GetProperty("video");
        Assert.Equal(CallRules.RoomName(circle.Id), video.GetProperty("room").GetString());
        Assert.True(video.GetProperty("canPublish").GetBoolean());
        Assert.Equal(["camera"], video.GetProperty("canPublishSources").EnumerateArray().Select(s => s.GetString()!).ToArray());

        // The API opened the room itself, with the circle's size as the limit.
        Assert.Contains((CallRules.RoomName(circle.Id), 100), _rooms.Created);
    }

    [Fact]
    public async Task Passes_follow_the_role_the_floor_and_the_mode_read_from_the_database()
    {
        var circle = await _host.Room.CircleAsync();
        await SetCallAsync(circle.Id, on: true, video: false, speaking: CallSpeakingModes.Hand);
        var (http, csrf, member) = await GuestAsync(circle.Code);

        // Audio call, Hand to speak, no floor: nothing to publish, so canPublish is false (the empty-sources trap).
        var listener = await (await PassAsync(http, circle.Id, csrf)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(listener.GetProperty("canSpeak").GetBoolean());
        Assert.False(listener.GetProperty("canVideo").GetBoolean());
        var grants = CallPassReader.Claims(listener.GetProperty("token").GetString()!).GetProperty("video");
        Assert.False(grants.GetProperty("canPublish").GetBoolean());
        Assert.False(grants.TryGetProperty("canPublishSources", out _));

        // The animator always has the microphone.
        var animator = await (await PassAsync(circle.Http, circle.Id, circle.Csrf)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(animator.GetProperty("canSpeak").GetBoolean());
        Assert.False(animator.GetProperty("canVideo").GetBoolean());

        // Given the floor (spec 008's hand row), the participant may speak.
        await _host.Room.DbAsync(async db =>
        {
            db.RaisedHands.Add(new RaisedHand { CircleId = circle.Id, MemberId = member.Id, RaisedAt = _factory.Clock.GetUtcNow(), HasFloor = true });
            return await db.SaveChangesAsync();
        });
        var floor = await (await PassAsync(http, circle.Id, csrf)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(floor.GetProperty("canSpeak").GetBoolean());

        // Open mic, but muted by the animator: no microphone until allowed.
        await SetCallAsync(circle.Id, on: true, video: true, speaking: CallSpeakingModes.Open);
        var moderation = _factory.Services.GetRequiredService<CallModeration>();
        moderation.Mute(circle.Id, member.Id, CallRights.MicrophoneSource);
        var muted = await (await PassAsync(http, circle.Id, csrf)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal((false, true), (muted.GetProperty("canSpeak").GetBoolean(), muted.GetProperty("canVideo").GetBoolean()));
        moderation.Clear(circle.Id);
    }

    [Fact]
    public async Task A_stranger_or_someone_who_left_gets_404_and_the_attempt_is_audited()
    {
        var circle = await _host.Room.CircleAsync();
        await SetCallAsync(circle.Id, on: true);
        var (stranger, _, strangerId) = await _host.SignedInStrangerAsync();

        using var res = await PassAsync(stranger, circle.Id, await stranger.CsrfAsync());

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        var audits = await _host.AuditAsync(AuditTypesFor.Refused, circle.Id);
        Assert.Contains(audits, a => a.UserId == strangerId && a.Detail!.Contains("not-a-member", StringComparison.Ordinal)
            && a.Detail.Contains(CallEndpoints.TokenMethod, StringComparison.Ordinal));

        var (guest, csrf, member) = await GuestAsync(circle.Code);
        await _host.Room.DbAsync(db => db.CircleMembers.Where(m => m.Id == member.Id).ExecuteUpdateAsync(m => m.SetProperty(x => x.LeftAt, _factory.Clock.GetUtcNow())));
        using var left = await PassAsync(guest, circle.Id, csrf);
        Assert.Equal(HttpStatusCode.NotFound, left.StatusCode);

        // A member of another circle cannot reach this one either.
        var other = await _host.Room.CircleAsync();
        using var elsewhere = await PassAsync(other.Http, circle.Id, other.Csrf);
        Assert.Equal(HttpStatusCode.NotFound, elsewhere.StatusCode);
        Assert.DoesNotContain(_rooms.Created, r => r.Room == CallRules.RoomName(circle.Id));
    }

    [Fact]
    public async Task A_closed_circle_gives_no_pass()
    {
        var circle = await _host.Room.CircleAsync();
        await SetCallAsync(circle.Id, on: true);
        (await circle.Http.PostJsonAsync($"/api/circles/{circle.Id}/close", new { }, circle.Csrf)).EnsureSuccessStatusCode();

        using var res = await PassAsync(circle.Http, circle.Id, circle.Csrf);

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        Assert.Equal("circle-not-open", await ProblemTypeAsync(res));
    }

    [Fact]
    public async Task No_pass_while_the_call_is_off()
    {
        var circle = await _host.Room.CircleAsync();

        using var res = await PassAsync(circle.Http, circle.Id, circle.Csrf);

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Equal("call-off", await ProblemTypeAsync(res));
        Assert.DoesNotContain(_rooms.Created, r => r.Room == CallRules.RoomName(circle.Id));
    }

    [Fact]
    public async Task No_pass_when_this_environment_has_no_call_server()
    {
        await using var factory = new ApiFactory(pg.Container.GetConnectionString());
        var host = new DiscussionHost(factory);
        var circle = await host.Room.CircleAsync();
        await host.Room.DbAsync(db => db.Circles.Where(c => c.Id == circle.Id).ExecuteUpdateAsync(c => c.SetProperty(x => x.DiscussionOn, true)));

        using var res = await PassAsync(circle.Http, circle.Id, circle.Csrf);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, res.StatusCode);
        Assert.Equal("calls-unavailable", await ProblemTypeAsync(res));
    }

    [Fact]
    public async Task Someone_removed_from_the_call_gets_no_pass_until_allowed_back()
    {
        var circle = await _host.Room.CircleAsync();
        await SetCallAsync(circle.Id, on: true);
        var (http, csrf, member) = await GuestAsync(circle.Code);
        var moderation = _factory.Services.GetRequiredService<CallModeration>();
        moderation.Remove(circle.Id, member.Id);

        using var res = await PassAsync(http, circle.Id, csrf);

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        Assert.Equal("removed-from-call", await ProblemTypeAsync(res));
        var audits = await _host.AuditAsync(AuditTypesFor.Refused, circle.Id);
        Assert.Contains(audits, a => a.Detail!.Contains("removed-from-call", StringComparison.Ordinal) && a.Detail.Contains(member.Id.ToString(), StringComparison.Ordinal));

        moderation.AllowBack(circle.Id, member.Id);
        using var back = await PassAsync(http, circle.Id, csrf);
        Assert.Equal(HttpStatusCode.OK, back.StatusCode);
    }

    [Fact]
    public async Task Ten_passes_a_minute_per_member_then_429_with_Retry_After()
    {
        var circle = await _host.Room.CircleAsync();
        await SetCallAsync(circle.Id, on: true);
        var (http, csrf, _) = await GuestAsync(circle.Code);

        for (var i = 0; i < 10; i++)
        {
            using var ok = await PassAsync(http, circle.Id, csrf);
            Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        }
        using var limited = await PassAsync(http, circle.Id, csrf);

        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.RetryAfter!.Delta > TimeSpan.Zero);
        // Someone else in the same circle is not affected, and a minute later it works again.
        using var animator = await PassAsync(circle.Http, circle.Id, circle.Csrf);
        Assert.Equal(HttpStatusCode.OK, animator.StatusCode);
        _host.Advance(TimeSpan.FromMinutes(1));
        using var later = await PassAsync(http, circle.Id, csrf);
        Assert.Equal(HttpStatusCode.OK, later.StatusCode);
    }

    [Fact]
    public async Task Without_the_CSRF_header_there_is_no_pass()
    {
        var circle = await _host.Room.CircleAsync();
        await SetCallAsync(circle.Id, on: true);

        using var res = await PassAsync(circle.Http, circle.Id, csrf: null);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("antiforgery", await ProblemTypeAsync(res));
        Assert.DoesNotContain(_rooms.Created, r => r.Room == CallRules.RoomName(circle.Id));
    }

    [Fact]
    public async Task Without_a_session_there_is_no_pass()
    {
        var circle = await _host.Room.CircleAsync();
        await SetCallAsync(circle.Id, on: true);
        var anonymous = _host.Room.Browser().Http;

        using var res = await PassAsync(anonymous, circle.Id, await anonymous.CsrfAsync());

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task When_the_call_server_does_not_answer_the_member_is_told_to_try_again()
    {
        var circle = await _host.Room.CircleAsync();
        await SetCallAsync(circle.Id, on: true);
        _rooms.Down = true;
        try
        {
            using var res = await PassAsync(circle.Http, circle.Id, circle.Csrf);

            Assert.Equal(HttpStatusCode.ServiceUnavailable, res.StatusCode);
            Assert.Equal("try-again", await ProblemTypeAsync(res));
        }
        finally
        {
            _rooms.Down = false;
        }
    }

    [Fact]
    public async Task The_pass_never_reaches_the_logs_and_a_granted_pass_is_not_audited()
    {
        var circle = await _host.Room.CircleAsync();
        await SetCallAsync(circle.Id, on: true);
        var auditsBefore = await _host.Room.DbAsync(db => db.AuditEvents.CountAsync());

        using var res = await PassAsync(circle.Http, circle.Id, circle.Csrf);

        res.EnsureSuccessStatusCode();
        var token = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString()!;
        var signature = token.Split('.')[2];
        Assert.NotEmpty(_logs.Lines);
        Assert.DoesNotContain(_logs.Lines, l => l.Contains(signature, StringComparison.Ordinal) || l.Contains(token.Split('.')[1], StringComparison.Ordinal));
        Assert.DoesNotContain(_logs.Lines, l => l.Contains(LiveKitFixture.ApiSecret, StringComparison.Ordinal));
        // Joining is not an animator action: nothing is audited for it (founder decision D10).
        Assert.Equal(auditsBefore, await _host.Room.DbAsync(db => db.AuditEvents.CountAsync()));
    }

    /// <summary>Audit type names used here, kept in one place.</summary>
    private static class AuditTypesFor
    {
        public const string Refused = Circloo.Api.Security.AuditTypes.DiscussionRefused;
    }
}
