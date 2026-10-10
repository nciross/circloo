using Circloo.Api.Discussion;
using Microsoft.Extensions.Options;

namespace Circloo.Api.Security;

/// <summary>Strict response headers on every response (FR-023, contracts/http-api.md).</summary>
public static class SecurityHeaders
{
    public const string ContentSecurityPolicy =
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

    /// <summary>
    /// The policy with the call server's origins added to <c>connect-src</c> (spec 009 research R29): its WebSocket
    /// origin and the matching HTTP one (the client asks <c>/rtc/validate</c> why a join failed). Built once at start-up
    /// from <c>LiveKit:Url</c>; unchanged when no call server is configured. No wildcard, nothing else widened.
    /// </summary>
    public static string ContentSecurityPolicyFor(LiveKitOptions livekit)
    {
        var origins = CallServerOrigins(livekit);
        return origins.Count == 0
            ? ContentSecurityPolicy
            : ContentSecurityPolicy.Replace("connect-src 'self';", $"connect-src 'self' {string.Join(' ', origins)};", StringComparison.Ordinal);
    }

    /// <summary><c>ws://host:port</c> and <c>http://host:port</c> (or <c>wss</c> and <c>https</c>) of <c>LiveKit:Url</c>; empty without one.</summary>
    public static IReadOnlyList<string> CallServerOrigins(LiveKitOptions livekit)
    {
        ArgumentNullException.ThrowIfNull(livekit);
        if (!livekit.Available || !Uri.TryCreate(livekit.Url!.Trim(), UriKind.Absolute, out var url) || url.Scheme is not ("ws" or "wss"))
        {
            return [];
        }
        var http = url.Scheme == "wss" ? Uri.UriSchemeHttps : Uri.UriSchemeHttp;
        return [$"{url.Scheme}://{url.Authority}", $"{http}://{url.Authority}"];
    }

    public const string PermissionsPolicy = "camera=(), microphone=(), geolocation=()";

    /// <summary>The live room may use the camera and microphone for the discussion (spec 009 R15); nothing else may.</summary>
    public const string RoomPermissionsPolicy = "camera=(self), microphone=(self), geolocation=()";

    private static readonly string[] RoomPrefixes = ["/c/", "/app/circles/"];

    /// <summary>True for <c>/c/{guid}</c> and <c>/app/circles/{guid}</c> only: the audience route and every other path stay denied.</summary>
    public static bool IsRoomRoute(PathString path)
    {
        var value = path.Value;
        if (value is null)
        {
            return false;
        }
        foreach (var prefix in RoomPrefixes)
        {
            if (value.StartsWith(prefix, StringComparison.Ordinal))
            {
                return Guid.TryParseExact(value[prefix.Length..].TrimEnd('/'), "D", out _);
            }
        }
        return false;
    }

    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app, IWebHostEnvironment env)
    {
        var contentSecurityPolicy = ContentSecurityPolicyFor(app.ApplicationServices.GetRequiredService<IOptions<LiveKitOptions>>().Value);
        return app.Use(async (ctx, next) =>
        {
            // Read before the SPA fallback rewrites the path to /index.html: the policy follows the URL the browser asked for.
            var path = ctx.Request.Path;
            ctx.Response.OnStarting(() =>
            {
                var h = ctx.Response.Headers;
                h.ContentSecurityPolicy = contentSecurityPolicy;
                h.XContentTypeOptions = "nosniff";
                h.XFrameOptions = "DENY";
                h["Referrer-Policy"] = "strict-origin-when-cross-origin";
                h["Permissions-Policy"] = IsRoomRoute(path) ? RoomPermissionsPolicy : PermissionsPolicy;
                h["Cross-Origin-Opener-Policy"] = "same-origin";
                if (!env.IsDevelopment())
                {
                    h.StrictTransportSecurity = "max-age=31536000; includeSubDomains";
                }
                // API answers are never cached unless an endpoint chose otherwise (slide pictures: private, spec 006).
                if (path.StartsWithSegments("/api") && string.IsNullOrEmpty(h.CacheControl))
                {
                    h.CacheControl = "no-store";
                }
                return Task.CompletedTask;
            });
            await next();
        });
    }
}
