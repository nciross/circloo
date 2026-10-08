using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Circloo.Api.Tests.Discussion;

/// <summary>Reads and checks a call pass the way the call server does, independently of the API's signer.</summary>
public static class CallPassReader
{
    public static JsonElement Header(string token) => Part(token, 0);

    public static JsonElement Claims(string token) => Part(token, 1);

    /// <summary>True when the HS256 signature matches <paramref name="secret"/>.</summary>
    public static bool SignedWith(string token, string secret)
    {
        var parts = token.Split('.');
        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes($"{parts[0]}.{parts[1]}"));
        return CryptographicOperations.FixedTimeEquals(expected, Base64Url.DecodeFromChars(parts[2]));
    }

    private static JsonElement Part(string token, int index)
    {
        var parts = token.Split('.');
        Assert.Equal(3, parts.Length);
        return JsonDocument.Parse(Base64Url.DecodeFromChars(parts[index])).RootElement.Clone();
    }
}
