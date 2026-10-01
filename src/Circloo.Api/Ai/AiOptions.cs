using System.ClientModel;
using System.ClientModel.Primitives;
using Azure.Identity;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using OpenAI;

namespace Circloo.Api.Ai;

public sealed class AiOptions
{
    public const string Section = "Ai";

    /// <summary><c>Seed</c> (default, zero cost, no network) or <c>OpenAICompatible</c> (Microsoft Foundry, Foundry Local).</summary>
    public string Provider { get; set; } = "Seed";

    /// <summary>OpenAI-compatible base URL, e.g. https://&lt;resource&gt;.openai.azure.com/openai/v1/ or http://localhost:5273/v1.</summary>
    public string? Endpoint { get; set; }

    /// <summary>Model or deployment name.</summary>
    public string Model { get; set; } = SeedRemixChatClient.ModelName;

    /// <summary><c>ManagedIdentity</c> (Foundry in Azure), <c>ApiKey</c> or <c>None</c> (Foundry Local).</summary>
    public string Auth { get; set; } = "None";

    public string? ApiKey { get; set; }
    public int DailyPerUser { get; set; } = 20;
    public int DailyGlobal { get; set; } = 200;
    public int TimeoutSeconds { get; set; } = 15;

    public bool IsSeed => !string.Equals(Provider, "OpenAICompatible", StringComparison.OrdinalIgnoreCase);
}

public static class AiServiceCollectionExtensions
{
    private const string CognitiveServicesScope = "https://cognitiveservices.azure.com/.default";

    /// <summary>
    /// Registers one <see cref="IChatClient"/> chosen by configuration only (FR-111). Microsoft Foundry and Foundry Local both
    /// speak the OpenAI v1 API, so a single OpenAI client covers them; dev defaults to the free seed remix (constitution IX).
    /// </summary>
    public static IServiceCollection AddCirclooAi(this IServiceCollection services, IConfiguration config)
    {
        services.AddOptions<AiOptions>().BindConfiguration(AiOptions.Section);
        services.AddSingleton<SeedRemixChatClient>();
        services.AddSingleton<IChatClient>(sp =>
        {
            var o = sp.GetRequiredService<IOptions<AiOptions>>().Value;
            IChatClient inner = o.IsSeed ? sp.GetRequiredService<SeedRemixChatClient>() : CreateOpenAICompatible(o);
            return inner.AsBuilder().UseOpenTelemetry(sourceName: "Circloo.Ai").Build(sp);
        });
        services.AddSingleton<SafetyPolicy>();
        services.AddSingleton<InFlightGate>();
        services.AddScoped<IcebreakerGenerator>();
        return services;
    }

    private static IChatClient CreateOpenAICompatible(AiOptions o)
    {
        if (string.IsNullOrWhiteSpace(o.Endpoint))
        {
            throw new InvalidOperationException("Ai:Endpoint is required when Ai:Provider is OpenAICompatible.");
        }
        var options = new OpenAIClientOptions { Endpoint = new Uri(o.Endpoint) };
        var client = o.Auth switch
        {
            // Entra token for Microsoft Foundry; this constructor is marked evaluation-only in the OpenAI SDK.
#pragma warning disable OPENAI001
            "ManagedIdentity" => new OpenAIClient(new BearerTokenPolicy(new DefaultAzureCredential(), CognitiveServicesScope), options),
#pragma warning restore OPENAI001
            "ApiKey" => new OpenAIClient(new ApiKeyCredential(o.ApiKey ?? throw new InvalidOperationException("Ai:ApiKey is required.")), options),
            _ => new OpenAIClient(new ApiKeyCredential("not-needed"), options),
        };
        return client.GetChatClient(o.Model).AsIChatClient();
    }
}
