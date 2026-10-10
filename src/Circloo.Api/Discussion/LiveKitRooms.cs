using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Http.Resilience;
using Microsoft.Extensions.Options;
using Polly;

namespace Circloo.Api.Discussion;

/// <summary>Someone connected to a call room, as the call server sees them.</summary>
/// <param name="Identity">The member id (research R21).</param>
/// <param name="State">LiveKit's state: <c>JOINING</c>, <c>JOINED</c>, <c>ACTIVE</c> or <c>DISCONNECTED</c>.</param>
public sealed record CallParticipant(string Identity, string Name, string State, CallRights Permission, IReadOnlyList<CallTrack> Tracks);

/// <summary>A published track. <c>Source</c> is <c>microphone</c>, <c>camera</c> or LiveKit's other names in lower case.</summary>
public sealed record CallTrack(string Sid, string Source, bool Muted);

/// <summary>The call server did not answer, or answered with an error: the caller says "try again".</summary>
public sealed class LiveKitException : Exception
{
    public LiveKitException() : base("The call server did not answer.") { }

    public LiveKitException(string message) : base(message) { }

    public LiveKitException(string message, Exception? inner) : base(message, inner) { }
}

/// <summary>
/// The call server's RoomService (spec 009, research R21, R22). Only the API opens rooms (<c>auto_create</c> is off).
/// "Not found" is an answer, not a failure: methods on a person or a room that is not there return false or null.
/// Every other failure throws <see cref="LiveKitException"/>.
/// </summary>
public interface ILiveKitRooms
{
    /// <summary>Opens the room, or returns quietly if it is already open (LiveKit's <c>CreateRoom</c> is idempotent).</summary>
    Task CreateRoomAsync(string room, int maxParticipants, CancellationToken ct);

    /// <summary>Closes the room and disconnects everyone. False when there was no room.</summary>
    Task<bool> DeleteRoomAsync(string room, CancellationToken ct);

    Task<IReadOnlyList<CallParticipant>> ListParticipantsAsync(string room, CancellationToken ct);

    Task<CallParticipant?> GetParticipantAsync(string room, string identity, CancellationToken ct);

    /// <summary>Replaces the person's whole permission. False when they are not in the call.</summary>
    Task<bool> UpdateParticipantAsync(string room, string identity, CallRights permission, CancellationToken ct);

    /// <summary>Mutes (or unmutes) one published track. False when the person is not in the call.</summary>
    Task<bool> MutePublishedTrackAsync(string room, string identity, string trackSid, bool muted, CancellationToken ct);

    /// <summary>Disconnects the person. It does not revoke their pass (research R22). False when they are not in the call.</summary>
    Task<bool> RemoveParticipantAsync(string room, string identity, CancellationToken ct);
}

/// <summary>
/// RoomService over Twirp JSON (<c>POST {ApiUrl}/twirp/livekit.RoomService/{Method}</c>) with a short-lived admin
/// token per request. 3 s per attempt, one retry on a 5xx or a connection failure, never on a timeout. Neither the
/// requests nor the answers are logged: only the method and the status.
/// </summary>
public sealed partial class LiveKitRooms(HttpClient http, LiveKitTokens tokens, IOptions<LiveKitOptions> options, ILogger<LiveKitRooms> log) : ILiveKitRooms
{
    public const string ClientName = "livekit";
    public static readonly TimeSpan AttemptTimeout = TimeSpan.FromSeconds(3);

    /// <summary>Room settings of research R21.</summary>
    public const int EmptyTimeoutSeconds = 300;
    public const int DepartureTimeoutSeconds = 20;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
    };

    public async Task CreateRoomAsync(string room, int maxParticipants, CancellationToken ct)
    {
        using var doc = await CallAsync("CreateRoom", room, new
        {
            name = room,
            empty_timeout = EmptyTimeoutSeconds,
            departure_timeout = DepartureTimeoutSeconds,
            max_participants = maxParticipants,
        }, ct) ?? throw new LiveKitException("The call server could not open the room.");
    }

    public async Task<bool> DeleteRoomAsync(string room, CancellationToken ct)
    {
        using var doc = await CallAsync("DeleteRoom", room, new { room }, ct);
        return doc is not null;
    }

    public async Task<IReadOnlyList<CallParticipant>> ListParticipantsAsync(string room, CancellationToken ct)
    {
        using var doc = await CallAsync("ListParticipants", room, new { room }, ct);
        return doc?.Deserialize<ListAnswer>(Json)?.Participants?.Select(p => p.ToCall()).ToList() ?? [];
    }

    public async Task<CallParticipant?> GetParticipantAsync(string room, string identity, CancellationToken ct)
    {
        using var doc = await CallAsync("GetParticipant", room, new { room, identity }, ct);
        return doc?.Deserialize<ParticipantInfo>(Json)?.ToCall();
    }

    public async Task<bool> UpdateParticipantAsync(string room, string identity, CallRights permission, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(permission);
        using var doc = await CallAsync("UpdateParticipant", room, new
        {
            room,
            identity,
            // The whole permission, every time: LiveKit replaces it. An empty source list means "every source", so
            // can_publish is false whenever the list is empty (research R20).
            permission = new
            {
                can_subscribe = true,
                can_publish = permission.CanPublish,
                can_publish_data = false,
                can_update_metadata = false,
                can_publish_sources = permission.Sources.Select(s => s.ToUpperInvariant()).ToArray(),
            },
        }, ct);
        return doc is not null;
    }

    public async Task<bool> MutePublishedTrackAsync(string room, string identity, string trackSid, bool muted, CancellationToken ct)
    {
        using var doc = await CallAsync("MutePublishedTrack", room, new { room, identity, track_sid = trackSid, muted }, ct);
        return doc is not null;
    }

    public async Task<bool> RemoveParticipantAsync(string room, string identity, CancellationToken ct)
    {
        using var doc = await CallAsync("RemoveParticipant", room, new { room, identity }, ct);
        return doc is not null;
    }

    /// <summary>The answer, or null on Twirp's <c>not_found</c>. Throws <see cref="LiveKitException"/> on anything else.</summary>
    private async Task<JsonDocument?> CallAsync(string method, string room, object body, CancellationToken ct)
    {
        var baseUrl = options.Value.RoomServiceUrl ?? throw new LiveKitException("No call server is configured.");
        using var req = new HttpRequestMessage(HttpMethod.Post, new Uri(baseUrl, $"/twirp/livekit.RoomService/{method}"))
        {
            Content = JsonContent.Create(body),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AdminToken(room));
        HttpResponseMessage res;
        try
        {
            res = await http.SendAsync(req, ct);
        }
        catch (Exception e) when (e is HttpRequestException or TimeoutException or Polly.Timeout.TimeoutRejectedException
            || (e is TaskCanceledException && !ct.IsCancellationRequested))
        {
            LogUnreachable(log, method, e.GetType().Name);
            throw new LiveKitException("The call server did not answer.", e);
        }
        using (res)
        {
            if (res.StatusCode == HttpStatusCode.NotFound)
            {
                return null;
            }
            if (!res.IsSuccessStatusCode)
            {
                LogFailed(log, method, (int)res.StatusCode);
                throw new LiveKitException("The call server refused the request.");
            }
            await using var stream = await res.Content.ReadAsStreamAsync(ct);
            return await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        }
    }

    /// <summary>The typed client with its own resilience: the default 10 s attempts and 3 retries do not fit a live call.</summary>
    public static IServiceCollection AddLiveKitRooms(IServiceCollection services)
    {
        services.AddSingleton<LiveKitTokens>();
#pragma warning disable EXTEXP0001 // RemoveAllResilienceHandlers is marked for evaluation
        services.AddHttpClient<ILiveKitRooms, LiveKitRooms>(ClientName, c => c.Timeout = TimeSpan.FromSeconds(10))
            .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false })
            .RemoveAllResilienceHandlers()
            .AddResilienceHandler("livekit", pipeline => pipeline
                .AddRetry(new HttpRetryStrategyOptions
                {
                    MaxRetryAttempts = 1,
                    Delay = TimeSpan.FromMilliseconds(200),
                    ShouldHandle = args => ValueTask.FromResult(args.Outcome switch
                    {
                        { Exception: HttpRequestException } => true,
                        { Result: { } r } => (int)r.StatusCode >= 500,
                        _ => false,
                    }),
                })
                .AddTimeout(AttemptTimeout));
#pragma warning restore EXTEXP0001
        return services;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Call server {Method} did not answer ({Error})")]
    private static partial void LogUnreachable(ILogger logger, string method, string error);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Call server {Method} answered {Status}")]
    private static partial void LogFailed(ILogger logger, string method, int status);

    private sealed record ListAnswer(List<ParticipantInfo>? Participants);

    private sealed record ParticipantInfo(string? Identity, string? Name, string? State, PermissionInfo? Permission, List<TrackInfo>? Tracks)
    {
        public CallParticipant ToCall()
        {
            var publish = Permission?.CanPublish == true;
            var sources = Permission?.CanPublishSources ?? [];
            // LiveKit reads an empty list with can_publish as "every source": read it the same way.
            var every = publish && sources.Count == 0;
            var permission = new CallRights(
                publish && (every || sources.Contains("MICROPHONE", StringComparer.OrdinalIgnoreCase)),
                publish && (every || sources.Contains("CAMERA", StringComparer.OrdinalIgnoreCase)));
            return new CallParticipant(Identity ?? "", Name ?? "", State ?? "JOINING", permission,
                [.. (Tracks ?? []).Select(t => new CallTrack(t.Sid ?? "", (t.Source ?? "unknown").ToLowerInvariant(), t.Muted))]);
        }
    }

    private sealed record PermissionInfo(bool CanPublish, List<string>? CanPublishSources);

    private sealed record TrackInfo(string? Sid, string? Source, bool Muted);
}
