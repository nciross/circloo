using System.Net.Http.Json;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Discussion;
using Circloo.Api.Tests.Infrastructure;
using Circloo.Api.Tests.LiveRoom;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Tests.Discussion;

/// <summary>
/// Issue #223 (T908): one-level replies in the circle chat, and a call that writes nothing to it (spec 009 US5, FR-913,
/// FR-930). Call status lines are live <c>CallNotice</c> events only.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class ReplyTests(PostgresFixture pg) : IAsyncLifetime
{
    private readonly FakeLiveKitRooms _rooms = new();
    private ApiFactory _factory = null!;
    private DiscussionHost _host = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString(), FakeLiveKitRooms.Settings()) { Configure = _rooms.Install };
        _host = new DiscussionHost(_factory);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private static async Task<string> RefusedAsync(Func<Task> call) =>
        (await Assert.ThrowsAsync<HubException>(call)).Message;

    private sealed class Room : IAsyncDisposable
    {
        public required Guid CircleId { get; init; }
        public required HubConnection Animator { get; init; }
        public required HubConnection Guest { get; init; }
        public required HttpClient AnimatorHttp { get; init; }
        public required CookieContainerHandler AnimatorCookies { get; init; }
        public required HttpClient GuestHttp { get; init; }
        public required Inbox<MessageDto> GuestMessages { get; init; }
        public required Inbox<long> GuestHidden { get; init; }
        public required Inbox<string> GuestNotices { get; init; }
        public required Inbox<MessageDto> AnimatorMessages { get; init; }

        public async ValueTask DisposeAsync()
        {
            await Animator.DisposeAsync();
            await Guest.DisposeAsync();
        }
    }

    private async Task<Room> RoomAsync()
    {
        var circle = await _host.Room.CircleAsync();
        var (_, guestHttp, guestCookies) = await _host.Room.JoinAsync(circle.Code, "Guest", "fox");

        var guest = _host.Room.Hub(guestCookies);
        var guestMessages = new Inbox<MessageDto>(guest, "Message");
        var guestHidden = new Inbox<long>(guest, "MessageHidden");
        var guestNotices = new Inbox<string>(push => guest.On<string, Guid?, Guid?>("CallNotice", (kind, _, _) => push(kind)));
        await guest.StartAsync();
        await guest.InvokeAsync<Guid[]>("Enter", circle.Id);

        var animator = _host.Room.Hub(circle.Cookies);
        var animatorMessages = new Inbox<MessageDto>(animator, "Message");
        await animator.StartAsync();
        await animator.InvokeAsync<Guid[]>("Enter", circle.Id);

        return new Room
        {
            CircleId = circle.Id,
            Animator = animator,
            Guest = guest,
            AnimatorHttp = circle.Http,
            AnimatorCookies = circle.Cookies,
            GuestHttp = guestHttp,
            GuestMessages = guestMessages,
            GuestHidden = guestHidden,
            GuestNotices = guestNotices,
            AnimatorMessages = animatorMessages,
        };
    }

    private static async Task<long> SayAsync(Room room, string text)
    {
        await room.Animator.InvokeAsync("Say", text);
        return (await room.GuestMessages.NextAsync(m => m.Text == text)).Id;
    }

    private Task<int> StoredAsync(Guid circleId, string text) =>
        _host.Room.DbAsync(db => db.CircleMessages.CountAsync(m => m.CircleId == circleId && m.Text == text));

    [Fact]
    public async Task A_reply_is_stored_in_order_with_its_parent_and_reaches_everyone_and_the_circle_view()
    {
        await using var room = await RoomAsync();
        var parent = await SayAsync(room, "What did you think of the demo?");

        await room.Guest.InvokeAsync("Reply", parent, "Loved the ending");
        await room.Animator.InvokeAsync("Reply", parent, "Same here");

        var first = await room.AnimatorMessages.NextAsync(m => m.Text == "Loved the ending");
        Assert.Equal(parent, first.ReplyToId);
        Assert.Equal("member", first.Kind);
        var second = await room.GuestMessages.NextAsync(m => m.Text == "Same here");
        Assert.Equal(parent, second.ReplyToId);
        Assert.True(first.Id < second.Id);

        var view = await room.GuestHttp.GetFromJsonAsync<CircleView>($"/api/circles/{room.CircleId}");
        var replies = view!.Messages.Where(m => m.ReplyToId == parent).Select(m => m.Text).ToArray();
        Assert.Equal(new[] { "Loved the ending", "Same here" }, replies);
        Assert.Null(view.Messages.Single(m => m.Id == parent).ReplyToId);
    }

    [Fact]
    public async Task A_reply_is_refused_for_a_missing_other_circle_hidden_system_or_reply_parent()
    {
        await using var room = await RoomAsync();
        var parent = await SayAsync(room, "Parent");
        await room.Guest.InvokeAsync("Reply", parent, "Child");
        var child = (await room.GuestMessages.NextAsync(m => m.Text == "Child")).Id;

        var other = await _host.Room.CircleAsync();
        await using var otherHub = await _host.EnteredAsync(other.Cookies, other.Id);
        await otherHub.InvokeAsync("Say", "Elsewhere");
        var elsewhere = await _host.Room.DbAsync(db => db.CircleMessages.Where(m => m.CircleId == other.Id && m.Text == "Elsewhere").Select(m => m.Id).SingleAsync());

        // A call writes no line any more, so the system parent is an activity line of this circle.
        var system = await _host.Room.DbAsync(async db =>
        {
            var line = new CircleMessage { CircleId = room.CircleId, ActivityId = "chat", Kind = "system", Text = "start:chat", CreatedAt = _factory.Clock.GetUtcNow() };
            db.CircleMessages.Add(line);
            await db.SaveChangesAsync();
            return line.Id;
        });

        var hiddenParent = await SayAsync(room, "Hidden parent");
        await room.Animator.InvokeAsync("HideMessage", hiddenParent, true);

        foreach (var bad in new[] { long.MaxValue, elsewhere, system, child, hiddenParent })
        {
            Assert.Contains("reply-invalid", await RefusedAsync(() => room.Guest.InvokeAsync("Reply", bad, "Nope")));
        }
        Assert.Equal(0, await StoredAsync(room.CircleId, "Nope"));
    }

    [Theory]
    [InlineData("Why is Kenji such an idiot?")]
    [InlineData("Quel idiot ce Kenji")]
    [InlineData("Eres un idiota")]
    [InlineData("أنت غبي")]
    public async Task An_unsafe_reply_is_refused_in_every_language_and_never_stored(string text)
    {
        await using var room = await RoomAsync();
        var parent = await SayAsync(room, "Parent");
        Assert.Contains("message-unsafe", await RefusedAsync(() => room.Guest.InvokeAsync("Reply", parent, text)));
        Assert.Contains("message-invalid", await RefusedAsync(() => room.Guest.InvokeAsync("Reply", parent, "   ")));
        Assert.Equal(0, await StoredAsync(room.CircleId, text));
    }

    [Fact]
    public async Task Slow_mode_pause_and_the_sending_budget_apply_to_replies()
    {
        await using var room = await RoomAsync();
        var parent = await SayAsync(room, "Parent");

        await room.Animator.InvokeAsync("SetRoomSettings", new RoomSettings(RoomChatModes.Slow, true, false));
        await room.Guest.InvokeAsync("Reply", parent, "first");
        Assert.Contains("slow-mode:10", await RefusedAsync(() => room.Guest.InvokeAsync("Reply", parent, "second")));
        Assert.Contains("slow-mode", await RefusedAsync(() => room.Guest.InvokeAsync("Say", "third")));
        Assert.Equal(0, await StoredAsync(room.CircleId, "second"));

        await room.Animator.InvokeAsync("SetRoomSettings", new RoomSettings(RoomChatModes.Paused, true, false));
        Assert.Contains("chat-paused", await RefusedAsync(() => room.Guest.InvokeAsync("Reply", parent, "paused")));
        await room.Animator.InvokeAsync("Reply", parent, "animator is never slowed");
        Assert.Equal(1, await StoredAsync(room.CircleId, "animator is never slowed"));

        await room.Animator.InvokeAsync("SetRoomSettings", new RoomSettings(RoomChatModes.Open, true, false));
        _factory.Clock.Advance(TimeSpan.FromSeconds(11));
        // Replies and messages share one budget of five per ten seconds; "first" has just left the window.
        for (var i = 0; i < 5; i++)
        {
            await room.Guest.InvokeAsync("Reply", parent, $"budget {i}");
        }
        Assert.Contains("slow-down", await RefusedAsync(() => room.Guest.InvokeAsync("Reply", parent, "budget 5")));
        Assert.Equal(0, await StoredAsync(room.CircleId, "budget 5"));
    }

    [Fact]
    public async Task A_reply_works_with_the_call_off_and_on()
    {
        await using var room = await RoomAsync();
        var parent = await SayAsync(room, "Parent");
        await room.Guest.InvokeAsync("Reply", parent, "while off");
        await room.Animator.InvokeAsync("EnableDiscussion", false, "open");
        _factory.Clock.Advance(TimeSpan.FromSeconds(11));
        await room.Guest.InvokeAsync("Reply", parent, "while on");
        Assert.Equal(1, await StoredAsync(room.CircleId, "while off"));
        Assert.Equal(1, await StoredAsync(room.CircleId, "while on"));
    }

    [Fact]
    public async Task Only_a_member_who_has_entered_can_reply_and_the_audience_screen_is_read_only()
    {
        await using var room = await RoomAsync();
        var parent = await SayAsync(room, "Parent");

        var (_, strangerCookies, _) = await _host.SignedInStrangerAsync();
        await using var stranger = await _host.ConnectedAsync(strangerCookies);
        Assert.Contains("not-entered", await RefusedAsync(() => stranger.InvokeAsync("Reply", parent, "hi")));
        Assert.Contains("not-a-member", await RefusedAsync(() => stranger.InvokeAsync<Guid[]>("Enter", room.CircleId)));
        Assert.Contains("not-entered", await RefusedAsync(() => stranger.InvokeAsync("Reply", parent, "hi")));

        await using var screen = await _host.AudienceAsync(room.AnimatorCookies, room.CircleId);
        Assert.Contains("audience-read-only", await RefusedAsync(() => screen.InvokeAsync("Reply", parent, "hi")));

        var guest = (await _host.Room.MembersAsync(room.CircleId)).Single(m => m.Name == "Guest");
        await _host.Room.DbAsync(db => db.CircleMembers.Where(m => m.Id == guest.Id).ExecuteUpdateAsync(s => s.SetProperty(m => m.LeftAt, _factory.Clock.GetUtcNow())));
        Assert.Contains("not-a-member", await RefusedAsync(() => room.Guest.InvokeAsync("Reply", parent, "still here")));
        Assert.Equal(0, await StoredAsync(room.CircleId, "hi"));
    }

    [Fact]
    public async Task A_hidden_parent_hides_its_replies_for_members_but_not_for_the_animator()
    {
        await using var room = await RoomAsync();
        var parent = await SayAsync(room, "Parent");
        await room.Guest.InvokeAsync("Reply", parent, "Child");
        var child = (await room.AnimatorMessages.NextAsync(m => m.Text == "Child")).Id;

        await room.Animator.InvokeAsync("HideMessage", parent, true);
        await room.GuestHidden.NextAsync(id => id == child);

        var members = await room.GuestHttp.GetFromJsonAsync<CircleView>($"/api/circles/{room.CircleId}");
        Assert.DoesNotContain(members!.Messages, m => m.Id == parent || m.Id == child);
        var animator = await room.AnimatorHttp.GetFromJsonAsync<CircleView>($"/api/circles/{room.CircleId}");
        Assert.Contains(animator!.Messages, m => m.Id == child && !m.Hidden && m.ReplyToId == parent);
        Assert.Contains(animator.Messages, m => m.Id == parent && m.Hidden);

        room.GuestMessages.Drain();
        await room.Animator.InvokeAsync("HideMessage", parent, false);
        Assert.Equal(parent, (await room.GuestMessages.NextAsync(m => m.Id == child)).ReplyToId);
        var back = await room.GuestHttp.GetFromJsonAsync<CircleView>($"/api/circles/{room.CircleId}");
        Assert.Contains(back!.Messages, m => m.Id == child);
    }

    [Fact]
    public async Task A_member_cannot_like_a_reply_whose_parent_is_hidden_and_the_animator_still_can()
    {
        // Issue #279: a member never sees the replies of a hidden message, so a like sent by id is refused like a like
        // on the hidden message itself. The animator still sees them, so may still like them.
        await using var room = await RoomAsync();
        var guestLikes = new Inbox<(long Id, bool Liked)>(push => room.Guest.On<long, bool>("MyLike", (id, liked) => push((id, liked))));
        var animatorLikes = new Inbox<(long Id, bool Liked)>(push => room.Animator.On<long, bool>("MyLike", (id, liked) => push((id, liked))));
        var parent = await SayAsync(room, "Parent");
        await room.Animator.InvokeAsync("Reply", parent, "From the animator");
        var animatorReply = (await room.GuestMessages.NextAsync(m => m.Text == "From the animator")).Id;
        await room.Guest.InvokeAsync("Reply", parent, "From the guest");
        var guestReply = (await room.AnimatorMessages.NextAsync(m => m.Text == "From the guest")).Id;
        await room.Guest.InvokeAsync("LikeMessage", animatorReply);
        Assert.Equal((animatorReply, true), await guestLikes.NextAsync());

        await room.Animator.InvokeAsync("HideMessage", parent, true);
        await room.GuestHidden.NextAsync(id => id == animatorReply);

        Assert.Contains("message-hidden", await RefusedAsync(() => room.Guest.InvokeAsync("LikeMessage", animatorReply)));
        Assert.Equal(1, await LikesAsync(animatorReply));
        await room.Animator.InvokeAsync("LikeMessage", guestReply);
        Assert.Equal((guestReply, true), await animatorLikes.NextAsync());
        Assert.Equal(1, await LikesAsync(guestReply));

        // Shown again: the member's like works again (it toggles the one they had).
        await room.Animator.InvokeAsync("HideMessage", parent, false);
        await room.Guest.InvokeAsync("LikeMessage", animatorReply);
        Assert.Equal((animatorReply, false), await guestLikes.NextAsync());
        Assert.Equal(0, await LikesAsync(animatorReply));
    }

    private Task<int> LikesAsync(long messageId) => _host.Room.DbAsync(db => db.MessageLikes.CountAsync(l => l.MessageId == messageId));

    [Fact]
    public async Task A_call_start_and_end_write_no_CircleMessages_row()
    {
        await using var room = await RoomAsync();
        await SayAsync(room, "Before the call");
        Task<List<CircleMessage>> RowsAsync() => _host.Room.DbAsync(db => db.CircleMessages.AsNoTracking()
            .Where(m => m.CircleId == room.CircleId).OrderBy(m => m.Id).ToListAsync());
        var before = await RowsAsync();

        await room.Animator.InvokeAsync("EnableDiscussion", true, "open");
        Assert.Equal(CallNoticeKinds.CallStarted, await room.GuestNotices.NextAsync());
        await room.Animator.InvokeAsync("EnableDiscussion", false, "hand");
        await room.GuestNotices.NextAsync(k => k == CallNoticeKinds.ModeHand);
        await room.Animator.InvokeAsync("DisableDiscussion");
        await room.GuestNotices.NextAsync(k => k == CallNoticeKinds.CallEnded);

        var after = await RowsAsync();
        Assert.Equal(before.Select(m => (m.Id, m.Kind, m.Text)), after.Select(m => (m.Id, m.Kind, m.Text)));
        Assert.DoesNotContain(after, m => m.Kind == "system");
        // The notices were live only: no chat message went out for them.
        Assert.Empty(room.GuestMessages.Drain());
    }
}
