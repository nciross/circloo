namespace Circloo.Api.Security;

/// <summary>Strict response headers on every response (FR-023, contracts/http-api.md).</summary>
public static class SecurityHeaders
{
    public const string ContentSecurityPolicy =
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

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

    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app, IWebHostEnvironment env) =>
        app.Use(async (ctx, next) =>
        {
            ctx.Response.OnStarting(() =>
            {
                var h = ctx.Response.Headers;
                h.ContentSecurityPolicy = ContentSecurityPolicy;
                h.XContentTypeOptions = "nosniff";
                h.XFrameOptions = "DENY";
                h["Referrer-Policy"] = "strict-origin-when-cross-origin";
                h["Permissions-Policy"] = IsRoomRoute(ctx.Request.Path) ? RoomPermissionsPolicy : PermissionsPolicy;
                h["Cross-Origin-Opener-Policy"] = "same-origin";
                if (!env.IsDevelopment())
                {
                    h.StrictTransportSecurity = "max-age=31536000; includeSubDomains";
                }
                // API answers are never cached unless an endpoint chose otherwise (slide pictures: private, spec 006).
                if (ctx.Request.Path.StartsWithSegments("/api") && string.IsNullOrEmpty(h.CacheControl))
                {
                    h.CacheControl = "no-store";
                }
                return Task.CompletedTask;
            });
            await next();
        });
}
