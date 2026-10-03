// circloo local platform: everything runs on this machine at zero cloud cost (constitution IX).
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
    // The Azure SDK can be ahead of Azurite on storage API versions, so the emulator skips that check. The container is
    // recreated on every run (not persistent), so changed arguments always apply; the named volume keeps the slides (#139).
    .RunAsEmulator(azurite => azurite.WithDataVolume("circloo-azurite").WithApiVersionCheck(enable: false));
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
    // The seed provider costs nothing: a roomy shared budget so repeated local test runs never hit it.
    .WithEnvironment("Ai__DailyGlobal", "100000")
    .WithHttpHealthCheck("/health");

builder.AddViteApp("web", "../web")
    .WithReference(api).WaitFor(api)
    .WithExternalHttpEndpoints();

builder.Build().Run();
