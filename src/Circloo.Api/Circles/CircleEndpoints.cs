using System.Security.Claims;
using Circloo.Api.Auth;
using Circloo.Api.Data;
using Circloo.Api.Decide;
using Circloo.Api.Discussion;
using Circloo.Api.Presentations;
using Circloo.Api.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Circloo.Api.Circles;

public sealed record CreateCircle(string? Name, string[]? Activities, string? Character, string? Locale);
/// <param name="Ring">Which copy of the character (0–5); the lowest free one when left out (spec 008).</param>
public sealed record JoinCircle(string? Name, string? Character, int? Ring = null);

/// <summary>One character on the join screen: how many people use it and which rings are still free (spec 008).</summary>
public sealed record CharacterUse(string Id, int Used, int[] FreeRings);
public sealed record CircleSummary(Guid Id, string Name, string? JoinCode, string Role, string Status, DateTimeOffset CreatedAt, int People);
public sealed record CircleView(
    Guid Id, string Name, string? JoinCode, string[] Activities, string? CurrentActivity, string Status, string Locale,
    MemberDto Me, MemberDto[] Members, MessageDto[] Messages, BoardNoteDto[] Notes, CanvasNoteDto[] Canvas, DecideView Decide,
    RoomSettings Settings, HandsView Hands, DiscussionState Discussion, RecordingState? Recording);
/// <param name="Taken">Characters with no free ring left (kept for the current join screen).</param>
/// <param name="Characters">Every character with its use count and free rings (spec 008, contracts/rest.md).</param>
public sealed record JoinInfo(Guid CircleId, string Name, string AnimatorName, string AnimatorCharacter, string[] Taken, bool Full, bool AlreadyIn,
    CharacterUse[] Characters);

public static class CircleAccess
{
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

        circles.MapGet("/{id:guid}", async (Guid id, HttpContext ctx, CirclooDbContext db, TimeProvider clock, Polls polls, Qa qa, IOptions<DiscussionOptions> discussion, CancellationToken ct) =>
        {
            var me = await CircleAccess.ResolveAsync(db, ctx.User, id, ct);
            if (me is null)
            {
                return Results.NotFound();
            }
            var c = me.Circle!;
            var members = await db.CircleMembers.AsNoTracking().Where(m => m.CircleId == id && m.LeftAt == null)
                .OrderBy(m => m.JoinedAt).Select(m => MemberDto.From(m)).ToArrayAsync(ct);
            // Hidden messages only ever reach the animator (spec 008 FR-813).
            var animator = me.Role == Roles.Animator;
            var messages = await db.CircleMessages.AsNoTracking().Where(m => m.CircleId == id && (animator || m.HiddenAt == null))
                .OrderByDescending(m => m.Id).Take(200).ToListAsync(ct);
            var messageIds = messages.Select(m => m.Id).ToList();
            var likes = await db.MessageLikes.AsNoTracking().Where(l => messageIds.Contains(l.MessageId))
                .GroupBy(l => l.MessageId).Select(g => new { Id = g.Key, Count = g.Count(), Mine = g.Any(l => l.MemberId == me.Id) })
                .ToDictionaryAsync(x => x.Id, ct);
            // Only hands of people still in the circle.
            var hands = await db.RaisedHands.AsNoTracking()
                .Where(h => h.CircleId == id && db.CircleMembers.Any(m => m.Id == h.MemberId && m.LeftAt == null))
                .OrderBy(h => h.RaisedAt).ThenBy(h => h.Id).ToListAsync(ct);
            var notes = await db.BoardNotes.AsNoTracking().Include(n => n.Votes).Where(n => n.CircleId == id)
                .OrderBy(n => n.Id).Take(ActivityCatalog.MaxNotes * 4).ToListAsync(ct);
            var canvas = await db.CanvasNotes.AsNoTracking().Where(n => n.CircleId == id)
                .OrderBy(n => n.Id).Take(ActivityCatalog.MaxCanvasNotes).ToListAsync(ct);
            var poll = await polls.ForMemberAsync(c.Id, me, ct);
            var questions = await qa.ForMemberAsync(c, me, ct);
            return Results.Ok(new CircleView(
                c.Id, c.Name, me.Role == Roles.Animator ? JoinCodes.Display(c.JoinCode) : null, c.Activities, c.CurrentActivity,
                CircleAccess.Status(c, clock.GetUtcNow()), c.Locale, MemberDto.From(me), members,
                [.. messages.OrderBy(m => m.Id).Select(m => likes.TryGetValue(m.Id, out var l) ? MessageDto.From(m, l.Count, l.Mine) : MessageDto.From(m))], [.. notes.Select(BoardNoteDto.From)], [.. canvas.Select(CanvasNoteDto.From)],
                // Forms are filled in by their task (spec 007 T707).
                DecideView.Empty(c) with { Poll = poll.Poll, PollResults = poll.Results, PollVotes = poll.Votes, Polls = poll.Finished, Qa = questions },
                RoomSettings.Of(c), Hands.View(hands), DiscussionRules.State(c, discussion.Value), null));
        }).RequireAuthorization(SessionAuthentication.CircleMemberPolicy);

        circles.MapPost("/{id:guid}/close", async (Guid id, HttpContext ctx, CirclooDbContext db, AuditLog audit, TimeProvider clock,
            IHubContext<CircleHub, ICircleClient> hub, LiveSessions live, CancellationToken ct) =>
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
            await live.EndForCircleAsync(id, userId, ct);
            await hub.Clients.Group(CircleHub.Group(id)).Closed();
            return Results.NoContent();
        }).RequireAuthorization();

        var join = api.MapGroup("/join").RequireRateLimiting(RateLimits.Join);

        join.MapGet("/{code}", async (string code, HttpContext ctx, CirclooDbContext db, TimeProvider clock, IOptions<CircleOptions> circles, CancellationToken ct) =>
        {
            var circle = await FindOpenAsync(db, code, clock.GetUtcNow(), ct);
            if (circle is null)
            {
                return NotOpen();
            }
            var members = await db.CircleMembers.AsNoTracking().Where(m => m.CircleId == circle.Id && m.LeftAt == null).ToListAsync(ct);
            var animator = members.First(m => m.Role == Roles.Animator);
            var mine = await CircleAccess.ResolveAsync(db, ctx.User, circle.Id, ct);
            var uses = Characters.All.Select(c => Rings.Use(c, members.Where(m => m.Character == c).Select(m => m.Ring))).ToArray();
            return Results.Ok(new JoinInfo(circle.Id, circle.Name, animator.Name, animator.Character,
                [.. uses.Where(u => u.FreeRings.Length == 0).Select(u => u.Id)], members.Count >= Characters.Capacity(circles.Value.MaxPeople), mine is not null,
                uses));
        });

        join.MapPost("/{code}", async Task<IResult> (string code, JoinCircle body, HttpContext ctx, CirclooDbContext db, AuditLog audit, TimeProvider clock,
            IHubContext<CircleHub, ICircleClient> hub, IOptions<CircleOptions> circles, JoinLimiter limiter, CancellationToken ct) =>
        {
            var now = clock.GetUtcNow();
            var circle = await FindOpenAsync(db, code, now, ct);
            if (circle is null)
            {
                return NotOpen();
            }
            // Beside the per-IP limit of the group: joins of one circle from one address (spec 008 R4). Keyed on circles
            // that exist, so guessed codes add no entries (the per-IP limit covers guessing).
            if (!limiter.TryAcquire(RateLimits.ClientIp(ctx), circle.Id, out var retryAfter))
            {
                return await RateLimits.RejectAsync(ctx, retryAfter, "circle-join", ct);
            }
            var existing = await CircleAccess.ResolveAsync(db, ctx.User, circle.Id, ct);
            if (existing is not null)
            {
                return Results.Ok(new { circleId = circle.Id, memberId = existing.Id, ring = existing.Ring });
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
            if (body.Ring is < 0 or >= Characters.RingsInUse)
            {
                errors["ring"] = [$"Ring must be 0 to {Characters.RingsInUse - 1}."];
            }
            if (errors.Count > 0)
            {
                return Results.ValidationProblem(errors);
            }
            var userId = ctx.User.TryGetUserId();
            var capacity = Characters.Capacity(circles.Value.MaxPeople);
            // The id is fixed once, so a retry after a commit that did go through finds the member instead of adding a
            // second one.
            var memberId = Guid.CreateVersion7();
            // Joins of one circle run one at a time under a lock on its row, so 100 people joining at once can never
            // push it past its capacity, and the ring picked is still free when saved (spec 008 R2).
            var (member, refusal) = await db.Database.CreateExecutionStrategy().ExecuteAsync(async Task<(CircleMember?, IResult?)> () =>
            {
                db.ChangeTracker.Clear();
                await using var tx = await db.Database.BeginTransactionAsync(ct);
                var locked = await db.Circles.FromSql($"""SELECT * FROM "Circles" WHERE "Id" = {circle.Id} FOR UPDATE""").AsNoTracking().FirstOrDefaultAsync(ct);
                if (locked is null || !locked.IsOpen(now))
                {
                    return ((CircleMember?)null, NotOpen());
                }
                // Already in: this very join committed on an earlier attempt, or the same person joined from another tab.
                var already = await db.CircleMembers.AsNoTracking().FirstOrDefaultAsync(m => m.CircleId == circle.Id && m.LeftAt == null
                    && (m.Id == memberId || (userId != null && m.UserId == userId)), ct);
                if (already is not null)
                {
                    return (already, (IResult?)null);
                }
                var active = await db.CircleMembers.Where(m => m.CircleId == circle.Id && m.LeftAt == null)
                    .Select(m => new { m.Character, m.Ring }).ToListAsync(ct);
                if (active.Count >= capacity)
                {
                    return (null, Results.Problem(statusCode: StatusCodes.Status409Conflict, type: "circle-full", title: "This circle is full."));
                }
                var use = Rings.Use(body.Character!, active.Where(a => a.Character == body.Character).Select(a => a.Ring));
                if (use.FreeRings.Length == 0)
                {
                    return (null, Results.Problem(statusCode: StatusCodes.Status409Conflict, type: "character-full",
                        title: "Every copy of this character is taken. Pick another one."));
                }
                var joined = new CircleMember
                {
                    Id = memberId,
                    CircleId = circle.Id,
                    Role = Roles.Participant,
                    UserId = userId,
                    Name = name!,
                    Character = body.Character!,
                    // The ring asked for when it is free, otherwise the lowest free one.
                    Ring = body.Ring is int wanted && use.FreeRings.Contains(wanted) ? wanted : use.FreeRings[0],
                    JoinedAt = now,
                };
                db.CircleMembers.Add(joined);
                audit.Add(AuditTypes.CircleJoined, userId, ip: RateLimits.ClientIp(ctx), detail: new { circle = circle.Id, guest = userId is null });
                try
                {
                    await db.SaveChangesAsync(ct);
                }
                catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
                {
                    // A backstop: the lock makes this unreachable for one circle, but answer as "already in" rather than fail.
                    await tx.RollbackAsync(ct);
                    db.ChangeTracker.Clear();
                    var mine = await db.CircleMembers.AsNoTracking().FirstOrDefaultAsync(m => m.CircleId == circle.Id && m.LeftAt == null
                        && (m.Id == memberId || (userId != null && m.UserId == userId)), ct);
                    return mine is not null
                        ? (mine, null)
                        : (null, Results.Problem(statusCode: StatusCodes.Status409Conflict, type: "character-full", title: "Every copy of this character is taken. Pick another one."));
                }
                await tx.CommitAsync(ct);
                return (joined, (IResult?)null);
            });
            if (refusal is not null)
            {
                return refusal;
            }
            if (userId is null)
            {
                await ctx.SignInAsync(GuestAuthentication.Scheme, GuestAuthentication.Principal(member!.Id, circle.Id),
                    new AuthenticationProperties { IsPersistent = false });
            }
            await hub.Clients.Group(CircleHub.Group(circle.Id)).MemberJoined(MemberDto.From(member!));
            return Results.Ok(new { circleId = circle.Id, memberId = member!.Id, ring = member.Ring });
        });

        return api;
    }

    private static IResult NotOpen() =>
        Results.Problem(statusCode: StatusCodes.Status404NotFound, type: "circle-not-open", title: "This circle is not open.");

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
