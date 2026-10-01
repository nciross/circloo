using System.Collections.Frozen;
using System.Security.Cryptography;
using System.Text.Json;

namespace Circloo.Api.Sparks;

public sealed record SeedSpark(string Id, string Lang, string Kind, string[] Tags, string Text);

public sealed record PublicSparkDto(string Id, string Lang, string Kind, string Text);

/// <summary>Read-only seed sparks from content/fun/{lang}.json. Feature 002 moves them to the database.</summary>
public sealed class SparkCatalog
{
    private static readonly string[] PublicKinds = ["icebreaker", "would-you-rather"];
    private readonly FrozenDictionary<string, SeedSpark[]> _byLang;

    public SparkCatalog(IWebHostEnvironment env)
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "content", "fun");
        if (!Directory.Exists(dir))
        {
            dir = Path.GetFullPath(Path.Combine(env.ContentRootPath, "..", "..", "content", "fun"));
        }
        var opts = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        _byLang = Locales.All.ToFrozenDictionary(l => l, l =>
        {
            var file = JsonSerializer.Deserialize<SeedFile>(File.ReadAllText(Path.Combine(dir, $"{l}.json")), opts)!;
            return file.Sparks.Select((s, i) => new SeedSpark($"{l}-{i}", l, s.Kind, s.Tags ?? [], s.Text)).ToArray();
        });
    }

    public IReadOnlyList<SeedSpark> All(string lang) => _byLang[lang];

    /// <summary>Kids-safe icebreakers and would-you-rather only: the public page shows nothing edgier.</summary>
    public PublicSparkDto? RandomPublic(string lang, string? excludeId)
    {
        var pool = _byLang[lang]
            .Where(s => PublicKinds.Contains(s.Kind) && s.Tags.Contains("kids-safe") && s.Id != excludeId)
            .ToArray();
        if (pool.Length == 0)
        {
            return null;
        }
        var s = pool[RandomNumberGenerator.GetInt32(pool.Length)];
        return new PublicSparkDto(s.Id, s.Lang, s.Kind, s.Text);
    }

    private sealed record SeedFile(string Lang, SeedItem[] Sparks);
    private sealed record SeedItem(string Kind, string[]? Tags, string Text);
}

public static class SparkEndpoints
{
    public static RouteGroupBuilder MapPublicSparkEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/public/sparks/random", (string? lang, string? exclude, SparkCatalog catalog) =>
        {
            if (!Locales.IsSupported(lang))
            {
                return Results.Problem(statusCode: 400, type: "unsupported-language", title: "Language must be one of en, fr, ar, es.");
            }
            var spark = catalog.RandomPublic(lang!, exclude);
            return spark is null ? Results.NotFound() : Results.Ok(spark);
        });
        return api;
    }
}
