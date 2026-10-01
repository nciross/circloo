using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace Circloo.Api.Security;

public sealed class RateLimitOptions
{
    public const string Section = "RateLimits";
    public int OtpRequestsPerIpPerHour { get; set; } = 20;
    public int OtpVerifiesPerIpPer10Min { get; set; } = 30;
    public int OtpRequestsPerEmailPer15Min { get; set; } = 3;
    public int OtpFailedGuessesPerEmailPerDay { get; set; } = 25;
    public int AiRequestsPerUserPerMinute { get; set; } = 6;
}

public static class RateLimits
{
    public const string OtpRequest = "otp-request";
    public const string OtpVerify = "otp-verify";
    public const string Ai = "ai";

    public static IServiceCollection AddCirclooRateLimits(this IServiceCollection services, IConfiguration config)
    {
        var opts = config.GetSection(RateLimitOptions.Section).Get<RateLimitOptions>() ?? new RateLimitOptions();
        return services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.AddPolicy(OtpRequest, ctx => RateLimitPartition.GetFixedWindowLimiter(
                ClientIp(ctx) ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = opts.OtpRequestsPerIpPerHour, Window = TimeSpan.FromHours(1), QueueLimit = 0 }));
            o.AddPolicy(OtpVerify, ctx => RateLimitPartition.GetFixedWindowLimiter(
                ClientIp(ctx) ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = opts.OtpVerifiesPerIpPer10Min, Window = TimeSpan.FromMinutes(10), QueueLimit = 0 }));
            // Anything that can reach a paid model is throttled per member (constitution VIII), on top of the daily allowance.
            o.AddPolicy(Ai, ctx => RateLimitPartition.GetFixedWindowLimiter(
                ctx.User.FindFirst(Circloo.Api.Auth.CirclooClaims.UserId)?.Value ?? ClientIp(ctx) ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = opts.AiRequestsPerUserPerMinute, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
            o.OnRejected = async (rejected, ct) =>
            {
                var http = rejected.HttpContext;
                var retryAfter = rejected.Lease.TryGetMetadata(MetadataName.RetryAfter, out var ra) ? ra : TimeSpan.FromMinutes(1);
                http.Response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
                var audit = http.RequestServices.GetRequiredService<AuditLog>();
                var isAi = http.Request.Path.StartsWithSegments("/api/ai");
                await audit.WriteAsync(isAi ? AuditTypes.AiRateLimited : AuditTypes.OtpRateLimited, ip: ClientIp(http),
                    detail: new { scope = isAi ? "user" : "ip", path = http.Request.Path.Value }, ct: ct);
                await Results.Problem(statusCode: StatusCodes.Status429TooManyRequests, type: "rate-limited", title: "Too many requests. Please slow down.",
                    extensions: new Dictionary<string, object?> { ["retryAfterSeconds"] = (int)Math.Ceiling(retryAfter.TotalSeconds) })
                    .ExecuteAsync(http);
            };
        });
    }

    public static string? ClientIp(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString();
}
