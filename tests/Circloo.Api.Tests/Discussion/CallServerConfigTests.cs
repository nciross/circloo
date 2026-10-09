namespace Circloo.Api.Tests.Discussion;

/// <summary>
/// Issue #256 (T916), SC-906: the call server never records or bridges media, and only the API opens rooms or
/// switches a microphone on. Reads the LiveKit configuration files as committed (T917 adds the production file).
/// </summary>
public sealed class CallServerConfigTests
{
    public static TheoryData<string> Files() => new()
    {
        "src/Circloo.AppHost/livekit.dev.yaml",
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
    public void The_reader_flattens_nested_keys_and_ignores_comments_and_list_items()
    {
        var settings = Parse(["# note", "room:", "  auto_create: false # inline", "  list:", "    - a", "egress:", "  s3: {}"]);

        Assert.Equal("false", settings["room.auto_create"]);
        Assert.Equal("", settings["room.list"]);
        Assert.True(settings.ContainsKey("egress.s3"));
        Assert.Equal(5, settings.Count);
    }

    private static Dictionary<string, string> Read(string file, [System.Runtime.CompilerServices.CallerFilePath] string source = "")
    {
        // From this source file: tests/Circloo.Api.Tests/Discussion → repo root.
        var path = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(source)!, "..", "..", "..", file));
        return Parse(File.ReadAllLines(path));
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
