namespace Circloo.Api.Security;

/// <summary>Strict response headers on every response (FR-023, contracts/http-api.md).</summary>
public static class SecurityHeaders
{
    public const string ContentSecurityPolicy =
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

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
                h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
                h["Cross-Origin-Opener-Policy"] = "same-origin";
                if (!env.IsDevelopment())
                {
                    h.StrictTransportSecurity = "max-age=31536000; includeSubDomains";
                }
                if (ctx.Request.Path.StartsWithSegments("/api"))
                {
                    h.CacheControl = "no-store";
                }
                return Task.CompletedTask;
            });
            await next();
        });
}
