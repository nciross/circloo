using System.Collections.Concurrent;
using Circloo.Api.Discussion;
using Microsoft.Extensions.Logging;

namespace Circloo.Api.Tests.Infrastructure;

/// <summary>A call server in memory for the endpoint and hub tests (spec 009 R30); the real one is <see cref="LiveKitFixture"/>.</summary>
public sealed class FakeLiveKitRooms : ILiveKitRooms
{
    public ConcurrentQueue<(string Room, int MaxParticipants)> Created { get; } = new();

    /// <summary>When true, every call fails like an unreachable call server.</summary>
    public bool Down { get; set; }

    public Task CreateRoomAsync(string room, int maxParticipants, CancellationToken ct)
    {
        ThrowIfDown();
        Created.Enqueue((room, maxParticipants));
        return Task.CompletedTask;
    }

    public Task<bool> DeleteRoomAsync(string room, CancellationToken ct) => Answer(true);

    public Task<IReadOnlyList<CallParticipant>> ListParticipantsAsync(string room, CancellationToken ct)
    {
        ThrowIfDown();
        return Task.FromResult<IReadOnlyList<CallParticipant>>([]);
    }

    public Task<CallParticipant?> GetParticipantAsync(string room, string identity, CancellationToken ct)
    {
        ThrowIfDown();
        return Task.FromResult<CallParticipant?>(null);
    }

    public Task<bool> UpdateParticipantAsync(string room, string identity, CallRights permission, CancellationToken ct) => Answer(false);

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
