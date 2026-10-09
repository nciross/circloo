using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Circloo.Api.Integrations;

public sealed record SendResult(bool Ok, string? Url, int Created, int? Status = null);

/// <summary>
/// Talks to the outside services. Uses the "integrations" HttpClient: no redirects, short timeout (FR-502).
/// Every value from people is JSON- or HTML-encoded by construction; responses are read only for ids and links.
/// </summary>
public sealed class IntegrationSender(IHttpClientFactory http)
{
    public const string ClientName = "integrations";
    private const string NotionVersion = "2022-06-28";
    private const int MaxJiraIssues = 20;

    private HttpClient Client() => http.CreateClient(ClientName);

    public async Task<SendResult> TestAsync(string provider, IntegrationConfig c, CancellationToken ct)
    {
        using var req = provider switch
        {
            Providers.Teams => TeamsRequest(c, Card("circloo", ["circloo is connected to this channel."])),
            Providers.Jira => Atlassian(HttpMethod.Get, c, $"/rest/api/3/project/{Uri.EscapeDataString(c.ProjectKey!)}"),
            Providers.Confluence => Atlassian(HttpMethod.Get, c, $"/wiki/api/v2/spaces/{Uri.EscapeDataString(c.SpaceId!)}"),
            Providers.Notion => Notion(HttpMethod.Get, c, $"/v1/pages/{c.ParentPageId}"),
            _ => throw new ArgumentOutOfRangeException(nameof(provider)),
        };
        using var res = await Client().SendAsync(req, ct);
        return new SendResult(res.IsSuccessStatusCode, null, 0, (int)res.StatusCode);
    }

    public Task<SendResult> SendAsync(string provider, IntegrationConfig c, CircleReport report, CancellationToken ct) => provider switch
    {
        Providers.Teams => SendTeamsAsync(c, report, ct),
        Providers.Jira => SendJiraAsync(c, report, ct),
        Providers.Confluence => SendConfluenceAsync(c, report, ct),
        Providers.Notion => SendNotionAsync(c, report, ct),
        _ => throw new ArgumentOutOfRangeException(nameof(provider)),
    };

    // ---------- Teams: an adaptive card posted to a Workflows webhook ----------

    private async Task<SendResult> SendTeamsAsync(IntegrationConfig c, CircleReport r, CancellationToken ct)
    {
        var lines = new List<string>();
        foreach (var s in r.Sections)
        {
            lines.Add($"**{s.Title}**");
            foreach (var col in s.Columns)
            {
                lines.Add($"_{col.Name}_");
                lines.AddRange(col.Notes.Take(8).Select(n => $"- {n.Text}{Votes(n)}"));
            }
            if (s.Summary is not null)
            {
                lines.Add($"circloo: {s.Summary}");
            }
        }
        lines.AddRange(r.ReactionLines);
        using var req = TeamsRequest(c, Card($"{r.Name} · {Date(r)}", lines));
        using var res = await Client().SendAsync(req, ct);
        return new SendResult(res.IsSuccessStatusCode, null, res.IsSuccessStatusCode ? 1 : 0, (int)res.StatusCode);
    }

    private static HttpRequestMessage TeamsRequest(IntegrationConfig c, JsonObject card) =>
        new(HttpMethod.Post, c.WebhookUrl) { Content = JsonContent.Create(card) };

    private static JsonObject Card(string title, IEnumerable<string> lines)
    {
        var body = new JsonArray { new JsonObject { ["type"] = "TextBlock", ["text"] = title, ["size"] = "Large", ["weight"] = "Bolder", ["wrap"] = true } };
        foreach (var line in lines)
        {
            body.Add(new JsonObject { ["type"] = "TextBlock", ["text"] = line, ["wrap"] = true, ["spacing"] = "Small" });
        }
        return new JsonObject
        {
            ["type"] = "message",
            ["attachments"] = new JsonArray
            {
                new JsonObject
                {
                    ["contentType"] = "application/vnd.microsoft.card.adaptive",
                    ["content"] = new JsonObject
                    {
                        ["$schema"] = "http://adaptivecards.io/schemas/adaptive-card.json",
                        ["type"] = "AdaptiveCard",
                        ["version"] = "1.4",
                        ["body"] = body,
                    },
                },
            },
        };
    }

    // ---------- Jira: one task per action note ----------

    private async Task<SendResult> SendJiraAsync(IntegrationConfig c, CircleReport r, CancellationToken ct)
    {
        var actions = r.Actions(MaxJiraIssues).ToList();
        var items = actions.Count > 0
            ? actions.Select(n => (Summary: n.Text, Detail: $"From the circle \"{r.Name}\" on {Date(r)}{Votes(n)}."))
            : [($"{r.Name} · {Date(r)}", string.Join("\n", r.Sections.Select(s => $"{s.Title}: {s.Summary}").Concat(r.ReactionLines)))];
        string? firstKey = null;
        var created = 0;
        foreach (var (summary, detail) in items)
        {
            var issue = new JsonObject
            {
                ["fields"] = new JsonObject
                {
                    ["project"] = new JsonObject { ["key"] = c.ProjectKey },
                    ["issuetype"] = new JsonObject { ["name"] = "Task" },
                    ["summary"] = summary.Length > 250 ? summary[..250] : summary,
                    ["labels"] = new JsonArray { "circloo" },
                    ["description"] = new JsonObject
                    {
                        ["type"] = "doc",
                        ["version"] = 1,
                        ["content"] = new JsonArray
                        {
                            new JsonObject { ["type"] = "paragraph", ["content"] = new JsonArray { new JsonObject { ["type"] = "text", ["text"] = detail } } },
                        },
                    },
                },
            };
            using var req = Atlassian(HttpMethod.Post, c, "/rest/api/3/issue");
            req.Content = JsonContent.Create(issue);
            using var res = await Client().SendAsync(req, ct);
            if (!res.IsSuccessStatusCode)
            {
                return new SendResult(created > 0, Link(c, firstKey), created, (int)res.StatusCode);
            }
            var key = (await res.Content.ReadFromJsonAsync<JsonElement>(ct)).TryGetProperty("key", out var k) ? k.GetString() : null;
            firstKey ??= key;
            created++;
        }
        return new SendResult(true, created == 1 ? Link(c, firstKey) : $"{c.Site}/jira/software/projects/{Uri.EscapeDataString(c.ProjectKey!)}/issues", created);
    }

    private static string? Link(IntegrationConfig c, string? key) => key is null ? null : $"{c.Site}/browse/{Uri.EscapeDataString(key)}";

    // ---------- Confluence: one page with the whole report ----------

    private async Task<SendResult> SendConfluenceAsync(IntegrationConfig c, CircleReport r, CancellationToken ct)
    {
        var html = new StringBuilder();
        html.Append(CultureInfo.InvariantCulture, $"<p>{E($"{Date(r)} · {r.People} people")}</p>");
        foreach (var s in r.Sections)
        {
            html.Append(CultureInfo.InvariantCulture, $"<h2>{E(s.Title)}</h2>");
            foreach (var col in s.Columns)
            {
                html.Append(CultureInfo.InvariantCulture, $"<h3>{E(col.Name)}</h3><ul>");
                foreach (var n in col.Notes)
                {
                    html.Append(CultureInfo.InvariantCulture, $"<li>{E(n.Text + Votes(n))}</li>");
                }
                html.Append("</ul>");
            }
            if (s.Summary is not null)
            {
                html.Append(CultureInfo.InvariantCulture, $"<blockquote><p>{E("circloo: " + s.Summary)}</p></blockquote>");
            }
        }
        foreach (var line in r.ReactionLines)
        {
            html.Append(CultureInfo.InvariantCulture, $"<p>{E(line)}</p>");
        }
        var page = new JsonObject
        {
            ["spaceId"] = c.SpaceId,
            ["status"] = "current",
            ["title"] = $"{r.Name} · {r.At.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)}",
            ["body"] = new JsonObject { ["representation"] = "storage", ["value"] = html.ToString() },
        };
        using var req = Atlassian(HttpMethod.Post, c, "/wiki/api/v2/pages");
        req.Content = JsonContent.Create(page);
        using var res = await Client().SendAsync(req, ct);
        if (!res.IsSuccessStatusCode)
        {
            return new SendResult(false, null, 0, (int)res.StatusCode);
        }
        var json = await res.Content.ReadFromJsonAsync<JsonElement>(ct);
        var webui = json.TryGetProperty("_links", out var links) && links.TryGetProperty("webui", out var w) ? w.GetString() : null;
        return new SendResult(true, webui is null ? null : $"{c.Site}/wiki{webui}", 1);
    }

    // ---------- Notion: one page under the chosen parent ----------

    private async Task<SendResult> SendNotionAsync(IntegrationConfig c, CircleReport r, CancellationToken ct)
    {
        var blocks = new JsonArray { Block("paragraph", $"{Date(r)} · {r.People} people") };
        foreach (var s in r.Sections)
        {
            blocks.Add(Block("heading_2", s.Title));
            foreach (var col in s.Columns)
            {
                blocks.Add(Block("heading_3", col.Name));
                foreach (var n in col.Notes.Take(30))
                {
                    blocks.Add(Block("bulleted_list_item", n.Text + Votes(n)));
                }
            }
            if (s.Summary is not null)
            {
                blocks.Add(Block("quote", "circloo: " + s.Summary));
            }
        }
        foreach (var line in r.ReactionLines)
        {
            blocks.Add(Block("paragraph", line));
        }
        var page = new JsonObject
        {
            ["parent"] = new JsonObject { ["page_id"] = c.ParentPageId },
            ["properties"] = new JsonObject
            {
                ["title"] = new JsonObject { ["title"] = new JsonArray { new JsonObject { ["text"] = new JsonObject { ["content"] = $"{r.Name} · {Date(r)}" } } } },
            },
            // Notion accepts at most 100 children per request.
            ["children"] = new JsonArray([.. blocks.Take(100).Select(b => b!.DeepClone())]),
        };
        using var req = Notion(HttpMethod.Post, c, "/v1/pages");
        req.Content = JsonContent.Create(page);
        using var res = await Client().SendAsync(req, ct);
        if (!res.IsSuccessStatusCode)
        {
            return new SendResult(false, null, 0, (int)res.StatusCode);
        }
        var json = await res.Content.ReadFromJsonAsync<JsonElement>(ct);
        return new SendResult(true, json.TryGetProperty("url", out var url) ? url.GetString() : null, 1);
    }

    private static JsonObject Block(string type, string text) => new()
    {
        ["object"] = "block",
        ["type"] = type,
        [type] = new JsonObject
        {
            ["rich_text"] = new JsonArray { new JsonObject { ["type"] = "text", ["text"] = new JsonObject { ["content"] = text.Length > 1900 ? text[..1900] : text } } },
        },
    };

    // ---------- helpers ----------

    private static HttpRequestMessage Atlassian(HttpMethod method, IntegrationConfig c, string path)
    {
        var req = new HttpRequestMessage(method, c.Site + path);
        req.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{c.Email}:{c.ApiToken}")));
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return req;
    }

    private static HttpRequestMessage Notion(HttpMethod method, IntegrationConfig c, string path)
    {
        var req = new HttpRequestMessage(method, "https://api.notion.com" + path);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", c.Token);
        req.Headers.Add("Notion-Version", NotionVersion);
        return req;
    }

    private static string Votes(ReportNote n) => n.Votes switch { 0 => "", 1 => " (1 vote)", _ => $" ({n.Votes} votes)" };

    private static string Date(CircleReport r) => r.At.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string E(string text) => System.Net.WebUtility.HtmlEncode(text);
}
