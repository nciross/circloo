using System.Globalization;
using System.Security.Cryptography;
using Circloo.Api.Data;
using Circloo.Api.Email;
using Circloo.Api.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Circloo.Api.Auth;

public sealed class OtpOptions
{
    public const string Section = "Otp";
    public int LifetimeMinutes { get; set; } = 10;
    public int MaxAttempts { get; set; } = 5;
}

public sealed record OtpVerifyResult(User? User, bool IsNewUser)
{
    public bool Succeeded => User is not null;
    public static readonly OtpVerifyResult Failed = new(null, false);
}

/// <summary>
/// Passwordless one-time codes (research R3). A request never touches user state; the account is
/// created on a successful verify, so responses cannot reveal whether an email is registered.
/// </summary>
public sealed class OtpService(
    CirclooDbContext db,
    Hasher hasher,
    AuditLog audit,
    EmailOutbox outbox,
    TimeProvider clock,
    IOptions<OtpOptions> otpOptions,
    IOptions<RateLimitOptions> limits)
{
    private readonly OtpOptions _otp = otpOptions.Value;

    public async Task RequestAsync(string email, string locale, string? ip, CancellationToken ct)
    {
        var normalized = EmailAddress.Normalize(email);
        var now = clock.GetUtcNow();

        var recent = await db.OtpChallenges.CountAsync(c => c.Email == normalized && c.CreatedAt > now.AddMinutes(-15), ct);
        // Daily guess budget per email: caps online brute force across many IPs (~30 guesses/day vs a 10^6 space).
        var guessesToday = await db.OtpChallenges
            .Where(c => c.Email == normalized && c.CreatedAt > now.AddDays(-1) && c.ConsumedAt == null)
            .SumAsync(c => c.Attempts, ct);
        if (recent >= limits.Value.OtpRequestsPerEmailPer15Min || guessesToday >= limits.Value.OtpFailedGuessesPerEmailPerDay)
        {
            // Same response as success: the caller cannot tell a limited email from a sent one.
            await audit.WriteAsync(AuditTypes.OtpRateLimited, normalizedEmail: normalized, ip: ip, detail: new { scope = "email" }, ct: ct);
            return;
        }

        await db.OtpChallenges
            .Where(c => c.Email == normalized && c.ConsumedAt == null && c.SupersededAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.SupersededAt, now), ct);

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6", CultureInfo.InvariantCulture);
        db.OtpChallenges.Add(new OtpChallenge
        {
            Email = normalized,
            CodeHash = hasher.Code(normalized, code),
            Locale = locale,
            CreatedAt = now,
            ExpiresAt = now.AddMinutes(_otp.LifetimeMinutes),
            RequestIpHash = hasher.Ip(ip),
        });
        outbox.Enqueue(normalized, "otp-code", locale, new Dictionary<string, string>
        {
            ["code"] = code,
            ["minutes"] = _otp.LifetimeMinutes.ToString(CultureInfo.InvariantCulture),
        });
        audit.Add(AuditTypes.OtpRequested, normalizedEmail: normalized, ip: ip);
        await db.SaveChangesAsync(ct);
        outbox.Notify();
    }

    /// <summary>Strips spaces and dashes; returns null unless exactly 6 digits remain.</summary>
    public static string? NormalizeCode(string? code)
    {
        if (code is null)
        {
            return null;
        }
        var digits = new string(code.Where(c => !char.IsWhiteSpace(c) && c != '-').ToArray());
        return digits.Length == 6 && digits.All(char.IsAsciiDigit) ? digits : null;
    }

    public async Task<OtpVerifyResult> VerifyAsync(string email, string? rawCode, string? ip, CancellationToken ct)
    {
        var normalized = EmailAddress.Normalize(email);
        var code = NormalizeCode(rawCode);
        var now = clock.GetUtcNow();

        var challenge = await db.OtpChallenges.AsNoTracking()
            .Where(c => c.Email == normalized && c.ConsumedAt == null && c.SupersededAt == null
                        && c.ExpiresAt > now && c.Attempts < _otp.MaxAttempts)
            .OrderByDescending(c => c.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (challenge is null || code is null)
        {
            await audit.WriteAsync(AuditTypes.OtpVerifyFailed, normalizedEmail: normalized, ip: ip, ct: ct);
            return OtpVerifyResult.Failed;
        }

        // Reserve an attempt atomically BEFORE comparing, so parallel guesses can never exceed the limit.
        var reserved = await db.OtpChallenges
            .Where(c => c.Id == challenge.Id && c.ConsumedAt == null && c.SupersededAt == null
                        && c.ExpiresAt > now && c.Attempts < _otp.MaxAttempts)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.Attempts, c => c.Attempts + 1), ct);
        if (reserved != 1 || !Hasher.FixedTimeEquals(challenge.CodeHash, hasher.Code(normalized, code)))
        {
            await audit.WriteAsync(AuditTypes.OtpVerifyFailed, normalizedEmail: normalized, ip: ip, ct: ct);
            return OtpVerifyResult.Failed;
        }

        // Atomic single use: only one concurrent verify can flip ConsumedAt.
        var consumed = await db.OtpChallenges
            .Where(c => c.Id == challenge.Id && c.ConsumedAt == null && c.SupersededAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.ConsumedAt, now), ct);
        if (consumed != 1)
        {
            await audit.WriteAsync(AuditTypes.OtpVerifyFailed, normalizedEmail: normalized, ip: ip, ct: ct);
            return OtpVerifyResult.Failed;
        }

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == normalized, ct);
        var isNew = false;
        if (user is null)
        {
            user = new User { Email = normalized, Locale = Locales.Normalize(challenge.Locale), CreatedAt = now, LastSeenAt = now };
            db.Users.Add(user);
            try
            {
                await db.SaveChangesAsync(ct);
                isNew = true;
            }
            catch (DbUpdateException)
            {
                // Another request created the account at the same moment.
                db.ChangeTracker.Clear();
                user = await db.Users.FirstAsync(u => u.Email == normalized, ct);
            }
        }

        user.LastSeenAt = now;
        audit.Add(isNew ? AuditTypes.SignedUp : AuditTypes.SignedIn, user.Id, normalized, ip);
        await db.SaveChangesAsync(ct);
        return new OtpVerifyResult(user, isNew);
    }
}
