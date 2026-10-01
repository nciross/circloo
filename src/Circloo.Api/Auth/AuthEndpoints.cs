using Circloo.Api.Security;
using Circloo.Api.Users;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Circloo.Api.Auth;

public sealed record OtpRequest(string? Email, string? Locale);
public sealed record OtpRequestAccepted(string Status, int ResendAfterSeconds);
public sealed record OtpVerify(string? Email, string? Code);
public sealed record OtpVerified(MeDto Me, bool IsNewUser);

public static class AuthEndpoints
{
    public static RouteGroupBuilder MapAuthEndpoints(this RouteGroupBuilder api)
    {
        var auth = api.MapGroup("/auth");

        auth.MapGet("/csrf", (HttpContext ctx, IAntiforgery af) =>
        {
            af.IssueRequestToken(ctx);
            return Results.NoContent();
        });

        auth.MapPost("/otp/request", async (OtpRequest body, HttpContext ctx, OtpService otp, CancellationToken ct) =>
        {
            if (!EmailAddress.IsValid(body.Email))
            {
                return Results.Problem(statusCode: 400, type: "invalid-email", title: "Please enter a valid email address.");
            }
            await otp.RequestAsync(body.Email!, Locales.Normalize(body.Locale), RateLimits.ClientIp(ctx), ct);
            return Results.Accepted(value: new OtpRequestAccepted("sent", 30));
        }).RequireRateLimiting(RateLimits.OtpRequest);

        auth.MapPost("/otp/verify", async (OtpVerify body, HttpContext ctx, OtpService otp, SessionStore sessions, IAntiforgery af, CancellationToken ct) =>
        {
            if (!EmailAddress.IsValid(body.Email))
            {
                return InvalidCode();
            }
            var result = await otp.VerifyAsync(body.Email!, body.Code, RateLimits.ClientIp(ctx), ct);
            if (!result.Succeeded)
            {
                return InvalidCode();
            }

            var session = await sessions.CreateAsync(result.User!.Id, ctx.Request.Headers.UserAgent.ToString(), ct);
            var principal = SessionStore.Principal(result.User.Id, session.Id);
            await ctx.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal,
                new AuthenticationProperties { IsPersistent = true });

            // The anti-forgery token is bound to the identity: issue a fresh one for the new principal.
            ctx.User = principal;
            af.IssueRequestToken(ctx);
            return Results.Ok(new OtpVerified(MeDto.From(result.User), result.IsNewUser));
        }).RequireRateLimiting(RateLimits.OtpVerify);

        auth.MapPost("/signout", async (HttpContext ctx, SessionStore sessions, AuditLog audit, CancellationToken ct) =>
        {
            if (ctx.User.Identity?.IsAuthenticated == true && ctx.User.GetSessionId() is { } sid)
            {
                await sessions.RevokeAsync(sid, ct);
                await audit.WriteAsync(AuditTypes.SignedOut, ctx.User.GetUserId(), ip: RateLimits.ClientIp(ctx), ct: ct);
            }
            await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        });

        auth.MapPost("/signout-everywhere", async (HttpContext ctx, SessionStore sessions, AuditLog audit, CancellationToken ct) =>
        {
            var userId = ctx.User.GetUserId();
            await sessions.RevokeAllAsync(userId, ct);
            await audit.WriteAsync(AuditTypes.SignedOutEverywhere, userId, ip: RateLimits.ClientIp(ctx), ct: ct);
            await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        }).RequireAuthorization();

        return api;
    }

    private static IResult InvalidCode() =>
        Results.Problem(statusCode: 400, type: "invalid-code", title: "This code is not valid. It may be wrong, used or expired.");
}
