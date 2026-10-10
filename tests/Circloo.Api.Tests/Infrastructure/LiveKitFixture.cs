using System.Text;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using DotNet.Testcontainers.Networks;

namespace Circloo.Api.Tests.Infrastructure;

/// <summary>
/// One real LiveKit server for the call tests (spec 009, research R30), same image as the AppHost. Dev mode, but with
/// its own key (<c>--keys</c> replaces the public <c>devkey</c>/<c>secret</c>), so the secret meets the API's 32-character
/// minimum (<c>LiveKitOptions</c>) and can be handed to an <c>ApiFactory</c> as is. Only the HTTP port (WebSocket and
/// Twirp RoomService) is exposed: tests validate passes and drive rooms, they carry no media.
/// Its webhooks go to a tiny capture container on the same network (a container cannot reach the test process on
/// every machine), so tests can check the call server's own signed requests (<see cref="WebhooksAsync"/>).
/// </summary>
public sealed class LiveKitFixture : IAsyncLifetime
{
    public const string Image = "livekit/livekit-server:v1.13.7"; // same pin as src/Circloo.AppHost/AppHost.cs
    public const string ApiKey = "circloo-test";
    public const string ApiSecret = "circloo-test-secret-0123456789abcdef0123456789"; // test only, 46 characters
    private const int HttpPort = 7880;
    private const string HooksAlias = "hooks";
    private const string RequestEnd = "--END-OF-REQUEST--";

    static LiveKitFixture()
    {
        // Ryuk is unreliable on Podman; the containers are disposed explicitly below.
        Environment.SetEnvironmentVariable("TESTCONTAINERS_RYUK_DISABLED", "true");
    }

    private readonly INetwork _network = new NetworkBuilder().Build();

    /// <summary>
    /// The capture: BusyBox <c>nc</c> (in an image the tests already pull) takes one request at a time and hands it to
    /// this script, which copies the request line, headers and exact body to stderr, then answers 200.
    /// </summary>
    private const string CaptureScript = """
        cr=$(printf '\r')
        len=0
        while IFS= read -r line; do
          printf '%s\n' "$line" >&2
          line=${line%"$cr"}
          [ -z "$line" ] && break
          case "$line" in [Cc]ontent-[Ll]ength:*) len=${line#*:}; len=${len# } ;; esac
        done
        head -c "$len" >&2
        printf '\n%s\n' "--END-OF-REQUEST--" >&2
        printf 'HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
        """;

    private readonly IContainer _hooks;

    public LiveKitFixture()
    {
        _hooks = new ContainerBuilder("postgres:17-alpine")
            .WithNetwork(_network)
            .WithNetworkAliases(HooksAlias)
            .WithResourceMapping(Encoding.UTF8.GetBytes(CaptureScript.Replace("\r\n", "\n", StringComparison.Ordinal) + "\n"), "/capture.sh")
            .WithEntrypoint("sh", "-c")
            .WithCommand("while true; do nc -l -p 8080 -e sh /capture.sh; done")
            .Build();
        Container = new ContainerBuilder(Image)
            .WithNetwork(_network)
            .WithCommand("--dev", "--bind", "0.0.0.0", "--keys", $"{ApiKey}: {ApiSecret}")
            .WithEnvironment("LIVEKIT_CONFIG", $"webhook:\n  api_key: {ApiKey}\n  urls:\n    - http://{HooksAlias}:8080/api/livekit/webhook\n")
            .WithPortBinding(HttpPort, assignRandomHostPort: true)
            .WithWaitStrategy(Wait.ForUnixContainer().UntilHttpRequestIsSucceeded(r => r.ForPort(HttpPort).ForPath("/")))
            .Build();
    }

    public IContainer Container { get; }

    /// <summary>The HTTP address of the server, for RoomService calls and <c>/rtc/validate</c>.</summary>
    public Uri ApiUrl => new($"http://{Container.Hostname}:{Container.GetMappedPublicPort(HttpPort)}/");

    /// <summary>Every webhook request the call server sent so far: its <c>Authorization</c> header and exact body.</summary>
    public async Task<IReadOnlyList<(string? Authorization, byte[] Body)>> WebhooksAsync()
    {
        var (_, stderr) = await _hooks.GetLogsAsync(timestampsEnabled: false);
        var requests = new List<(string?, byte[])>();
        foreach (var raw in stderr.Split(RequestEnd))
        {
            var split = raw.IndexOf("\r\n\r\n", StringComparison.Ordinal);
            if (split < 0)
            {
                continue;
            }
            var headers = raw[..split].Split("\r\n");
            string? Header(string name) => headers.Select(h => h.Split(':', 2)).Where(h => h.Length == 2 && h[0].Trim().Equals(name, StringComparison.OrdinalIgnoreCase))
                .Select(h => h[1].Trim()).FirstOrDefault();
            var bytes = Encoding.UTF8.GetBytes(raw[(split + 4)..]);
            var length = int.TryParse(Header("Content-Length"), out var n) ? Math.Min(n, bytes.Length) : bytes.Length;
            requests.Add((Header("Authorization"), bytes[..length]));
        }
        return requests;
    }

    /// <summary>What went wrong when a webhook never arrived: the capture's raw output and the call server's webhook lines.</summary>
    public async Task<string> WebhookDiagnosticsAsync()
    {
        var (hooks, hooksErr) = await _hooks.GetLogsAsync(timestampsEnabled: false);
        var (server, serverErr) = await Container.GetLogsAsync(timestampsEnabled: false);
        var lines = (server + serverErr).Split('\n').Where(l => l.Contains("webhook", StringComparison.OrdinalIgnoreCase)).TakeLast(5);
        return $"capture: {hooks.Length} chars [{hooks[..Math.Min(300, hooks.Length)]}] {hooksErr[..Math.Min(300, hooksErr.Length)]}; server: {string.Join(" | ", lines)}";
    }

    public async Task InitializeAsync()
    {
        await _network.CreateAsync();
        await _hooks.StartAsync();
        await Container.StartAsync();
    }

    public async Task DisposeAsync()
    {
        await Container.DisposeAsync();
        await _hooks.DisposeAsync();
        await _network.DisposeAsync();
    }
}

[CollectionDefinition(Name)]
public sealed class LiveKitCollection : ICollectionFixture<LiveKitFixture>
{
    public const string Name = "livekit";
}
