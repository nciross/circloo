using System.Net.Mail;

namespace Circloo.Api;

public static class Locales
{
    public static readonly string[] All = ["en", "fr", "ar", "es"];

    public static bool IsSupported(string? locale) => locale is not null && All.Contains(locale);

    public static string Normalize(string? locale) => IsSupported(locale) ? locale! : "en";
}

public static class EmailAddress
{
    /// <summary>Trims and lower-cases; plus-addressing is kept distinct.</summary>
    public static string Normalize(string email) => email.Trim().ToLowerInvariant();

    public static bool IsValid(string? email)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            return false;
        }
        var e = email.Trim();
        if (e.Length > 254 || e.Contains(' ', StringComparison.Ordinal) || e.Count(c => c == '@') != 1)
        {
            return false;
        }
        if (!MailAddress.TryCreate(e, out var parsed) || parsed.Address != e)
        {
            return false;
        }
        var domain = parsed.Host;
        return domain.Contains('.', StringComparison.Ordinal) && !domain.StartsWith('.') && !domain.EndsWith('.');
    }
}
