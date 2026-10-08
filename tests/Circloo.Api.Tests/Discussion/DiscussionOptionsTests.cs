using System.ComponentModel.DataAnnotations;
using Circloo.Api.Discussion;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Circloo.Api.Tests.Discussion;

/// <summary>
/// Issues #216 (T901) and #258 (T918): the <c>Discussion:*</c> and <c>LiveKit:*</c> settings and their start-up checks
/// (spec 009 data-model, "Configuration").
/// </summary>
public sealed class DiscussionOptionsTests
{
    private const string Secret = "0123456789abcdef0123456789abcdef"; // exactly 32 characters

    private static string[] Problems(LiveKitOptions o) =>
        new LiveKitOptionsValidator().Validate(null, o).Failures?.ToArray() ?? [];

    /// <summary>The AppHost's local settings (T916): plain ws and http on localhost.</summary>
    private static LiveKitOptions Local() => new()
    {
        Url = "ws://localhost:7880", ApiUrl = "http://localhost:7880", ApiKey = "circloo-dev", ApiSecret = Secret,
    };

    [Theory]
    [InlineData(300, true)]
    [InlineData(60, true)]
    [InlineData(3600, true)]
    [InlineData(59, false)]
    [InlineData(3601, false)]
    public void The_animator_away_delay_is_one_minute_to_one_hour(int seconds, bool valid)
    {
        Assert.Equal(300, new DiscussionOptions().AwayEndSeconds);
        var o = new DiscussionOptions { AwayEndSeconds = seconds };
        Assert.Equal(valid, Validator.TryValidateObject(o, new ValidationContext(o), null, validateAllProperties: true));
    }

    [Fact]
    public void Without_a_call_server_calls_are_unavailable_and_nothing_else_is_checked()
    {
        var o = new LiveKitOptions { ApiKey = "x", ApiSecret = "short", TokenMinutes = 0, ApiUrl = "nonsense" };
        Assert.False(o.Available);
        Assert.Empty(Problems(o));
        Assert.Empty(Problems(new LiveKitOptions { Url = "   " }));
        Assert.Equal(5, new LiveKitOptions().TokenMinutes);
    }

    [Fact]
    public void The_local_settings_of_the_apphost_are_valid()
    {
        var o = Local();
        Assert.True(o.Available);
        Assert.Empty(Problems(o));
        Assert.Equal(new Uri("http://localhost:7880/"), o.RoomServiceUrl);
    }

    [Theory]
    [InlineData("wss://lk-abc123.francecentral.cloudapp.azure.com", "https://lk-abc123.francecentral.cloudapp.azure.com/")]
    [InlineData("ws://localhost:7880", "http://localhost:7880/")]
    [InlineData("wss://calls.example.test:8443", "https://calls.example.test:8443/")]
    public void The_room_service_address_defaults_from_the_url(string url, string expected)
    {
        var o = Local();
        o.Url = url;
        o.ApiUrl = null;
        Assert.Empty(Problems(o));
        Assert.Equal(new Uri(expected), o.RoomServiceUrl);
    }

    [Theory]
    [InlineData("https://calls.example.test")]
    [InlineData("http://localhost:7880")]
    [InlineData("calls.example.test")]
    [InlineData("wss://user:pass@calls.example.test")]
    [InlineData("wss://calls.example.test/?token=x")]
    public void The_url_must_be_a_websocket_address(string url)
    {
        var o = Local();
        o.Url = url;
        Assert.Contains(Problems(o), p => p.StartsWith("LiveKit:Url", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("ws://localhost:7880")]
    [InlineData("ftp://localhost")]
    [InlineData("localhost:7880")]
    public void The_api_url_must_be_an_http_address(string apiUrl)
    {
        var o = Local();
        o.ApiUrl = apiUrl;
        Assert.Equal(new[] { "LiveKit:ApiUrl must be an http:// or https:// address." }, Problems(o));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("secret")]
    [InlineData("0123456789abcdef0123456789abcde")] // 31 characters
    public void The_secret_needs_32_characters_and_is_never_named_in_the_message(string? secret)
    {
        var o = Local();
        o.ApiSecret = secret;
        var problem = Assert.Single(Problems(o));
        Assert.StartsWith("LiveKit:ApiSecret", problem, StringComparison.Ordinal);
        if (!string.IsNullOrEmpty(secret))
        {
            Assert.DoesNotContain(secret, problem, StringComparison.Ordinal);
        }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("ab")]
    [InlineData("has space")]
    [InlineData("k1234567890123456789012345678901234567890123456789012345678901234")] // 65 characters
    public void The_key_id_is_3_to_64_characters(string? key)
    {
        var o = Local();
        o.ApiKey = key;
        Assert.StartsWith("LiveKit:ApiKey", Assert.Single(Problems(o)), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(31)]
    public void A_call_pass_lasts_1_to_30_minutes(int minutes)
    {
        var o = Local();
        o.TokenMinutes = minutes;
        Assert.StartsWith("LiveKit:TokenMinutes", Assert.Single(Problems(o)), StringComparison.Ordinal);
    }

    [Fact]
    public void A_wrong_call_server_setting_stops_the_app_at_start_up()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["LiveKit:Url"] = "ws://localhost:7880",
            ["LiveKit:ApiKey"] = "devkey",
            ["LiveKit:ApiSecret"] = "secret",
        }).Build();
        var services = new ServiceCollection().AddSingleton<IConfiguration>(config);
        DiscussionOptions.AddDiscussion(services);
        using var provider = services.BuildServiceProvider();

        var failed = Assert.Throws<OptionsValidationException>(() => provider.GetRequiredService<IStartupValidator>().Validate());
        Assert.Contains(failed.Failures, f => f.StartsWith("LiveKit:ApiSecret", StringComparison.Ordinal));
    }

    [Fact]
    public void An_environment_without_a_call_server_starts()
    {
        var services = new ServiceCollection().AddSingleton<IConfiguration>(new ConfigurationBuilder().Build());
        DiscussionOptions.AddDiscussion(services);
        using var provider = services.BuildServiceProvider();

        provider.GetRequiredService<IStartupValidator>().Validate();
        Assert.False(provider.GetRequiredService<IOptions<LiveKitOptions>>().Value.Available);
    }
}
