using System.Collections.Concurrent;
using Circloo.Api.Auth;
using Circloo.Api.Ai;
using Circloo.Api.Data;
using Circloo.Api.Decide;
using Circloo.Api.Discussion;
using Circloo.Api.Presentations;
using Circloo.Api.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

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
    /// <summary>Someone else is writing in the chat (issue #89); the event carries no text.</summary>
    Task Typing(Guid memberId);
    /// <summary>A canvas note was added, moved, edited or restyled (issue #93).</summary>
    Task CanvasChanged(CanvasNoteDto note);
    Task CanvasDeleted(long id);
    /// <summary>Someone else's pointer on the canvas, in canvas coordinates. Never stored.</summary>
    Task Cursor(Guid memberId, double x, double y);
    /// <summary>The running presentation changed: slide, blank, phase (spec 006, contracts/hub.md).</summary>
    Task PresentationState(PresentationStateView state);
    /// <summary>Animator connections only: the current slide's notes and a preview of the next slide.</summary>
    Task PresenterNotes(Guid slideId, string? notes, NextSlideView? upcoming);
    /// <summary>The session ended; screens still showing it leave the presentation (a late event about another one is ignored).</summary>
    Task PresentationEnded(Guid sessionId);
    /// <summary>"n of N answered" and who is still to answer: animator connections and the audience screen only.</summary>
    Task AnswerCount(AnswerCountView count);
    /// <summary>A participant's own answer to the current question, to all of their connections.</summary>
    Task MyAnswer(MyAnswerView answer);
    /// <summary>A poll was created, edited, opened or closed (drafts reach the animator only, spec 007).</summary>
    Task PollChanged(PollView poll);
    /// <summary>Aggregated results: to everyone when the poll shows them, otherwise to the animator only.</summary>
    Task PollResults(PollResultsView results);
    /// <summary>How many voted, for members while the results are hidden.</summary>
    Task PollCount(Guid pollId, int votes);
    /// <summary>The member's own vote, to all of their connections.</summary>
    Task MyVote(Guid pollId, string[] options);
    /// <summary>A Q&A question changed (asked, answered, reopened, upvotes); hidden ones reach the animator only.</summary>
    Task QaChanged(QaQuestionView question);
    /// <summary>A question was hidden: members drop it.</summary>
    Task QaRemoved(long questionId);
    /// <summary>Whether members may ask anonymously.</summary>
    Task QaSettings(bool allowAnonymous);
    /// <summary>The member's own upvote on a question, to all of their connections.</summary>
    Task MyUpvote(long questionId, bool upvoted);
    /// <summary>The live discussion switch changed, or the caller just entered (spec 009).</summary>
    Task Discussion(DiscussionState state);
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
public sealed partial class CircleHub(CirclooDbContext db, CirclePresence presence, TimeProvider clock, CoachRunner coach, SafetyPolicy safety, AuditLog audit, LiveSessions live,
    Polls polls, Qa qa, LiveThrottle throttle, QuizClock quizClock, RoomLimits limits, IOptions<DiscussionOptions> discussion) : Hub<ICircleClient>
{
    public static string Group(Guid circleId) => $"circle:{circleId}";

    private const string CircleKey = "circle";
    private const string TypingKey = "typing";

    /// <summary>Pings from one connection closer together than this are dropped, so a chatty client costs nothing.</summary>
    public static readonly TimeSpan TypingEvery = TimeSpan.FromSeconds(1.5);

    private const string CursorKey = "cursor";
    private const string VerifiedKey = "verified";

    /// <summary>Cursor updates closer together than this are dropped (about 20 a second at most).</summary>
    public static readonly TimeSpan CursorEvery = TimeSpan.FromMilliseconds(50);

    /// <summary>Cursors re-check membership at most this often: they are frequent and carry nothing but a position.</summary>
    public static readonly TimeSpan CursorRecheck = TimeSpan.FromSeconds(10);

    private sealed record Verified(Guid MemberId, DateTimeOffset At);

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
        if (Context.Items.ContainsKey(AudienceKey))
        {
            throw new HubException("audience-read-only");
        }
        var me = await MemberAsync(circleId);
        Context.Items[CircleKey] = circleId;
        presence.Add(Context.ConnectionId, circleId, me.Id);
        await Groups.AddToGroupAsync(Context.ConnectionId, Group(circleId));
        // All of a member's tabs and devices: their own vote, upvotes and answers (spec 007).
        await Groups.AddToGroupAsync(Context.ConnectionId, MemberGroup(me.Id));
        if (me.Role == Roles.Animator)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, AnimatorGroup(circleId));
        }
        await Clients.Caller.Discussion(DiscussionRules.State(me.Circle!, discussion.Value));
        var online = presence.Online(circleId);
        RequestPresence(circleId);
        // Reloads and late joiners land on the current slide (spec 006 FR-608).
        await SendPresentationAsync(circleId, Clients.Caller, me);
        RequestAnswerCount(circleId);
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
        // The next keystroke after a message announces typing again at once.
        Context.Items.Remove(TypingKey);
    }

    /// <summary>"Kenji is typing…" for the others in the circle (issue #89). Same membership check as <see cref="Say"/>.</summary>
    public async Task Typing()
    {
        var now = clock.GetUtcNow();
        if (Context.Items[TypingKey] is DateTimeOffset last && now - last < TypingEvery)
        {
            return;
        }
        var (circleId, me) = await CurrentAsync();
        Context.Items[TypingKey] = now;
        await Clients.OthersInGroup(Group(circleId)).Typing(me.Id);
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
        // Switching activity ends a running presentation for everyone (spec 006 US3 #6).
        await EndSessionAsync(circleId, me, "switched");
        await polls.CloseOpenAsync(circleId, me.UserId);
        await db.Circles.Where(c => c.Id == circleId).ExecuteUpdateAsync(s => s.SetProperty(c => c.CurrentActivity, activityId));
        var started = await AddMessageAsync(circleId, activityId, me.Id, "system", $"start:{activityId}");
        await Clients.Group(Group(circleId)).Activity(new ActivityState(activityId, me.Id));
        await Clients.Group(Group(circleId)).Message(MessageDto.From(started));
        // circloo opens the activity; it streams in the background so the room stays responsive.
        // A presentation has its own start flow (spec 006), and circloo stays quiet there until asked.
        if (!ActivityCatalog.IsQuiet(activityId))
        {
            coach.Start(circleId, me.UserId!.Value, activityId, ask: null);
        }
    }

    public async Task EndActivity()
    {
        var (circleId, me) = await CurrentAsync(animatorOnly: true);
        var activityId = me.Circle!.CurrentActivity;
        await EndSessionAsync(circleId, me, "ended");
        await polls.CloseOpenAsync(circleId, me.UserId);
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
        Context.Items.Remove(TypingKey);
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

    // ---------- Live canvas (issue #93) ----------

    public async Task AddCanvasNote(double x, double y, string text, string color, string size, string shape)
    {
        var (circleId, me) = await CurrentAsync();
        if (me.Circle!.CurrentActivity != ActivityCatalog.Canvas || !ActivityCatalog.IsCanvasPoint(x, y) || !IsCanvasStyle(color, size, shape, null))
        {
            throw new HubException("note-invalid");
        }
        var clean = CleanNote(text);
        if (await db.CanvasNotes.CountAsync(n => n.CircleId == circleId && n.ActivityId == ActivityCatalog.Canvas) >= ActivityCatalog.MaxCanvasNotes)
        {
            throw new HubException("board-full");
        }
        var note = new CanvasNote
        {
            CircleId = circleId, ActivityId = ActivityCatalog.Canvas, Text = clean, X = Math.Round(x, 1), Y = Math.Round(y, 1),
            Color = color, Size = size, Shape = shape, AuthorMemberId = me.Id, CreatedAt = clock.GetUtcNow(),
        };
        db.CanvasNotes.Add(note);
        await db.SaveChangesAsync();
        await Clients.Group(Group(circleId)).CanvasChanged(CanvasNoteDto.From(note));
    }

    /// <summary>Anyone in the circle moves notes, like on a real wall.</summary>
    public async Task MoveCanvasNote(long id, double x, double y)
    {
        var (circleId, _) = await CurrentAsync();
        if (!ActivityCatalog.IsCanvasPoint(x, y))
        {
            throw new HubException("note-invalid");
        }
        var note = await CanvasNoteAsync(circleId, id);
        note.X = Math.Round(x, 1);
        note.Y = Math.Round(y, 1);
        await db.SaveChangesAsync();
        await Clients.Group(Group(circleId)).CanvasChanged(CanvasNoteDto.From(note));
    }

    public async Task EditCanvasNote(long id, string text)
    {
        var (circleId, me) = await CurrentAsync();
        var note = await CanvasNoteAsync(circleId, id);
        if (note.AuthorMemberId != me.Id)
        {
            throw new HubException("author-only");
        }
        note.Text = CleanNote(text);
        await db.SaveChangesAsync();
        await Clients.Group(Group(circleId)).CanvasChanged(CanvasNoteDto.From(note));
    }

    /// <summary>Colour, size, shape and sticker: the author's choice, or the animator's.</summary>
    public async Task StyleCanvasNote(long id, string color, string size, string shape, string? sticker)
    {
        var (circleId, me) = await CurrentAsync();
        if (!IsCanvasStyle(color, size, shape, sticker))
        {
            throw new HubException("note-invalid");
        }
        var note = await CanvasNoteAsync(circleId, id);
        if (note.AuthorMemberId != me.Id && me.Role != Roles.Animator)
        {
            throw new HubException("author-only");
        }
        (note.Color, note.Size, note.Shape, note.Sticker) = (color, size, shape, sticker);
        await db.SaveChangesAsync();
        await Clients.Group(Group(circleId)).CanvasChanged(CanvasNoteDto.From(note));
    }

    public async Task DeleteCanvasNote(long id)
    {
        var (circleId, me) = await CurrentAsync();
        var note = await CanvasNoteAsync(circleId, id);
        if (note.AuthorMemberId != me.Id && me.Role != Roles.Animator)
        {
            throw new HubException("author-only");
        }
        db.CanvasNotes.Remove(note);
        await db.SaveChangesAsync();
        await Clients.Group(Group(circleId)).CanvasDeleted(id);
    }

    /// <summary>Shares the caller's pointer with the others. Throttled, never stored, and membership is re-checked every few seconds.</summary>
    public async Task Cursor(double x, double y)
    {
        var now = clock.GetUtcNow();
        if (!ActivityCatalog.IsCanvasPoint(x, y) || (Context.Items[CursorKey] is DateTimeOffset last && now - last < CursorEvery))
        {
            return;
        }
        if (Context.Items[CircleKey] is not Guid circleId)
        {
            throw new HubException("not-entered");
        }
        if (Context.Items[VerifiedKey] is not Verified verified || now - verified.At > CursorRecheck)
        {
            verified = new Verified((await MemberAsync(circleId)).Id, now);
            Context.Items[VerifiedKey] = verified;
        }
        Context.Items[CursorKey] = now;
        await Clients.OthersInGroup(Group(circleId)).Cursor(verified.MemberId, Math.Round(x, 1), Math.Round(y, 1));
    }

    private static bool IsCanvasStyle(string color, string size, string shape, string? sticker) =>
        ActivityCatalog.CanvasColors.Contains(color) && ActivityCatalog.CanvasSizes.Contains(size) && ActivityCatalog.CanvasShapes.Contains(shape)
        && (sticker is null || ActivityCatalog.CanvasStickers.Contains(sticker));

    private async Task<CanvasNote> CanvasNoteAsync(Guid circleId, long id) =>
        await db.CanvasNotes.FirstOrDefaultAsync(n => n.Id == id && n.CircleId == circleId) ?? throw new HubException("note-invalid");

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
            RequestPresence(left.Circle);
            // "n of N answered" counts the people in the room.
            RequestAnswerCount(left.Circle);
        }
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Tells the circle who is online, at most every 250 ms with the latest list last, so 100 people arriving do not
    /// send everyone one full list per arrival (spec 008 FR-827). The arriving member gets the list from <c>Enter</c>.
    /// </summary>
    private void RequestPresence(Guid circleId) =>
        throttle.Request($"presence:{circleId}", services => services.GetRequiredService<IHubContext<CircleHub, ICircleClient>>()
            .Clients.Group(Group(circleId)).Presence(services.GetRequiredService<CirclePresence>().Online(circleId)));

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
