using Circloo.Api.Security;
using Circloo.Api.Tests.Infrastructure;

namespace Circloo.Api.Tests.Discussion;

/// <summary>Issue #216 (T901): camera and microphone only on the room routes (spec 009 R15).</summary>
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
