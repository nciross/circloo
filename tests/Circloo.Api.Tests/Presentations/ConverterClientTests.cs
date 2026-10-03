using Circloo.Api.Presentations;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Circloo.Api.Tests.Presentations;

/// <summary>
/// Issue #139: the converter call must not inherit the standard resilience handler (10 s per attempt, 30 s total,
/// which cut every conversion short); it keeps its own 130 s timeout and only a retry for transient failures.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class ConverterClientTests(PostgresFixture pg) : IAsyncLifetime
{
    private ApiFactory _factory = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString());
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private List<string> HandlerChain(string client)
    {
        var names = new List<string>();
        var handler = _factory.Services.GetRequiredService<IHttpMessageHandlerFactory>().CreateHandler(client);
        while (handler is DelegatingHandler delegating)
        {
            names.Add(delegating.GetType().Name);
            handler = delegating.InnerHandler!;
        }
        return names;
    }

    [Fact]
    public void The_converter_keeps_its_own_timeout_and_one_retry_handler_only()
    {
        Assert.Equal(TimeSpan.FromSeconds(130), _factory.Services.GetRequiredService<IHttpClientFactory>().CreateClient(PresentationOptions.ConverterClient).Timeout);
        // One resilience handler (our retry), not the standard one stacked on top of it.
        Assert.Single(HandlerChain(PresentationOptions.ConverterClient), name => name == "ResilienceHandler");
        // Other clients keep the service defaults.
        Assert.Contains("ResilienceHandler", HandlerChain("any-other-client"));
    }
}
