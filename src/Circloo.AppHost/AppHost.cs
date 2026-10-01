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

var api = builder.AddProject<Projects.Circloo_Api>("api")
    .WithReference(db).WaitFor(db)
    .WithReference(mailpit).WaitFor(mailpit)
    .WithEnvironment("Security__Pepper", pepper)
    .WithEnvironment("Ai__Provider", "Seed") // zero cost: remix seeds locally; switch to OpenAICompatible for Foundry Local
    .WithHttpHealthCheck("/health");

builder.AddViteApp("web", "../web")
    .WithReference(api).WaitFor(api)
    .WithExternalHttpEndpoints();

builder.Build().Run();
