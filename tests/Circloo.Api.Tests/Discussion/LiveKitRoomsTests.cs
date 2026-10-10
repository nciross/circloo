using System.Net;
using System.Net.WebSockets;
using Circloo.Api.Discussion;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Circloo.Api.Tests.Discussion;

/// <summary>
/// Issues #256 (T916) and #259 (T919): the real call server in a container (spec 009, research R30). The API's own
/// passes are accepted by it, tampered or foreign ones are not, and the RoomService client drives its rooms.
/// </summary>
[Collection(LiveKitCollection.Name)]
[Trait("Category", "LiveKit")]
public sealed class LiveKitRoomsTests(LiveKitFixture livekit)
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(10);

    private LiveKitOptions Options(string? secret = null) => new()
    {
        Url = $"ws://{livekit.ApiUrl.Authority}",
        ApiUrl = livekit.ApiUrl.ToString(),
        ApiKey = LiveKitFixture.ApiKey,
        ApiSecret = secret ?? LiveKitFixture.ApiSecret,
    };

    private LiveKitTokens Tokens(string? secret = null) => new(Microsoft.Extensions.Options.Options.Create(Options(secret)), TimeProvider.System);

    private LiveKitRooms Rooms(HttpClient http, string? secret = null, ILogger<LiveKitRooms>? log = null) =>
        new(http, Tokens(secret), Microsoft.Extensions.Options.Options.Create(Options(secret)), log ?? Microsoft.Extensions.Logging.Abstractions.NullLogger<LiveKitRooms>.Instance);

    private static string NewRoom() => CallRules.RoomName(Guid.NewGuid());

    private async Task<HttpStatusCode> ValidateAsync(string token)
    {
        using var http = new HttpClient { BaseAddress = livekit.ApiUrl };
        using var res = await http.GetAsync(new Uri($"/rtc/validate?access_token={Uri.EscapeDataString(token)}", UriKind.Relative));
        return res.StatusCode;
    }

    /// <summary>Opens the call server's signalling socket with a pass, as the browser does, and waits for its first answer.</summary>
    private async Task<ClientWebSocket> JoinAsync(string token)
    {
        var socket = new ClientWebSocket();
        using var timeout = new CancellationTokenSource(Wait);
        await socket.ConnectAsync(new Uri($"ws://{livekit.ApiUrl.Authority}/rtc?access_token={Uri.EscapeDataString(token)}&protocol=15&auto_subscribe=1&sdk=js"), timeout.Token);
        var buffer = new byte[16 * 1024];
        var first = await socket.ReceiveAsync(buffer, timeout.Token);
        Assert.Equal(WebSocketMessageType.Binary, first.MessageType);
        return socket;
    }

    [Fact]
    public async Task The_call_server_is_up_and_answers_its_health_check()
    {
        using var http = new HttpClient { BaseAddress = livekit.ApiUrl };

        using var res = await http.GetAsync(new Uri("/", UriKind.Relative));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    [Fact]
    public async Task A_pass_signed_by_the_API_is_accepted_and_a_tampered_or_foreign_one_is_refused()
    {
        using var http = new HttpClient();
        var room = NewRoom();
        await Rooms(http).CreateRoomAsync(room, 100, CancellationToken.None);
        var pass = Tokens().JoinPass(room, Guid.NewGuid(), "Kenji", new CallRights(true, false)).Token;

        Assert.Equal(HttpStatusCode.OK, await ValidateAsync(pass));

        // One character of the claims changed: the signature no longer matches.
        var parts = pass.Split('.');
        var claims = parts[1].ToCharArray();
        claims[^2] = claims[^2] == 'A' ? 'B' : 'A';
        Assert.Equal(HttpStatusCode.Unauthorized, await ValidateAsync($"{parts[0]}.{new string(claims)}.{parts[2]}"));
        // Same key id, another secret: refused.
        var foreign = Tokens(new string('x', 46)).JoinPass(room, Guid.NewGuid(), "Kenji", new CallRights(true, false)).Token;
        Assert.Equal(HttpStatusCode.Unauthorized, await ValidateAsync(foreign));
        // An expired pass: refused.
        var old = new LiveKitTokens(Microsoft.Extensions.Options.Options.Create(Options()),
            new Microsoft.Extensions.Time.Testing.FakeTimeProvider(DateTimeOffset.UtcNow.AddHours(-1))).JoinPass(room, Guid.NewGuid(), "Kenji", CallRights.Nothing).Token;
        Assert.Equal(HttpStatusCode.Unauthorized, await ValidateAsync(old));

        Assert.True(await Rooms(http).DeleteRoomAsync(room, CancellationToken.None));
    }

    [Fact]
    public async Task A_joined_pass_shows_up_with_its_identity_name_and_exact_rights()
    {
        using var http = new HttpClient();
        var rooms = Rooms(http);
        var room = NewRoom();
        await rooms.CreateRoomAsync(room, 100, CancellationToken.None);
        var listener = Guid.NewGuid();
        var speaker = Guid.NewGuid();

        using var listenerSocket = await JoinAsync(Tokens().JoinPass(room, listener, "Kenji", CallRights.Nothing).Token);
        using var speakerSocket = await JoinAsync(Tokens().JoinPass(room, speaker, "Amina", new CallRights(true, false)).Token);
        var people = await rooms.ListParticipantsAsync(room, CancellationToken.None);

        // canPublish false with no sources really means "nothing" on the server, not "every source".
        var heard = Assert.Single(people, p => p.Identity == listener.ToString());
        Assert.Equal(("Kenji", CallRights.Nothing), (heard.Name, heard.Permission));
        var speaking = Assert.Single(people, p => p.Identity == speaker.ToString());
        Assert.Equal(("Amina", new CallRights(true, false)), (speaking.Name, speaking.Permission));

        // A live change of rights, then a removal, then the room is gone for everyone.
        Assert.True(await rooms.UpdateParticipantAsync(room, listener.ToString(), new CallRights(true, true), CancellationToken.None));
        Assert.Equal(new CallRights(true, true), (await rooms.GetParticipantAsync(room, listener.ToString(), CancellationToken.None))!.Permission);
        Assert.True(await rooms.UpdateParticipantAsync(room, listener.ToString(), CallRights.Nothing, CancellationToken.None));
        Assert.Equal(CallRights.Nothing, (await rooms.GetParticipantAsync(room, listener.ToString(), CancellationToken.None))!.Permission);
        Assert.True(await rooms.MutePublishedTrackAsync(room, speaker.ToString(), "TR_none", muted: true, CancellationToken.None));
        Assert.True(await rooms.RemoveParticipantAsync(room, speaker.ToString(), CancellationToken.None));
        Assert.Null(await rooms.GetParticipantAsync(room, speaker.ToString(), CancellationToken.None));
        Assert.True(await rooms.DeleteRoomAsync(room, CancellationToken.None));
        Assert.Empty(await rooms.ListParticipantsAsync(room, CancellationToken.None));
    }

    [Fact]
    public async Task CreateRoom_is_idempotent_and_DeleteRoom_and_ListParticipants_work()
    {
        using var http = new HttpClient();
        var rooms = Rooms(http);
        var room = NewRoom();

        await rooms.CreateRoomAsync(room, 100, CancellationToken.None);
        await rooms.CreateRoomAsync(room, 100, CancellationToken.None);

        Assert.Empty(await rooms.ListParticipantsAsync(room, CancellationToken.None));
        Assert.True(await rooms.DeleteRoomAsync(room, CancellationToken.None));
        Assert.False(await rooms.DeleteRoomAsync(room, CancellationToken.None));
    }

    [Fact]
    public async Task Someone_not_in_the_call_is_an_answer_not_a_failure()
    {
        using var http = new HttpClient();
        var rooms = Rooms(http);
        var room = NewRoom();
        await rooms.CreateRoomAsync(room, 100, CancellationToken.None);
        var nobody = Guid.NewGuid().ToString();

        Assert.Null(await rooms.GetParticipantAsync(room, nobody, CancellationToken.None));
        Assert.False(await rooms.UpdateParticipantAsync(room, nobody, new CallRights(true, true), CancellationToken.None));
        Assert.False(await rooms.RemoveParticipantAsync(room, nobody, CancellationToken.None));

        await rooms.DeleteRoomAsync(room, CancellationToken.None);
    }

    [Fact]
    public async Task A_wrong_admin_secret_is_a_failure_and_nothing_of_it_is_logged()
    {
        using var http = new HttpClient();
        var logs = new CapturingLoggerProvider();
        using var factory = LoggerFactory.Create(l => l.AddProvider(logs).SetMinimumLevel(LogLevel.Trace));
        var secret = new string('y', 46);
        var rooms = Rooms(http, secret, factory.CreateLogger<LiveKitRooms>());

        await Assert.ThrowsAsync<LiveKitException>(() => rooms.CreateRoomAsync(NewRoom(), 100, CancellationToken.None));

        var line = Assert.Single(logs.Lines, l => l.Contains("Warning", StringComparison.Ordinal));
        Assert.Contains("CreateRoom answered 401", line, StringComparison.Ordinal);
        Assert.DoesNotContain(logs.Lines, l => l.Contains(secret, StringComparison.Ordinal) || l.Contains("eyJ", StringComparison.Ordinal));
    }
}
