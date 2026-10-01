using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace Circloo.Api.Security;

public sealed class SecurityOptions
{
    public const string Section = "Security";

    /// <summary>Base64 secret (≥ 32 bytes) used to HMAC one-time codes, emails and IPs. Key Vault in prod.</summary>
    public string Pepper { get; set; } = "";

    /// <summary>Trust X-Forwarded-* headers (only behind the Container Apps ingress).</summary>
    public bool TrustForwardedHeaders { get; set; }
}

/// <summary>Keyed hashing so codes and personal data never sit in readable form (constitution VIII).</summary>
public sealed class Hasher
{
    private readonly byte[] _key;

    public Hasher(IOptions<SecurityOptions> options)
    {
        var pepper = options.Value.Pepper;
        byte[] key;
        try { key = Convert.FromBase64String(pepper); }
        catch (FormatException) { key = Encoding.UTF8.GetBytes(pepper); }
        if (key.Length < 32)
        {
            throw new InvalidOperationException("Security:Pepper must be configured with at least 32 bytes of secret material.");
        }
        _key = key;
    }

    public byte[] Hash(string purpose, string value) =>
        HMACSHA256.HashData(_key, Encoding.UTF8.GetBytes($"{purpose}\u001f{value}"));

    public byte[] Code(string normalizedEmail, string code) => Hash("otp", $"{normalizedEmail}:{code}");

    public byte[] Email(string normalizedEmail) => Hash("email", normalizedEmail);

    public byte[]? Ip(string? ip) => ip is null ? null : Hash("ip", ip);

    public static bool FixedTimeEquals(byte[] a, byte[] b) => CryptographicOperations.FixedTimeEquals(a, b);
}
