using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;

namespace Circloo.Api.Tests.Infrastructure;

/// <summary>
/// One real LiveKit server for the call tests (spec 009, research R30), same image as the AppHost. Dev mode, but with
/// its own key (<c>--keys</c> replaces the public <c>devkey</c>/<c>secret</c>), so the secret meets the API's 32-character
/// minimum (<c>LiveKitOptions</c>) and can be handed to an <c>ApiFactory</c> as is. Only the HTTP port (WebSocket and
/// Twirp RoomService) is exposed: tests validate passes and drive rooms, they carry no media.
/// </summary>
public sealed class LiveKitFixture : IAsyncLifetime
{
    public const string Image = "livekit/livekit-server:v1.13.7"; // same pin as src/Circloo.AppHost/AppHost.cs
    public const string ApiKey = "circloo-test";
    public const string ApiSecret = "circloo-test-secret-0123456789abcdef0123456789"; // test only, 46 characters
    private const int HttpPort = 7880;

    static LiveKitFixture()
    {
        // Ryuk is unreliable on Podman; the container is disposed explicitly below.
        Environment.SetEnvironmentVariable("TESTCONTAINERS_RYUK_DISABLED", "true");
    }

    public IContainer Container { get; } = new ContainerBuilder(Image)
        .WithCommand("--dev", "--bind", "0.0.0.0", "--keys", $"{ApiKey}: {ApiSecret}")
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
