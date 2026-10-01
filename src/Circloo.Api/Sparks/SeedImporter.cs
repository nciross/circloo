using System.Text.Json;
using Circloo.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Sparks;

public static class SparkKinds
{
    public static readonly string[] All = ["icebreaker", "would-you-rather", "joke", "riddle"];
    public static readonly string[] Tones = ["silly", "cozy", "deep"];
    public static readonly string[] Audiences = ["family", "friends", "work"];
    public const int MaxTextLength = 220;
    public const int MaxAnswerLength = 120;
}

/// <summary>
/// Imports content/fun/{lang}.json into the Sparks table: upsert by stable id, retire seeds that left the files
/// (so favourites never point at a deleted row). Idempotent; runs at startup.
/// </summary>
public static class SeedImporter
{
    private sealed record SeedFile(string Lang, SeedItem[] Sparks);
    private sealed record SeedItem(string Id, string Kind, string Tone, string[] Audiences, bool KidsSafe, string Text, string? Answer);

    public static string ContentDirectory(IWebHostEnvironment env)
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "content", "fun");
        return Directory.Exists(dir) ? dir : Path.GetFullPath(Path.Combine(env.ContentRootPath, "..", "..", "content", "fun"));
    }

    public static async Task ImportAsync(CirclooDbContext db, string directory, TimeProvider clock, CancellationToken ct)
    {
        var opts = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var seeds = Locales.All
            .SelectMany(l => JsonSerializer.Deserialize<SeedFile>(File.ReadAllText(Path.Combine(directory, $"{l}.json")), opts)!
                .Sparks.Select(s => (Lang: l, Item: s)))
            .ToList();

        var existing = await db.Sparks.Where(s => s.Source == "seed").ToDictionaryAsync(s => s.Id, ct);
        var now = clock.GetUtcNow();
        foreach (var (lang, item) in seeds)
        {
            if (!existing.TryGetValue(item.Id, out var spark))
            {
                spark = new Spark { Id = item.Id, Lang = lang, Kind = item.Kind, Tone = item.Tone, Text = item.Text, Source = "seed", CreatedAt = now };
                db.Sparks.Add(spark);
            }
            spark.Lang = lang;
            spark.Kind = item.Kind;
            spark.Tone = item.Tone;
            spark.Audiences = item.Audiences;
            spark.KidsSafe = item.KidsSafe;
            spark.Text = item.Text;
            spark.Answer = item.Answer;
            spark.Retired = false;
        }

        var current = seeds.Select(s => s.Item.Id).ToHashSet();
        foreach (var gone in existing.Values.Where(s => !current.Contains(s.Id)))
        {
            gone.Retired = true;
        }
        await db.SaveChangesAsync(ct);
    }
}
