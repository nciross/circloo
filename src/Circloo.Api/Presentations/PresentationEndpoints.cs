using Circloo.Api.Auth;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Security;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Presentations;

public sealed record PresentationSummary(
    Guid Id, string Name, string Status, string? Error, int SlideCount, int ProcessedSlides, int QuestionCount,
    string? Thumbnail, DateTimeOffset LastUsedAt, int? DeletesInDays);

public sealed record SlideDto(
    Guid Id, string Kind, int Position, bool Hidden, string? Notes, string? Image, string? Thumbnail,
    string? Question, IReadOnlyList<OptionDto>? Options, bool MultipleChoice, string? CorrectOption, int? TimerSeconds,
    bool ShowFirst, bool ShowLive);

public sealed record OptionDto(string Id, string Text);

public sealed record PresentationDetail(
    Guid Id, string Name, string Status, string? Error, int SlideCount, int ProcessedSlides, int QuestionCount,
    string? Thumbnail, DateTimeOffset LastUsedAt, int? DeletesInDays, bool ShowPodium, int Version, IReadOnlyList<SlideDto> Slides);

public sealed record UpdatePresentation(string? Name, bool? ShowPodium, int Version);

public sealed record UpdateDeckSlide(bool? Hidden, int Version);

/// <summary>The animator's presentation library (spec 006 US1, contracts/rest.md). Owner-only; other people get 404.</summary>
public static class PresentationEndpoints
{
    public static string ImageUrl(Guid slideId, bool thumb = false) => $"/api/slides/{slideId}/image{(thumb ? "?size=thumb" : "")}";

    public static IEndpointRouteBuilder MapPresentationEndpoints(this IEndpointRouteBuilder api)
    {
        var group = api.MapGroup("/presentations").RequireAuthorization();

        group.MapGet("/", async (HttpContext ctx, CirclooDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            var userId = ctx.User.GetUserId();
            var rows = await db.Presentations.AsNoTracking()
                .Where(p => p.OwnerUserId == userId)
                .OrderByDescending(p => p.UpdatedAt)
                .Select(p => new
                {
                    Presentation = p,
                    Questions = p.Slides.Count(s => s.Kind != SlideKinds.Deck),
                    First = p.Slides.Where(s => s.Kind == SlideKinds.Deck && !s.Hidden).OrderBy(s => s.Position).Select(s => (Guid?)s.Id).FirstOrDefault(),
                })
                .ToListAsync(ct);
            var now = clock.GetUtcNow();
            return Results.Ok(rows.Select(r => Summary(r.Presentation, r.Questions, r.First, now)));
        });

        group.MapPost("/", async (IFormFile? file, HttpContext ctx, CirclooDbContext db, SlideStore store, ConversionBacklog queue,
            AuditLog audit, TimeProvider clock, CancellationToken ct) =>
        {
            if (file is null || file.Length == 0)
            {
                return Rejected("not-pptx");
            }
            if (file.Length > PresentationRules.MaxUploadBytes)
            {
                return Rejected("too-large");
            }
            byte[] bytes;
            await using (var input = file.OpenReadStream())
            using (var buffer = new MemoryStream((int)file.Length))
            {
                await input.CopyToAsync(buffer, ct);
                bytes = buffer.ToArray();
            }

            DeckInspection inspection;
            try
            {
                inspection = DeckInspector.Inspect(bytes);
            }
            catch (DeckRejectedException e)
            {
                return Rejected(e.Code);
            }

            var userId = ctx.User.GetUserId();
            var now = clock.GetUtcNow();
            var presentation = new Presentation
            {
                OwnerUserId = userId,
                Name = PresentationRules.NameFromFile(file.FileName),
                SourceFileName = Truncate(Path.GetFileName(file.FileName), 200),
                Status = PresentationStatus.Processing,
                SlideCount = inspection.Slides.Count,
                CreatedAt = now,
                UpdatedAt = now,
                LastUsedAt = now,
                Slides = [.. inspection.Slides.Select(s => new Slide
                {
                    Kind = SlideKinds.Deck,
                    Position = s.Index,
                    SourceIndex = s.Index,
                    Hidden = s.Hidden,
                    Notes = s.Notes,
                })],
            };
            // Row first, then the file: the daily orphan sweep only removes folders without a row.
            db.Presentations.Add(presentation);
            audit.Add(AuditTypes.PresentationUploaded, userId, detail: new { presentation = presentation.Id, slides = presentation.SlideCount });
            await db.SaveChangesAsync(ct);
            await store.EnsureContainerAsync(ct);
            await store.PutSourceAsync(userId, presentation.Id, new MemoryStream(inspection.Deck), ct);
            await queue.EnqueueAsync(presentation.Id, ct);
            return Results.Accepted($"/api/presentations/{presentation.Id}", Summary(presentation, 0, null, now));
        })
        .RequireRateLimiting(RateLimits.PresentationUpload)
        // Binding a form file adds ASP.NET's form antiforgery check, which needs middleware this app does not use: the
        // /api group's own filter already validates the X-XSRF-TOKEN header on every unsafe request, uploads included.
        .DisableAntiforgery()
        // A little room above 50 MB for the multipart envelope; the file itself is checked against the limit above.
        .WithMetadata(new RequestSizeLimitAttribute(PresentationRules.MaxUploadBytes + 1024 * 1024));

        group.MapGet("/{id:guid}", async (Guid id, HttpContext ctx, CirclooDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            var userId = ctx.User.GetUserId();
            var now = clock.GetUtcNow();
            // Opening it in the editor counts as use for the 12-month idle clean-up (FR-604a).
            var touched = await db.Presentations.Where(p => p.Id == id && p.OwnerUserId == userId)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.LastUsedAt, now), ct);
            if (touched == 0)
            {
                return NotFound();
            }
            return Results.Ok(await DetailAsync(db, id, now, ct));
        });

        group.MapPatch("/{id:guid}", async (Guid id, UpdatePresentation body, HttpContext ctx, CirclooDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            var presentation = await OwnedAsync(db, ctx, id, ct);
            if (presentation is null)
            {
                return NotFound();
            }
            if (body.Version != presentation.Version)
            {
                return Stale();
            }
            if (body.Name is not null)
            {
                var name = TextRules.Clean(body.Name, PresentationRules.NameMax);
                if (name is null)
                {
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["name-length"] });
                }
                presentation.Name = name;
            }
            if (body.ShowPodium is { } podium)
            {
                presentation.ShowPodium = podium;
            }
            return await SaveAsync(db, presentation, clock, ct);
        });

        group.MapDelete("/{id:guid}", async (Guid id, HttpContext ctx, CirclooDbContext db, SlideStore store, AuditLog audit, LiveSessions live, CancellationToken ct) =>
        {
            var presentation = await OwnedAsync(db, ctx, id, ct);
            if (presentation is null)
            {
                return NotFound();
            }
            // Circles presenting it leave the presentation together.
            await live.EndForPresentationAsync(id, presentation.OwnerUserId, ct);
            await store.DeletePresentationAsync(presentation.OwnerUserId, id, ct);
            db.Presentations.Remove(presentation);
            audit.Add(AuditTypes.PresentationDeleted, presentation.OwnerUserId, detail: new { presentation = id });
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        group.MapPut("/{id:guid}/slides/{slideId:guid}", async (Guid id, Guid slideId, UpdateDeckSlide body, HttpContext ctx, CirclooDbContext db,
            TimeProvider clock, CancellationToken ct) =>
        {
            var presentation = await OwnedAsync(db, ctx, id, ct);
            var slide = presentation is null ? null : await db.Slides.FirstOrDefaultAsync(s => s.Id == slideId && s.PresentationId == id, ct);
            if (presentation is null || slide is null)
            {
                return NotFound();
            }
            if (body.Version != presentation.Version)
            {
                return Stale();
            }
            if (slide.Kind == SlideKinds.Deck && body.Hidden is { } hidden)
            {
                slide.Hidden = hidden;
            }
            return await SaveAsync(db, presentation, clock, ct);
        });

        group.MapDelete("/{id:guid}/slides/{slideId:guid}", async (Guid id, Guid slideId, int version, HttpContext ctx, CirclooDbContext db,
            SlideStore store, TimeProvider clock, CancellationToken ct) =>
        {
            var presentation = await OwnedAsync(db, ctx, id, ct);
            if (presentation is null)
            {
                return NotFound();
            }
            var slides = await db.Slides.Where(s => s.PresentationId == id).OrderBy(s => s.Position).ToListAsync(ct);
            var slide = slides.FirstOrDefault(s => s.Id == slideId);
            if (slide is null)
            {
                return NotFound();
            }
            if (version != presentation.Version)
            {
                return Stale();
            }
            db.Slides.Remove(slide);
            // Keep positions dense (data-model.md).
            var position = 0;
            foreach (var s in slides.Where(s => s.Id != slideId))
            {
                s.Position = position++;
            }
            if (slide.Kind == SlideKinds.Deck)
            {
                presentation.SlideCount--;
                presentation.ProcessedSlides = Math.Min(presentation.ProcessedSlides, presentation.SlideCount);
            }
            var result = await SaveAsync(db, presentation, clock, ct);
            if (slide.Kind == SlideKinds.Deck)
            {
                await store.DeleteSlideAsync(presentation.OwnerUserId, id, slideId, ct);
            }
            return result;
        });

        // Slide pictures, streamed after an access check (research R3): the owner, and circle members for the slides their
        // session has shown (spec 006 US3).
        api.MapGet("/slides/{slideId:guid}/image", async (Guid slideId, string? size, HttpContext ctx, CirclooDbContext db, SlideStore store, LiveSessions live, CancellationToken ct) =>
        {
            var userId = ctx.User.FindFirst(CirclooClaims.UserId)?.Value is { } sub && Guid.TryParse(sub, out var u) ? u : (Guid?)null;
            var owner = await db.Slides.AsNoTracking()
                .Where(s => s.Id == slideId && s.Kind == SlideKinds.Deck)
                .Join(db.Presentations, s => s.PresentationId, p => p.Id, (s, p) => new { p.Id, p.OwnerUserId })
                .FirstOrDefaultAsync(ct);
            // The owner always; circle members (users or guests) once the slide has been shown in their session (spec 006 US3).
            if (owner is null || (owner.OwnerUserId != userId && !await live.MayViewAsync(ctx.User, owner.Id, slideId, ct)))
            {
                return NotFound();
            }
            var blob = await store.GetSlideAsync(owner.OwnerUserId, owner.Id, slideId, thumb: size == "thumb", ct);
            if (blob is null)
            {
                return NotFound();
            }
            ctx.Response.Headers.CacheControl = "private, max-age=3600";
            return Results.Stream(blob.Content, blob.ContentType, entityTag: new Microsoft.Net.Http.Headers.EntityTagHeaderValue(blob.ETag));
        });

        return api;
    }

    private static PresentationSummary Summary(Presentation p, int questions, Guid? first, DateTimeOffset now) =>
        new(p.Id, p.Name, p.Status, p.Error, p.SlideCount, p.ProcessedSlides, questions,
            p.Status == PresentationStatus.Ready && first is { } f ? ImageUrl(f, thumb: true) : null,
            p.LastUsedAt, PresentationRules.DeletesInDays(p.LastUsedAt, now));

    internal static async Task<PresentationDetail> DetailAsync(CirclooDbContext db, Guid id, DateTimeOffset now, CancellationToken ct)
    {
        var p = await db.Presentations.AsNoTracking().Include(x => x.Slides).FirstAsync(x => x.Id == id, ct);
        var ready = p.Status == PresentationStatus.Ready;
        var slides = p.Slides.OrderBy(s => s.Position).Select(s => new SlideDto(
            s.Id, s.Kind, s.Position, s.Hidden, s.Notes,
            s.Kind == SlideKinds.Deck && ready ? ImageUrl(s.Id) : null,
            s.Kind == SlideKinds.Deck && ready ? ImageUrl(s.Id, thumb: true) : null,
            s.Question, s.Kind == SlideKinds.Deck ? null : [.. s.Options.Select(o => new OptionDto(o.Id, o.Text))],
            s.MultipleChoice, s.CorrectOption, s.TimerSeconds, s.ShowFirst, s.ShowLive)).ToList();
        var first = slides.FirstOrDefault(s => s.Kind == SlideKinds.Deck && !s.Hidden)?.Id;
        var summary = Summary(p, slides.Count(s => s.Kind != SlideKinds.Deck), first, now);
        return new PresentationDetail(summary.Id, summary.Name, summary.Status, summary.Error, summary.SlideCount, summary.ProcessedSlides,
            summary.QuestionCount, summary.Thumbnail, summary.LastUsedAt, summary.DeletesInDays, p.ShowPodium, p.Version, slides);
    }

    internal static async Task<Presentation?> OwnedAsync(CirclooDbContext db, HttpContext ctx, Guid id, CancellationToken ct)
    {
        var userId = ctx.User.GetUserId();
        return await db.Presentations.FirstOrDefaultAsync(p => p.Id == id && p.OwnerUserId == userId, ct);
    }

    /// <summary>Bumps the version and saves; a concurrent edit that got there first turns into 409.</summary>
    internal static async Task<IResult> SaveAsync(CirclooDbContext db, Presentation presentation, TimeProvider clock, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        presentation.Version++;
        presentation.UpdatedAt = now;
        presentation.LastUsedAt = now;
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Stale();
        }
        return Results.Ok(await DetailAsync(db, presentation.Id, now, ct));
    }

    internal static IResult NotFound() =>
        Results.Problem(statusCode: StatusCodes.Status404NotFound, type: "presentation-not-found", title: "This presentation does not exist.");

    internal static IResult Stale() =>
        Results.Problem(statusCode: StatusCodes.Status409Conflict, type: "stale", title: "This presentation changed in the meantime.");

    private static IResult Rejected(string code) =>
        Results.Problem(statusCode: code == "too-large" ? StatusCodes.Status413PayloadTooLarge : StatusCodes.Status400BadRequest, type: code, title: "This file cannot be used.");

    // Never cut a surrogate pair in half: PostgreSQL refuses the lone half.
    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..(char.IsHighSurrogate(value[max - 1]) ? max - 1 : max)];
}
