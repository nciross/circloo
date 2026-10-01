using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Circloo.Api.Email;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;
using Testcontainers.PostgreSql;

namespace Circloo.Api.Tests.Infrastructure;

/// <summary>One real Postgres for the whole test run (constitution VI: test against the real engine).</summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    static PostgresFixture()
    {
        // Ryuk is unreliable on Podman; containers are disposed explicitly below.
        Environment.SetEnvironmentVariable("TESTCONTAINERS_RYUK_DISABLED", "true");
    }

    public PostgreSqlContainer Container { get; } = new PostgreSqlBuilder("postgres:17-alpine").Build();

    public Task InitializeAsync() => Container.StartAsync();

    public Task DisposeAsync() => Container.DisposeAsync().AsTask();
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<PostgresFixture>
{
    public const string Name = "api";
}

public sealed class CapturingEmailSender : IEmailSender
{
    public ConcurrentQueue<EmailMessage> Sent { get; } = new();

    public Task SendAsync(EmailMessage message, CancellationToken ct)
    {
        Sent.Enqueue(message);
        return Task.CompletedTask;
    }
}

public sealed partial class ApiFactory(string connectionString, IDictionary<string, string?>? overrides = null, FakeChatClient? fakeAi = null)
    : WebApplicationFactory<Program>
{
    public FakeTimeProvider Clock { get; } = new(DateTimeOffset.Parse("2026-10-01T08:00:00Z", System.Globalization.CultureInfo.InvariantCulture));
    public CapturingEmailSender Emails { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:circloodb", connectionString);
        builder.UseSetting("Security:Pepper", Convert.ToBase64String(new byte[32].Select((_, i) => (byte)(i * 7 + 3)).ToArray()));
        builder.UseSetting("RateLimits:OtpRequestsPerIpPerHour", "10000");
        builder.UseSetting("RateLimits:OtpVerifiesPerIpPer10Min", "10000");
        foreach (var (k, v) in overrides ?? new Dictionary<string, string?>())
        {
            builder.UseSetting(k, v);
        }
        builder.ConfigureServices(s =>
        {
            s.RemoveAll<TimeProvider>();
            s.AddSingleton<TimeProvider>(Clock);
            s.RemoveAll<IEmailSender>();
            s.AddSingleton<IEmailSender>(Emails);
            if (fakeAi is not null)
            {
                s.RemoveAll<Microsoft.Extensions.AI.IChatClient>();
                s.AddSingleton<Microsoft.Extensions.AI.IChatClient>(fakeAi);
            }
        });
    }

    public HttpClient CreateHttpsClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });

    /// <summary>Waits for the outbox worker to deliver the latest code sent to <paramref name="email"/>.</summary>
    public async Task<string> WaitForCodeAsync(string email, int previousCount = 0)
    {
        for (var i = 0; i < 100; i++)
        {
            var mails = Emails.Sent.Where(m => m.To == email).ToList();
            if (mails.Count > previousCount)
            {
                return CodeRegex().Match(mails[^1].Text).Value;
            }
            await Task.Delay(50);
        }
        throw new TimeoutException($"No code email for {email}");
    }

    public int EmailCount(string email) => Emails.Sent.Count(m => m.To == email);

    [GeneratedRegex(@"\b\d{6}\b")]
    private static partial Regex CodeRegex();
}

public static class ClientExtensions
{
    public static async Task<string> CsrfAsync(this HttpClient client)
    {
        var res = await client.GetAsync(new Uri("/api/auth/csrf", UriKind.Relative));
        res.EnsureSuccessStatusCode();
        return Token(res) ?? throw new InvalidOperationException("No XSRF-TOKEN cookie");
    }

    private static string? Token(HttpResponseMessage res) =>
        res.Headers.TryGetValues("Set-Cookie", out var cookies)
            ? cookies.Select(c => c.Split(';')[0]).Where(c => c.StartsWith("XSRF-TOKEN=", StringComparison.Ordinal)).Select(c => c["XSRF-TOKEN=".Length..]).LastOrDefault()
            : null;

    public static async Task<HttpResponseMessage> PostJsonAsync(this HttpClient client, string url, object body, string? csrf)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = JsonContent.Create(body) };
        if (csrf is not null)
        {
            req.Headers.Add("X-XSRF-TOKEN", csrf);
        }
        return await client.SendAsync(req);
    }

    public static async Task<HttpResponseMessage> DeleteAsync(this HttpClient client, string url, string csrf)
    {
        using var req = new HttpRequestMessage(HttpMethod.Delete, url);
        req.Headers.Add("X-XSRF-TOKEN", csrf);
        return await client.SendAsync(req);
    }

    public static async Task<HttpResponseMessage> PutJsonAsync(this HttpClient client, string url, object body, string? csrf)
    {
        using var req = new HttpRequestMessage(HttpMethod.Put, url) { Content = JsonContent.Create(body) };
        if (csrf is not null)
        {
            req.Headers.Add("X-XSRF-TOKEN", csrf);
        }
        return await client.SendAsync(req);
    }

    /// <summary>Full sign-in; returns the fresh CSRF token bound to the new identity.</summary>
    public static async Task<string> SignInAsync(this HttpClient client, ApiFactory factory, string email)
    {
        var csrf = await client.CsrfAsync();
        var before = factory.EmailCount(email);
        (await client.PostJsonAsync("/api/auth/otp/request", new { email, locale = "en" }, csrf)).EnsureSuccessStatusCode();
        var code = await factory.WaitForCodeAsync(email, before);
        var res = await client.PostJsonAsync("/api/auth/otp/verify", new { email, code }, csrf);
        res.EnsureSuccessStatusCode();
        return Token(res) ?? throw new InvalidOperationException("No refreshed XSRF token after sign-in");
    }
}
