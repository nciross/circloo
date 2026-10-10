using Microsoft.Extensions.Options;

namespace Circloo.Api.Discussion;

/// <summary>
/// Where the self-hosted LiveKit call server is and how the API signs for it (spec 009 data-model, research R20, R30).
/// An empty <see cref="Url"/> means this environment has no call server: calls are unavailable (FR-935) and nothing
/// else is checked. Otherwise every value is checked at start-up, so a wrong setting stops the app instead of failing
/// the first call.
/// </summary>
public sealed class LiveKitOptions
{
    public const string Section = "LiveKit";
    public const int MinSecretLength = 32;

    private static readonly string[] ClientSchemes = ["ws", "wss"];
    private static readonly string[] ApiSchemes = ["http", "https"];

    /// <summary>The address browsers connect to, <c>ws://</c> locally or <c>wss://</c> when deployed. Empty: calls are unavailable.</summary>
    public string? Url { get; set; }

    /// <summary>Where the API calls RoomService. Empty: derived from <see cref="Url"/> (<c>ws</c> to <c>http</c>, <c>wss</c> to <c>https</c>).</summary>
    public string? ApiUrl { get; set; }

    /// <summary>The key id, not a secret.</summary>
    public string? ApiKey { get; set; }

    /// <summary>The signing secret: user-secrets locally, Key Vault (<c>livekit-api-secret</c>) in Azure. Never logged.</summary>
    public string? ApiSecret { get; set; }

    /// <summary>Lifetime of a call pass, in minutes.</summary>
    public int TokenMinutes { get; set; } = 5;

    /// <summary>Whether this environment has a call server.</summary>
    public bool Available => !string.IsNullOrWhiteSpace(Url);

    /// <summary>The RoomService address: <see cref="ApiUrl"/> when set, otherwise <see cref="Url"/> with an HTTP scheme. Null when unavailable.</summary>
    public Uri? RoomServiceUrl
    {
        get
        {
            if (!string.IsNullOrWhiteSpace(ApiUrl))
            {
                return Uri.TryCreate(ApiUrl.Trim(), UriKind.Absolute, out var api) ? api : null;
            }
            if (!Available || !Uri.TryCreate(Url!.Trim(), UriKind.Absolute, out var url) || !ClientSchemes.Contains(url.Scheme))
            {
                return null;
            }
            return new UriBuilder(url) { Scheme = url.Scheme == "wss" ? Uri.UriSchemeHttps : Uri.UriSchemeHttp, Port = url.IsDefaultPort ? -1 : url.Port }.Uri;
        }
    }

    /// <summary>Why the settings are wrong; empty when they are fine or when no call server is configured.</summary>
    public IEnumerable<string> Problems()
    {
        if (!Available)
        {
            yield break;
        }
        if (!IsAddress(Url, ClientSchemes))
        {
            yield return "LiveKit:Url must be a ws:// or wss:// address.";
        }
        if (!string.IsNullOrWhiteSpace(ApiUrl) && !IsAddress(ApiUrl, ApiSchemes))
        {
            yield return "LiveKit:ApiUrl must be an http:// or https:// address.";
        }
        if (ApiKey is null || ApiKey.Trim().Length is < 3 or > 64 || ApiKey.Any(char.IsWhiteSpace))
        {
            yield return "LiveKit:ApiKey must be 3 to 64 characters without spaces when LiveKit:Url is set.";
        }
        // The value itself is never part of the message.
        if (ApiSecret is null || ApiSecret.Length < MinSecretLength)
        {
            yield return $"LiveKit:ApiSecret must be at least {MinSecretLength} characters when LiveKit:Url is set.";
        }
        if (TokenMinutes is < 1 or > 30)
        {
            yield return "LiveKit:TokenMinutes must be between 1 and 30.";
        }
    }

    private static bool IsAddress(string? value, string[] schemes) =>
        Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var uri) && schemes.Contains(uri.Scheme)
        && !string.IsNullOrEmpty(uri.Host) && string.IsNullOrEmpty(uri.UserInfo) && string.IsNullOrEmpty(uri.Query) && string.IsNullOrEmpty(uri.Fragment);

    public static IServiceCollection AddLiveKit(IServiceCollection services)
    {
        services.AddOptions<LiveKitOptions>().BindConfiguration(Section).ValidateOnStart();
        services.AddSingleton<IValidateOptions<LiveKitOptions>, LiveKitOptionsValidator>();
        return services;
    }
}

/// <summary>Fails start-up with every <see cref="LiveKitOptions.Problems"/> named, so the operator sees which setting is wrong.</summary>
public sealed class LiveKitOptionsValidator : IValidateOptions<LiveKitOptions>
{
    public ValidateOptionsResult Validate(string? name, LiveKitOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        var problems = options.Problems().ToList();
        return problems.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(problems);
    }
}
