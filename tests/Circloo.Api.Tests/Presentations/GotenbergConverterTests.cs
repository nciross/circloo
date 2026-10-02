using System.Diagnostics;
using Circloo.Api.Presentations;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Circloo.Api.Tests.Presentations;

/// <summary>The real converter: Gotenberg 8 (LibreOffice) in a container, then PDFium (research R1, SC-601).</summary>
[Trait("Category", "Converter")]
public sealed class GotenbergConverterTests : IAsyncLifetime
{
    private readonly IContainer _gotenberg = new ContainerBuilder("gotenberg/gotenberg:8")
        .WithCommand("gotenberg", "--api-timeout=120s", "--chromium-disable-routes=true", "--webhook-disable=true", "--prometheus-disable-collect=true")
        .WithPortBinding(3000, assignRandomHostPort: true)
        .WithWaitStrategy(Wait.ForUnixContainer().UntilHttpRequestIsSucceeded(r => r.ForPort(3000).ForPath("/health")))
        .Build();
    private GotenbergConverter _converter = null!;
    private ServiceProvider _services = null!;

    public async Task InitializeAsync()
    {
        Environment.SetEnvironmentVariable("TESTCONTAINERS_RYUK_DISABLED", "true");
        await _gotenberg.StartAsync();
        var url = $"http://{_gotenberg.Hostname}:{_gotenberg.GetMappedPublicPort(3000)}/";
        _services = new ServiceCollection()
            .AddHttpClient(PresentationOptions.ConverterClient, c => { c.BaseAddress = new Uri(url); c.Timeout = TimeSpan.FromSeconds(130); })
            .Services.BuildServiceProvider();
        _converter = new GotenbergConverter(_services.GetRequiredService<IHttpClientFactory>(), Options.Create(new PresentationOptions { ConverterUrl = url }));
    }

    public async Task DisposeAsync()
    {
        await _services.DisposeAsync();
        await _gotenberg.DisposeAsync();
    }

    [Fact]
    public async Task Hidden_slides_are_exported_so_pages_match_slides()
    {
        var deck = DeckInspector.Inspect(TestDecks.Build(5, hidden: [2])).Deck;

        var pdf = await _converter.ToPdfAsync(deck, default);

        Assert.Equal(5, SlideRenderer.PageCount(pdf));
    }

    [Fact]
    public async Task A_thirty_slide_deck_is_ready_in_under_a_minute()
    {
        var watch = Stopwatch.StartNew();
        var deck = DeckInspector.Inspect(TestDecks.Build(30)).Deck;
        var pdf = await _converter.ToPdfAsync(deck, default);
        var pages = SlideRenderer.PageCount(pdf);
        for (var page = 0; page < pages; page++)
        {
            var rendered = SlideRenderer.Render(pdf, page);
            Assert.True(rendered.Full.Length < 250 * 1024, $"slide {page + 1} is {rendered.Full.Length} bytes");
        }
        watch.Stop();

        Assert.Equal(30, pages);
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(60), $"took {watch.Elapsed}");
    }
}
