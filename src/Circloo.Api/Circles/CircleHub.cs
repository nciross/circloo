using System.Collections.Concurrent;
using Circloo.Api.Auth;
using Circloo.Api.Ai;
using Circloo.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Circles;

public sealed record ActivityState(string? ActivityId, Guid? StartedBy);
public sealed record AiDelta(string Text);

/// <summary>What the server pushes to everyone in a circle (spec 003, FR-305).</summary>
public interface ICircleClient
{
    Task Presence(Guid[] online);
    Task MemberJoined(MemberDto member);
    Task Activity(ActivityState state);
    Task Message(MessageDto message);
    Task AiThinking(bool thinking);
    Task AiDelta(AiDelta delta);
    Task Closed();
    Task NoteChanged(BoardNoteDto note);
    Task NoteDeleted(long id);
}

/// <summary>Who is connected, per circle. In memory: one replica in this version (plan: complexity tracking).</summary>
public sealed class CirclePresence
{
    private readonly ConcurrentDictionary<string, (Guid Circle, Guid Member)> _connections = new();

    public void Add(string connectionId, Guid circle, Guid member) => _connections[connectionId] = (circle, member);

    public (Guid Circle, Guid Member)? Remove(string connectionId) =>
        _connections.TryRemove(connectionId, out var entry) ? entry : null;

    public Guid[] Online(Guid circle) => [.. _connections.Values.Where(v => v.Circle == circle).Select(v => v.Member).Distinct()];
}

/// <summary>
/// The live room. Every method re-checks the caller's membership in the database, so a closed circle or a removed
/// member loses access at once; only the animator can steer activities or talk to circloo.
/// </summary>
[Authorize(Policy = SessionAuthentication.CircleMemberPolicy)]
public sealed class CircleHub(CirclooDbContext db, CirclePresence presence, TimeProvider clock, CoachRunner coach, SafetyPolicy safety) : Hub<ICircleClient>
{
    public static string Group(Guid circleId) => $"circle:{circleId}";

    private const string CircleKey = "circle";

    public override Task OnConnectedAsync()
    {
        // Defence in depth against cross-site WebSocket hijacking: the browser's Origin must be ours.
        var http = Context.GetHttpContext();
        var origin = http?.Request.Headers.Origin.ToString();
        if (!string.IsNullOrEmpty(origin) && http is not null
            && (!Uri.TryCreate(origin, UriKind.Absolute, out var o) || !string.Equals(o.Authority, http.Request.Host.Value, StringComparison.OrdinalIgnoreCase)))
        {
            Context.Abort();
        }
        return base.OnConnectedAsync();
    }

    /// <summary>Joins the circle's group and announces presence. Returns the online member ids.</summary>
    public async Task<Guid[]> Enter(Guid circleId)
    {
        var me = await MemberAsync(circleId);
        Context.Items[CircleKey] = circleId;
        presence.Add(Context.ConnectionId, circleId, me.Id);
        await Groups.AddToGroupAsync(Context.ConnectionId, Group(circleId));
        var online = presence.Online(circleId);
        await Clients.Group(Group(circleId)).Presence(online);
        return online;
    }

    public async Task Say(string text)
    {
        var (circleId, me) = await CurrentAsync();
        var clean = TextRules.Clean(text, TextRules.MessageMax) ?? throw new HubException("message-invalid");
        if (!safety.IsMessageSafe(clean))
        {
            throw new HubException("message-unsafe");
        }
        var message = await AddMessageAsync(circleId, me.Circle!.CurrentActivity, me.Id, "member", clean);
        await Clients.Group(Group(circleId)).Message(MessageDto.From(message));
    }

    public async Task StartActivity(string activityId)
    {
        var (circleId, me) = await CurrentAsync(animatorOnly: true);
        var circle = me.Circle!;
        var activity = ActivityCatalog.Find(activityId);
        if (activity is null || !circle.Activities.Contains(activityId))
        {
            throw new HubException("activity-invalid");
        }
        await db.Circles.Where(c => c.Id == circleId).ExecuteUpdateAsync(s => s.SetProperty(c => c.CurrentActivity, activityId));
        var started = await AddMessageAsync(circleId, activityId, me.Id, "system", $"start:{activityId}");
        await Clients.Group(Group(circleId)).Activity(new ActivityState(activityId, me.Id));
        await Clients.Group(Group(circleId)).Message(MessageDto.From(started));
        // circloo opens the activity; it streams in the background so the room stays responsive.
        coach.Start(circleId, me.UserId!.Value, activityId, ask: null);
    }

    public async Task EndActivity()
    {
        var (circleId, me) = await CurrentAsync(animatorOnly: true);
        var activityId = me.Circle!.CurrentActivity;
        await db.Circles.Where(c => c.Id == circleId).ExecuteUpdateAsync(s => s.SetProperty(c => c.CurrentActivity, (string?)null));
        var ended = await AddMessageAsync(circleId, activityId, me.Id, "system", $"end:{activityId}");
        await Clients.Group(Group(circleId)).Activity(new ActivityState(null, me.Id));
        await Clients.Group(Group(circleId)).Message(MessageDto.From(ended));
    }

    public async Task AskCircloo(string text)
    {
        var (circleId, me) = await CurrentAsync(animatorOnly: true);
        var activityId = me.Circle!.CurrentActivity ?? throw new HubException("no-activity");
        var clean = TextRules.Clean(text, TextRules.AskMax) ?? throw new HubException("message-invalid");
        var message = await AddMessageAsync(circleId, activityId, me.Id, "member", clean);
        await Clients.Group(Group(circleId)).Message(MessageDto.From(message));
        coach.Start(circleId, me.UserId!.Value, activityId, clean);
    }

    // ---------- Live board (spec 004) ----------

    public async Task AddNote(string column, string text, string color)
    {
        var (circleId, me) = await CurrentAsync();
        var activityId = me.Circle!.CurrentActivity;
        var columns = ActivityCatalog.ColumnsOf(activityId);
        if (columns.Length == 0 || !columns.Contains(column) || !ActivityCatalog.NoteColors.Contains(color))
        {
            throw new HubException("note-invalid");
        }
        var clean = CleanNote(text);
        if (await db.BoardNotes.CountAsync(n => n.CircleId == circleId && n.ActivityId == activityId) >= ActivityCatalog.MaxNotes)
        {
            throw new HubException("board-full");
        }
        var note = new BoardNote { CircleId = circleId, ActivityId = activityId!, Column = column, Text = clean, Color = color, AuthorMemberId = me.Id, CreatedAt = clock.GetUtcNow() };
        db.BoardNotes.Add(note);
        await db.SaveChangesAsync();
        await Clients.Group(Group(circleId)).NoteChanged(BoardNoteDto.From(note));
    }

    public async Task EditNote(long id, string text)
    {
        var (circleId, me) = await CurrentAsync();
        var note = await NoteAsync(circleId, id);
        if (note.AuthorMemberId != me.Id)
        {
            throw new HubException("author-only");
        }
        note.Text = CleanNote(text);
        await db.SaveChangesAsync();
        await Clients.Group(Group(circleId)).NoteChanged(BoardNoteDto.From(note));
    }

    public async Task MoveNote(long id, string column)
    {
        var (circleId, _) = await CurrentAsync();
        var note = await NoteAsync(circleId, id);
        if (!ActivityCatalog.ColumnsOf(note.ActivityId).Contains(column))
        {
            throw new HubException("note-invalid");
        }
        note.Column = column;
        await db.SaveChangesAsync();
        await Clients.Group(Group(circleId)).NoteChanged(BoardNoteDto.From(note));
    }

    public async Task DeleteNote(long id)
    {
        var (circleId, me) = await CurrentAsync();
        var note = await NoteAsync(circleId, id);
        if (note.AuthorMemberId != me.Id && me.Role != Roles.Animator)
        {
            throw new HubException("author-only");
        }
        db.BoardNotes.Remove(note);
        await db.SaveChangesAsync();
        await Clients.Group(Group(circleId)).NoteDeleted(id);
    }

    /// <summary>Toggles the caller's dot on a note; each member has a few dots per board activity.</summary>
    public async Task Vote(long id)
    {
        var (circleId, me) = await CurrentAsync();
        var note = await NoteAsync(circleId, id);
        var mine = note.Votes.FirstOrDefault(v => v.MemberId == me.Id);
        if (mine is not null)
        {
            note.Votes.Remove(mine);
        }
        else
        {
            var activityId = note.ActivityId;
            var used = await db.BoardVotes.CountAsync(v => v.MemberId == me.Id
                && db.BoardNotes.Any(n => n.Id == v.NoteId && n.CircleId == circleId && n.ActivityId == activityId));
            if (used >= ActivityCatalog.VotesPerMember)
            {
                throw new HubException("no-votes-left");
            }
            note.Votes.Add(new BoardVote { NoteId = note.Id, MemberId = me.Id });
        }
        await db.SaveChangesAsync();
        await Clients.Group(Group(circleId)).NoteChanged(BoardNoteDto.From(note));
    }

    private string CleanNote(string text)
    {
        var clean = TextRules.Clean(text, ActivityCatalog.NoteMax) ?? throw new HubException("note-invalid");
        return safety.IsMessageSafe(clean) ? clean : throw new HubException("message-unsafe");
    }

    private async Task<BoardNote> NoteAsync(Guid circleId, long id) =>
        await db.BoardNotes.Include(n => n.Votes).FirstOrDefaultAsync(n => n.Id == id && n.CircleId == circleId)
            ?? throw new HubException("note-invalid");

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (presence.Remove(Context.ConnectionId) is { } left)
        {
            await Clients.Group(Group(left.Circle)).Presence(presence.Online(left.Circle));
        }
        await base.OnDisconnectedAsync(exception);
    }

    private async Task<(Guid CircleId, CircleMember Me)> CurrentAsync(bool animatorOnly = false)
    {
        if (Context.Items[CircleKey] is not Guid circleId)
        {
            throw new HubException("not-entered");
        }
        var me = await MemberAsync(circleId);
        if (animatorOnly && me.Role != Roles.Animator)
        {
            throw new HubException("animator-only");
        }
        return (circleId, me);
    }

    private async Task<CircleMember> MemberAsync(Guid circleId)
    {
        var me = await CircleAccess.ResolveAsync(db, Context.User!, circleId, Context.ConnectionAborted);
        if (me is null || !me.Circle!.IsOpen(clock.GetUtcNow()))
        {
            throw new HubException("not-a-member");
        }
        return me;
    }

    private async Task<CircleMessage> AddMessageAsync(Guid circleId, string? activityId, Guid? memberId, string kind, string text)
    {
        var message = new CircleMessage { CircleId = circleId, ActivityId = activityId, MemberId = memberId, Kind = kind, Text = text, CreatedAt = clock.GetUtcNow() };
        db.CircleMessages.Add(message);
        await db.SaveChangesAsync();
        return message;
    }
}
