using Circloo.Api.Tests.Infrastructure;

namespace Circloo.Api.Tests.Discussion;

/// <summary>The real call server in a container (spec 009, research R30). T919 adds the RoomService tests here.</summary>
[Collection(LiveKitCollection.Name)]
[Trait("Category", "LiveKit")]
public sealed class LiveKitRoomsTests(LiveKitFixture livekit)
{
    [Fact]
    public async Task The_call_server_is_up_and_answers_its_health_check()
    {
        using var http = new HttpClient { BaseAddress = livekit.ApiUrl };

        using var res = await http.GetAsync(new Uri("/", UriKind.Relative));

        Assert.Equal(System.Net.HttpStatusCode.OK, res.StatusCode);
    }
}
