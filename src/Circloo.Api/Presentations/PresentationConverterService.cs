using System.Threading.Channels;
using Circloo.Api.Data;
using Circloo.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Presentations;

/// <summary>Presentations waiting to be converted, in upload order (research R4).</summary>
public sealed class ConversionBacklog
{
    private readonly Channel<Guid> _channel = Channel.CreateBounded<Guid>(new BoundedChannelOptions(500) { FullMode = BoundedChannelFullMode.Wait });

    public ValueTask EnqueueAsync(Guid id, CancellationToken ct = default) => _channel.Writer.WriteAsync(id, ct);

    public ChannelReader<Guid> Reader => _channel.Reader;
}

/// <summary>
/// Converts uploaded decks in the background: claims a lease so only one replica works on a deck, asks the converter
/// for a PDF, renders each page to WebP pictures, reports progress, then marks the presentation ready (or failed with
/// a code). Decks left "processing" by a restart are picked up again; any stuck for 10 minutes are marked "timeout".
/// </summary>
public sealed partial class PresentationConverterService(
    IServiceScopeFactory scopes, ConversionBacklog queue, TimeProvider clock, ILogger<PresentationConverterService> log) : BackgroundService
{
    public const int Workers = 2;
    public static readonly TimeSpan Lease = TimeSpan.FromMinutes(2);
    public static readonly TimeSpan StuckAfter = TimeSpan.FromMinutes(10);
    private static readonly string Me = $"{Environment.MachineName}:{Environment.ProcessId}";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await RequeueAsync(stoppingToken);
        var workers = Enumerable.Range(0, Workers).Select(_ => WorkAsync(stoppingToken)).ToList();
        workers.Add(WatchdogAsync(stoppingToken));
        await Task.WhenAll(workers);
    }

    private async Task RequeueAsync(CancellationToken ct)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
            var waiting = await db.Presentations.Where(p => p.Status == PresentationStatus.Processing).Select(p => p.Id).ToListAsync(ct);
            foreach (var id in waiting)
            {
                await queue.EnqueueAsync(id, ct);
            }
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogRequeueFailed(log, e);
        }
    }

    private async Task WorkAsync(CancellationToken ct)
    {
        await foreach (var id in queue.Reader.ReadAllAsync(ct))
        {
            try
            {
                await ConvertAsync(id, ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                LogConversionCrashed(log, id, e);
            }
        }
    }

    /// <summary>Converts one presentation. Public so tests can run it without the hosted loop.</summary>
    public async Task ConvertAsync(Guid id, CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        var store = scope.ServiceProvider.GetRequiredService<SlideStore>();
        var converter = scope.ServiceProvider.GetRequiredService<IDeckConverter>();
        var audit = scope.ServiceProvider.GetRequiredService<AuditLog>();

        // Only one replica converts a deck: claim it with a guarded update, the lease expires if we die.
        var now = clock.GetUtcNow();
        var claimed = await db.Presentations
            .Where(p => p.Id == id && p.Status == PresentationStatus.Processing && (p.LeaseUntil == null || p.LeaseUntil < now))
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.ConvertingBy, Me).SetProperty(p => p.LeaseUntil, now + Lease), ct);
        if (claimed == 0)
        {
            return;
        }

        var presentation = await db.Presentations.AsNoTracking().FirstAsync(p => p.Id == id, ct);
        var slides = await db.Slides.AsNoTracking()
            .Where(s => s.PresentationId == id && s.Kind == SlideKinds.Deck)
            .OrderBy(s => s.SourceIndex)
            .ToListAsync(ct);
        try
        {
            await using var source = await store.OpenSourceAsync(presentation.OwnerUserId, id, ct)
                ?? throw new ConversionFailedException("conversion-failed", "The uploaded deck is missing.");
            using var buffer = new MemoryStream();
            await source.CopyToAsync(buffer, ct);
            var pdf = await converter.ToPdfAsync(buffer.ToArray(), ct);
            await RenewAsync(db, id, ct);

            var targets = MapPages(SlideRenderer.PageCount(pdf), slides);
            for (var page = 0; page < targets.Count; page++)
            {
                var rendered = SlideRenderer.Render(pdf, page);
                var slide = targets[page];
                await store.PutSlideAsync(presentation.OwnerUserId, id, slide.Id, thumb: false, new MemoryStream(rendered.Full), ct);
                await store.PutSlideAsync(presentation.OwnerUserId, id, slide.Id, thumb: true, new MemoryStream(rendered.Thumb), ct);
                var progress = page + 1;
                var at = clock.GetUtcNow();
                await db.Presentations.Where(p => p.Id == id)
                    .ExecuteUpdateAsync(s => s.SetProperty(p => p.ProcessedSlides, progress).SetProperty(p => p.LeaseUntil, at + Lease), ct);
            }

            await FinishAsync(db, id, PresentationStatus.Ready, null, ct);
            await store.DeleteSourceAsync(presentation.OwnerUserId, id, ct);
            await audit.WriteAsync(AuditTypes.PresentationConverted, presentation.OwnerUserId, detail: new { presentation = id, slides = slides.Count }, ct: ct);
        }
        catch (ConversionFailedException e)
        {
            await FailAsync(db, audit, presentation, e.Code, ct);
            LogConversionFailed(log, id, e.Code, e);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            await FailAsync(db, audit, presentation, "conversion-failed", ct);
            LogConversionCrashed(log, id, e);
        }
    }

    /// <summary>
    /// Which slide each PDF page belongs to. Normally one page per slide in the file (hidden slides exported too); if the
    /// converter skipped hidden slides, the pages map to the visible ones in order (research R1 fallback).
    /// </summary>
    public static IReadOnlyList<Slide> MapPages(int pages, IReadOnlyList<Slide> slides)
    {
        if (pages == slides.Count)
        {
            return slides;
        }
        var visible = slides.Where(s => !s.Hidden).ToList();
        if (pages == visible.Count)
        {
            return visible;
        }
        throw new ConversionFailedException("conversion-failed", $"The converter produced {pages} pages for {slides.Count} slides.");
    }

    private async Task RenewAsync(CirclooDbContext db, Guid id, CancellationToken ct)
    {
        var until = clock.GetUtcNow() + Lease;
        await db.Presentations.Where(p => p.Id == id).ExecuteUpdateAsync(s => s.SetProperty(p => p.LeaseUntil, until), ct);
    }

    private async Task FinishAsync(CirclooDbContext db, Guid id, string status, string? error, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        await db.Presentations.Where(p => p.Id == id).ExecuteUpdateAsync(s => s
            .SetProperty(p => p.Status, status)
            .SetProperty(p => p.Error, error)
            .SetProperty(p => p.ConvertingBy, (string?)null)
            .SetProperty(p => p.LeaseUntil, (DateTimeOffset?)null)
            .SetProperty(p => p.UpdatedAt, now)
            .SetProperty(p => p.Version, p => p.Version + 1), ct);
    }

    private async Task FailAsync(CirclooDbContext db, AuditLog audit, Presentation presentation, string code, CancellationToken ct)
    {
        await FinishAsync(db, presentation.Id, PresentationStatus.Failed, code, ct);
        await audit.WriteAsync(AuditTypes.PresentationFailed, presentation.OwnerUserId, detail: new { presentation = presentation.Id, code }, ct: ct);
    }

    /// <summary>Marks decks stuck in "processing" for 10 minutes as failed, every minute.</summary>
    private async Task WatchdogAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1), clock);
        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                await TimeOutStuckAsync(ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                LogWatchdogFailed(log, e);
            }
        }
    }

    public async Task<int> TimeOutStuckAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        var now = clock.GetUtcNow();
        var limit = now - StuckAfter;
        return await db.Presentations
            .Where(p => p.Status == PresentationStatus.Processing && p.UpdatedAt < limit && (p.LeaseUntil == null || p.LeaseUntil < now))
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.Status, PresentationStatus.Failed)
                .SetProperty(p => p.Error, "timeout")
                .SetProperty(p => p.ConvertingBy, (string?)null)
                .SetProperty(p => p.LeaseUntil, (DateTimeOffset?)null)
                .SetProperty(p => p.UpdatedAt, now), ct);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Could not re-queue presentations left processing")]
    private static partial void LogRequeueFailed(ILogger logger, Exception e);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Presentation {Id} failed to convert: {Code}")]
    private static partial void LogConversionFailed(ILogger logger, Guid id, string code, Exception e);

    [LoggerMessage(Level = LogLevel.Error, Message = "Presentation {Id} conversion crashed")]
    private static partial void LogConversionCrashed(ILogger logger, Guid id, Exception e);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Presentation watchdog failed")]
    private static partial void LogWatchdogFailed(ILogger logger, Exception e);
}
