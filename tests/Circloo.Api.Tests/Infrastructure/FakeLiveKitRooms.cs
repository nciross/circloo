using System.Collections.Concurrent;
using Circloo.Api.Discussion;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;

namespace Circloo.Api.Tests.Infrastructure;

/// <summary>
/// A call server in memory for the endpoint and hub tests (spec 009 R30); the real one is <see cref="LiveKitFixture"/>.
/// It records what the API asked for, keeps who is in each room with their permission, and can fail on demand.
/// </summary>
public sealed class FakeLiveKitRooms : ILiveKitRooms
{
    public const string Url = "wss://lk-test.example.com";

    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, CallParticipant>> _rooms = new();

    public ConcurrentQueue<(string Room, int MaxParticipants)> Created { get; } = new();

    public ConcurrentQueue<string> Deleted { get; } = new();

    /// <summary>Every permission update that reached someone in a room, in order.</summary>
    public ConcurrentQueue<(string Room, string Identity, CallRights Permission)> Updates { get; } = new();

    /// <summary>When true, every call fails like an unreachable call server.</summary>
    public bool Down { get; set; }

    /// <summary>Updates for these identities fail, as if the call server broke halfway through a change.</summary>
    public ConcurrentDictionary<string, bool> FailUpdatesFor { get; } = new();

    /// <summary>The settings that make a host think it has a call server (pointing nowhere: this fake answers instead).</summary>
    public static Dictionary<string, string?> Settings() => new()
    {
        ["LiveKit:Url"] = Url,
        ["LiveKit:ApiUrl"] = "https://lk-test.example.com",
        ["LiveKit:ApiKey"] = LiveKitFixture.ApiKey,
        ["LiveKit:ApiSecret"] = LiveKitFixture.ApiSecret,
    };

    /// <summary>Replaces the real RoomService client of a test host with this fake.</summary>
    public void Install(IWebHostBuilder builder) => builder.ConfigureTestServices(s =>
    {
        s.RemoveAll<ILiveKitRooms>();
        s.AddSingleton<ILiveKitRooms>(this);
    });

    /// <summary>Someone connects to a room with a pass carrying <paramref name="permission"/>.</summary>
    public void Join(string room, Guid memberId, CallRights permission) =>
        _rooms.GetOrAdd(room, _ => new())[memberId.ToString()] = new CallParticipant(memberId.ToString(), "", "ACTIVE", permission, []);

    /// <summary>The permission the call server holds for someone now, or null when they are not in the room.</summary>
    public CallRights? PermissionOf(string room, Guid memberId) =>
        _rooms.TryGetValue(room, out var people) && people.TryGetValue(memberId.ToString(), out var p) ? p.Permission : null;

    public IReadOnlyList<(string Identity, CallRights Permission)> UpdatesIn(string room) =>
        [.. Updates.Where(u => u.Room == room).Select(u => (u.Identity, u.Permission))];

    public Task CreateRoomAsync(string room, int maxParticipants, CancellationToken ct)
    {
        ThrowIfDown();
        Created.Enqueue((room, maxParticipants));
        _rooms.GetOrAdd(room, _ => new());
        return Task.CompletedTask;
    }

    public Task<bool> DeleteRoomAsync(string room, CancellationToken ct)
    {
        ThrowIfDown();
        Deleted.Enqueue(room);
        return Task.FromResult(_rooms.TryRemove(room, out _));
    }

    public Task<IReadOnlyList<CallParticipant>> ListParticipantsAsync(string room, CancellationToken ct)
    {
        ThrowIfDown();
        return Task.FromResult<IReadOnlyList<CallParticipant>>(_rooms.TryGetValue(room, out var people) ? [.. people.Values] : []);
    }

    public Task<CallParticipant?> GetParticipantAsync(string room, string identity, CancellationToken ct)
    {
        ThrowIfDown();
        return Task.FromResult(_rooms.TryGetValue(room, out var people) && people.TryGetValue(identity, out var p) ? p : null);
    }

    public Task<bool> UpdateParticipantAsync(string room, string identity, CallRights permission, CancellationToken ct)
    {
        ThrowIfDown();
        if (FailUpdatesFor.ContainsKey(identity))
        {
            throw new LiveKitException("The call server refused the request.");
        }
        if (!_rooms.TryGetValue(room, out var people) || !people.TryGetValue(identity, out var person))
        {
            return Task.FromResult(false);
        }
        people[identity] = person with { Permission = permission };
        Updates.Enqueue((room, identity, permission));
        return Task.FromResult(true);
    }

    public Task<bool> MutePublishedTrackAsync(string room, string identity, string trackSid, bool muted, CancellationToken ct) => Answer(false);

    public Task<bool> RemoveParticipantAsync(string room, string identity, CancellationToken ct) => Answer(false);

    private Task<bool> Answer(bool value)
    {
        ThrowIfDown();
        return Task.FromResult(value);
    }

    private void ThrowIfDown()
    {
        if (Down)
        {
            throw new LiveKitException("The call server did not answer.");
        }
    }
}

/// <summary>Every log line of the host, at every level, to prove what never reaches the logs.</summary>
public sealed class CapturingLoggerProvider : ILoggerProvider
{
    public ConcurrentQueue<string> Lines { get; } = new();

    public ILogger CreateLogger(string categoryName) => new Capture(this, categoryName);

    public void Dispose() { }

    private sealed class Capture(CapturingLoggerProvider owner, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull
        {
            owner.Lines.Enqueue($"{category} scope: {state}");
            return null;
        }

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            ArgumentNullException.ThrowIfNull(formatter);
            owner.Lines.Enqueue($"{category} {logLevel}: {formatter(state, exception)} {exception}");
            if (state is IEnumerable<KeyValuePair<string, object?>> values)
            {
                foreach (var (key, value) in values)
                {
                    owner.Lines.Enqueue($"{category} {key}={value}");
                }
            }
        }
    }
}
