using Circloo.Api.Auth;
using Circloo.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Sparks;

public sealed record PublicSparkDto(string Id, string Lang, string Kind, string Text);

public sealed record SparkDto(
    string Id, string Lang, string Kind, string Tone, string[] Audiences, bool KidsSafe,
    string Text, string? Answer, string Source, bool Favourite)
{
    public static SparkDto From(Spark s, bool favourite) =>
        new(s.Id, s.Lang, s.Kind, s.Tone, s.Audiences, s.KidsSafe, s.Text, s.Answer, s.Source, favourite);
}

public sealed record DrawResult(SparkDto? Spark, int PoolSize, bool Exhausted);

public static class SparkEndpoints
{
    private static readonly string[] PublicKinds = ["icebreaker", "would-you-rather"];

    /// <summary>Seeds that are live, plus the member's own kept AI sparks. Nothing else is ever visible.</summary>
    internal static IQueryable<Spark> VisibleTo(this IQueryable<Spark> sparks, Guid userId) =>
        sparks.Where(s => !s.Retired && (s.Source == "seed" || s.OwnerId == userId));

    public static RouteGroupBuilder MapPublicSparkEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/public/sparks/random", async (string? lang, string? exclude, CirclooDbContext db, CancellationToken ct) =>
        {
            if (!Locales.IsSupported(lang))
            {
                return Results.Problem(statusCode: 400, type: "unsupported-language", title: "Language must be one of en, fr, ar, es.");
            }
            // The public page only shows kids-safe icebreakers and would-you-rather, never jokes or AI content.
            var spark = await db.Sparks.AsNoTracking()
                .Where(s => s.Source == "seed" && !s.Retired && s.Lang == lang && s.KidsSafe && PublicKinds.Contains(s.Kind) && s.Id != exclude)
                .OrderBy(_ => EF.Functions.Random())
                .Select(s => new PublicSparkDto(s.Id, s.Lang, s.Kind, s.Text))
                .FirstOrDefaultAsync(ct);
            return spark is null ? Results.NotFound() : Results.Ok(spark);
        });
        return api;
    }

    public static RouteGroupBuilder MapSparkEndpoints(this RouteGroupBuilder api)
    {
        var sparks = api.MapGroup("/sparks").RequireAuthorization();

        sparks.MapGet("/draw", async (string? lang, string? audience, string? tone, string? kind, bool? kidsSafe, string? exclude,
            HttpContext ctx, CirclooDbContext db, CancellationToken ct) =>
        {
            if (!Locales.IsSupported(lang)
                || (audience is not null && !SparkKinds.Audiences.Contains(audience))
                || (tone is not null && !SparkKinds.Tones.Contains(tone))
                || (kind is not null && !SparkKinds.All.Contains(kind)))
            {
                return Results.Problem(statusCode: 400, type: "invalid-request", title: "Unknown language or filter.");
            }
            var userId = ctx.User.GetUserId();
            var excluded = (exclude ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Take(200).ToArray();

            var pool = db.Sparks.AsNoTracking().VisibleTo(userId).Where(s => s.Lang == lang);
            if (audience is not null) pool = pool.Where(s => s.Audiences.Contains(audience));
            if (tone is not null) pool = pool.Where(s => s.Tone == tone);
            if (kind is not null) pool = pool.Where(s => s.Kind == kind);
            if (kidsSafe == true) pool = pool.Where(s => s.KidsSafe);

            var poolSize = await pool.CountAsync(ct);
            var fresh = pool.Where(s => !excluded.Contains(s.Id));
            var exhausted = poolSize > 0 && !await fresh.AnyAsync(ct);
            var pick = await (exhausted ? pool : fresh).OrderBy(_ => EF.Functions.Random()).FirstOrDefaultAsync(ct);
            if (pick is null)
            {
                return Results.Ok(new DrawResult(null, poolSize, exhausted));
            }
            var favourite = await db.SparkFavorites.AnyAsync(f => f.UserId == userId && f.SparkId == pick.Id, ct);
            return Results.Ok(new DrawResult(SparkDto.From(pick, favourite), poolSize, exhausted));
        });

        sparks.MapGet("/favourites", async (HttpContext ctx, CirclooDbContext db, CancellationToken ct) =>
        {
            var userId = ctx.User.GetUserId();
            var list = await db.SparkFavorites.AsNoTracking()
                .Where(f => f.UserId == userId && !f.Spark!.Retired && (f.Spark.Source == "seed" || f.Spark.OwnerId == userId))
                .OrderByDescending(f => f.CreatedAt)
                .Select(f => f.Spark!)
                .ToListAsync(ct);
            return Results.Ok(list.Select(s => SparkDto.From(s, true)));
        });

        sparks.MapPut("/{id}/favourite", async (string id, HttpContext ctx, CirclooDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            var userId = ctx.User.GetUserId();
            if (!await db.Sparks.VisibleTo(userId).AnyAsync(s => s.Id == id, ct))
            {
                return Results.NotFound();
            }
            if (!await db.SparkFavorites.AnyAsync(f => f.UserId == userId && f.SparkId == id, ct))
            {
                db.SparkFavorites.Add(new SparkFavorite { UserId = userId, SparkId = id, CreatedAt = clock.GetUtcNow() });
                try
                {
                    await db.SaveChangesAsync(ct);
                }
                catch (DbUpdateException)
                {
                    // A parallel tap already saved it: idempotent.
                }
            }
            return Results.NoContent();
        });

        sparks.MapDelete("/{id}/favourite", async (string id, HttpContext ctx, CirclooDbContext db, CancellationToken ct) =>
        {
            var userId = ctx.User.GetUserId();
            await db.SparkFavorites.Where(f => f.UserId == userId && f.SparkId == id).ExecuteDeleteAsync(ct);
            return Results.NoContent();
        });

        sparks.MapGet("/mine", async (HttpContext ctx, CirclooDbContext db, CancellationToken ct) =>
        {
            var userId = ctx.User.GetUserId();
            var mine = await db.Sparks.AsNoTracking().Where(s => s.OwnerId == userId).OrderByDescending(s => s.CreatedAt).ToListAsync(ct);
            var favs = await db.SparkFavorites.Where(f => f.UserId == userId).Select(f => f.SparkId).ToListAsync(ct);
            return Results.Ok(mine.Select(s => SparkDto.From(s, favs.Contains(s.Id))));
        });

        sparks.MapDelete("/mine/{id}", async (string id, HttpContext ctx, CirclooDbContext db, CancellationToken ct) =>
        {
            var userId = ctx.User.GetUserId();
            var deleted = await db.Sparks.Where(s => s.Id == id && s.OwnerId == userId).ExecuteDeleteAsync(ct);
            return deleted == 0 ? Results.NotFound() : Results.NoContent();
        });

        return api;
    }
}
