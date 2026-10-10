using System.Net.WebSockets;
using System.Text;
using Circloo.Api.Discussion;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;

namespace Circloo.Api.Tests.Discussion;

/// <summary>
/// Issue #262 (T922): the real call server's webhooks (research R24). LiveKit v1.13.7 posts its events to a capture
/// container (<see cref="LiveKitFixture"/>; it cannot reach the test process on every machine, so the API host is not
/// the receiver here); the API's verifier believes them exactly as sent, reads their room and participant, and
/// refuses them once a byte of the body changes, under another secret or once expired. The endpoint around the
/// verifier is covered by <see cref="WebhookTests"/>.
/// </summary>
[Collection(LiveKitCollection.Name)]
[Trait("Category", "LiveKit")]
public sealed class LiveKitWebhookTests(LiveKitFixture livekit)
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(30);

    private LiveKitOptions Options(string? secret = null) => new()
    {
        Url = $"ws://{livekit.ApiUrl.Authority}",
        ApiUrl = livekit.ApiUrl.ToString(),
        ApiKey = LiveKitFixture.ApiKey,
        ApiSecret = secret ?? LiveKitFixture.ApiSecret,
    };

    /// <summary>Waits until the call server has posted every one of <paramref name="kinds"/> about <paramref name="room"/>.</summary>
    private async Task<List<(string? Authorization, byte[] Body, LiveKitEvent Event)>> EventsAsync(string room, params string[] kinds)
    {
        var waited = System.Diagnostics.Stopwatch.StartNew();
        while (true)
        {
            var events = (await livekit.WebhooksAsync())
                .Select(r => (r.Authorization, r.Body, Event: LiveKitWebhook.Parse(r.Body)))
                .Where(r => r.Event?.RoomName == room)
                .Select(r => (r.Authorization, r.Body, r.Event!))
                .ToList();
            if (kinds.All(k => events.Any(e => e.Item3.Kind == k)))
            {
                return events;
            }
            if (waited.Elapsed > Wait)
            {
                Assert.Fail($"The call server sent {string.Join(", ", events.Select(e => e.Item3.Kind))} for {room}, not all of {string.Join(", ", kinds)}. "
                    + await livekit.WebhookDiagnosticsAsync());
            }
            await Task.Delay(250);
        }
    }

    [Fact]
    public async Task The_call_servers_own_webhooks_are_believed_as_sent_and_refused_once_changed()
    {
        var options = Microsoft.Extensions.Options.Options.Create(Options());
        var tokens = new LiveKitTokens(options, TimeProvider.System);
        using var http = new HttpClient();
        var rooms = new LiveKitRooms(http, tokens, options, NullLogger<LiveKitRooms>.Instance);
        var circleId = Guid.NewGuid();
        var room = CallRules.RoomName(circleId);
        var memberId = Guid.NewGuid();

        await rooms.CreateRoomAsync(room, 10, CancellationToken.None);
        // A browser joins with the API's pass, as in LiveKitRoomsTests, then the room is closed.
        using (var socket = new ClientWebSocket())
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var pass = tokens.JoinPass(room, memberId, "Kenji", new CallRights(true, false)).Token;
            await socket.ConnectAsync(new Uri($"ws://{livekit.ApiUrl.Authority}/rtc?access_token={Uri.EscapeDataString(pass)}&protocol=15&auto_subscribe=1&sdk=js"), timeout.Token);
            await socket.ReceiveAsync(new byte[16 * 1024], timeout.Token);
        }
        // Without media the connection never becomes active: LiveKit reports it as aborted, not joined (a joined event
        // needs ICE, which these tests do not carry). The API reads both by the same participant fields.
        await EventsAsync(room, LiveKitWebhook.ConnectionAborted);
        await rooms.DeleteRoomAsync(room, CancellationToken.None);

        var events = await EventsAsync(room, "room_started", LiveKitWebhook.ConnectionAborted, LiveKitWebhook.RoomFinished);
        var now = DateTimeOffset.UtcNow;
        foreach (var (authorization, body, e) in events)
        {
            Assert.True(LiveKitWebhook.Verify(Options(), now, authorization, body), $"{e.Kind} is believed");
            Assert.Equal(circleId, CallRules.CircleOf(e.RoomName));
            Assert.StartsWith("RM_", e.RoomSid, StringComparison.Ordinal);

            var changed = body.Concat(Encoding.UTF8.GetBytes(" ")).ToArray();
            Assert.False(LiveKitWebhook.Verify(Options(), now, authorization, changed), $"{e.Kind} with one more byte");
            Assert.False(LiveKitWebhook.Verify(Options(new string('x', 46)), now, authorization, body), $"{e.Kind} under another secret");
            Assert.False(LiveKitWebhook.Verify(Options(), now.AddHours(1), authorization, body), $"{e.Kind} an hour later");
        }
        var aborted = events.First(e => e.Event.Kind == LiveKitWebhook.ConnectionAborted).Event;
        Assert.Equal(memberId.ToString(), aborted.Identity);
        Assert.StartsWith("PA_", aborted.ParticipantSid, StringComparison.Ordinal);
    }
}
