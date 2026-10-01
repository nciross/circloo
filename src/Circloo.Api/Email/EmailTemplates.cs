using System.Collections.Frozen;
using System.Net;
using System.Text.Json;
using Circloo.Api.Security;

namespace Circloo.Api.Email;

public sealed record EmailTemplate(string Subject, string Text, string Html);

/// <summary>Localized email templates from Resources/emails/{locale}.json. Placeholders: {code}, {minutes}.</summary>
public sealed class EmailTemplates
{
    private readonly FrozenDictionary<string, FrozenDictionary<string, EmailTemplate>> _byLocale;

    public EmailTemplates(IWebHostEnvironment env)
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "Resources", "emails");
        if (!Directory.Exists(dir))
        {
            dir = Path.Combine(env.ContentRootPath, "Resources", "emails");
        }
        var opts = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        _byLocale = Locales.All.ToFrozenDictionary(
            l => l,
            l => JsonSerializer.Deserialize<Dictionary<string, EmailTemplate>>(File.ReadAllText(Path.Combine(dir, $"{l}.json")), opts)!
                .ToFrozenDictionary());
    }

    public EmailMessage Render(string template, string locale, string to, IReadOnlyDictionary<string, string> values)
    {
        var t = _byLocale[Locales.Normalize(locale)][template];
        string Fill(string s, bool html) => values.Aggregate(s, (acc, kv) =>
            acc.Replace("{" + kv.Key + "}", html ? WebUtility.HtmlEncode(kv.Value) : kv.Value, StringComparison.Ordinal));
        return new EmailMessage(to, Fill(t.Subject, false), Fill(t.Text, false), Fill(t.Html, true));
    }
}
