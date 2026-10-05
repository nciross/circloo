using System.ComponentModel.DataAnnotations;

namespace Circloo.Api.Discussion;

/// <summary>
/// The live discussion's settings (spec 009 data-model, "Configuration"): plain settings with code defaults, no secret.
/// Configuration, never customer-specific code (constitution V).
/// </summary>
public sealed class DiscussionOptions
{
    public const string Section = "Discussion";

    public static readonly string[] DefaultIceUrls = ["stun:stun.cloudflare.com:3478"];
    private static readonly string[] IceSchemes = ["stun", "stuns", "turn", "turns"];

    /// <summary>People sending at once, the animator included.</summary>
    [Range(2, 12)]
    public int StageMax { get; set; } = 8;

    /// <summary>Receive-only viewers.</summary>
    [Range(0, 24)]
    public int ListenersMax { get; set; } = 8;

    /// <summary>
    /// ICE servers handed to the browsers; null means the default. Read it through <see cref="IceServers"/>: blank
    /// entries are dropped, so one blank entry (local development) leaves host candidates only.
    /// </summary>
    public string[]? IceUrls { get; set; }

    /// <summary>A dropped connection keeps its seat this long.</summary>
    [Range(5, 120)]
    public int SeatGraceSeconds { get; set; } = 30;

    /// <summary>A floor invitation expires if the person does not join.</summary>
    [Range(10, 300)]
    public int InviteSeconds { get; set; } = 60;

    /// <summary>Animator away: the stage freezes.</summary>
    [Range(10, 600)]
    public int AwayFreezeSeconds { get; set; } = 60;

    /// <summary>Animator away: the discussion ends. Must exceed <see cref="AwayFreezeSeconds"/>.</summary>
    [Range(60, 3600)]
    public int AwayEndSeconds { get; set; } = 300;

    [Range(2, 30)]
    public int RecordingNoticeSeconds { get; set; } = 5;

    [Range(10, 480)]
    public int RecordingMaxMinutes { get; set; } = 240;

    [Range(1, 60)]
    public int RecordingWarnMinutes { get; set; } = 15;

    [Range(1000, 200000)]
    public int RecordingMaxEvents { get; set; } = 50000;

    [Range(1, 500)]
    public int RecordingsPerCircle { get; set; } = 50;

    /// <summary>The ICE servers to hand out: the configured ones without blanks, or the default when none were set.</summary>
    public string[] IceServers => IceUrls is null ? DefaultIceUrls : [.. IceUrls.Where(u => !string.IsNullOrWhiteSpace(u)).Select(u => u.Trim())];

    /// <summary>Why the settings that data annotations cannot judge are wrong; empty when they are fine.</summary>
    public IEnumerable<string> Problems()
    {
        if (AwayEndSeconds <= AwayFreezeSeconds)
        {
            yield return "Discussion:AwayEndSeconds must be greater than Discussion:AwayFreezeSeconds.";
        }
        if (RecordingWarnMinutes >= RecordingMaxMinutes)
        {
            yield return "Discussion:RecordingWarnMinutes must be less than Discussion:RecordingMaxMinutes.";
        }
        foreach (var url in IceServers.Where(u => !IsIceUrl(u)))
        {
            yield return $"Discussion:IceUrls has an entry that is not a stun, stuns, turn or turns address: '{url}'.";
        }
    }

    private static bool IsIceUrl(string url)
    {
        var colon = url.IndexOf(':');
        return colon > 0 && IceSchemes.Contains(url[..colon], StringComparer.Ordinal) && colon < url.Length - 1 && !url.Any(char.IsWhiteSpace);
    }

    public static IServiceCollection AddDiscussion(IServiceCollection services)
    {
        services.AddOptions<DiscussionOptions>().BindConfiguration(Section)
            .ValidateDataAnnotations()
            .Validate(o => !o.Problems().Any(), "Discussion settings are invalid.")
            .ValidateOnStart();
        return services;
    }
}
