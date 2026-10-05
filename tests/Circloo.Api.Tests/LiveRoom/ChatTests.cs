using System.Net.Http.Json;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Tests.LiveRoom;

/// <summary>Issue #179 (T805): the live room's chat hub: limits, slow mode, pause, likes, hiding and room settings (spec 008 US3).</summary>
[Collection(ApiCollection.Name)]
public sealed class ChatTests(PostgresFixture pg) : IAsyncLifetime
{
    private ApiFactory _factory = null!;
    private RoomHost _host = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString());
        _host = new RoomHost(_factory);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private static async Task<string> RefusedAsync(Func<Task> call) =>
        (await Assert.ThrowsAsync<HubException>(call)).Message;

    private static RoomSettings Chat(string mode, bool reactions = true) => new(mode, reactions, false);

    private sealed class Room : IAsyncDisposable
    {
        public required Guid CircleId { get; init; }
        public required HubConnection Animator { get; init; }
        public required HubConnection Kenji { get; init; }
        public required HubConnection Lucia { get; init; }
        public required HttpClient AnimatorHttp { get; init; }
        public required HttpClient KenjiHttp { get; init; }
        public required HttpClient LuciaHttp { get; init; }
        public required CookieContainerHandler AnimatorCookies { get; init; }
        public required CookieContainerHandler KenjiCookies { get; init; }
        public required CookieContainerHandler LuciaCookies { get; init; }
        public required Inbox<MessageDto> AnimatorMessages { get; init; }
        public required Inbox<MessageDto> KenjiMessages { get; init; }
        public required Inbox<MessageDto> LuciaMessages { get; init; }
        public required Inbox<RoomSettings> LuciaSettings { get; init; }

        public async ValueTask DisposeAsync()
        {
            await Animator.DisposeAsync();
            await Kenji.DisposeAsync();
            await Lucia.DisposeAsync();
        }
    }

    private async Task<Room> RoomAsync()
    {
        var circle = await _host.CircleAsync(["qa", "poll"]);
        var (_, kenjiHttp, kenjiCookies) = await _host.JoinAsync(circle.Code, "Kenji", "fox");
        var (_, luciaHttp, luciaCookies) = await _host.JoinAsync(circle.Code, "Lucía", "owl");
        var animator = _host.Hub(circle.Cookies);
        var kenji = _host.Hub(kenjiCookies);
        var lucia = _host.Hub(luciaCookies);
        var room = new Room
        {
            CircleId = circle.Id, Animator = animator, Kenji = kenji, Lucia = lucia,
            AnimatorHttp = circle.Http, KenjiHttp = kenjiHttp, LuciaHttp = luciaHttp, AnimatorCookies = circle.Cookies, KenjiCookies = kenjiCookies, LuciaCookies = luciaCookies,
            AnimatorMessages = new Inbox<MessageDto>(animator, "Message"),
            KenjiMessages = new Inbox<MessageDto>(kenji, "Message"),
            LuciaMessages = new Inbox<MessageDto>(lucia, "Message"),
            LuciaSettings = new Inbox<RoomSettings>(lucia, "RoomSettings"),
        };
        foreach (var h in new[] { animator, kenji, lucia })
        {
            await h.StartAsync();
            await h.InvokeAsync<Guid[]>("Enter", circle.Id);
        }
        return room;
    }

    private async Task<HubConnection> SecondTabAsync(Room room)
    {
        var tab = _host.Hub(room.KenjiCookies);
        await tab.StartAsync();
        await tab.InvokeAsync<Guid[]>("Enter", room.CircleId);
        return tab;
    }

    private Task<int> StoredAsync(Guid circleId, string text) =>
        _host.DbAsync(db => db.CircleMessages.CountAsync(m => m.CircleId == circleId && m.Text == text));

    [Fact]
    public async Task Entering_pushes_the_room_settings()
    {
        var circle = await _host.CircleAsync();
        await using var animator = _host.Hub(circle.Cookies);
        var settings = new Inbox<RoomSettings>(animator, "RoomSettings");
        await animator.StartAsync();
        await animator.InvokeAsync<Guid[]>("Enter", circle.Id);
        Assert.Equal(RoomSettings.Default, await settings.NextAsync());
    }

    [Fact]
    public async Task A_participant_is_limited_to_five_messages_per_ten_seconds_across_tabs_and_the_animator_is_not()
    {
        await using var room = await RoomAsync();
        await using var tab = await SecondTabAsync(room);

        for (var i = 0; i < 5; i++)
        {
            await (i % 2 == 0 ? room.Kenji : tab).InvokeAsync("Say", $"limit {i}");
        }
        Assert.Contains("slow-down", await RefusedAsync(() => room.Kenji.InvokeAsync("Say", "limit 5")));
        Assert.Contains("slow-down", await RefusedAsync(() => tab.InvokeAsync("Say", "limit 5")));
        Assert.Equal(0, await StoredAsync(room.CircleId, "limit 5"));
        // Another person has their own budget, and the animator has none.
        await room.Lucia.InvokeAsync("Say", "lucia fine");
        for (var i = 0; i < 8; i++)
        {
            await room.Animator.InvokeAsync("Say", $"animator {i}");
        }

        _factory.Clock.Advance(TimeSpan.FromSeconds(10));
        await room.Kenji.InvokeAsync("Say", "limit 6");
        Assert.Equal(1, await StoredAsync(room.CircleId, "limit 6"));
    }

    [Fact]
    public async Task Slow_mode_allows_one_message_per_ten_seconds_and_survives_a_reload()
    {
        await using var room = await RoomAsync();
        await room.Animator.InvokeAsync("SetRoomSettings", Chat(RoomChatModes.Slow));
        Assert.Equal(RoomChatModes.Slow, (await room.LuciaSettings.NextAsync(s => s.Chat == RoomChatModes.Slow)).Chat);

        await room.Kenji.InvokeAsync("Say", "first");
        Assert.Contains("slow-mode:10", await RefusedAsync(() => room.Kenji.InvokeAsync("Say", "second")));

        // A reload is a new connection; the wait is counted from the stored message.
        await room.Kenji.DisposeAsync();
        await using var reloaded = await SecondTabAsync(room);
        _factory.Clock.Advance(TimeSpan.FromSeconds(4));
        Assert.Contains("slow-mode:6", await RefusedAsync(() => reloaded.InvokeAsync("Say", "second")));
        Assert.Equal(0, await StoredAsync(room.CircleId, "second"));

        _factory.Clock.Advance(TimeSpan.FromSeconds(6));
        await reloaded.InvokeAsync("Say", "second");
        Assert.Equal(1, await StoredAsync(room.CircleId, "second"));

        // The animator is never slowed.
        await room.Animator.InvokeAsync("Say", "one");
        await room.Animator.InvokeAsync("Say", "two");
    }

    [Fact]
    public async Task Pause_refuses_participants_but_not_the_animator_until_the_chat_opens_again()
    {
        await using var room = await RoomAsync();
        await room.Animator.InvokeAsync("SetRoomSettings", Chat(RoomChatModes.Paused));
        await room.LuciaSettings.NextAsync(s => s.Chat == RoomChatModes.Paused);

        Assert.Contains("chat-paused", await RefusedAsync(() => room.Kenji.InvokeAsync("Say", "hello?")));
        Assert.Equal(0, await StoredAsync(room.CircleId, "hello?"));
        await room.Animator.InvokeAsync("Say", "Back in a minute");
        Assert.Equal("Back in a minute", (await room.LuciaMessages.NextAsync(m => m.Text == "Back in a minute")).Text);

        await room.Animator.InvokeAsync("SetRoomSettings", Chat(RoomChatModes.Open));
        await room.Kenji.InvokeAsync("Say", "hello!");
        Assert.Equal(1, await StoredAsync(room.CircleId, "hello!"));
    }

    [Theory]
    [InlineData("Why is Kenji such an idiot?")]
    [InlineData("Quel idiot ce Kenji")]
    [InlineData("Eres un idiota")]
    [InlineData("أنت غبي")]
    public async Task Unsafe_messages_are_refused_in_every_language_and_never_stored_or_shown(string text)
    {
        await using var room = await RoomAsync();
        Assert.Contains("message-unsafe", await RefusedAsync(() => room.Kenji.InvokeAsync("Say", text)));
        Assert.Contains("message-unsafe", await RefusedAsync(() => room.Animator.InvokeAsync("Say", text)));
        Assert.Equal(0, await StoredAsync(room.CircleId, text));
        Assert.DoesNotContain(room.LuciaMessages.Drain(), m => m.Text == text);
    }

    [Fact]
    public async Task Someone_who_is_not_in_the_circle_cannot_chat_like_hide_or_change_settings()
    {
        await using var room = await RoomAsync();
        await room.Kenji.InvokeAsync("Say", "hi all");
        var id = (await room.LuciaMessages.NextAsync(m => m.Text == "hi all")).Id;

        // Never entered: every action is refused.
        var other = await _host.CircleAsync();
        await using var stranger = _host.Hub(other.Cookies);
        await stranger.StartAsync();
        Assert.Contains("not-entered", await RefusedAsync(() => stranger.InvokeAsync("Say", "hi")));
        Assert.Contains("not-entered", await RefusedAsync(() => stranger.InvokeAsync("LikeMessage", id)));
        Assert.Contains("not-entered", await RefusedAsync(() => stranger.InvokeAsync("HideMessage", id, true)));
        Assert.Contains("not-entered", await RefusedAsync(() => stranger.InvokeAsync("SetRoomSettings", Chat(RoomChatModes.Paused))));

        // Someone who left after entering loses access at once.
        var members = await _host.MembersAsync(room.CircleId);
        var lucia = members.Single(m => m.Name == "Lucía");
        await _host.DbAsync(db => db.CircleMembers.Where(m => m.Id == lucia.Id).ExecuteUpdateAsync(s => s.SetProperty(m => m.LeftAt, _factory.Clock.GetUtcNow())));
        Assert.Contains("not-a-member", await RefusedAsync(() => room.Lucia.InvokeAsync("Say", "still here")));
        Assert.Contains("not-a-member", await RefusedAsync(() => room.Lucia.InvokeAsync("LikeMessage", id)));
        Assert.Contains("not-a-member", await RefusedAsync(() => room.Lucia.InvokeAsync("HideMessage", id, true)));
        Assert.Contains("not-a-member", await RefusedAsync(() => room.Lucia.InvokeAsync("SetRoomSettings", Chat(RoomChatModes.Paused))));
    }

    [Fact]
    public async Task The_audience_screen_is_read_only()
    {
        await using var room = await RoomAsync();
        await room.Kenji.InvokeAsync("Say", "hi all");
        var id = (await room.LuciaMessages.NextAsync(m => m.Text == "hi all")).Id;

        await using var screen = _host.Hub(room.AnimatorCookies);
        await screen.StartAsync();
        await screen.InvokeAsync("EnterAudience", room.CircleId);
        Assert.Contains("not-entered", await RefusedAsync(() => screen.InvokeAsync("Say", "hi")));
        Assert.Contains("not-entered", await RefusedAsync(() => screen.InvokeAsync("LikeMessage", id)));
        Assert.Contains("not-entered", await RefusedAsync(() => screen.InvokeAsync("HideMessage", id, true)));
        Assert.Contains("not-entered", await RefusedAsync(() => screen.InvokeAsync("SetRoomSettings", Chat(RoomChatModes.Paused))));
    }

    [Fact]
    public async Task Likes_toggle_are_counted_on_read_and_refused_on_own_or_hidden_messages()
    {
        await using var room = await RoomAsync();
        var myLikes = new Inbox<(long Id, bool Liked)>(add => room.Lucia.On<long, bool>("MyLike", (id, liked) => add((id, liked))));
        var counts = new Inbox<(long Id, int Count)>(add => room.Kenji.On<long, int>("MessageLikes", (id, count) => add((id, count))));
        await room.Kenji.InvokeAsync("Say", "Great talk 👏");
        var id = (await room.LuciaMessages.NextAsync(m => m.Text == "Great talk 👏")).Id;

        Assert.Contains("own-message", await RefusedAsync(() => room.Kenji.InvokeAsync("LikeMessage", id)));
        Assert.Contains("message-invalid", await RefusedAsync(() => room.Lucia.InvokeAsync("LikeMessage", long.MaxValue)));

        await room.Lucia.InvokeAsync("LikeMessage", id);
        Assert.True((await myLikes.NextAsync(x => x.Id == id)).Liked);
        Assert.Equal(1, (await counts.NextAsync(x => x.Id == id)).Count);
        var view = await room.KenjiHttp.GetFromJsonAsync<CircleView>($"/api/circles/{room.CircleId}");
        Assert.Equal(1, view!.Messages.Single(m => m.Id == id).Likes);
        var luciaView = await room.LuciaHttp.GetFromJsonAsync<CircleView>($"/api/circles/{room.CircleId}");
        Assert.True(luciaView!.Messages.Single(m => m.Id == id).Liked);

        await room.Lucia.InvokeAsync("LikeMessage", id);
        Assert.False((await myLikes.NextAsync(x => x.Id == id)).Liked);
        Assert.Equal(0, (await counts.NextAsync(x => x.Id == id && x.Count == 0)).Count);

        await room.Animator.InvokeAsync("HideMessage", id, true);
        Assert.Contains("message-hidden", await RefusedAsync(() => room.Lucia.InvokeAsync("LikeMessage", id)));
    }

    [Fact]
    public async Task Parallel_likes_from_one_member_leave_at_most_one_row_and_a_count_that_matches()
    {
        await using var room = await RoomAsync();
        await room.Kenji.InvokeAsync("Say", "Parallel");
        var id = (await room.LuciaMessages.NextAsync(m => m.Text == "Parallel")).Id;
        var tabs = new List<HubConnection> { room.Lucia };
        try
        {
            var luciaCookies = room.LuciaCookies;
            for (var i = 0; i < 3; i++)
            {
                var tab = _host.Hub(luciaCookies);
                await tab.StartAsync();
                await tab.InvokeAsync<Guid[]>("Enter", room.CircleId);
                tabs.Add(tab);
            }
            await Task.WhenAll(tabs.Select(t => t.InvokeAsync("LikeMessage", id)));
        }
        finally
        {
            foreach (var t in tabs.Skip(1))
            {
                await t.DisposeAsync();
            }
        }

        var rows = await _host.DbAsync(db => db.MessageLikes.CountAsync(l => l.MessageId == id));
        Assert.InRange(rows, 0, 1);
        var view = await room.KenjiHttp.GetFromJsonAsync<CircleView>($"/api/circles/{room.CircleId}");
        Assert.Equal(rows, view!.Messages.Single(m => m.Id == id).Likes);
    }

    [Fact]
    public async Task Hidden_messages_never_reach_members_and_stay_visible_to_the_animator_until_unhidden()
    {
        await using var room = await RoomAsync();
        var hiddenIds = new Inbox<long>(add => room.Lucia.On<long>("MessageHidden", add));
        await room.Kenji.InvokeAsync("Say", "Not so kind");
        var id = (await room.LuciaMessages.NextAsync(m => m.Text == "Not so kind")).Id;

        Assert.Contains("animator-only", await RefusedAsync(() => room.Lucia.InvokeAsync("HideMessage", id, true)));
        Assert.Contains("animator-only", await RefusedAsync(() => room.Kenji.InvokeAsync("HideMessage", id, true)));
        Assert.Contains("message-invalid", await RefusedAsync(() => room.Animator.InvokeAsync("HideMessage", long.MaxValue, true)));

        room.LuciaMessages.Drain();
        await room.Animator.InvokeAsync("HideMessage", id, true);
        Assert.Equal(id, await hiddenIds.NextAsync());
        Assert.True((await room.AnimatorMessages.NextAsync(m => m.Id == id && m.Hidden)).Hidden);
        // Members got the removal only, never the text again.
        Assert.DoesNotContain(room.LuciaMessages.Drain(), m => m.Id == id);

        var luciaView = await room.LuciaHttp.GetFromJsonAsync<CircleView>($"/api/circles/{room.CircleId}");
        Assert.DoesNotContain(luciaView!.Messages, m => m.Id == id);
        var animatorView = await room.AnimatorHttp.GetFromJsonAsync<CircleView>($"/api/circles/{room.CircleId}");
        Assert.True(animatorView!.Messages.Single(m => m.Id == id).Hidden);
        var audits = await _host.DbAsync(db => db.AuditEvents.Where(a => a.Type == "message.hidden" && a.Detail!.Contains(room.CircleId.ToString())).ToListAsync());
        var audit = Assert.Single(audits);
        Assert.DoesNotContain("Not so kind", audit.Detail, StringComparison.Ordinal);

        await room.Animator.InvokeAsync("HideMessage", id, false);
        Assert.False((await room.LuciaMessages.NextAsync(m => m.Id == id)).Hidden);
        var back = await room.LuciaHttp.GetFromJsonAsync<CircleView>($"/api/circles/{room.CircleId}");
        Assert.False(back!.Messages.Single(m => m.Id == id).Hidden);
    }

    [Fact]
    public async Task Room_settings_are_animator_only_validated_and_reset_when_the_activity_changes()
    {
        await using var room = await RoomAsync();
        Assert.Contains("animator-only", await RefusedAsync(() => room.Kenji.InvokeAsync("SetRoomSettings", Chat(RoomChatModes.Paused))));
        Assert.Contains("settings-invalid", await RefusedAsync(() => room.Animator.InvokeAsync("SetRoomSettings", Chat("loud"))));

        var quiet = new RoomSettings(RoomChatModes.Slow, false, true);
        await room.Animator.InvokeAsync("SetRoomSettings", quiet);
        Assert.Equal(quiet, await room.LuciaSettings.NextAsync(s => s.Chat == RoomChatModes.Slow));
        Assert.Equal(quiet, RoomSettings.Of(await _host.DbAsync(db => db.Circles.AsNoTracking().SingleAsync(c => c.Id == room.CircleId))));
        var view = await room.KenjiHttp.GetFromJsonAsync<CircleView>($"/api/circles/{room.CircleId}");
        Assert.Equal(quiet, view!.Settings);
        var audited = await _host.DbAsync(db => db.AuditEvents.CountAsync(a => a.Type == "chat.slow" && a.Detail!.Contains(room.CircleId.ToString())));
        Assert.Equal(1, audited);

        await room.Animator.InvokeAsync("StartActivity", "qa");
        Assert.Equal(RoomSettings.Default, await room.LuciaSettings.NextAsync(s => s.Chat == RoomChatModes.Open));
        Assert.Equal(RoomSettings.Default, RoomSettings.Of(await _host.DbAsync(db => db.Circles.AsNoTracking().SingleAsync(c => c.Id == room.CircleId))));

        await room.Animator.InvokeAsync("SetRoomSettings", Chat(RoomChatModes.Paused));
        await room.LuciaSettings.NextAsync(s => s.Chat == RoomChatModes.Paused);
        await room.Animator.InvokeAsync("EndActivity");
        Assert.Equal(RoomSettings.Default, await room.LuciaSettings.NextAsync(s => s.Chat == RoomChatModes.Open));
        Assert.Equal(1, await _host.DbAsync(db => db.AuditEvents.CountAsync(a => a.Type == "chat.paused" && a.Detail!.Contains(room.CircleId.ToString()))));
    }
}
