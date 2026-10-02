using System.Security.Claims;
using Circloo.Api.Auth;
using Circloo.Api.Data;
using Circloo.Api.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Circles;

public sealed record CreateCircle(string? Name, string[]? Activities, string? Character, string? Locale);
public sealed record JoinCircle(string? Name, string? Character);
public sealed record CircleSummary(Guid Id, string Name, string? JoinCode, string Role, string Status, DateTimeOffset CreatedAt, int People);
public sealed record CircleView(
    Guid Id, string Name, string? JoinCode, string[] Activities, string? CurrentActivity, string Status, string Locale,
    MemberDto Me, MemberDto[] Members, MessageDto[] Messages, BoardNoteDto[] Notes);
public sealed record JoinInfo(Guid CircleId, string Name, string AnimatorName, string AnimatorCharacter, string[] Taken, bool Full, bool AlreadyIn);

public static class CircleAccess
{
    public const int MaxPeople = 12;
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    /// <summary>The caller's active membership in a circle: by account, or by the guest cookie of that circle.</summary>
    public static Task<CircleMember?> ResolveAsync(CirclooDbContext db, ClaimsPrincipal user, Guid circleId, CancellationToken ct)
    {
        if (user.TryGetUserId() is { } userId)
        {
            return db.CircleMembers.Include(m => m.Circle)
                .FirstOrDefaultAsync(m => m.CircleId == circleId && m.UserId == userId && m.LeftAt == null, ct);
        }
        if (user.GetGuest() is { } guest && guest.CircleId == circleId)
        {
            return db.CircleMembers.Include(m => m.Circle)
                .FirstOrDefaultAsync(m => m.Id == guest.MemberId && m.CircleId == circleId && m.UserId == null && m.LeftAt == null, ct);
        }
        return Task.FromResult<CircleMember?>(null);
    }

    public static string Status(Circle c, DateTimeOffset now) => c.IsOpen(now) ? "open" : "closed";
}

public static class CircleEndpoints
{
    public static RouteGroupBuilder MapCircleEndpoints(this RouteGroupBuilder api)
    {
        var circles = api.MapGroup("/circles");

        circles.MapPost("/", async (CreateCircle body, HttpContext ctx, CirclooDbContext db, AuditLog audit, TimeProvider clock, CancellationToken ct) =>
        {
            var errors = Validate(body, out var name, out var activities);
            if (errors.Count > 0)
            {
                return Results.ValidationProblem(errors);
            }
            var userId = ctx.User.GetUserId();
            var user = await db.Users.AsNoTracking().FirstAsync(u => u.Id == userId, ct);
            var now = clock.GetUtcNow();
            var circle = new Circle
            {
                OwnerUserId = userId,
                Name = name,
                JoinCode = await UniqueCodeAsync(db, ct),
                Activities = activities,
                Locale = body.Locale!,
                CreatedAt = now,
                ExpiresAt = now + CircleAccess.Lifetime,
            };
            db.Circles.Add(circle);
            db.CircleMembers.Add(new CircleMember
            {
                CircleId = circle.Id,
                Role = Roles.Animator,
                UserId = userId,
                Name = user.DisplayName ?? "circloo",
                Character = body.Character!,
                JoinedAt = now,
            });
            audit.Add(AuditTypes.CircleCreated, userId, detail: new { circle = circle.Id, activities = activities.Length });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/circles/{circle.Id}",
                new CircleSummary(circle.Id, circle.Name, JoinCodes.Display(circle.JoinCode), Roles.Animator, "open", circle.CreatedAt, 1));
        }).RequireAuthorization().RequireRateLimiting(RateLimits.CircleCreate);

        circles.MapGet("/", async (HttpContext ctx, CirclooDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            var userId = ctx.User.GetUserId();
            var now = clock.GetUtcNow();
            var rows = await db.CircleMembers.AsNoTracking()
                .Where(m => m.UserId == userId && m.LeftAt == null)
                .OrderByDescending(m => m.Circle!.CreatedAt)
                .Take(50)
                .Select(m => new
                {
                    m.Circle!.Id, m.Circle.Name, m.Circle.JoinCode, m.Role, m.Circle.CreatedAt, m.Circle.ClosedAt, m.Circle.ExpiresAt,
                    People = db.CircleMembers.Count(x => x.CircleId == m.CircleId && x.LeftAt == null),
                })
                .ToListAsync(ct);
            return Results.Ok(rows.Select(r => new CircleSummary(
                r.Id, r.Name, r.Role == Roles.Animator ? JoinCodes.Display(r.JoinCode) : null, r.Role,
                r.ClosedAt is null && r.ExpiresAt > now ? "open" : "closed", r.CreatedAt, r.People)));
        }).RequireAuthorization();

        circles.MapGet("/{id:guid}", async (Guid id, HttpContext ctx, CirclooDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            var me = await CircleAccess.ResolveAsync(db, ctx.User, id, ct);
            if (me is null)
            {
                return Results.NotFound();
            }
            var c = me.Circle!;
            var members = await db.CircleMembers.AsNoTracking().Where(m => m.CircleId == id && m.LeftAt == null)
                .OrderBy(m => m.JoinedAt).Select(m => MemberDto.From(m)).ToArrayAsync(ct);
            var messages = await db.CircleMessages.AsNoTracking().Where(m => m.CircleId == id)
                .OrderByDescending(m => m.Id).Take(200).ToListAsync(ct);
            var notes = await db.BoardNotes.AsNoTracking().Include(n => n.Votes).Where(n => n.CircleId == id)
                .OrderBy(n => n.Id).Take(ActivityCatalog.MaxNotes * 4).ToListAsync(ct);
            return Results.Ok(new CircleView(
                c.Id, c.Name, me.Role == Roles.Animator ? JoinCodes.Display(c.JoinCode) : null, c.Activities, c.CurrentActivity,
                CircleAccess.Status(c, clock.GetUtcNow()), c.Locale, MemberDto.From(me), members,
                [.. messages.OrderBy(m => m.Id).Select(MessageDto.From)], [.. notes.Select(BoardNoteDto.From)]));
        }).RequireAuthorization(SessionAuthentication.CircleMemberPolicy);

        circles.MapPost("/{id:guid}/close", async (Guid id, HttpContext ctx, CirclooDbContext db, AuditLog audit, TimeProvider clock,
            IHubContext<CircleHub, ICircleClient> hub, CancellationToken ct) =>
        {
            var userId = ctx.User.GetUserId();
            var circle = await db.Circles.FirstOrDefaultAsync(c => c.Id == id && c.OwnerUserId == userId, ct);
            if (circle is null)
            {
                return Results.NotFound();
            }
            circle.ClosedAt ??= clock.GetUtcNow();
            audit.Add(AuditTypes.CircleClosed, userId, detail: new { circle = id });
            await db.SaveChangesAsync(ct);
            await hub.Clients.Group(CircleHub.Group(id)).Closed();
            return Results.NoContent();
        }).RequireAuthorization();

        var join = api.MapGroup("/join").RequireRateLimiting(RateLimits.Join);

        join.MapGet("/{code}", async (string code, HttpContext ctx, CirclooDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            var circle = await FindOpenAsync(db, code, clock.GetUtcNow(), ct);
            if (circle is null)
            {
                return NotOpen();
            }
            var members = await db.CircleMembers.AsNoTracking().Where(m => m.CircleId == circle.Id && m.LeftAt == null).ToListAsync(ct);
            var animator = members.First(m => m.Role == Roles.Animator);
            var mine = await CircleAccess.ResolveAsync(db, ctx.User, circle.Id, ct);
            return Results.Ok(new JoinInfo(circle.Id, circle.Name, animator.Name, animator.Character,
                [.. members.Select(m => m.Character)], members.Count >= CircleAccess.MaxPeople, mine is not null));
        });

        join.MapPost("/{code}", async (string code, JoinCircle body, HttpContext ctx, CirclooDbContext db, AuditLog audit, TimeProvider clock,
            IHubContext<CircleHub, ICircleClient> hub, CancellationToken ct) =>
        {
            var now = clock.GetUtcNow();
            var circle = await FindOpenAsync(db, code, now, ct);
            if (circle is null)
            {
                return NotOpen();
            }
            var existing = await CircleAccess.ResolveAsync(db, ctx.User, circle.Id, ct);
            if (existing is not null)
            {
                return Results.Ok(new { circleId = circle.Id, memberId = existing.Id });
            }
            var errors = new Dictionary<string, string[]>();
            var name = TextRules.Clean(body.Name, TextRules.NameMax);
            if (name is null)
            {
                errors["name"] = [$"Name must be 1 to {TextRules.NameMax} characters."];
            }
            if (!Characters.IsKnown(body.Character))
            {
                errors["character"] = ["Pick a character."];
            }
            if (errors.Count > 0)
            {
                return Results.ValidationProblem(errors);
            }
            var active = await db.CircleMembers.Where(m => m.CircleId == circle.Id && m.LeftAt == null).Select(m => m.Character).ToListAsync(ct);
            if (active.Count >= CircleAccess.MaxPeople)
            {
                return Results.Problem(statusCode: StatusCodes.Status409Conflict, type: "circle-full", title: "This circle is full.");
            }
            if (active.Contains(body.Character!))
            {
                return CharacterTaken(active);
            }

            var userId = ctx.User.TryGetUserId();
            var member = new CircleMember
            {
                CircleId = circle.Id,
                Role = Roles.Participant,
                UserId = userId,
                Name = name!,
                Character = body.Character!,
                JoinedAt = now,
            };
            db.CircleMembers.Add(member);
            audit.Add(AuditTypes.CircleJoined, userId, ip: RateLimits.ClientIp(ctx), detail: new { circle = circle.Id, guest = userId is null });
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException)
            {
                // Two people grabbed the same character at the same moment: the unique index decides.
                return CharacterTaken(await db.CircleMembers.Where(m => m.CircleId == circle.Id && m.LeftAt == null).Select(m => m.Character).ToListAsync(ct));
            }
            if (userId is null)
            {
                await ctx.SignInAsync(GuestAuthentication.Scheme, GuestAuthentication.Principal(member.Id, circle.Id),
                    new AuthenticationProperties { IsPersistent = false });
            }
            await hub.Clients.Group(CircleHub.Group(circle.Id)).MemberJoined(MemberDto.From(member));
            return Results.Ok(new { circleId = circle.Id, memberId = member.Id });
        });

        return api;
    }

    private static IResult NotOpen() =>
        Results.Problem(statusCode: StatusCodes.Status404NotFound, type: "circle-not-open", title: "This circle is not open.");

    private static IResult CharacterTaken(IEnumerable<string> taken) =>
        Results.Problem(statusCode: StatusCodes.Status409Conflict, type: "character-taken", title: "Someone already picked this character.",
            extensions: new Dictionary<string, object?> { ["taken"] = taken.ToArray() });

    private static async Task<Circle?> FindOpenAsync(CirclooDbContext db, string code, DateTimeOffset now, CancellationToken ct)
    {
        var normalized = JoinCodes.Normalize(code);
        if (normalized is null)
        {
            return null;
        }
        var circle = await db.Circles.AsNoTracking().FirstOrDefaultAsync(c => c.JoinCode == normalized, ct);
        return circle is not null && circle.IsOpen(now) ? circle : null;
    }

    private static async Task<string> UniqueCodeAsync(CirclooDbContext db, CancellationToken ct)
    {
        for (var i = 0; i < 5; i++)
        {
            var code = JoinCodes.New();
            if (!await db.Circles.AnyAsync(c => c.JoinCode == code, ct))
            {
                return code;
            }
        }
        throw new InvalidOperationException("Could not allocate a join code.");
    }

    internal static Dictionary<string, string[]> Validate(CreateCircle body, out string name, out string[] activities)
    {
        var errors = new Dictionary<string, string[]>();
        name = TextRules.Clean(body.Name, TextRules.CircleNameMax) ?? "";
        if (name.Length == 0)
        {
            errors["name"] = [$"Name must be 1 to {TextRules.CircleNameMax} characters."];
        }
        activities = (body.Activities ?? []).Distinct().ToArray();
        if (activities.Length is 0 or > ActivityCatalog.MaxPerCircle || activities.Any(a => ActivityCatalog.Find(a) is null))
        {
            errors["activities"] = [$"Pick 1 to {ActivityCatalog.MaxPerCircle} activities from the catalog."];
        }
        if (!Characters.IsKnown(body.Character))
        {
            errors["character"] = ["Pick a character."];
        }
        if (!Locales.IsSupported(body.Locale))
        {
            errors["locale"] = ["Locale must be one of en, fr, ar, es."];
        }
        return errors;
    }
}
