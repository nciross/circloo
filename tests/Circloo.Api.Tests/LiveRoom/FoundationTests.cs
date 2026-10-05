using System.Net.Http.Json;
using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Npgsql;

namespace Circloo.Api.Tests.LiveRoom;

/// <summary>Issue #175 (T801): the live room foundation of spec 008.</summary>
[Collection(ApiCollection.Name)]
public sealed class FoundationTests(PostgresFixture pg) : IAsyncLifetime
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

    private static bool IsUnique(DbUpdateException e) => e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };

    [Fact]
    public async Task A_circle_starts_with_an_open_chat_reactions_on_and_no_hands()
    {
        var circle = await _host.CircleAsync();
        var row = await _host.DbAsync(db => db.Circles.SingleAsync(c => c.Id == circle.Id));
        Assert.Equal((RoomChatModes.Open, true, false), (row.ChatMode, row.ReactionsOn, row.PirikooQuiet));
        var view = await circle.Http.GetFromJsonAsync<CircleView>($"/api/circles/{circle.Id}");
        Assert.Equal(RoomSettings.Default, view!.Settings);
        Assert.Equal((0, (Guid?)null), (view.Hands!.Queue.Count, view.Hands.Floor));
        Assert.Equal(0, view.Me.Ring);
    }

    [Fact]
    public async Task Two_people_may_share_a_character_on_different_rings_but_never_the_same_ring()
    {
        var circle = await _host.CircleAsync();
        var now = _factory.Clock.GetUtcNow();
        CircleMember Fox(string name, int ring) => new() { CircleId = circle.Id, Role = Roles.Participant, Name = name, Character = "fox", Ring = ring, JoinedAt = now };

        await _host.DbAsync(async db =>
        {
            db.CircleMembers.AddRange(Fox("Kenji", 0), Fox("Lucía", 1));
            return await db.SaveChangesAsync();
        });
        var clash = await Assert.ThrowsAsync<DbUpdateException>(() => _host.DbAsync(async db =>
        {
            db.CircleMembers.Add(Fox("Théo", 1));
            return await db.SaveChangesAsync();
        }));
        Assert.True(IsUnique(clash));

        // Two people grabbing the same ring at the same moment: one of them wins, the other is refused.
        var race = await Task.WhenAll(Enumerable.Range(0, 2).Select(async i =>
        {
            try
            {
                await _host.DbAsync(async db =>
                {
                    db.CircleMembers.Add(Fox($"Racer {i}", 2));
                    return await db.SaveChangesAsync();
                });
                return true;
            }
            catch (DbUpdateException e) when (IsUnique(e))
            {
                return false;
            }
        }));
        Assert.Equal(1, race.Count(won => won));

        // Someone who left frees their ring.
        await _host.DbAsync(db => db.CircleMembers.Where(m => m.CircleId == circle.Id && m.Name == "Lucía")
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.LeftAt, now)));
        await _host.DbAsync(async db =>
        {
            db.CircleMembers.Add(Fox("Théo", 1));
            return await db.SaveChangesAsync();
        });
        Assert.Equal(3, (await _host.MembersAsync(circle.Id)).Count(m => m.Character == "fox"));
    }

    [Fact]
    public async Task One_like_per_member_and_message_and_one_floor_per_circle()
    {
        var circle = await _host.CircleAsync();
        var now = _factory.Clock.GetUtcNow();
        var (members, message) = await _host.DbAsync(async db =>
        {
            var a = new CircleMember { CircleId = circle.Id, Role = Roles.Participant, Name = "Kenji", Character = "fox", JoinedAt = now };
            var b = new CircleMember { CircleId = circle.Id, Role = Roles.Participant, Name = "Youssef", Character = "owl", JoinedAt = now };
            db.CircleMembers.AddRange(a, b);
            var m = new CircleMessage { CircleId = circle.Id, MemberId = a.Id, Kind = "member", Text = "Hello 👋", CreatedAt = now };
            db.CircleMessages.Add(m);
            await db.SaveChangesAsync();
            return ((a, b), m);
        });

        await _host.DbAsync(async db =>
        {
            db.MessageLikes.Add(new MessageLike { MessageId = message.Id, MemberId = members.b.Id, At = now });
            return await db.SaveChangesAsync();
        });
        Assert.True(IsUnique(await Assert.ThrowsAsync<DbUpdateException>(() => _host.DbAsync(async db =>
        {
            db.MessageLikes.Add(new MessageLike { MessageId = message.Id, MemberId = members.b.Id, At = now });
            return await db.SaveChangesAsync();
        }))));

        await _host.DbAsync(async db =>
        {
            db.RaisedHands.AddRange(
                new RaisedHand { CircleId = circle.Id, MemberId = members.a.Id, RaisedAt = now, HasFloor = true },
                new RaisedHand { CircleId = circle.Id, MemberId = members.b.Id, RaisedAt = now.AddSeconds(1) });
            return await db.SaveChangesAsync();
        });
        var second = await Assert.ThrowsAsync<PostgresException>(() => _host.DbAsync(db =>
            db.RaisedHands.Where(h => h.MemberId == members.b.Id).ExecuteUpdateAsync(s => s.SetProperty(h => h.HasFloor, true))));
        Assert.Equal(PostgresErrorCodes.UniqueViolation, second.SqlState);

        // Hands as everyone sees them: the floor apart, the queue oldest first.
        var view = await circle.Http.GetFromJsonAsync<CircleView>($"/api/circles/{circle.Id}");
        Assert.Equal(members.a.Id, view!.Hands!.Floor);
        Assert.Equal([members.b.Id], view.Hands.Queue.Select(h => h.MemberId));
    }

    [Fact]
    public async Task Members_never_receive_hidden_messages_and_see_their_own_likes()
    {
        var circle = await _host.CircleAsync();
        var (_, guest, _) = await _host.JoinAsync(circle.Code, "Kenji", "fox");
        var now = _factory.Clock.GetUtcNow();
        var kenji = (await _host.MembersAsync(circle.Id)).Single(m => m.Name == "Kenji");
        var (shown, hidden) = await _host.DbAsync(async db =>
        {
            var a = new CircleMessage { CircleId = circle.Id, Kind = "member", Text = "Bonjour", CreatedAt = now };
            var b = new CircleMessage { CircleId = circle.Id, Kind = "member", Text = "rude", CreatedAt = now, HiddenAt = now };
            db.CircleMessages.AddRange(a, b);
            await db.SaveChangesAsync();
            db.MessageLikes.Add(new MessageLike { MessageId = a.Id, MemberId = kenji.Id, At = now });
            await db.SaveChangesAsync();
            return (a.Id, b.Id);
        });

        var guestView = await guest.GetFromJsonAsync<CircleView>($"/api/circles/{circle.Id}");
        Assert.DoesNotContain(guestView!.Messages, m => m.Id == hidden);
        var mine = guestView.Messages.Single(m => m.Id == shown);
        Assert.Equal((1, true, false), (mine.Likes, mine.Liked, mine.Hidden));

        var animatorView = await circle.Http.GetFromJsonAsync<CircleView>($"/api/circles/{circle.Id}");
        Assert.True(animatorView!.Messages.Single(m => m.Id == hidden).Hidden);
        Assert.False(animatorView.Messages.Single(m => m.Id == shown).Liked);
    }

    [Fact]
    public void The_upgrade_gives_existing_rows_an_open_chat_reactions_on_ring_0_and_no_reactions()
    {
        var up = new Circloo.Api.Data.Migrations.LiveRoomBigCircles().UpOperations
            .OfType<Microsoft.EntityFrameworkCore.Migrations.Operations.AddColumnOperation>()
            .ToDictionary(o => $"{o.Table}.{o.Name}");
        Assert.Equal("open", up["Circles.ChatMode"].DefaultValue);
        Assert.Equal(true, up["Circles.ReactionsOn"].DefaultValue);
        Assert.Equal(false, up["Circles.PirikooQuiet"].DefaultValue);
        Assert.Equal(0, up["CircleMembers.Ring"].DefaultValue);
        Assert.Equal("'{}'::jsonb", up["PresentationSessions.ReactionTotals"].DefaultValueSql);
        Assert.False(up.ContainsKey("CircleMessages.Likes"));
    }

    [Fact]
    public void A_circle_holds_its_configured_maximum_but_never_more_people_than_characters_allow()
    {
        Assert.Equal(12, Characters.Capacity(12));
        Assert.Equal(100, Characters.Capacity(100));
        // Never more people than 24 characters x 6 rings.
        Assert.Equal(144, Characters.Capacity(500));
    }

    [Fact]
    public void Room_limits_are_a_sliding_window_per_member_and_kind()
    {
        var clock = new FakeTimeProvider(DateTimeOffset.Parse("2026-10-05T09:00:00Z", System.Globalization.CultureInfo.InvariantCulture));
        var limits = new RoomLimits(clock);
        var (kenji, amina) = (Guid.NewGuid(), Guid.NewGuid());
        var window = TimeSpan.FromSeconds(10);

        Assert.All(Enumerable.Range(0, 5), _ => Assert.True(limits.TryTake(kenji, "message", 5, window)));
        Assert.False(limits.TryTake(kenji, "message", 5, window));
        // Another kind and another member have their own budgets.
        Assert.True(limits.TryTake(kenji, "reaction", 5, window));
        Assert.True(limits.TryTake(amina, "message", 5, window));

        clock.Advance(TimeSpan.FromSeconds(10));
        Assert.True(limits.TryTake(kenji, "message", 5, window));

        clock.Advance(TimeSpan.FromMinutes(11));
        Assert.Equal(3, limits.Sweep(TimeSpan.FromMinutes(10)));
        Assert.Equal(0, limits.Count);
    }

    [Fact]
    public async Task Many_people_entering_at_once_send_a_few_presence_updates_not_one_per_arrival()
    {
        var circle = await _host.CircleAsync();
        await using var animator = _host.Hub(circle.Cookies);
        var presence = new Inbox<Guid[]>(animator, "Presence");
        var received = 0;
        animator.On<Guid[]>("Presence", _ => Interlocked.Increment(ref received));
        await animator.StartAsync();
        await animator.InvokeAsync<Guid[]>("Enter", circle.Id);
        await presence.NextAsync();

        string[] characters = ["fox", "owl", "cat", "bear", "frog", "bee", "lion", "koala", "whale", "dino", "chick", "robot", "ghost", "bunny", "octopus", "penguin", "hamster", "hedgehog", "monkey", "cactus"];
        var guests = new List<HubConnection>();
        foreach (var (character, i) in characters.Select((c, i) => (c, i)))
        {
            var (res, _, cookies) = await _host.JoinAsync(circle.Code, $"Guest {i}", character);
            res.EnsureSuccessStatusCode();
            var hub = _host.Hub(cookies);
            await hub.StartAsync();
            guests.Add(hub);
        }
        try
        {
            var before = Volatile.Read(ref received);
            var started = System.Diagnostics.Stopwatch.StartNew();
            await Task.WhenAll(guests.Select(g => g.InvokeAsync<Guid[]>("Enter", circle.Id)));
            // The latest list always arrives, with everyone in it.
            var full = await presence.NextAsync(online => online.Length == characters.Length + 1);
            Assert.Equal(characters.Length + 1, full.Length);
            await Task.Delay(600);
            var updates = Volatile.Read(ref received) - before;
            // At most one list per 250 ms window while people arrive (plus the leading and trailing sends), never one each.
            var bound = (int)(started.Elapsed.TotalMilliseconds / 250) + 2;
            Assert.True(updates <= bound && updates < characters.Length, $"{updates} presence updates for {characters.Length} arrivals in {started.ElapsedMilliseconds} ms");
        }
        finally
        {
            foreach (var g in guests)
            {
                await g.DisposeAsync();
            }
        }
    }
}
