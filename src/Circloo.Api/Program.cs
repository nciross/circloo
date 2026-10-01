using Circloo.Api;
using Circloo.Api.Auth;
using Circloo.Api.Data;
using Circloo.Api.Email;
using Circloo.Api.Security;
using Circloo.Api.Sparks;
using Circloo.Api.Users;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDbContext<CirclooDbContext>("circloodb");

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddProblemDetails();
builder.Services.AddMemoryCache();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);

builder.Services.AddOptions<SecurityOptions>().BindConfiguration(SecurityOptions.Section);
builder.Services.AddOptions<OtpOptions>().BindConfiguration(OtpOptions.Section);
builder.Services.AddOptions<RateLimitOptions>().BindConfiguration(RateLimitOptions.Section);
builder.Services.AddOptions<EmailOptions>().BindConfiguration(EmailOptions.Section);

builder.Services.AddDataProtection()
    .SetApplicationName("circloo")
    .PersistKeysToDbContext<CirclooDbContext>();

builder.Services.AddCirclooAuthentication();
builder.Services.AddCirclooAntiforgery();
builder.Services.AddCirclooRateLimits(builder.Configuration);
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.ForwardLimit = 1;
    // Container Apps ingress is the only hop; the app is not reachable directly.
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

builder.Services.AddSingleton<Hasher>();
builder.Services.AddScoped<AuditLog>();
builder.Services.AddScoped<OtpService>();
builder.Services.AddScoped<EmailOutbox>();
builder.Services.AddSingleton<EmailOutboxSignal>();
builder.Services.AddSingleton<EmailTemplates>();
builder.Services.AddSingleton<SparkCatalog>();
builder.Services.AddHostedService<EmailOutboxWorker>();
if (builder.Configuration["Email:Provider"] == "Acs")
{
    builder.Services.AddSingleton<IEmailSender, AcsEmailSender>();
}
else
{
    builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();
}

var app = builder.Build();

// Fail fast on a missing secret instead of running insecurely.
_ = app.Services.GetRequiredService<Hasher>();

if (app.Configuration.GetValue("Database:MigrateOnStartup", true))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<CirclooDbContext>().Database.MigrateAsync();
}

if (app.Configuration.GetValue<bool>("Security:TrustForwardedHeaders"))
{
    app.UseForwardedHeaders();
}
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseSecurityHeaders(app.Environment);
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        // Vite emits content-hashed file names under /assets: cache them forever.
        if (ctx.Context.Request.Path.StartsWithSegments("/assets"))
        {
            ctx.Context.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        }
    },
});

app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

var api = app.MapGroup("/api").RequireAntiforgery();
api.MapAuthEndpoints();
api.MapMeEndpoints();
api.MapPublicSparkEndpoints();
api.MapFallback(() => Results.NotFound());

app.MapDefaultEndpoints();
app.MapFallbackToFile("index.html");

await app.RunAsync();

public partial class Program;
