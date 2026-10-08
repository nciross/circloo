using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;

namespace Circloo.Api.Tests.Infrastructure;

/// <summary>
/// One real LiveKit server for the call tests (spec 009, research R30), same image as the AppHost. Dev mode uses the
/// public dev key <c>devkey</c>/<c>secret</c>, fine inside a throwaway test container. Only the HTTP port (WebSocket
/// and Twirp RoomService) is exposed: tests validate passes and drive rooms, they carry no media.
/// </summary>
public sealed class LiveKitFixture : IAsyncLifetime
{
    public const string Image = "livekit/livekit-server:v1.13.7"; // same pin as src/Circloo.AppHost/AppHost.cs
    public const string ApiKey = "devkey";
    public const string ApiSecret = "secret";
    private const int HttpPort = 7880;

    static LiveKitFixture()
    {
        // Ryuk is unreliable on Podman; the container is disposed explicitly below.
        Environment.SetEnvironmentVariable("TESTCONTAINERS_RYUK_DISABLED", "true");
    }

    public IContainer Container { get; } = new ContainerBuilder(Image)
        .WithCommand("--dev", "--bind", "0.0.0.0")
        .WithPortBinding(HttpPort, assignRandomHostPort: true)
        .WithWaitStrategy(Wait.ForUnixContainer().UntilHttpRequestIsSucceeded(r => r.ForPort(HttpPort).ForPath("/")))
        .Build();

    /// <summary>The HTTP address of the server, for RoomService calls and <c>/rtc/validate</c>.</summary>
    public Uri ApiUrl => new($"http://{Container.Hostname}:{Container.GetMappedPublicPort(HttpPort)}/");

    public Task InitializeAsync() => Container.StartAsync();

    public Task DisposeAsync() => Container.DisposeAsync().AsTask();
}

[CollectionDefinition(Name)]
public sealed class LiveKitCollection : ICollectionFixture<LiveKitFixture>
{
    public const string Name = "livekit";
}
