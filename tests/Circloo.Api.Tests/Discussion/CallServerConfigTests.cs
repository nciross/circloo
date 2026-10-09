using Circloo.Api.Tests.Infrastructure;

namespace Circloo.Api.Tests.Discussion;

/// <summary>
/// Issue #256 (T916), SC-906: the call server never records or bridges media, and only the API opens rooms or
/// switches a microphone on. Reads the LiveKit configuration files as committed: the local one and, since #257
/// (T917), the template the Azure VM runs.
/// </summary>
public sealed class CallServerConfigTests
{
    private const string AzureFile = "infra/livekit/livekit.yaml";

    public static TheoryData<string> Files() => new()
    {
        "src/Circloo.AppHost/livekit.dev.yaml",
        AzureFile,
    };

    [Theory]
    [MemberData(nameof(Files))]
    public void There_is_no_egress_ingress_or_sip_section(string file)
    {
        var settings = Read(file);

        foreach (var section in new[] { "egress", "ingress", "sip" })
        {
            Assert.DoesNotContain(settings.Keys, k => k == section || k.StartsWith(section + ".", StringComparison.Ordinal));
        }
    }

    [Theory]
    [MemberData(nameof(Files))]
    public void Rooms_are_never_auto_created_and_never_unmuted_remotely(string file)
    {
        var settings = Read(file);

        // LiveKit's own default for auto_create is true, so both must be written out.
        Assert.Equal("false", settings.GetValueOrDefault("room.auto_create"));
        Assert.Equal("false", settings.GetValueOrDefault("room.enable_remote_unmute"));
    }

    [Theory]
    [MemberData(nameof(Files))]
    public void Speaker_detection_keeps_400_ms_windows_so_the_highlight_does_not_flicker(string file)
    {
        var settings = Read(file);

        // Issue #276: shorter windows drop the speaking highlight between words. The values are written out so a
        // config copied for the call server's VM keeps them.
        Assert.Equal("400", settings.GetValueOrDefault("audio.update_interval"));
        Assert.Equal("2", settings.GetValueOrDefault("audio.smooth_intervals"));
    }

    [Fact]
    public void The_dev_file_holds_no_keys_because_the_secret_lives_in_user_secrets()
    {
        var settings = Read("src/Circloo.AppHost/livekit.dev.yaml");

        Assert.DoesNotContain(settings.Keys, k => k == "keys" || k.StartsWith("keys.", StringComparison.Ordinal));
        Assert.Equal("circloo-dev", settings.GetValueOrDefault("webhook.api_key"));
    }

    [Fact]
    public void The_azure_file_reads_its_key_from_the_root_only_file_written_from_key_vault()
    {
        var settings = Read(AzureFile);

        // Issue #257: the secret never sits in the template or in the VM's userData; boot.sh writes the key file.
        Assert.DoesNotContain(settings.Keys, k => k == "keys" || k.StartsWith("keys.", StringComparison.Ordinal));
        Assert.Equal("/etc/livekit/keys.yaml", settings.GetValueOrDefault("key_file"));
        Assert.Contains("/etc/livekit/keys.yaml", ReadText("infra/livekit/boot.sh"), StringComparison.Ordinal);
    }

    [Fact]
    public void The_azure_file_opens_only_the_ports_the_network_security_group_allows()
    {
        var settings = Read(AzureFile);
        var nsg = ReadText("infra/modules/livekit.bicep");

        // Research R28: ICE/TCP 7881, one muxed UDP port 7882, TURN/UDP 3478; TURN/TLS arrives on 443 through Caddy.
        Assert.Equal("7881", settings.GetValueOrDefault("rtc.tcp_port"));
        Assert.Equal("7882", settings.GetValueOrDefault("rtc.udp_port"));
        Assert.Equal("3478", settings.GetValueOrDefault("turn.udp_port"));
        Assert.Equal("true", settings.GetValueOrDefault("turn.external_tls"));
        Assert.Equal("true", settings.GetValueOrDefault("turn.proxy_protocol"));
        string[] fromInternet = ["443", "7881", "7882", "3478"];
        foreach (var port in fromInternet)
        {
            Assert.Contains($"destinationPortRange: '{port}'", nsg, StringComparison.Ordinal);
        }
        Assert.Equal(fromInternet.Length, nsg.Split("sourceAddressPrefix: 'Internet'").Length - 1);

        // The one other rule: the relay ports, only from the VM's own public IP.
        var relay = $"{settings.GetValueOrDefault("turn.relay_range_start")}-{settings.GetValueOrDefault("turn.relay_range_end")}";
        Assert.Contains($"var relayPorts = '{relay}'", nsg, StringComparison.Ordinal);
        Assert.Equal(fromInternet.Length + 1, nsg.Split("destinationPortRange:").Length - 1);
        Assert.Contains("sourceAddressPrefix: '${lkIp.properties.ipAddress}/32'", nsg, StringComparison.Ordinal);
    }

    [Fact]
    public void The_azure_file_logs_warnings_only()
    {
        var settings = Read(AzureFile);

        // Research R26: little personal data in the VM's logs.
        Assert.Equal("warn", settings.GetValueOrDefault("logging.level"));
        Assert.Equal("error", settings.GetValueOrDefault("logging.pion_level"));
    }

    [Fact]
    public void The_azure_vm_runs_the_same_pinned_image_as_the_tests_and_the_apphost()
    {
        var boot = ReadText("infra/livekit/boot.sh");

        Assert.Contains($"LIVEKIT_IMAGE='{LiveKitFixture.Image}'", boot, StringComparison.Ordinal);
        Assert.Contains("\"livekit/livekit-server\", \"" + LiveKitFixture.Image.Split(':')[1] + "\"",
            ReadText("src/Circloo.AppHost/AppHost.cs"), StringComparison.Ordinal);
        Assert.DoesNotContain(":latest", boot, StringComparison.Ordinal);
    }

    [Fact]
    public void The_reader_flattens_nested_keys_and_ignores_comments_and_list_items()
    {
        var settings = Parse(["# note", "room:", "  auto_create: false # inline", "  list:", "    - a", "egress:", "  s3: {}"]);

        Assert.Equal("false", settings["room.auto_create"]);
        Assert.Equal("", settings["room.list"]);
        Assert.True(settings.ContainsKey("egress.s3"));
        Assert.Equal(5, settings.Count);
    }

    private static Dictionary<string, string> Read(string file) => Parse(ReadText(file).Split('\n'));

    private static string ReadText(string file, [System.Runtime.CompilerServices.CallerFilePath] string source = "")
    {
        // From this source file: tests/Circloo.Api.Tests/Discussion → repo root.
        var path = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(source)!, "..", "..", "..", file));
        return File.ReadAllText(path).Replace("\r\n", "\n", StringComparison.Ordinal);
    }

    /// <summary>
    /// A small reader for block-style YAML maps: each key becomes its dotted path (<c>room.auto_create</c>) with its
    /// scalar value, or an empty value for a section. List items and comments are skipped. Enough for these files,
    /// and it avoids a YAML package for one test.
    /// </summary>
    private static Dictionary<string, string> Parse(IEnumerable<string> lines)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        var path = new List<(int Indent, string Key)>();
        foreach (var raw in lines)
        {
            var hash = raw.IndexOf(" #", StringComparison.Ordinal);
            var line = (raw.TrimStart().StartsWith('#') ? "" : hash >= 0 ? raw[..hash] : raw).TrimEnd();
            var text = line.TrimStart();
            var colon = text.IndexOf(':', StringComparison.Ordinal);
            if (text.Length == 0 || text.StartsWith('-') || colon <= 0)
            {
                continue;
            }
            var indent = line.Length - text.Length;
            path.RemoveAll(p => p.Indent >= indent);
            var key = text[..colon].Trim();
            path.Add((indent, key));
            result[string.Join('.', path.Select(p => p.Key))] = text[(colon + 1)..].Trim().Trim('"', '\'');
        }
        return result;
    }
}
