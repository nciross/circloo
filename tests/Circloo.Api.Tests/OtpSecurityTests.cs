using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Circloo.Api.Data;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Circloo.Api.Tests;

/// <summary>SC-006: the security behaviours of one-time code sign-in.</summary>
[Collection(ApiCollection.Name)]
public sealed class OtpSecurityTests(PostgresFixture pg) : IAsyncLifetime
{
    private ApiFactory _factory = null!;
    private HttpClient _client = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString());
        _client = _factory.CreateHttpsClient();
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private static string NewEmail() => $"user-{Guid.NewGuid():N}@example.test";

    private async Task<(string Csrf, string Code)> RequestCodeAsync(string email)
    {
        var csrf = await _client.CsrfAsync();
        var before = _factory.EmailCount(email);
        var res = await _client.PostJsonAsync("/api/auth/otp/request", new { email, locale = "fr" }, csrf);
        Assert.Equal(HttpStatusCode.Accepted, res.StatusCode);
        return (csrf, await _factory.WaitForCodeAsync(email, before));
    }

    [Fact]
    public async Task Correct_code_signs_in_and_creates_the_account_once()
    {
        var email = NewEmail();
        var (csrf, code) = await RequestCodeAsync(email);

        var res = await _client.PostJsonAsync("/api/auth/otp/verify", new { email = email.ToUpperInvariant(), code = $"{code[..3]} {code[3..]}" }, csrf);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("isNewUser").GetBoolean());
        Assert.Equal("fr", body.GetProperty("me").GetProperty("locale").GetString());
        var cookie = Assert.Single(res.Headers.GetValues("Set-Cookie"), c => c.StartsWith("__Host-circloo=", StringComparison.Ordinal));
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", cookie, StringComparison.OrdinalIgnoreCase);

        // Second sign-in reuses the same account.
        var again = _factory.CreateHttpsClient();
        await again.SignInAsync(_factory, email);
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        Assert.Equal(1, await db.Users.CountAsync(u => u.Email == email));
    }

    [Fact]
    public async Task Code_cannot_be_reused()
    {
        var email = NewEmail();
        var (csrf, code) = await RequestCodeAsync(email);
        Assert.Equal(HttpStatusCode.OK, (await _client.PostJsonAsync("/api/auth/otp/verify", new { email, code }, csrf)).StatusCode);

        var other = _factory.CreateHttpsClient();
        var otherCsrf = await other.CsrfAsync();
        var reuse = await other.PostJsonAsync("/api/auth/otp/verify", new { email, code }, otherCsrf);
        Assert.Equal(HttpStatusCode.BadRequest, reuse.StatusCode);
    }

    [Fact]
    public async Task Expired_code_is_rejected()
    {
        var email = NewEmail();
        var (csrf, code) = await RequestCodeAsync(email);
        _factory.Clock.Advance(TimeSpan.FromMinutes(10) + TimeSpan.FromSeconds(1));

        var res = await _client.PostJsonAsync("/api/auth/otp/verify", new { email, code }, csrf);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Five_wrong_attempts_lock_the_code()
    {
        var email = NewEmail();
        var (csrf, code) = await RequestCodeAsync(email);
        var wrong = code == "000000" ? "111111" : "000000";
        for (var i = 0; i < 5; i++)
        {
            Assert.Equal(HttpStatusCode.BadRequest, (await _client.PostJsonAsync("/api/auth/otp/verify", new { email, code = wrong }, csrf)).StatusCode);
        }

        var res = await _client.PostJsonAsync("/api/auth/otp/verify", new { email, code }, csrf);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Newer_code_supersedes_older_one()
    {
        var email = NewEmail();
        var (csrf, first) = await RequestCodeAsync(email);
        var (_, second) = await RequestCodeAsync(email);

        if (first != second)
        {
            Assert.Equal(HttpStatusCode.BadRequest, (await _client.PostJsonAsync("/api/auth/otp/verify", new { email, code = first }, csrf)).StatusCode);
        }
        Assert.Equal(HttpStatusCode.OK, (await _client.PostJsonAsync("/api/auth/otp/verify", new { email, code = second }, csrf)).StatusCode);
    }

    [Fact]
    public async Task Responses_do_not_reveal_whether_an_account_exists()
    {
        var known = NewEmail();
        await _factory.CreateHttpsClient().SignInAsync(_factory, known);
        var unknown = NewEmail();
        var csrf = await _client.CsrfAsync();

        var a = await _client.PostJsonAsync("/api/auth/otp/request", new { email = known, locale = "en" }, csrf);
        var b = await _client.PostJsonAsync("/api/auth/otp/request", new { email = unknown, locale = "en" }, csrf);
        Assert.Equal(a.StatusCode, b.StatusCode);
        Assert.Equal(await a.Content.ReadAsStringAsync(), await b.Content.ReadAsStringAsync());

        var va = await _client.PostJsonAsync("/api/auth/otp/verify", new { email = known, code = "123456" }, csrf);
        var vb = await _client.PostJsonAsync("/api/auth/otp/verify", new { email = NewEmail(), code = "123456" }, csrf);
        Assert.Equal(va.StatusCode, vb.StatusCode);
        Assert.Equal(Problem(await va.Content.ReadAsStringAsync()), Problem(await vb.Content.ReadAsStringAsync()));
    }

    [Fact]
    public async Task Per_email_limit_is_silent_and_sends_nothing()
    {
        var email = NewEmail();
        var csrf = await _client.CsrfAsync();
        for (var i = 0; i < 3; i++)
        {
            Assert.Equal(HttpStatusCode.Accepted, (await _client.PostJsonAsync("/api/auth/otp/request", new { email, locale = "en" }, csrf)).StatusCode);
        }
        await _factory.WaitForCodeAsync(email, 2);

        var fourth = await _client.PostJsonAsync("/api/auth/otp/request", new { email, locale = "en" }, csrf);
        Assert.Equal(HttpStatusCode.Accepted, fourth.StatusCode);
        await Task.Delay(500);
        Assert.Equal(3, _factory.EmailCount(email));
    }

    [Fact]
    public async Task Codes_are_stored_hashed_and_audit_holds_no_raw_email()
    {
        var email = NewEmail();
        var (_, code) = await RequestCodeAsync(email);
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        var challenge = await db.OtpChallenges.SingleAsync(c => c.Email == email);
        Assert.Equal(32, challenge.CodeHash.Length);
        Assert.DoesNotContain(code, Convert.ToHexString(challenge.CodeHash), StringComparison.Ordinal);
        var details = await db.AuditEvents.Where(a => a.Detail != null).Select(a => a.Detail!).ToListAsync();
        Assert.DoesNotContain(details, d => d.Contains(email, StringComparison.OrdinalIgnoreCase) || d.Contains(code, StringComparison.Ordinal));
    }

    [Fact]
    public async Task Unsafe_requests_without_csrf_token_are_rejected()
    {
        var res = await _client.PostJsonAsync("/api/auth/otp/request", new { email = NewEmail(), locale = "en" }, csrf: null);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Contains("antiforgery", await res.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Invalid_email_is_rejected()
    {
        var csrf = await _client.CsrfAsync();
        var res = await _client.PostJsonAsync("/api/auth/otp/request", new { email = "not-an-email", locale = "en" }, csrf);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Security_headers_are_present()
    {
        var res = await _client.GetAsync(new Uri("/api/public/sparks/random?lang=en", UriKind.Relative));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var csp = string.Join(";", res.Headers.GetValues("Content-Security-Policy"));
        Assert.Contains("script-src 'self'", csp, StringComparison.Ordinal);
        Assert.Contains("frame-ancestors 'none'", csp, StringComparison.Ordinal);
        Assert.Equal("nosniff", res.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", res.Headers.GetValues("X-Frame-Options").Single());
    }

    private static string Problem(string json)
    {
        var e = JsonDocument.Parse(json).RootElement;
        return $"{e.GetProperty("type").GetString()}|{e.GetProperty("title").GetString()}|{e.GetProperty("status").GetInt32()}";
    }
}

[Collection(ApiCollection.Name)]
public sealed class RateLimitTests(PostgresFixture pg)
{
    [Fact]
    public async Task Ip_limit_returns_429_with_retry_after()
    {
        await using var factory = new ApiFactory(pg.Container.GetConnectionString(), new Dictionary<string, string?>
        {
            ["RateLimits:OtpRequestsPerIpPerHour"] = "2",
        });
        var client = factory.CreateHttpsClient();
        var csrf = await client.CsrfAsync();
        HttpResponseMessage last = null!;
        for (var i = 0; i < 3; i++)
        {
            last = await client.PostJsonAsync("/api/auth/otp/request", new { email = $"rl-{Guid.NewGuid():N}@example.test", locale = "en" }, csrf);
        }
        Assert.Equal(HttpStatusCode.TooManyRequests, last.StatusCode);
        Assert.True(last.Headers.Contains("Retry-After"));
    }
}
