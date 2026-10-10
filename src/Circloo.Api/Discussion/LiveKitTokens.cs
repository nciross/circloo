using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace Circloo.Api.Discussion;

/// <summary>A call pass for one member and one room. The token is a credential: returned once, never logged or stored.</summary>
public sealed record CallPass(string Token, DateTimeOffset ExpiresAt);

/// <summary>
/// LiveKit access tokens signed by the API itself (spec 009, research R20): a JWT with HS256, the API key as
/// <c>iss</c> and the API secret as the HMAC key. No SDK: the format is small and checked against the real server in
/// <c>LiveKitRoomsTests</c>.
/// </summary>
public sealed class LiveKitTokens(IOptions<LiveKitOptions> options, TimeProvider clock)
{
    /// <summary>Accepts a call server clock a little behind ours.</summary>
    public static readonly TimeSpan NotBeforeSkew = TimeSpan.FromSeconds(10);

    /// <summary>Server-to-server tokens live just long enough for one call and its retry.</summary>
    public static readonly TimeSpan AdminLifetime = TimeSpan.FromSeconds(60);

    private static readonly byte[] Header = Encoding.UTF8.GetBytes("""{"alg":"HS256","typ":"JWT"}""");

    /// <summary>
    /// The browser's pass (research R20, R21): <c>sub</c> is the member id, <c>name</c> the display name already shown
    /// to the circle. It may join and listen; it may publish only the sources of <paramref name="permission"/>, never
    /// data, metadata, screen share or any admin right. With nothing to publish it says <c>canPublish: false</c> and
    /// carries no source list, because LiveKit reads an empty list as "every source".
    /// </summary>
    public CallPass JoinPass(string room, Guid memberId, string name, CallRights permission)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(room);
        ArgumentNullException.ThrowIfNull(name);
        ArgumentNullException.ThrowIfNull(permission);
        var now = clock.GetUtcNow();
        var expires = now.AddMinutes(options.Value.TokenMinutes);
        var video = new JsonObject
        {
            ["room"] = room,
            ["roomJoin"] = true,
            ["canSubscribe"] = true,
            ["canPublish"] = permission.CanPublish,
            ["canPublishData"] = false,
            ["canUpdateOwnMetadata"] = false,
        };
        if (permission.CanPublish)
        {
            video["canPublishSources"] = new JsonArray([.. permission.Sources.Select(s => (JsonNode?)JsonValue.Create(s))]);
        }
        var claims = Claims(now, expires);
        claims["sub"] = memberId.ToString();
        claims["name"] = name;
        claims["jti"] = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(16));
        claims["video"] = video;
        return new CallPass(Sign(claims), expires);
    }

    /// <summary>The API's own token for RoomService calls on one room. Never sent to a browser.</summary>
    public string AdminToken(string room)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(room);
        var now = clock.GetUtcNow();
        var claims = Claims(now, now + AdminLifetime);
        claims["video"] = new JsonObject
        {
            ["room"] = room,
            ["roomAdmin"] = true,
            ["roomCreate"] = true,
            ["roomList"] = true,
        };
        return Sign(claims);
    }

    private JsonObject Claims(DateTimeOffset now, DateTimeOffset expires) => new()
    {
        ["iss"] = options.Value.ApiKey,
        ["nbf"] = (now - NotBeforeSkew).ToUnixTimeSeconds(),
        ["exp"] = expires.ToUnixTimeSeconds(),
    };

    private string Sign(JsonObject claims)
    {
        var secret = options.Value.ApiSecret;
        if (string.IsNullOrEmpty(secret) || string.IsNullOrEmpty(options.Value.ApiKey))
        {
            throw new InvalidOperationException("No call server is configured.");
        }
        var signingInput = $"{Base64Url.EncodeToString(Header)}.{Base64Url.EncodeToString(Encoding.UTF8.GetBytes(claims.ToJsonString()))}";
        var signature = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(signingInput));
        return $"{signingInput}.{Base64Url.EncodeToString(signature)}";
    }
}
