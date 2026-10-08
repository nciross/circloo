using System.ComponentModel.DataAnnotations;

namespace Circloo.Api.Discussion;

/// <summary>
/// The group call's own settings (spec 009 data-model, "Configuration"): plain settings with code defaults, no secret.
/// The call server's address and keys are <see cref="LiveKitOptions"/>. Configuration, never customer-specific code
/// (constitution V).
/// </summary>
public sealed class DiscussionOptions
{
    public const string Section = "Discussion";

    /// <summary>The call ends after the animator has been away this long (research R34, founder decision D6).</summary>
    [Range(60, 3600)]
    public int AwayEndSeconds { get; set; } = 300;

    /// <summary>Binds and checks both call sections at start-up: <c>Discussion</c> and <c>LiveKit</c>.</summary>
    public static IServiceCollection AddDiscussion(IServiceCollection services)
    {
        services.AddOptions<DiscussionOptions>().BindConfiguration(Section)
            .ValidateDataAnnotations()
            .ValidateOnStart();
        LiveKitOptions.AddLiveKit(services);
        return services;
    }
}
