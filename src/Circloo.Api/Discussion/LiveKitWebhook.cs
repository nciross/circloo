using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Decide;
using Circloo.Api.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Circloo.Api.Discussion;

/// <summary>One call server event, reduced to what the API uses. Every id is LiveKit's own (<c>RM_…</c>, <c>PA_…</c>).</summary>
public sealed record LiveKitEvent(string Kind, string? RoomName, string? RoomSid, string? Identity, string? ParticipantSid);

/// <summary>
/// The call server's webhooks (spec 009 research R24, contracts/rest.md): one purpose, enforcement, plus the live
/// roster. A request is believed only when its <c>Authorization</c> JWT is signed with HS256 by <c>LiveKit:ApiSecret</c>,
/// names <c>LiveKit:ApiKey</c> as <c>iss</c>, is within its lifetime and carries the Base64 SHA-256 of the exact body in
/// its <c>sha256</c> claim. The only thing a webhook can cause is removing someone from a call or changing the roster.
/// Events of one circle are handled one after the other, in the background, so the call server gets its answer at
/// once and a join is never overtaken by its own leave.
/// </summary>
public sealed partial class LiveKitWebhook(IServiceScopeFactory scopes, IOptions<LiveKitOptions> options, TimeProvider clock, CallModeration moderation,
    LiveThrottle throttle, ILogger<LiveKitWebhook> log)
{
    public const string Joined = "participant_joined";
    public const string Left = "participant_left";
    public const string ConnectionAborted = "participant_connection_aborted";
    public const string RoomFinished = "room_finished";

    /// <summary>The <c>method</c> of a refused join in the <c>discussion.refused</c> audit row.</summary>
    public const string JoinMethod = "call-join";

    /// <summary>The largest body accepted (contracts/rest.md). LiveKit's events are a few kilobytes.</summary>
    public const int MaxBodyBytes = 64 * 1024;

    /// <summary>An <c>Authorization</c> value longer than this is not a LiveKit token.</summary>
    public const int MaxAuthorizationLength = 4 * 1024;

    /// <summary>Clock difference accepted on <c>exp</c> and <c>nbf</c>, like LiveKit's own receivers (go-jose's default leeway).</summary>
    public static readonly TimeSpan Leeway = TimeSpan.FromMinutes(1);

    /// <summary>How long the handling of one event may take, call server calls included (each has its own 3 s attempts).</summary>
    public static readonly TimeSpan HandlingTimeout = TimeSpan.FromSeconds(15);

    /// <summary>Refused joins write at most this many audit rows per member per minute, like the hub's and the pass's refusals.</summary>
    private const int RefusedAuditsPerMinute = 5;

    private readonly Dictionary<Guid, Task> _tails = [];
    private readonly Lock _gate = new();

    /// <summary>
    /// Whether the request comes from our call server: the token's signature, algorithm, issuer, lifetime and body
    /// hash. Says nothing about why it failed: the caller answers 401 either way.
    /// </summary>
    public bool Verify(string? authorization, ReadOnlySpan<byte> body) => Verify(options.Value, clock.GetUtcNow(), authorization, body);

    /// <summary><see cref="Verify(string?, ReadOnlySpan{byte})"/> with the settings and the time given, for checks without a host.</summary>
    public static bool Verify(LiveKitOptions settings, DateTimeOffset now, string? authorization, ReadOnlySpan<byte> body)
    {
        ArgumentNullException.ThrowIfNull(settings);
        if (!settings.Available || string.IsNullOrEmpty(settings.ApiKey) || string.IsNullOrEmpty(settings.ApiSecret)
            || string.IsNullOrWhiteSpace(authorization) || authorization.Length > MaxAuthorizationLength)
        {
            return false;
        }
        // LiveKit sends the bare token; a "Bearer " prefix is accepted too.
        var token = authorization.Trim();
        if (token.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            token = token[7..].Trim();
        }
        var parts = token.Split('.');
        if (parts.Length != 3 || !TryDecode(parts[0], out var header) || !TryDecode(parts[1], out var payload) || !TryDecode(parts[2], out var signature))
        {
            return false;
        }
        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(settings.ApiSecret), Encoding.ASCII.GetBytes($"{parts[0]}.{parts[1]}"));
        if (!CryptographicOperations.FixedTimeEquals(expected, signature))
        {
            return false;
        }
        try
        {
            using var head = JsonDocument.Parse(header);
            if (head.RootElement.ValueKind != JsonValueKind.Object || !head.RootElement.TryGetProperty("alg", out var alg) || alg.ValueKind != JsonValueKind.String
                || alg.GetString() != "HS256")
            {
                return false;
            }
            using var doc = JsonDocument.Parse(payload);
            var claims = doc.RootElement;
            if (claims.ValueKind != JsonValueKind.Object)
            {
                return false;
            }
            if (!claims.TryGetProperty("iss", out var iss) || iss.ValueKind != JsonValueKind.String || iss.GetString() != settings.ApiKey
                || Seconds(claims, "exp") is not { } exp || now > exp + Leeway
                || (claims.TryGetProperty("nbf", out _) && (Seconds(claims, "nbf") is not { } nbf || now < nbf - Leeway))
                || !claims.TryGetProperty("sha256", out var hash) || hash.ValueKind != JsonValueKind.String)
            {
                return false;
            }
            var actual = Encoding.ASCII.GetBytes(Convert.ToBase64String(SHA256.HashData(body)));
            return CryptographicOperations.FixedTimeEquals(actual, Encoding.UTF8.GetBytes(hash.GetString()!));
        }
        catch (JsonException)
        {
            return false;
        }
    }

    /// <summary>LiveKit's event (protobuf JSON): its kind, room and participant. Null when the body is not one.</summary>
    public static LiveKitEvent? Parse(ReadOnlySpan<byte> body)
    {
        try
        {
            var reader = new Utf8JsonReader(body);
            using var doc = JsonDocument.ParseValue(ref reader);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object || Text(root, "event") is not { } kind)
            {
                return null;
            }
            var room = Child(root, "room");
            var participant = Child(root, "participant");
            return new LiveKitEvent(kind, Text(room, "name"), Text(room, "sid"), Text(participant, "identity"), Text(participant, "sid"));
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Takes a verified event. Joins, leaves and closed rooms of our circles are queued for the circle; anything else
    /// (room started, tracks, another room's name) is ignored.
    /// </summary>
    public void Handle(LiveKitEvent e)
    {
        ArgumentNullException.ThrowIfNull(e);
        if (CallRules.CircleOf(e.RoomName) is not { } circleId)
        {
            return;
        }
        Func<IServiceProvider, CancellationToken, Task>? work = e.Kind switch
        {
            Joined when !string.IsNullOrEmpty(e.Identity) => (services, ct) => EnforceAsync(services, circleId, e, ct),
            Left or ConnectionAborted when Guid.TryParse(e.Identity, out var memberId) => (_, _) =>
            {
                RosterChanged(circleId, moderation.Left(circleId, memberId, e.ParticipantSid));
                return Task.CompletedTask;
            },
            RoomFinished => (_, _) =>
            {
                RosterChanged(circleId, moderation.RoomFinished(circleId, e.RoomSid));
                return Task.CompletedTask;
            },
            _ => null,
        };
        if (work is not null)
        {
            Enqueue(circleId, work);
        }
    }

    /// <summary>Completes when every event of the circle received so far is handled (for tests and orderly shutdowns).</summary>
    public Task IdleAsync(Guid circleId)
    {
        lock (_gate)
        {
            return _tails.TryGetValue(circleId, out var tail) ? tail : Task.CompletedTask;
        }
    }

    /// <summary>
    /// A connection joined the circle's room: it stays only if its member still belongs to the open circle, the call is
    /// on and the animator did not remove them (the call server does not revoke passes, research R22). A refused join
    /// is removed and audited as a refused attempt. An accepted one gets its permission recomputed (a pass minted just
    /// before a video or mode switch would otherwise keep its old rights) and enters the roster. Joins themselves are
    /// never audited.
    /// </summary>
    private async Task EnforceAsync(IServiceProvider services, Guid circleId, LiveKitEvent e, CancellationToken ct)
    {
        var db = services.GetRequiredService<CirclooDbContext>();
        var rooms = services.GetRequiredService<ILiveKitRooms>();
        var room = CallRules.RoomName(circleId);
        var memberId = Guid.TryParse(e.Identity, out var id) ? id : (Guid?)null;
        var member = memberId is null ? null : await db.CircleMembers.AsNoTracking().Include(m => m.Circle)
            .FirstOrDefaultAsync(m => m.Id == memberId && m.CircleId == circleId && m.LeftAt == null, ct);
        var circle = member?.Circle;
        var refusal = member is null ? "not-a-member"
            : !circle!.IsOpen(clock.GetUtcNow()) ? "circle-not-open"
            : !circle.DiscussionOn ? "call-off"
            : moderation.IsRemoved(circleId, member.Id) ? "removed-from-call"
            : null;
        if (refusal is null)
        {
            try
            {
                await services.GetRequiredService<CallPermissions>().ApplyAsync(circle!, member!.Id, ct);
            }
            catch (LiveKitException)
            {
                // Their pass already carries the rules of a moment ago; the next change or pass repairs it.
                LogPermissionNotApplied(log, circleId);
            }
            RosterChanged(circleId, moderation.Joined(circleId, member!.Id, e.ParticipantSid, e.RoomSid));
            return;
        }

        try
        {
            await rooms.RemoveParticipantAsync(room, e.Identity!, ct);
        }
        catch (LiveKitException)
        {
            LogRemovalFailed(log, circleId);
        }
        if (memberId is { } known)
        {
            RosterChanged(circleId, moderation.Left(circleId, known, null));
        }
        var limits = services.GetRequiredService<RoomLimits>();
        if (limits.TryTake(memberId ?? Guid.Empty, "refused-audit", RefusedAuditsPerMinute, TimeSpan.FromMinutes(1)))
        {
            await services.GetRequiredService<AuditLog>().WriteAsync(AuditTypes.DiscussionRefused, member?.UserId,
                detail: new { method = JoinMethod, code = refusal, circle = circleId, member = memberId }, ct: ct);
        }
    }

    private void RosterChanged(Guid circleId, bool changed)
    {
        if (changed)
        {
            CircleHub.RequestRoster(throttle, circleId);
        }
    }

    /// <summary>Runs <paramref name="work"/> after every earlier event of the same circle, with its own scope and timeout.</summary>
    private void Enqueue(Guid circleId, Func<IServiceProvider, CancellationToken, Task> work)
    {
        lock (_gate)
        {
            var previous = _tails.TryGetValue(circleId, out var tail) ? tail : Task.CompletedTask;
            var next = RunAfterAsync(previous, circleId, work);
            _tails[circleId] = next;
            _ = next.ContinueWith(done =>
            {
                lock (_gate)
                {
                    if (_tails.TryGetValue(circleId, out var current) && current == done)
                    {
                        _tails.Remove(circleId);
                    }
                }
            }, CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
        }
    }

    private async Task RunAfterAsync(Task previous, Guid circleId, Func<IServiceProvider, CancellationToken, Task> work)
    {
        await previous.ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing | ConfigureAwaitOptions.ForceYielding);
        using var timeout = new CancellationTokenSource(HandlingTimeout);
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            await work(scope.ServiceProvider, timeout.Token);
        }
        catch (Exception e)
        {
            LogHandlingFailed(log, e, circleId);
        }
    }

    private static bool TryDecode(string part, out byte[] bytes)
    {
        try
        {
            bytes = Base64Url.DecodeFromChars(part);
            return part.Length > 0;
        }
        catch (FormatException)
        {
            bytes = [];
            return false;
        }
    }

    private static DateTimeOffset? Seconds(JsonElement claims, string name) =>
        claims.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var seconds)
            && seconds is > 0 and < 253402300800
            ? DateTimeOffset.FromUnixTimeSeconds(seconds)
            : null;

    private static JsonElement Child(JsonElement parent, string name) =>
        parent.ValueKind == JsonValueKind.Object && parent.TryGetProperty(name, out var child) && child.ValueKind == JsonValueKind.Object ? child : default;

    private static string? Text(JsonElement parent, string name) =>
        parent.ValueKind == JsonValueKind.Object && parent.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    [LoggerMessage(Level = LogLevel.Warning, Message = "A call server webhook was refused ({Reason})")]
    public static partial void LogRefused(ILogger logger, string reason);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Removing a refused participant from the call of circle {CircleId} failed")]
    private static partial void LogRemovalFailed(ILogger logger, Guid circleId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "A joining participant's permission in the call of circle {CircleId} could not be updated")]
    private static partial void LogPermissionNotApplied(ILogger logger, Guid circleId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Handling a call server event for circle {CircleId} failed")]
    private static partial void LogHandlingFailed(ILogger logger, Exception exception, Guid circleId);
}
