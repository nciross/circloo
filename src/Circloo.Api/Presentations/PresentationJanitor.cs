using Circloo.Api.Data;
using Circloo.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Presentations;

/// <summary>
/// Daily clean-up (FR-604a, research R8): deletes presentations neither opened nor presented for 365 days, pictures
/// first, then rows; and removes blob folders whose presentation no longer exists (a deleted account, a crash between
/// steps).
/// </summary>
public sealed partial class PresentationJanitor(IServiceScopeFactory scopes, TimeProvider clock, ILogger<PresentationJanitor> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromDays(1), clock);
        do
        {
            try
            {
                await SweepAsync(stoppingToken);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                LogSweepFailed(log, e);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// <summary>One sweep; returns how many presentations and orphan folders were removed.</summary>
    public async Task<(int Purged, int Orphans)> SweepAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        var store = scope.ServiceProvider.GetRequiredService<SlideStore>();
        var audit = scope.ServiceProvider.GetRequiredService<AuditLog>();
        var live = scope.ServiceProvider.GetRequiredService<LiveSessions>();

        var limit = clock.GetUtcNow().AddDays(-PresentationRules.IdleDeleteDays);
        var idle = await db.Presentations.Where(p => p.LastUsedAt < limit).ToListAsync(ct);
        foreach (var presentation in idle)
        {
            await live.EndForPresentationAsync(presentation.Id, presentation.OwnerUserId, ct);
            await store.DeletePresentationAsync(presentation.OwnerUserId, presentation.Id, ct);
            db.Presentations.Remove(presentation);
            audit.Add(AuditTypes.PresentationPurged, presentation.OwnerUserId, detail: new { presentation = presentation.Id });
        }
        await db.SaveChangesAsync(ct);

        var orphans = 0;
        await store.EnsureContainerAsync(ct);
        var folders = new List<(Guid Owner, Guid Presentation)>();
        await foreach (var folder in store.ListPresentationsAsync(ct))
        {
            folders.Add(folder);
        }
        var ids = folders.Select(f => f.Presentation).ToList();
        var known = (await db.Presentations.Where(p => ids.Contains(p.Id)).Select(p => p.Id).ToListAsync(ct)).ToHashSet();
        foreach (var (owner, presentation) in folders.Where(f => !known.Contains(f.Presentation)))
        {
            await store.DeletePresentationAsync(owner, presentation, ct);
            orphans++;
        }
        return (idle.Count, orphans);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Presentation clean-up failed")]
    private static partial void LogSweepFailed(ILogger logger, Exception e);
}
