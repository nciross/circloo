using Circloo.Api.Auth;
using Circloo.Api.Data;
using Circloo.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Users;

public sealed record MeDto(Guid Id, string Email, string? DisplayName, string Locale, bool ProfileCompleted)
{
    public static MeDto From(User u) => new(u.Id, u.Email, u.DisplayName, u.Locale, u.ProfileCompleted);
}

public sealed record ProfileUpdate(string? DisplayName, string? Locale);

public static class MeEndpoints
{
    public const int DisplayNameMaxLength = 40;

    public static RouteGroupBuilder MapMeEndpoints(this RouteGroupBuilder api)
    {
        var me = api.MapGroup("/me").RequireAuthorization();

        me.MapGet("/", async (HttpContext ctx, CirclooDbContext db, CancellationToken ct) =>
        {
            var id = ctx.User.GetUserId();
            var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == id, ct);
            return user is null ? Results.Unauthorized() : Results.Ok(MeDto.From(user));
        });

        me.MapPut("/profile", async (ProfileUpdate body, HttpContext ctx, CirclooDbContext db, AuditLog audit, CancellationToken ct) =>
        {
            var errors = Validate(body, out var name);
            if (errors.Count > 0)
            {
                return Results.ValidationProblem(errors);
            }
            var id = ctx.User.GetUserId();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
            if (user is null)
            {
                return Results.Unauthorized();
            }
            user.DisplayName = name;
            user.Locale = body.Locale!;
            audit.Add(AuditTypes.ProfileUpdated, user.Id);
            await db.SaveChangesAsync(ct);
            return Results.Ok(MeDto.From(user));
        });

        return api;
    }

    internal static Dictionary<string, string[]> Validate(ProfileUpdate body, out string name)
    {
        var errors = new Dictionary<string, string[]>();
        name = (body.DisplayName ?? "").Trim();
        if (name.Length is 0 or > DisplayNameMaxLength || name.Any(char.IsControl))
        {
            errors["displayName"] = [$"Display name must be 1 to {DisplayNameMaxLength} characters."];
        }
        if (!Locales.IsSupported(body.Locale))
        {
            errors["locale"] = ["Locale must be one of en, fr, ar, es."];
        }
        return errors;
    }
}
