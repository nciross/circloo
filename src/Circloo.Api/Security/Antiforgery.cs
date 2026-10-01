using Microsoft.AspNetCore.Antiforgery;

namespace Circloo.Api.Security;

/// <summary>
/// Double-submit CSRF protection for the JSON API: the SPA reads the XSRF-TOKEN cookie
/// and echoes it in the X-XSRF-TOKEN header on every unsafe request (FR-022).
/// </summary>
public static class AntiforgeryExtensions
{
    public const string HeaderName = "X-XSRF-TOKEN";
    public const string RequestTokenCookie = "XSRF-TOKEN";

    public static IServiceCollection AddCirclooAntiforgery(this IServiceCollection services) =>
        services.AddAntiforgery(o =>
        {
            o.HeaderName = HeaderName;
            o.Cookie.Name = "__Host-circloo-af";
            o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            o.Cookie.SameSite = SameSiteMode.Strict;
            o.Cookie.HttpOnly = true;
        });

    /// <summary>Issues a fresh request token cookie bound to the current identity.</summary>
    public static void IssueRequestToken(this IAntiforgery af, HttpContext ctx)
    {
        var tokens = af.GetAndStoreTokens(ctx);
        ctx.Response.Cookies.Append(RequestTokenCookie, tokens.RequestToken!, new CookieOptions
        {
            HttpOnly = false,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Path = "/",
        });
    }

    /// <summary>Validates unsafe methods; safe methods pass through.</summary>
    public static TBuilder RequireAntiforgery<TBuilder>(this TBuilder builder) where TBuilder : IEndpointConventionBuilder =>
        builder.AddEndpointFilter(async (ctx, next) =>
        {
            var http = ctx.HttpContext;
            if (HttpMethods.IsGet(http.Request.Method) || HttpMethods.IsHead(http.Request.Method) || HttpMethods.IsOptions(http.Request.Method))
            {
                return await next(ctx);
            }
            var af = http.RequestServices.GetRequiredService<IAntiforgery>();
            try
            {
                await af.ValidateRequestAsync(http);
            }
            catch (AntiforgeryValidationException)
            {
                return Results.Problem(statusCode: StatusCodes.Status400BadRequest, type: "antiforgery", title: "Invalid or missing anti-forgery token.");
            }
            return await next(ctx);
        });
}
