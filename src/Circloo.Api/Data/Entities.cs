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

public sealed class Spark
{
    public required string Id { get; set; }
    public required string Lang { get; set; }
    public required string Kind { get; set; }
    public required string Tone { get; set; }
    public string[] Audiences { get; set; } = [];
    public bool KidsSafe { get; set; }
    public required string Text { get; set; }
    public string? Answer { get; set; }
    public required string Source { get; set; }
    public Guid? OwnerId { get; set; }
    public User? Owner { get; set; }
    public bool Retired { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class SparkFavorite
{
    public Guid UserId { get; set; }
    public required string SparkId { get; set; }
    public Spark? Spark { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class AiGeneration
{
    public long Id { get; set; }
    public Guid UserId { get; set; }
    public DateTimeOffset At { get; set; }
    public required string Provider { get; set; }
    public required string Model { get; set; }
    public int? InputTokens { get; set; }
    public int? OutputTokens { get; set; }
    public int Requested { get; set; }
    public int Accepted { get; set; }
    public required string Outcome { get; set; }
    public int LatencyMs { get; set; }
    /// <summary>What the call was for: "sparks" (fresh cards) or "coach" (circloo in a circle).</summary>
    public string Purpose { get; set; } = "sparks";
}

/// <summary>A live session: the animator creates it, people join with a link (spec 003).</summary>
public sealed class Circle
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid OwnerUserId { get; set; }
    public required string Name { get; set; }
    public required string JoinCode { get; set; }
    public string[] Activities { get; set; } = [];
    public string? CurrentActivity { get; set; }
    public required string Locale { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }

    public bool IsOpen(DateTimeOffset now) => ClosedAt is null && ExpiresAt > now;
}

public sealed class CircleMember
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid CircleId { get; set; }
    public Circle? Circle { get; set; }
    public required string Role { get; set; }
    public Guid? UserId { get; set; }
    public required string Name { get; set; }
    public required string Character { get; set; }
    public DateTimeOffset JoinedAt { get; set; }
    public DateTimeOffset? LeftAt { get; set; }
}

public sealed class CircleMessage
{
    public long Id { get; set; }
    public Guid CircleId { get; set; }
    public string? ActivityId { get; set; }
    public Guid? MemberId { get; set; }
    public required string Kind { get; set; }
    public required string Text { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>A sticky note on a circle's live board (spec 004).</summary>
public sealed class BoardNote
{
    public long Id { get; set; }
    public Guid CircleId { get; set; }
    public required string ActivityId { get; set; }
    public required string Column { get; set; }
    public required string Text { get; set; }
    public required string Color { get; set; }
    public Guid AuthorMemberId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public List<BoardVote> Votes { get; set; } = [];
}

/// <summary>A sticky note on a live canvas (issue #93), placed anywhere and styled by its author.</summary>
public sealed class CanvasNote
{
    public long Id { get; set; }
    public Guid CircleId { get; set; }
    public required string ActivityId { get; set; }
    public required string Text { get; set; }
    public double X { get; set; }
    public double Y { get; set; }
    public required string Color { get; set; }
    public required string Size { get; set; }
    public required string Shape { get; set; }
    public string? Sticker { get; set; }
    public Guid AuthorMemberId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class BoardVote
{
    public long NoteId { get; set; }
    public Guid MemberId { get; set; }
}

/// <summary>A person's connection to an outside service (spec 005). The config, secrets included, is encrypted.</summary>
public sealed class IntegrationConnection
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid UserId { get; set; }
    public required string Provider { get; set; }
    public required string ConfigProtected { get; set; }
    public required string Hint { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastUsedAt { get; set; }
}
