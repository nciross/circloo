using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Circloo.Api.Data;
using Circloo.Api.Integrations;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Circloo.Api.Tests;

/// <summary>Records outbound calls and answers like the real services would.</summary>
public sealed class StubServices : HttpMessageHandler
{
    public ConcurrentQueue<(HttpRequestMessage Request, string Body)> Calls { get; } = new();

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
        Calls.Enqueue((request, body));
        var path = request.RequestUri!.AbsolutePath;
        var json = path switch
        {
            "/rest/api/3/issue" => $$"""{"key":"TEAM-{{Calls.Count}}"}""",
            "/wiki/api/v2/pages" => """{"id":"42","_links":{"webui":"/spaces/TEAM/pages/42"}}""",
            "/v1/pages" => """{"id":"p1","url":"https://www.notion.so/p1"}""",
            _ => "{}",
        };
        return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
    }
}

/// <summary>Spec 005: connections are validated, encrypted and never echoed; circle results reach the right service.</summary>
[Collection(ApiCollection.Name)]
public sealed class IntegrationTests(PostgresFixture pg) : IAsyncLifetime
{
    private ApiFactory _root = null!;
    private WebApplicationFactory<Program> _factory = null!;
    private readonly StubServices _stub = new();
    private HttpClient _client = null!;
    private string _csrf = null!;

    public async Task InitializeAsync()
    {
        _root = new ApiFactory(pg.Container.GetConnectionString());
        _factory = _root.WithWebHostBuilder(b => b.ConfigureServices(s =>
            s.AddHttpClient(IntegrationSender.ClientName).ConfigurePrimaryHttpMessageHandler(() => _stub)));
        _client = _factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        _csrf = await _client.SignInAsync(_root, $"integrations-{Guid.NewGuid():N}@example.test");
        (await _client.PutJsonAsync("/api/me/profile", new { displayName = "Nadia", locale = "en" }, _csrf)).EnsureSuccessStatusCode();
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _root.DisposeAsync();
    }

    [Theory]
    [InlineData("teams", """{"webhookUrl":"http://prod-01.westeurope.logic.azure.com/workflows/x"}""", "webhookUrl")]
    [InlineData("teams", """{"webhookUrl":"https://169.254.169.254/latest/meta-data"}""", "webhookUrl")]
    [InlineData("teams", """{"webhookUrl":"https://logic.azure.com.evil.example/x"}""", "webhookUrl")]
    [InlineData("jira", """{"site":"https://team.atlassian.net.evil.example","email":"a@b.co","apiToken":"abcdefghijkl","projectKey":"TEAM"}""", "site")]
    [InlineData("jira", """{"site":"http://localhost:5432","email":"a@b.co","apiToken":"abcdefghijkl","projectKey":"TEAM"}""", "site")]
    [InlineData("jira", """{"site":"team.atlassian.net","email":"a@b.co","apiToken":"abcdefghijkl","projectKey":"team-1"}""", "projectKey")]
    [InlineData("confluence", """{"site":"team.atlassian.net","email":"a@b.co","apiToken":"abcdefghijkl","spaceId":"abc"}""", "spaceId")]
    [InlineData("notion", """{"token":"not-a-notion-secret","parentPageId":"0123456789abcdef0123456789abcdef"}""", "token")]
    public async Task Connections_refuse_hosts_and_values_outside_the_allow_list(string provider, string json, string field)
    {
        using var req = new HttpRequestMessage(HttpMethod.Put, $"/api/integrations/{provider}") { Content = new StringContent(json, Encoding.UTF8, "application/json") };
        req.Headers.Add("X-XSRF-TOKEN", _csrf);
        var res = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.True((await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors").TryGetProperty(field, out _));
    }

    [Fact]
    public async Task A_connection_is_stored_encrypted_and_only_a_hint_comes_back()
    {
        const string token = "ATATT3xFfGF0-very-secret-token";
        var res = await _client.PutJsonAsync("/api/integrations/jira",
            new { site = "Team.atlassian.net/jira/software", email = "nadia@example.test", apiToken = token, projectKey = "team" }, _csrf);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var list = await _client.GetStringAsync(new Uri("/api/integrations", UriKind.Relative));
        Assert.DoesNotContain(token, list, StringComparison.Ordinal);
        Assert.Contains("team.atlassian.net · TEAM", list, StringComparison.Ordinal);

        using var scope = _root.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        var rows = await db.IntegrationConnections.Where(c => c.Provider == "jira").ToListAsync();
        Assert.All(rows, r => Assert.DoesNotContain(token, r.ConfigProtected, StringComparison.Ordinal));

        var test = await _client.PostJsonAsync("/api/integrations/jira/test", new { }, _csrf);
        Assert.True((await test.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("ok").GetBoolean());
        Assert.Contains(_stub.Calls, c => c.Request.RequestUri!.ToString() == "https://team.atlassian.net/rest/api/3/project/TEAM");

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync("/api/integrations/jira", _csrf)).StatusCode);
        var after = await _client.GetFromJsonAsync<JsonElement>("/api/integrations");
        Assert.False(after.EnumerateArray().Single(p => p.GetProperty("provider").GetString() == "jira").GetProperty("connected").GetBoolean());
    }

    private async Task<Guid> CircleWithBoardAsync()
    {
        var res = await _client.PostJsonAsync("/api/circles", new { name = "Q4 retro", activities = new[] { "brainstorm" }, character = "panda", locale = "en" }, _csrf);
        var id = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        using var scope = _root.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        var me = await db.CircleMembers.FirstAsync(m => m.CircleId == id);
        var top = new BoardNote { CircleId = id, ActivityId = "brainstorm", Column = "next", Text = "Book the team offsite", Color = "green", AuthorMemberId = me.Id };
        top.Votes.Add(new BoardVote { MemberId = me.Id });
        db.BoardNotes.AddRange(
            top,
            new BoardNote { CircleId = id, ActivityId = "brainstorm", Column = "next", Text = "Try <script>alert(1)</script> pairing", Color = "yellow", AuthorMemberId = me.Id },
            new BoardNote { CircleId = id, ActivityId = "brainstorm", Column = "ideas", Text = "Plants everywhere", Color = "pink", AuthorMemberId = me.Id });
        await db.SaveChangesAsync();
        return id;
    }

    [Fact]
    public async Task Exporting_turns_action_notes_into_jira_tasks_top_voted_first()
    {
        var id = await CircleWithBoardAsync();
        var notConnected = await _client.PostJsonAsync($"/api/circles/{id}/export", new { provider = "notion" }, _csrf);
        Assert.Equal(HttpStatusCode.Conflict, notConnected.StatusCode);

        (await _client.PutJsonAsync("/api/integrations/jira", new { site = "https://team.atlassian.net", email = "nadia@example.test", apiToken = "ATATT3xFfGF0-token", projectKey = "TEAM" }, _csrf)).EnsureSuccessStatusCode();
        _stub.Calls.Clear();
        var res = await _client.PostJsonAsync($"/api/circles/{id}/export", new { provider = "jira", titles = new Dictionary<string, string> { ["brainstorm"] = "Brainstorm" } }, _csrf);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal(2, (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("created").GetInt32());

        var issues = _stub.Calls.Where(c => c.Request.RequestUri!.AbsolutePath == "/rest/api/3/issue").ToList();
        Assert.Equal(2, issues.Count);
        Assert.Equal("https://team.atlassian.net/rest/api/3/issue", issues[0].Request.RequestUri!.ToString());
        Assert.Equal("Basic", issues[0].Request.Headers.Authorization!.Scheme);
        var first = JsonDocument.Parse(issues[0].Body).RootElement.GetProperty("fields");
        Assert.Equal("Book the team offsite", first.GetProperty("summary").GetString());
        Assert.Equal("TEAM", first.GetProperty("project").GetProperty("key").GetString());
    }

    [Fact]
    public async Task Confluence_pages_encode_text_and_notion_and_teams_get_the_report()
    {
        var id = await CircleWithBoardAsync();
        (await _client.PutJsonAsync("/api/integrations/confluence", new { site = "team.atlassian.net", email = "nadia@example.test", apiToken = "ATATT3xFfGF0-token", spaceId = "98304" }, _csrf)).EnsureSuccessStatusCode();
        (await _client.PutJsonAsync("/api/integrations/notion", new { token = "ntn_1234567890abcdef", parentPageId = "https://www.notion.so/Team-0123456789abcdef0123456789abcdef" }, _csrf)).EnsureSuccessStatusCode();
        (await _client.PutJsonAsync("/api/integrations/teams", new { webhookUrl = "https://prod-01.westeurope.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?sig=x" }, _csrf)).EnsureSuccessStatusCode();
        _stub.Calls.Clear();

        var page = await _client.PostJsonAsync($"/api/circles/{id}/export", new { provider = "confluence" }, _csrf);
        Assert.Equal("https://team.atlassian.net/wiki/spaces/TEAM/pages/42", (await page.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString());
        var html = JsonDocument.Parse(_stub.Calls.Single(c => c.Request.RequestUri!.AbsolutePath == "/wiki/api/v2/pages").Body)
            .RootElement.GetProperty("body").GetProperty("value").GetString()!;
        Assert.DoesNotContain("<script>", html, StringComparison.Ordinal);
        Assert.Contains("&lt;script&gt;", html, StringComparison.Ordinal);
        Assert.Contains("Next steps", html, StringComparison.Ordinal);

        var notion = await _client.PostJsonAsync($"/api/circles/{id}/export", new { provider = "notion" }, _csrf);
        Assert.Equal("https://www.notion.so/p1", (await notion.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString());
        var notionCall = _stub.Calls.Single(c => c.Request.RequestUri!.Host == "api.notion.com");
        Assert.Equal("2022-06-28", notionCall.Request.Headers.GetValues("Notion-Version").Single());
        Assert.Contains("0123456789abcdef0123456789abcdef", notionCall.Body, StringComparison.Ordinal);

        var teams = await _client.PostJsonAsync($"/api/circles/{id}/export", new { provider = "teams" }, _csrf);
        Assert.Equal(HttpStatusCode.OK, teams.StatusCode);
        var card = _stub.Calls.Single(c => c.Request.RequestUri!.Host.EndsWith(".logic.azure.com", StringComparison.Ordinal));
        Assert.Contains("application/vnd.microsoft.card.adaptive", card.Body, StringComparison.Ordinal);
        Assert.Contains("Book the team offsite", card.Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Only_the_owner_exports_a_circle()
    {
        var id = await CircleWithBoardAsync();
        using var other = _factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        var csrf = await other.SignInAsync(_root, $"someone-{Guid.NewGuid():N}@example.test");
        (await other.PutJsonAsync("/api/integrations/teams", new { webhookUrl = "https://prod-01.westeurope.logic.azure.com/workflows/x" }, csrf)).EnsureSuccessStatusCode();
        var res = await other.PostJsonAsync($"/api/circles/{id}/export", new { provider = "teams" }, csrf);
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }
}
