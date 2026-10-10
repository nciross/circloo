using Circloo.Api.Security;
using Circloo.Api.Tests.Infrastructure;

namespace Circloo.Api.Tests.Discussion;

/// <summary>Issues #216 (T901) and #259 (T919): camera and microphone only on the room routes, and the call server in <c>connect-src</c> (spec 009 R15, R29).</summary>
[Collection(ApiCollection.Name)]
public sealed class SecurityHeaderTests(PostgresFixture pg) : IAsyncLifetime
{
    private ApiFactory _factory = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString());
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private async Task<string> PolicyAsync(string path)
    {
        using var http = _factory.CreateHttpsClient();
        using var res = await http.GetAsync(new Uri(path, UriKind.Relative));
        return string.Join(",", res.Headers.GetValues("Permissions-Policy"));
    }

    [Fact]
    public async Task The_room_routes_may_use_camera_and_microphone_and_nothing_else_may()
    {
        var id = Guid.NewGuid();
        Assert.Equal("camera=(self), microphone=(self), geolocation=()", await PolicyAsync($"/c/{id}"));
        Assert.Equal("camera=(self), microphone=(self), geolocation=()", await PolicyAsync($"/app/circles/{id}"));
        Assert.Equal("camera=(), microphone=(), geolocation=()", await PolicyAsync($"/app/circles/{id}/audience"));
        Assert.Equal("camera=(), microphone=(), geolocation=()", await PolicyAsync("/"));
        Assert.Equal("camera=(), microphone=(), geolocation=()", await PolicyAsync("/app/circles/new"));
        Assert.Equal("camera=(), microphone=(), geolocation=()", await PolicyAsync("/api/auth/csrf"));
    }

    private static async Task<(string Csp, string Permissions)> HeadersAsync(ApiFactory factory, string path)
    {
        using var http = factory.CreateHttpsClient();
        using var res = await http.GetAsync(new Uri(path, UriKind.Relative));
        return (string.Join(",", res.Headers.GetValues("Content-Security-Policy")), string.Join(",", res.Headers.GetValues("Permissions-Policy")));
    }

    [Fact]
    public async Task Without_a_call_server_connect_src_stays_self_only()
    {
        var (csp, _) = await HeadersAsync(_factory, "/");

        Assert.Equal(SecurityHeaders.ContentSecurityPolicy, csp);
        Assert.Contains("connect-src 'self';", csp, StringComparison.Ordinal);
    }

    [Fact]
    public async Task With_a_call_server_connect_src_gains_its_two_origins_and_nothing_else_changes()
    {
        await using var factory = new ApiFactory(pg.Container.GetConnectionString(), new Dictionary<string, string?>
        {
            ["LiveKit:Url"] = "ws://localhost:7880",
            ["LiveKit:ApiUrl"] = "http://livekit.internal:7880",
            ["LiveKit:ApiKey"] = LiveKitFixture.ApiKey,
            ["LiveKit:ApiSecret"] = LiveKitFixture.ApiSecret,
        });
        var id = Guid.NewGuid();
        var expected = SecurityHeaders.ContentSecurityPolicy.Replace("connect-src 'self';", "connect-src 'self' ws://localhost:7880 http://localhost:7880;", StringComparison.Ordinal);

        foreach (var (path, permissions) in new[]
        {
            ($"/app/circles/{id}", "camera=(self), microphone=(self), geolocation=()"),
            ($"/c/{id}", "camera=(self), microphone=(self), geolocation=()"),
            ($"/app/circles/{id}/audience", "camera=(), microphone=(), geolocation=()"),
            ("/api/auth/csrf", "camera=(), microphone=(), geolocation=()"),
        })
        {
            var headers = await HeadersAsync(factory, path);
            Assert.Equal((expected, permissions), headers);
        }
        // The API's own address for RoomService is server-side only: never offered to the browser.
        Assert.DoesNotContain("livekit.internal", expected, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("wss://lk-abc123.francecentral.cloudapp.azure.com", "wss://lk-abc123.francecentral.cloudapp.azure.com https://lk-abc123.francecentral.cloudapp.azure.com")]
    [InlineData("wss://lk.example.com:8443/", "wss://lk.example.com:8443 https://lk.example.com:8443")]
    [InlineData("ws://LOCALHOST:7880", "ws://localhost:7880 http://localhost:7880")]
    [InlineData("", "")]
    [InlineData(null, "")]
    public void The_call_server_origins_come_from_LiveKit_Url_only(string? url, string origins) =>
        Assert.Equal(origins, string.Join(' ', SecurityHeaders.CallServerOrigins(new Circloo.Api.Discussion.LiveKitOptions { Url = url, ApiUrl = "https://other.example" })));

    [Theory]
    [InlineData("/c/6f1c1b9e-7a53-4c1e-9a7d-2f3f4a5b6c7d", true)]
    [InlineData("/app/circles/6f1c1b9e-7a53-4c1e-9a7d-2f3f4a5b6c7d/", true)]
    [InlineData("/app/circles/6f1c1b9e-7a53-4c1e-9a7d-2f3f4a5b6c7d/audience", false)]
    [InlineData("/c/6f1c1b9e7a534c1e9a7d2f3f4a5b6c7d", false)]
    [InlineData("/c/", false)]
    [InlineData("/c/not-a-guid", false)]
    [InlineData("/x/c/6f1c1b9e-7a53-4c1e-9a7d-2f3f4a5b6c7d", false)]
    public void Only_the_exact_room_paths_match(string path, bool room) =>
        Assert.Equal(room, SecurityHeaders.IsRoomRoute(new Microsoft.AspNetCore.Http.PathString(path)));
}
