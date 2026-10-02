using System.Text.Json;
using System.Text.RegularExpressions;

namespace Circloo.Api.Integrations;

/// <summary>Services circloo can send to (spec 005). Salesforce is announced, not available.</summary>
public static class Providers
{
    public const string Teams = "teams";
    public const string Jira = "jira";
    public const string Confluence = "confluence";
    public const string Notion = "notion";
    public static readonly string[] All = [Teams, Jira, Confluence, Notion];
}

/// <summary>Everything a connection needs, by provider. Only some fields apply to each provider.</summary>
public sealed record IntegrationConfig(
    string? WebhookUrl = null,
    string? Site = null,
    string? Email = null,
    string? ApiToken = null,
    string? ProjectKey = null,
    string? SpaceId = null,
    string? Token = null,
    string? ParentPageId = null)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
}

/// <summary>
/// Validates and normalizes a connection. Outbound hosts are allow-listed per provider (FR-502): an attacker
/// cannot point circloo at an internal address, and nothing but https is accepted.
/// </summary>
public static partial class ConnectionRules
{
    private static readonly string[] TeamsHosts = [".logic.azure.com", ".webhook.office.com", ".api.powerplatform.com"];

    public static Dictionary<string, string[]> Validate(string provider, IntegrationConfig input, out IntegrationConfig clean, out string hint)
    {
        var errors = new Dictionary<string, string[]>();
        clean = input;
        hint = "";
        switch (provider)
        {
            case Providers.Teams:
                if (!TryHttps(input.WebhookUrl, out var hook) || !TeamsHosts.Any(h => hook!.Host.EndsWith(h, StringComparison.OrdinalIgnoreCase)))
                {
                    errors["webhookUrl"] = ["Use the https webhook URL of a Teams Workflows (Power Automate) trigger."];
                    break;
                }
                clean = new IntegrationConfig(WebhookUrl: hook!.AbsoluteUri);
                hint = hook.Host;
                break;
            case Providers.Jira:
            case Providers.Confluence:
                var site = Site(input.Site);
                if (site is null)
                {
                    errors["site"] = ["Use your Atlassian site, like https://your-team.atlassian.net."];
                }
                if (input.Email is null || !EmailRe().IsMatch(input.Email.Trim()) || input.Email.Length > 254)
                {
                    errors["email"] = ["Use the email of your Atlassian account."];
                }
                if (!IsToken(input.ApiToken))
                {
                    errors["apiToken"] = ["Paste an Atlassian API token."];
                }
                if (provider == Providers.Jira && (input.ProjectKey is null || !ProjectKeyRe().IsMatch(input.ProjectKey.Trim().ToUpperInvariant())))
                {
                    errors["projectKey"] = ["Use a Jira project key, like TEAM."];
                }
                if (provider == Providers.Confluence && (input.SpaceId is null || !SpaceIdRe().IsMatch(input.SpaceId.Trim())))
                {
                    errors["spaceId"] = ["Use the numeric id of the Confluence space."];
                }
                if (errors.Count == 0)
                {
                    clean = provider == Providers.Jira
                        ? new IntegrationConfig(Site: site, Email: input.Email!.Trim(), ApiToken: input.ApiToken!.Trim(), ProjectKey: input.ProjectKey!.Trim().ToUpperInvariant())
                        : new IntegrationConfig(Site: site, Email: input.Email!.Trim(), ApiToken: input.ApiToken!.Trim(), SpaceId: input.SpaceId!.Trim());
                    hint = provider == Providers.Jira ? $"{new Uri(site!).Host} · {clean.ProjectKey}" : $"{new Uri(site!).Host} · space {clean.SpaceId}";
                }
                break;
            case Providers.Notion:
                if (!IsToken(input.Token) || !(input.Token!.StartsWith("secret_", StringComparison.Ordinal) || input.Token.StartsWith("ntn_", StringComparison.Ordinal)))
                {
                    errors["token"] = ["Paste the secret of a Notion internal integration."];
                }
                var page = (input.ParentPageId ?? "").Replace("-", "", StringComparison.Ordinal).Trim();
                if (page.Length > 32)
                {
                    // Accept a pasted page URL: the id is the last 32 hex characters.
                    page = page[^32..];
                }
                if (!PageIdRe().IsMatch(page))
                {
                    errors["parentPageId"] = ["Use the id (or the link) of the Notion page to write under."];
                }
                if (errors.Count == 0)
                {
                    clean = new IntegrationConfig(Token: input.Token!.Trim(), ParentPageId: page.ToLowerInvariant());
                    hint = $"page …{page[^6..].ToLowerInvariant()}";
                }
                break;
            default:
                errors["provider"] = ["Unknown service."];
                break;
        }
        return errors;
    }

    private static bool IsToken(string? token) =>
        token is { Length: >= 10 and <= 400 } && !token.Trim().Any(char.IsWhiteSpace) && !token.Any(char.IsControl);

    private static bool TryHttps(string? url, out Uri? uri) =>
        Uri.TryCreate(url?.Trim(), UriKind.Absolute, out uri) && uri.Scheme == Uri.UriSchemeHttps && uri.IsDefaultPort && string.IsNullOrEmpty(uri.UserInfo);

    /// <summary>An Atlassian Cloud site, reduced to its origin.</summary>
    private static string? Site(string? url)
    {
        var value = url?.Trim();
        if (value is not null && !value.Contains("://", StringComparison.Ordinal))
        {
            value = "https://" + value;
        }
        return TryHttps(value, out var uri) && uri!.Host.EndsWith(".atlassian.net", StringComparison.OrdinalIgnoreCase) && SiteHostRe().IsMatch(uri.Host)
            ? $"https://{uri.Host.ToLowerInvariant()}"
            : null;
    }

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailRe();

    [GeneratedRegex(@"^[A-Z][A-Z0-9_]{1,9}$")]
    private static partial Regex ProjectKeyRe();

    [GeneratedRegex(@"^[0-9]{1,20}$")]
    private static partial Regex SpaceIdRe();

    [GeneratedRegex(@"^[0-9a-fA-F]{32}$")]
    private static partial Regex PageIdRe();

    [GeneratedRegex(@"^[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$", RegexOptions.IgnoreCase)]
    private static partial Regex SiteHostRe();
}
