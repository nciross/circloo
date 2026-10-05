using System.Threading.RateLimiting;
using Circloo.Api.Security;
using Microsoft.Extensions.Options;

namespace Circloo.Api.Circles;

/// <summary>
/// Joins of one circle from one IP address, beside the group's per-IP limit (spec 008 R4). The per-IP limit is
/// generous so a class behind one public address can all join; this one bounds how fast a single address can join
/// one particular circle (its capacity plus some retries per 10 minutes). It does not stop one address from filling a
/// circle: removing members or locking a circle is the animator's tool for that.
/// </summary>
public sealed class JoinLimiter : IDisposable
{
    private readonly PartitionedRateLimiter<string> _limiter;

    public JoinLimiter(IOptions<CircleOptions> circles, IConfiguration config)
    {
        var opts = config.GetSection(RateLimitOptions.Section).Get<RateLimitOptions>() ?? new RateLimitOptions();
        var permits = opts.CircleJoinsPerIpAndCodePer10Min ?? Characters.Capacity(circles.Value.MaxPeople) + 20;
        _limiter = PartitionedRateLimiter.Create<string, string>(key => RateLimitPartition.GetFixedWindowLimiter(key,
            _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = TimeSpan.FromMinutes(10), QueueLimit = 0 }));
    }

    /// <summary>Takes one join permit for this address and circle; when refused, says when to try again.</summary>
    public bool TryAcquire(string? ip, Guid circleId, out TimeSpan retryAfter)
    {
        using var lease = _limiter.AttemptAcquire($"{ip ?? "unknown"}|{circleId:N}");
        retryAfter = lease.TryGetMetadata(MetadataName.RetryAfter, out var wait) ? wait : TimeSpan.FromMinutes(1);
        return lease.IsAcquired;
    }

    public void Dispose() => _limiter.Dispose();
}
