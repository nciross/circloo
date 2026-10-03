using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Circloo.Api.Data;
using Circloo.Api.Presentations;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Testcontainers.Azurite;

namespace Circloo.Api.Tests.Presentations;

/// <summary>The presentation library (spec 006 US1, contracts/rest.md) with a real Postgres and Azurite.</summary>
[Collection(ApiCollection.Name)]
public sealed class PresentationEndpointsTests(PostgresFixture pg) : IAsyncLifetime
{
    private readonly AzuriteContainer _azurite = new AzuriteBuilder("mcr.microsoft.com/azure-storage/azurite:3.35.0")
        .WithInMemoryPersistence().WithCommand("--skipApiVersionCheck").Build();
    private readonly FakeConverter _converter = new();
    private ApiFactory _root = null!;
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _owner = null!;
    private string _csrf = null!;

    public async Task InitializeAsync()
    {
        await _azurite.StartAsync();
        _root = Factory(new Dictionary<string, string?>());
        _factory = WithConverter(_root);
        _owner = Browser(_factory);
        _csrf = await _owner.SignInAsync(_root, $"deck-{Guid.NewGuid():N}@example.test");
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _root.DisposeAsync();
        await _azurite.DisposeAsync();
    }

    private ApiFactory Factory(Dictionary<string, string?> overrides)
    {
        overrides["ConnectionStrings:blobs"] = _azurite.GetConnectionString();
        return new ApiFactory(pg.Container.GetConnectionString(), overrides);
    }

    private WebApplicationFactory<Program> WithConverter(ApiFactory root) =>
        root.WithWebHostBuilder(b => b.ConfigureServices(s =>
        {
            s.RemoveAll<IDeckConverter>();
            s.AddSingleton<IDeckConverter>(_converter);
        }));

    private static HttpClient Browser(WebApplicationFactory<Program> factory) =>
        factory.CreateDefaultClient(new Uri("https://localhost"), new CookieContainerHandler());

    private static async Task<HttpResponseMessage> UploadAsync(HttpClient http, string csrf, byte[] file, string name = "Team kickoff.pptx")
    {
        using var form = new MultipartFormDataContent();
        var content = new ByteArrayContent(file);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.presentationml.presentation");
        form.Add(content, "file", name);
        using var req = new HttpRequestMessage(HttpMethod.Post, "/api/presentations") { Content = form };
        req.Headers.Add("X-XSRF-TOKEN", csrf);
        return await http.SendAsync(req);
    }

    private async Task<JsonElement> WaitReadyAsync(Guid id)
    {
        for (var i = 0; i < 100; i++)
        {
            var detail = await _owner.GetFromJsonAsync<JsonElement>($"/api/presentations/{id}");
            if (detail.GetProperty("status").GetString() != "processing")
            {
                return detail;
            }
            await Task.Delay(100);
        }
        throw new TimeoutException("conversion did not finish");
    }

    private async Task<Guid> UploadReadyAsync(byte[]? deck = null)
    {
        var res = await UploadAsync(_owner, _csrf, deck ?? TestDecks.Demo());
        Assert.Equal(HttpStatusCode.Accepted, res.StatusCode);
        var id = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal("ready", (await WaitReadyAsync(id)).GetProperty("status").GetString());
        return id;
    }

    [Fact]
    public async Task Upload_converts_every_slide_in_order_with_notes_and_hidden_slides()
    {
        var res = await UploadAsync(_owner, _csrf, TestDecks.Demo());
        Assert.Equal(HttpStatusCode.Accepted, res.StatusCode);
        var summary = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("processing", summary.GetProperty("status").GetString());
        Assert.Equal("Team kickoff", summary.GetProperty("name").GetString());
        Assert.Equal(12, summary.GetProperty("slideCount").GetInt32());

        var detail = await WaitReadyAsync(summary.GetProperty("id").GetGuid());

        Assert.Equal("ready", detail.GetProperty("status").GetString());
        Assert.Equal(12, detail.GetProperty("processedSlides").GetInt32());
        var slides = detail.GetProperty("slides").EnumerateArray().ToList();
        Assert.Equal(Enumerable.Range(0, 12), slides.Select(s => s.GetProperty("position").GetInt32()));
        Assert.True(slides[6].GetProperty("hidden").GetBoolean());
        Assert.Equal("Welcome everyone\nKeep it short", slides[1].GetProperty("notes").GetString());
        Assert.StartsWith("/api/slides/", detail.GetProperty("thumbnail").GetString());

        // The owner gets the pictures; the transient source file is gone once converted.
        var image = await _owner.GetAsync(slides[0].GetProperty("image").GetString());
        Assert.Equal(HttpStatusCode.OK, image.StatusCode);
        Assert.Equal("image/webp", image.Content.Headers.ContentType?.MediaType);
        Assert.Contains("private", image.Headers.CacheControl?.ToString(), StringComparison.Ordinal);
        Assert.NotNull(image.Headers.ETag);
        var thumb = await _owner.GetAsync(slides[0].GetProperty("thumbnail").GetString());
        Assert.Equal(HttpStatusCode.OK, thumb.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<SlideStore>();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        var row = await db.Presentations.AsNoTracking().SingleAsync(p => p.Id == summary.GetProperty("id").GetGuid());
        Assert.Null(await store.OpenSourceAsync(row.OwnerUserId, row.Id, default));
        Assert.Null(row.ConvertingBy);
        Assert.True(await db.AuditEvents.AnyAsync(a => a.Type == "presentation.converted" && a.UserId == row.OwnerUserId));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task The_converter_never_sees_external_links(bool linkAsHyperlink)
    {
        await UploadReadyAsync(TestDecks.Build(2, externalPictureOn: 0, linkAsHyperlink: linkAsHyperlink));

        Assert.Equal(0, DeckInspector.CountExternalLinks(_converter.LastDeck!));
    }

    [Theory]
    [InlineData("encrypted", HttpStatusCode.BadRequest)]
    [InlineData("macros", HttpStatusCode.BadRequest)]
    [InlineData("not-pptx", HttpStatusCode.BadRequest)]
    [InlineData("too-many-slides", HttpStatusCode.BadRequest)]
    public async Task Bad_files_are_refused_with_a_reason(string code, HttpStatusCode status)
    {
        var file = code switch
        {
            "encrypted" => TestDecks.Encrypted(),
            "macros" => TestDecks.Build(1, type: DocumentFormat.OpenXml.PresentationDocumentType.MacroEnabledPresentation),
            "too-many-slides" => TestDecks.Build(101),
            _ => TestDecks.RenamedPdf(),
        };

        var res = await UploadAsync(_owner, _csrf, file, "deck.pptx");

        Assert.Equal(status, res.StatusCode);
        Assert.Equal(code, (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("type").GetString());
    }

    [Fact]
    public async Task A_failed_conversion_is_reported_with_a_code()
    {
        _converter.Fail = new ConversionFailedException("timeout", "too slow");
        try
        {
            var res = await UploadAsync(_owner, _csrf, TestDecks.Build(2));
            var detail = await WaitReadyAsync((await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid());

            Assert.Equal("failed", detail.GetProperty("status").GetString());
            Assert.Equal("timeout", detail.GetProperty("error").GetString());
            // The upload is not kept after a failure either (research R3), and the failure is audited (FR-619).
            using var scope = _factory.Services.CreateScope();
            var row = await scope.ServiceProvider.GetRequiredService<CirclooDbContext>().Presentations.AsNoTracking()
                .SingleAsync(p => p.Id == detail.GetProperty("id").GetGuid());
            Assert.Null(await scope.ServiceProvider.GetRequiredService<SlideStore>().OpenSourceAsync(row.OwnerUserId, row.Id, default));
            Assert.True(await scope.ServiceProvider.GetRequiredService<CirclooDbContext>().AuditEvents
                .AnyAsync(a => a.Type == "presentation.failed" && a.UserId == row.OwnerUserId));
        }
        finally
        {
            _converter.Fail = null;
        }
    }

    [Fact]
    public async Task A_deck_leased_by_another_replica_is_left_alone()
    {
        var id = await UploadReadyAsync(TestDecks.Build(1));
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        var until = _root.Clock.GetUtcNow().AddMinutes(1);
        await db.Presentations.Where(p => p.Id == id).ExecuteUpdateAsync(s => s
            .SetProperty(p => p.Status, PresentationStatus.Processing).SetProperty(p => p.ConvertingBy, "other:1").SetProperty(p => p.LeaseUntil, until));

        await _factory.Services.GetRequiredService<PresentationConverterService>().ConvertAsync(id, default);

        var row = await db.Presentations.AsNoTracking().SingleAsync(p => p.Id == id);
        Assert.Equal((PresentationStatus.Processing, "other:1"), (row.Status, row.ConvertingBy));
    }

    [Fact]
    public async Task The_watchdog_retries_dead_conversions_and_times_out_stuck_ones()
    {
        var dead = await UploadReadyAsync(TestDecks.Build(2));
        var stuck = await UploadReadyAsync(TestDecks.Build(1));
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        var store = scope.ServiceProvider.GetRequiredService<SlideStore>();
        var now = _root.Clock.GetUtcNow();
        var owner = (await db.Presentations.AsNoTracking().SingleAsync(p => p.Id == dead)).OwnerUserId;
        // A converter that died a minute ago (its lease ran out), and a deck nobody finished in 10 minutes.
        await db.Presentations.Where(p => p.Id == dead).ExecuteUpdateAsync(s => s.SetProperty(p => p.Status, PresentationStatus.Processing)
            .SetProperty(p => p.ConvertingBy, "gone:1").SetProperty(p => p.LeaseUntil, now.AddSeconds(-1)).SetProperty(p => p.UpdatedAt, now.AddMinutes(-1)));
        await store.PutSourceAsync(owner, dead, new MemoryStream(DeckInspector.Inspect(TestDecks.Build(2)).Deck), default);
        await db.Presentations.Where(p => p.Id == stuck).ExecuteUpdateAsync(s => s.SetProperty(p => p.Status, PresentationStatus.Processing)
            .SetProperty(p => p.UpdatedAt, now.AddMinutes(-11)));
        await store.PutSourceAsync(owner, stuck, new MemoryStream([1]), default);
        var version = (await db.Presentations.AsNoTracking().SingleAsync(p => p.Id == stuck)).Version;

        Assert.True(await _factory.Services.GetRequiredService<PresentationConverterService>().TimeOutStuckAsync(default) >= 1);

        Assert.Equal("ready", (await WaitReadyAsync(dead)).GetProperty("status").GetString());
        var row = await db.Presentations.AsNoTracking().SingleAsync(p => p.Id == stuck);
        Assert.Equal((PresentationStatus.Failed, "timeout", version + 1), (row.Status, row.Error, row.Version));
        Assert.Null(await store.OpenSourceAsync(owner, stuck, default));
        Assert.True(await db.AuditEvents.AnyAsync(a => a.Type == "presentation.failed" && a.UserId == owner));
    }

    [Fact]
    public async Task Other_people_cannot_see_or_touch_a_presentation()
    {
        var id = await UploadReadyAsync();
        var detail = await _owner.GetFromJsonAsync<JsonElement>($"/api/presentations/{id}");
        var image = detail.GetProperty("slides")[0].GetProperty("image").GetString();

        var stranger = Browser(_factory);
        var strangerCsrf = await stranger.SignInAsync(_root, $"stranger-{Guid.NewGuid():N}@example.test");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/presentations/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(image)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.DeleteAsync($"/api/presentations/{id}", strangerCsrf)).StatusCode);
        Assert.DoesNotContain((await stranger.GetFromJsonAsync<JsonElement>("/api/presentations")).EnumerateArray(), p => p.GetProperty("id").GetGuid() == id);
        // Signed out: no library, no pictures.
        var anonymous = Browser(_factory);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/presentations")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(image)).StatusCode);
    }

    [Fact]
    public async Task Uploads_need_the_csrf_header()
    {
        using var form = new MultipartFormDataContent { { new ByteArrayContent(TestDecks.Build(1)), "file", "deck.pptx" } };

        var res = await _owner.PostAsync("/api/presentations", form);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Rename_and_settings_use_optimistic_versions()
    {
        var id = await UploadReadyAsync();
        var version = (await _owner.GetFromJsonAsync<JsonElement>($"/api/presentations/{id}")).GetProperty("version").GetInt32();

        var renamed = await PatchAsync($"/api/presentations/{id}", new { name = "  All hands  ", showPodium = false, version });
        var stale = await PatchAsync($"/api/presentations/{id}", new { name = "Too late", version });
        var empty = await PatchAsync($"/api/presentations/{id}", new { name = "   ", version = version + 1 });

        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);
        var body = await renamed.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("All hands", body.GetProperty("name").GetString());
        Assert.False(body.GetProperty("showPodium").GetBoolean());
        Assert.Equal(version + 1, body.GetProperty("version").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);
    }

    [Fact]
    public async Task Slides_can_be_hidden_and_deleted_and_positions_stay_dense()
    {
        var id = await UploadReadyAsync(TestDecks.Build(4));
        var detail = await _owner.GetFromJsonAsync<JsonElement>($"/api/presentations/{id}");
        var slides = detail.GetProperty("slides").EnumerateArray().Select(s => s.GetProperty("id").GetGuid()).ToList();
        var version = detail.GetProperty("version").GetInt32();

        var hidden = await _owner.PutJsonAsync($"/api/presentations/{id}/slides/{slides[0]}", new { hidden = true, version }, _csrf);
        Assert.Equal(HttpStatusCode.OK, hidden.StatusCode);
        var deleted = await _owner.DeleteAsync($"/api/presentations/{id}/slides/{slides[1]}?version={version + 1}", _csrf);

        Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);
        var after = await deleted.Content.ReadFromJsonAsync<JsonElement>();
        var left = after.GetProperty("slides").EnumerateArray().ToList();
        Assert.Equal([slides[0], slides[2], slides[3]], left.Select(s => s.GetProperty("id").GetGuid()));
        Assert.Equal([0, 1, 2], left.Select(s => s.GetProperty("position").GetInt32()));
        Assert.True(left[0].GetProperty("hidden").GetBoolean());
        Assert.Equal(3, after.GetProperty("slideCount").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await _owner.GetAsync($"/api/slides/{slides[1]}/image")).StatusCode);
    }

    [Fact]
    public async Task Deleting_a_presentation_removes_its_pictures()
    {
        var id = await UploadReadyAsync(TestDecks.Build(2));
        var image = (await _owner.GetFromJsonAsync<JsonElement>($"/api/presentations/{id}")).GetProperty("slides")[0].GetProperty("image").GetString();

        var res = await _owner.DeleteAsync($"/api/presentations/{id}", _csrf);

        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _owner.GetAsync($"/api/presentations/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _owner.GetAsync(image)).StatusCode);
    }

    [Fact]
    public async Task Janitor_deletes_idle_presentations_and_orphan_folders()
    {
        var idle = await UploadReadyAsync(TestDecks.Build(1));
        var fresh = await UploadReadyAsync(TestDecks.Build(1));
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        var store = scope.ServiceProvider.GetRequiredService<SlideStore>();
        var old = _root.Clock.GetUtcNow().AddDays(-366);
        await db.Presentations.Where(p => p.Id == idle).ExecuteUpdateAsync(s => s.SetProperty(p => p.LastUsedAt, old));
        var (orphanOwner, orphan) = (Guid.NewGuid(), Guid.NewGuid());
        await store.PutSlideAsync(orphanOwner, orphan, Guid.NewGuid(), thumb: false, new MemoryStream([1]), default);

        // Flagged in the library during its last month (FR-604a).
        var listed = await _owner.GetFromJsonAsync<JsonElement>("/api/presentations");
        Assert.Equal(0, listed.EnumerateArray().Single(p => p.GetProperty("id").GetGuid() == idle).GetProperty("deletesInDays").GetInt32());

        var (purged, orphans) = await _factory.Services.GetRequiredService<PresentationJanitor>().SweepAsync(default);

        Assert.True(purged >= 1);
        Assert.True(orphans >= 1);
        Assert.False(await db.Presentations.AnyAsync(p => p.Id == idle));
        Assert.True(await db.Presentations.AnyAsync(p => p.Id == fresh));
        Assert.Equal(0, await store.DeletePresentationAsync(orphanOwner, orphan, default));
    }

    [Fact]
    public async Task Uploads_are_rate_limited_per_user()
    {
        await using var root = Factory(new Dictionary<string, string?> { ["RateLimits:PresentationUploadsPerUserPerHour"] = "2" });
        await using var factory = WithConverter(root);
        var http = Browser(factory);
        var csrf = await http.SignInAsync(root, $"limit-{Guid.NewGuid():N}@example.test");

        Assert.Equal(HttpStatusCode.Accepted, (await UploadAsync(http, csrf, TestDecks.Build(1))).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await UploadAsync(http, csrf, TestDecks.Build(1))).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await UploadAsync(http, csrf, TestDecks.Build(1))).StatusCode);
    }

    private async Task<HttpResponseMessage> PatchAsync(string url, object body)
    {
        using var req = new HttpRequestMessage(HttpMethod.Patch, url) { Content = JsonContent.Create(body) };
        req.Headers.Add("X-XSRF-TOKEN", _csrf);
        return await _owner.SendAsync(req);
    }
}
