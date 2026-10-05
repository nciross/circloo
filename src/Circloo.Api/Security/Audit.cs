using System.Text.Json;
using Circloo.Api.Data;

namespace Circloo.Api.Security;

public static class AuditTypes
{
    public const string OtpRequested = "otp.requested";
    public const string OtpRateLimited = "otp.rate_limited";
    public const string AiRateLimited = "ai.rate_limited";
    public const string OtpVerifyFailed = "otp.verify_failed";
    public const string SignedIn = "auth.signed_in";
    public const string SignedUp = "auth.signed_up";
    public const string SignedOut = "auth.signed_out";
    public const string SignedOutEverywhere = "auth.signed_out_everywhere";
    public const string ProfileUpdated = "profile.updated";
    public const string CircleCreated = "circle.created";
    public const string CircleJoined = "circle.joined";
    public const string CircleClosed = "circle.closed";
    public const string CircleExported = "circle.exported";
    public const string IntegrationConnected = "integration.connected";
    public const string IntegrationDisconnected = "integration.disconnected";
    public const string PresentationUploaded = "presentation.uploaded";
    public const string PresentationConverted = "presentation.converted";
    public const string PresentationFailed = "presentation.failed";
    public const string PresentationDeleted = "presentation.deleted";
    public const string SessionStarted = "session.started";
    public const string SessionEnded = "session.ended";
    public const string PollOpened = "poll.opened";
    public const string PollClosed = "poll.closed";
    public const string QaHidden = "qa.hidden";
    public const string PresentationPurged = "presentation.purged";
}

/// <summary>Writes security events. Emails and IPs are stored as keyed hashes only.</summary>
public sealed class AuditLog(CirclooDbContext db, Hasher hasher, TimeProvider clock)
{
    /// <summary>Adds an event to the current unit of work; the caller saves.</summary>
    public void Add(string type, Guid? userId = null, string? normalizedEmail = null, string? ip = null, object? detail = null)
    {
        db.AuditEvents.Add(new AuditEvent
        {
            Type = type,
            At = clock.GetUtcNow(),
            UserId = userId,
            EmailHash = normalizedEmail is null ? null : hasher.Email(normalizedEmail),
            IpHash = hasher.Ip(ip),
            Detail = detail is null ? null : JsonSerializer.Serialize(detail),
        });
    }

    public async Task WriteAsync(string type, Guid? userId = null, string? normalizedEmail = null, string? ip = null, object? detail = null, CancellationToken ct = default)
    {
        Add(type, userId, normalizedEmail, ip, detail);
        await db.SaveChangesAsync(ct);
    }
}
