using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Circloo.Api.Presentations;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Testcontainers.Azurite;

namespace Circloo.Api.Tests.Presentations;

/// <summary>
/// The API with a real Postgres, a real Azurite and a fake deck converter, plus a signed-in owner:
/// shared by the presentation test classes (spec 006).
/// </summary>
public sealed class PresentationHost(PostgresFixture pg) : IAsyncDisposable
{
    private readonly AzuriteContainer _azurite = new AzuriteBuilder("mcr.microsoft.com/azure-storage/azurite:3.35.0")
        .WithInMemoryPersistence().WithCommand("--skipApiVersionCheck").Build();

    public FakeConverter Converter { get; } = new();
    public ApiFactory Root { get; private set; } = null!;
    public WebApplicationFactory<Program> Factory { get; private set; } = null!;
    public HttpClient Owner { get; private set; } = null!;
    public string Csrf { get; private set; } = null!;

    public async Task StartAsync(Dictionary<string, string?>? overrides = null)
    {
        await _azurite.StartAsync();
        (Root, Factory) = Create(overrides ?? []);
        Owner = Browser();
        Csrf = await Owner.SignInAsync(Root, $"deck-{Guid.NewGuid():N}@example.test");
    }

    public (ApiFactory Root, WebApplicationFactory<Program> Factory) Create(Dictionary<string, string?> overrides)
    {
        overrides["ConnectionStrings:blobs"] = _azurite.GetConnectionString();
        var root = new ApiFactory(pg.Container.GetConnectionString(), overrides);
        var factory = root.WithWebHostBuilder(b => b.ConfigureServices(s =>
        {
            s.RemoveAll<IDeckConverter>();
            s.AddSingleton<IDeckConverter>(Converter);
        }));
        return (root, factory);
    }

    public HttpClient Browser(WebApplicationFactory<Program>? factory = null) =>
        (factory ?? Factory).CreateDefaultClient(new Uri("https://localhost"), new CookieContainerHandler());

    public static async Task<HttpResponseMessage> UploadAsync(HttpClient http, string csrf, byte[] file, string name = "Team kickoff.pptx")
    {
        using var form = new MultipartFormDataContent();
        var content = new ByteArrayContent(file);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.presentationml.presentation");
        form.Add(content, "file", name);
        using var req = new HttpRequestMessage(HttpMethod.Post, "/api/presentations") { Content = form };
        req.Headers.Add("X-XSRF-TOKEN", csrf);
        return await http.SendAsync(req);
    }

    public async Task<JsonElement> WaitReadyAsync(Guid id)
    {
        for (var i = 0; i < 100; i++)
        {
            var detail = await Owner.GetFromJsonAsync<JsonElement>($"/api/presentations/{id}");
            if (detail.GetProperty("status").GetString() != "processing")
            {
                return detail;
            }
            await Task.Delay(100);
        }
        throw new TimeoutException("conversion did not finish");
    }

    public async Task<Guid> UploadReadyAsync(byte[]? deck = null)
    {
        var res = await UploadAsync(Owner, Csrf, deck ?? TestDecks.Demo());
        Assert.Equal(HttpStatusCode.Accepted, res.StatusCode);
        var id = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal("ready", (await WaitReadyAsync(id)).GetProperty("status").GetString());
        return id;
    }

    public Task<JsonElement> DetailAsync(Guid id) => Owner.GetFromJsonAsync<JsonElement>($"/api/presentations/{id}");

    public async Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, object? body = null)
    {
        using var req = new HttpRequestMessage(method, url) { Content = body is null ? null : JsonContent.Create(body) };
        req.Headers.Add("X-XSRF-TOKEN", Csrf);
        return await Owner.SendAsync(req);
    }

    public async ValueTask DisposeAsync()
    {
        if (Factory is not null)
        {
            await Factory.DisposeAsync();
        }
        if (Root is not null)
        {
            await Root.DisposeAsync();
        }
        await _azurite.DisposeAsync();
    }
}
