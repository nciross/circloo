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
    /// <summary>A class or an office joins from one public IP: room for a whole circle and then some (spec 008 R4).</summary>
    public int CircleJoinsPerIpPer10Min { get; set; } = 300;
    /// <summary>Joins of one circle from one IP; unset means the circle's capacity plus 20 (spec 008 R4).</summary>
    public int? CircleJoinsPerIpAndCodePer10Min { get; set; }
    public int CirclesCreatedPerUserPerHour { get; set; } = 30;
    public int IntegrationCallsPerUserPer10Min { get; set; } = 20;
    public int PresentationUploadsPerUserPerHour { get; set; } = 10;
    /// <summary>Call passes per member, across tabs (spec 009 contracts/rest.md): a refresh every few minutes needs far less.</summary>
    public int CallTokensPerMemberPerMinute { get; set; } = 10;
}

public static class RateLimits
{
    public const string OtpRequest = "otp-request";
    public const string OtpVerify = "otp-verify";
    public const string Ai = "ai";
    public const string Join = "circle-join";
    public const string CircleCreate = "circle-create";
    public const string Integration = "integration";
    public const string PresentationUpload = "presentation-upload";
    /// <summary>
    /// Call passes (spec 009). Counted per member inside the endpoint with <c>RoomLimits</c>, after the contract's other
    /// checks, and refused through <see cref="RejectAsync"/>.
    /// </summary>
    public const string CallToken = "call-token";

    /// <summary>
    /// The animator's call actions (spec 009 contracts/hub.md), 30 per 10 s per member across tabs. Counted in the hub
    /// with <c>RoomLimits</c> and answered <c>slow-down</c>.
    /// </summary>
    public const string CallAdmin = "call-admin";

    /// <summary>
    /// Raising and lowering one's own hand (spec 009 FR-921, contracts/hub.md), 6 per 10 s per member across tabs, with
    /// or without a call. Counted in the hub with <c>RoomLimits</c> and answered <c>slow-down</c>.
    /// </summary>
    public const string Hand = "hand";

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
            // Anything that can reach a paid model is throttled per member or circle guest (constitution VIII), on top of the daily allowance.
            o.AddPolicy(Ai, ctx => RateLimitPartition.GetFixedWindowLimiter(
                ctx.User.FindFirst(Circloo.Api.Auth.CirclooClaims.UserId)?.Value
                    ?? ctx.User.FindFirst(Circloo.Api.Auth.CirclooClaims.GuestMemberId)?.Value ?? ClientIp(ctx) ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = opts.AiRequestsPerUserPerMinute, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
            // Join codes are 50 bits; this keeps guessing hopeless and the join page cheap.
            o.AddPolicy(Join, ctx => RateLimitPartition.GetFixedWindowLimiter(
                ClientIp(ctx) ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = opts.CircleJoinsPerIpPer10Min, Window = TimeSpan.FromMinutes(10), QueueLimit = 0 }));
            o.AddPolicy(CircleCreate, ctx => RateLimitPartition.GetFixedWindowLimiter(
                ctx.User.FindFirst(Circloo.Api.Auth.CirclooClaims.UserId)?.Value ?? ClientIp(ctx) ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = opts.CirclesCreatedPerUserPerHour, Window = TimeSpan.FromHours(1), QueueLimit = 0 }));
            // Every call here reaches someone else's service: keep it gentle.
            o.AddPolicy(Integration, ctx => RateLimitPartition.GetFixedWindowLimiter(
                ctx.User.FindFirst(Circloo.Api.Auth.CirclooClaims.UserId)?.Value ?? ClientIp(ctx) ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = opts.IntegrationCallsPerUserPer10Min, Window = TimeSpan.FromMinutes(10), QueueLimit = 0 }));
            // Each upload starts a conversion and stores pictures (spec 006, FR-619).
            o.AddPolicy(PresentationUpload, ctx => RateLimitPartition.GetFixedWindowLimiter(
                ctx.User.FindFirst(Circloo.Api.Auth.CirclooClaims.UserId)?.Value ?? ClientIp(ctx) ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = opts.PresentationUploadsPerUserPerHour, Window = TimeSpan.FromHours(1), QueueLimit = 0 }));
            o.OnRejected = async (rejected, ct) =>
            {
                var http = rejected.HttpContext;
                var retryAfter = rejected.Lease.TryGetMetadata(MetadataName.RetryAfter, out var ra) ? ra : TimeSpan.FromMinutes(1);
                http.Response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
                var audit = http.RequestServices.GetRequiredService<AuditLog>();
                var isAi = http.Request.Path.StartsWithSegments("/api/ai") || http.Request.Path.StartsWithSegments("/api/pirikoo");
                await audit.WriteAsync(isAi ? AuditTypes.AiRateLimited : AuditTypes.OtpRateLimited, ip: ClientIp(http),
                    detail: new { scope = isAi ? "user" : "ip", path = http.Request.Path.Value }, ct: ct);
                await Results.Problem(statusCode: StatusCodes.Status429TooManyRequests, type: "rate-limited", title: "Too many requests. Please slow down.",
                    extensions: new Dictionary<string, object?> { ["retryAfterSeconds"] = (int)Math.Ceiling(retryAfter.TotalSeconds) })
                    .ExecuteAsync(http);
            };
        });
    }

    public static string? ClientIp(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString();

    /// <summary>
    /// A refusal from a limiter inside an endpoint, answered and audited exactly like the policies above: 429
    /// <c>rate-limited</c>, <c>Retry-After</c> and <c>retryAfterSeconds</c>.
    /// </summary>
    public static async Task<IResult> RejectAsync(HttpContext http, TimeSpan retryAfter, string scope, CancellationToken ct)
    {
        var seconds = (int)Math.Ceiling(retryAfter.TotalSeconds);
        http.Response.Headers.RetryAfter = seconds.ToString(CultureInfo.InvariantCulture);
        await http.RequestServices.GetRequiredService<AuditLog>().WriteAsync(AuditTypes.OtpRateLimited, ip: ClientIp(http),
            detail: new { scope, path = http.Request.Path.Value }, ct: ct);
        return Results.Problem(statusCode: StatusCodes.Status429TooManyRequests, type: "rate-limited", title: "Too many requests. Please slow down.",
            extensions: new Dictionary<string, object?> { ["retryAfterSeconds"] = seconds });
    }
}
