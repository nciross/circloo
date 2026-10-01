namespace Circloo.Api.Data;

public sealed class User
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public required string Email { get; set; }
    public string? DisplayName { get; set; }
    public required string Locale { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }

    public bool ProfileCompleted => DisplayName is not null;
}

public sealed class OtpChallenge
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public required string Email { get; set; }
    public required byte[] CodeHash { get; set; }
    public required string Locale { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
    public DateTimeOffset? SupersededAt { get; set; }
    public byte[]? RequestIpHash { get; set; }
}

public sealed class UserSession
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public string? UserAgent { get; set; }
}

public sealed class AuditEvent
{
    public long Id { get; set; }
    public required string Type { get; set; }
    public DateTimeOffset At { get; set; }
    public Guid? UserId { get; set; }
    public byte[]? EmailHash { get; set; }
    public byte[]? IpHash { get; set; }
    public string? Detail { get; set; }
}

public sealed class EmailOutboxMessage
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public required string To { get; set; }
    public required string Template { get; set; }
    public required string Locale { get; set; }
    public required string PayloadProtected { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset? FailedAt { get; set; }
}
