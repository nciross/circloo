// circloo local platform: everything runs on this machine at zero cloud cost (constitution IX).
using System.Net.Sockets;
using System.Text.RegularExpressions;

var builder = DistributedApplication.CreateBuilder(args);

// Generated once and persisted in the AppHost user-secrets; Key Vault provides it in Azure.
var pepper = builder.AddParameter("otp-pepper", new GenerateParameterDefault { MinLength = 48, Special = false }, secret: true, persist: true);

var postgres = builder.AddPostgres("postgres")
    .WithDataVolume("circloo-postgres")
    .WithLifetime(ContainerLifetime.Persistent);
var db = postgres.AddDatabase("circloodb");

// Captures every email locally (SMTP + web UI). Nothing leaves the machine.
var mailpit = builder.AddMailPit("mailpit");

// Blob Storage emulator (Azurite) for slide pictures; the real storage account in Azure (spec 006).
var storage = builder.AddAzureStorage("storage")
    // The Azure SDK can be ahead of Azurite on storage API versions. Aspire already starts Azurite with
    // --skipApiVersionCheck; calling WithApiVersionCheck(enable: false) in Aspire 13.6 removes that flag (#139), so it is
    // not called. The container is recreated on every run (not persistent), so its arguments always apply; the named
    // volume keeps the slides.
    .RunAsEmulator(azurite => azurite.WithDataVolume("circloo-azurite"));
var blobs = storage.AddBlobs("blobs");

// Turns .pptx decks into PDF (LibreOffice inside Gotenberg), isolated from the API and its secrets (spec 006, R1).
// Webhooks, download-from and the Chromium routes are off, and decks reach it without external links (spec 006 threat
// model). The API does not wait for it, so the first (large) image pull never blocks start-up; uploads stay "processing"
// until it is up.
var converter = builder.AddContainer("converter", "gotenberg/gotenberg", "8.37.0") // same pin as infra/modules/app.bicep
    .WithArgs("gotenberg", "--api-timeout=120s", "--chromium-disable-routes=true", "--webhook-disable=true", "--api-disable-download-from=true", "--prometheus-disable-collect=true")
    .WithHttpEndpoint(targetPort: 3000, name: "http")
    .WithHttpHealthCheck("/health", endpointName: "http")
    .WithLifetime(ContainerLifetime.Persistent);

// Group calls on a self-hosted LiveKit server (spec 009, research R30). Configured by livekit.dev.yaml: no TURN, no
// egress, rooms opened only by the API. All three ports are fixed and not proxied: Aspire's proxy carries no UDP, and
// the browser must reach the exact address and ports LiveKit advertises. Free them before starting.
var livekitSecret = builder.AddParameter("livekit-secret", new GenerateParameterDefault { MinLength = 48, Special = false }, secret: true, persist: true);
// The address LiveKit gives browsers for media. Set it to this machine's LAN address to join from a phone.
var livekitNodeIp = builder.AddParameter("livekit-node-ip", "127.0.0.1");
var livekit = builder.AddContainer("livekit", "livekit/livekit-server", "v1.13.7") // same pin as LiveKitFixture and infra/ (T917)
    .WithHttpEndpoint(port: 7880, targetPort: 7880, name: "http", isProxied: false)
    .WithEndpoint(port: 7881, targetPort: 7881, scheme: "tcp", name: "rtc-tcp", isProxied: false)
    .WithEndpoint(port: 7882, targetPort: 7882, scheme: "udp", name: "rtc-udp", isProxied: false, protocol: ProtocolType.Udp)
    .WithEnvironment("LIVEKIT_KEYS", ReferenceExpression.Create($"circloo-dev: {livekitSecret}"))
    .WithHttpHealthCheck("/", endpointName: "http");

var api = builder.AddProject<Projects.Circloo_Api>("api")
    .WithReference(db).WaitFor(db)
    .WithReference(mailpit).WaitFor(mailpit)
    .WithReference(blobs).WaitFor(blobs)
    .WithEnvironment("Presentations__ConverterUrl", converter.GetEndpoint("http"))
    .WithEnvironment("Security__Pepper", pepper)
    .WithEnvironment("Ai__Provider", "Seed") // zero cost: remix seeds locally; switch to OpenAICompatible for Foundry Local
    // Local only: the e2e suite signs in many times from one IP. Production keeps the strict defaults.
    .WithEnvironment("RateLimits__OtpRequestsPerIpPerHour", "500")
    .WithEnvironment("RateLimits__OtpVerifiesPerIpPer10Min", "500")
    // Local only: e2e joins many guests from one address (spec 008 big circles).
    .WithEnvironment("RateLimits__CircleJoinsPerIpPer10Min", "5000")
    .WithEnvironment("RateLimits__CircleJoinsPerIpAndCodePer10Min", "1000")
    // The seed provider costs nothing: a roomy shared budget so repeated local test runs never hit it.
    .WithEnvironment("Ai__DailyGlobal", "100000")
    // Calls: the browser signals on localhost, the API calls RoomService on the container endpoint. Like the converter,
    // the API does not wait for LiveKit; calls answer "try again" until it is up.
    .WithEnvironment("LiveKit__Url", "ws://localhost:7880")
    .WithEnvironment("LiveKit__ApiUrl", livekit.GetEndpoint("http"))
    .WithEnvironment("LiveKit__ApiKey", "circloo-dev")
    .WithEnvironment("LiveKit__ApiSecret", livekitSecret)
    .WithHttpHealthCheck("/health");

// The YAML body with its placeholders filled; the webhook goes to the API as the container sees it.
livekit.WithEnvironment("LIVEKIT_CONFIG", LiveKitConfig(
    File.ReadAllText(Path.Combine(builder.AppHostDirectory, "livekit.dev.yaml")),
    new Dictionary<string, object>
    {
        ["NODE_IP"] = livekitNodeIp.Resource,
        ["WEBHOOK_URL"] = ReferenceExpression.Create($"{api.GetEndpoint("http")}/api/livekit/webhook"),
    }));

builder.AddViteApp("web", "../web")
    .WithReference(api).WaitFor(api)
    .WithExternalHttpEndpoints();

builder.Build().Run();

// Replaces each ${NAME} in the YAML with its value; an unknown placeholder stops the AppHost at start.
static ReferenceExpression LiveKitConfig(string yaml, Dictionary<string, object> values)
{
    var body = new ReferenceExpressionBuilder();
    var at = 0;
    foreach (Match m in Regex.Matches(yaml, @"\$\{([A-Z_]+)\}"))
    {
        body.AppendLiteral(yaml[at..m.Index]);
        body.AppendValueProvider(values.TryGetValue(m.Groups[1].Value, out var value)
            ? value
            : throw new InvalidOperationException($"livekit.dev.yaml: no value for ${{{m.Groups[1].Value}}}."));
        at = m.Index + m.Length;
    }
    body.AppendLiteral(yaml[at..]);
    return body.Build();
}
