using System.Threading.RateLimiting;
using Circloo.Api.Security;
using Microsoft.Extensions.Options;

namespace Circloo.Api.Circles;

/// <summary>
/// Joins of one circle from one IP address (spec 008 R4). The group's per-IP limit is generous so a class behind one
/// public address can all join; this keeps that address from filling another circle or trying codes at scale.
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

    public bool TryAcquire(string? ip, string? code)
    {
        using var lease = _limiter.AttemptAcquire($"{ip ?? "unknown"}|{code ?? ""}");
        return lease.IsAcquired;
    }

    public void Dispose() => _limiter.Dispose();
}
