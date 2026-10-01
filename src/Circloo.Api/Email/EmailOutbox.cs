using System.Text.Json;
using Circloo.Api.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Email;

/// <summary>
/// Queues emails in the database so request handlers never wait on SMTP (no timing side channel,
/// survives transient failures). Payloads are encrypted with Data Protection because they hold codes.
/// </summary>
public sealed class EmailOutbox(CirclooDbContext db, IDataProtectionProvider dp, TimeProvider clock, EmailOutboxSignal signal)
{
    internal const string Purpose = "Circloo.Email.Outbox.v1";

    /// <summary>Adds a message to the current unit of work; the caller saves, then calls <see cref="Notify"/>.</summary>
    public void Enqueue(string to, string template, string locale, IReadOnlyDictionary<string, string> values)
    {
        var now = clock.GetUtcNow();
        db.EmailOutbox.Add(new EmailOutboxMessage
        {
            To = to,
            Template = template,
            Locale = locale,
            PayloadProtected = dp.CreateProtector(Purpose).Protect(JsonSerializer.Serialize(values)),
            CreatedAt = now,
            NextAttemptAt = now,
        });
    }

    public void Notify() => signal.Pulse();
}

public sealed class EmailOutboxSignal : IDisposable
{
    private readonly SemaphoreSlim _sem = new(0, 1);

    public void Pulse()
    {
        try { _sem.Release(); }
        catch (SemaphoreFullException) { /* already signalled */ }
    }

    public Task WaitAsync(TimeSpan timeout, CancellationToken ct) => _sem.WaitAsync(timeout, ct);

    public void Dispose() => _sem.Dispose();
}

public sealed partial class EmailOutboxWorker(
    IServiceScopeFactory scopes,
    EmailOutboxSignal signal,
    TimeProvider clock,
    ILogger<EmailOutboxWorker> log) : BackgroundService
{
    private const int MaxAttempts = 3;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await DrainAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                LogDrainFailed(log, ex);
            }
            try
            {
                await signal.WaitAsync(TimeSpan.FromSeconds(5), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    public async Task DrainAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        var sender = scope.ServiceProvider.GetRequiredService<IEmailSender>();
        var templates = scope.ServiceProvider.GetRequiredService<EmailTemplates>();
        var protector = scope.ServiceProvider.GetRequiredService<IDataProtectionProvider>().CreateProtector(EmailOutbox.Purpose);

        var now = clock.GetUtcNow();
        var due = await db.EmailOutbox.AsNoTracking()
            .Where(m => m.FailedAt == null && m.NextAttemptAt <= now)
            .OrderBy(m => m.CreatedAt).Take(20).ToListAsync(ct);

        foreach (var m in due)
        {
            // Claim the row so several replicas never send the same message twice.
            var claimed = await db.EmailOutbox
                .Where(x => x.Id == m.Id && x.NextAttemptAt == m.NextAttemptAt && x.FailedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.NextAttemptAt, now.AddMinutes(2)), ct);
            if (claimed == 0)
            {
                continue;
            }

            try
            {
                var values = JsonSerializer.Deserialize<Dictionary<string, string>>(protector.Unprotect(m.PayloadProtected))!;
                await sender.SendAsync(templates.Render(m.Template, m.Locale, m.To, values), ct);
                await db.EmailOutbox.Where(x => x.Id == m.Id).ExecuteDeleteAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                var attempts = m.Attempts + 1;
                LogSendFailed(log, ex, m.Id, m.Template, attempts);
                await db.EmailOutbox.Where(x => x.Id == m.Id).ExecuteUpdateAsync(s => s
                    .SetProperty(x => x.Attempts, attempts)
                    .SetProperty(x => x.NextAttemptAt, now.AddSeconds(5 * Math.Pow(2, attempts)))
                    .SetProperty(x => x.FailedAt, attempts >= MaxAttempts ? now : null), ct);
                if (attempts >= MaxAttempts)
                {
                    LogDeadLettered(log, m.Id, attempts);
                }
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Email outbox drain failed")]
    private static partial void LogDrainFailed(ILogger logger, Exception ex);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Email {MessageId} ({Template}) failed, attempt {Attempt}")]
    private static partial void LogSendFailed(ILogger logger, Exception ex, Guid messageId, string template, int attempt);

    [LoggerMessage(Level = LogLevel.Error, Message = "Email {MessageId} dead-lettered after {Attempts} attempts")]
    private static partial void LogDeadLettered(ILogger logger, Guid messageId, int attempts);
}
