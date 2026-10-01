using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Circloo.Api.Tests.Infrastructure;

namespace Circloo.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class SessionAndProfileTests(PostgresFixture pg) : IAsyncLifetime
{
    private ApiFactory _factory = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString());
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private static string NewEmail() => $"user-{Guid.NewGuid():N}@example.test";

    [Fact]
    public async Task Me_requires_a_session()
    {
        var res = await _factory.CreateHttpsClient().GetAsync(new Uri("/api/me", UriKind.Relative));
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Profile_is_completed_with_validated_name_and_locale()
    {
        var client = _factory.CreateHttpsClient();
        var csrf = await client.SignInAsync(_factory, NewEmail());

        var me = await client.GetFromJsonAsync<JsonElement>("/api/me");
        Assert.False(me.GetProperty("profileCompleted").GetBoolean());

        var bad = await client.PutJsonAsync("/api/me/profile", new { displayName = "   ", locale = "de" }, csrf);
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        var errors = (await bad.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors");
        Assert.True(errors.TryGetProperty("displayName", out _));
        Assert.True(errors.TryGetProperty("locale", out _));

        var tooLong = await client.PutJsonAsync("/api/me/profile", new { displayName = new string('a', 41), locale = "ar" }, csrf);
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);

        var spoof = await client.PutJsonAsync("/api/me/profile", new { displayName = "Amina\u202Enimda", locale = "en" }, csrf);
        Assert.Equal(HttpStatusCode.BadRequest, spoof.StatusCode);

        var ok = await client.PutJsonAsync("/api/me/profile", new { displayName = "  يوسف  ", locale = "ar" }, csrf);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var body = await ok.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("يوسف", body.GetProperty("displayName").GetString());
        Assert.True(body.GetProperty("profileCompleted").GetBoolean());
    }

    [Fact]
    public async Task Sign_out_ends_the_current_session()
    {
        var client = _factory.CreateHttpsClient();
        var csrf = await client.SignInAsync(_factory, NewEmail());
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostJsonAsync("/api/auth/signout", new { }, csrf)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(new Uri("/api/me", UriKind.Relative))).StatusCode);
    }

    [Fact]
    public async Task Sign_out_everywhere_ends_every_session()
    {
        var email = NewEmail();
        var phone = _factory.CreateHttpsClient();
        var laptop = _factory.CreateHttpsClient();
        var phoneCsrf = await phone.SignInAsync(_factory, email);
        await laptop.SignInAsync(_factory, email);
        Assert.Equal(HttpStatusCode.OK, (await laptop.GetAsync(new Uri("/api/me", UriKind.Relative))).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await phone.PostJsonAsync("/api/auth/signout-everywhere", new { }, phoneCsrf)).StatusCode);

        // The revoked session is evicted from this node's cache immediately; other nodes within 30 s.
        Assert.Equal(HttpStatusCode.Unauthorized, (await laptop.GetAsync(new Uri("/api/me", UriKind.Relative))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await phone.GetAsync(new Uri("/api/me", UriKind.Relative))).StatusCode);
    }

    [Fact]
    public async Task Public_spark_respects_language_and_kids_safe_filter()
    {
        var client = _factory.CreateHttpsClient();
        foreach (var lang in new[] { "en", "fr", "ar", "es" })
        {
            var spark = await client.GetFromJsonAsync<JsonElement>($"/api/public/sparks/random?lang={lang}");
            Assert.Equal(lang, spark.GetProperty("lang").GetString());
            Assert.Contains(spark.GetProperty("kind").GetString(), new[] { "icebreaker", "would-you-rather" });
        }
        var unsupported = await client.GetAsync(new Uri("/api/public/sparks/random?lang=de", UriKind.Relative));
        Assert.Equal(HttpStatusCode.BadRequest, unsupported.StatusCode);
    }

    [Fact]
    public async Task Unknown_api_route_is_404_not_the_spa()
    {
        var res = await _factory.CreateHttpsClient().GetAsync(new Uri("/api/nope", UriKind.Relative));
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }
}
