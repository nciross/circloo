using Circloo.Api.Data;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Circloo.Api.Tests.Discussion;

/// <summary>Issue #216 (T901): the rules the database itself enforces for replies (spec 009 data-model). Recordings are gone (T918).</summary>
[Collection(ApiCollection.Name)]
public sealed class DiscussionDataTests(PostgresFixture pg) : IAsyncLifetime
{
    private ApiFactory _factory = null!;
    private DiscussionHost _host = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString());
        _host = new DiscussionHost(_factory);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private static bool Is(DbUpdateException e, string state) => e.InnerException is PostgresException p && p.SqlState == state;

    [Fact]
    public async Task A_reply_points_at_a_message_that_cannot_be_deleted_while_it_has_replies()
    {
        var circle = await _host.Room.CircleAsync();
        var parent = new CircleMessage { CircleId = circle.Id, Kind = "member", Text = "Question", CreatedAt = _factory.Clock.GetUtcNow() };
        await _host.Room.DbAsync(async db =>
        {
            db.CircleMessages.Add(parent);
            return await db.SaveChangesAsync();
        });
        await _host.Room.DbAsync(async db =>
        {
            db.CircleMessages.Add(new CircleMessage { CircleId = circle.Id, Kind = "member", Text = "Answer", ReplyToId = parent.Id, CreatedAt = _factory.Clock.GetUtcNow() });
            return await db.SaveChangesAsync();
        });
        var refused = await Assert.ThrowsAsync<DbUpdateException>(() => _host.Room.DbAsync(db =>
        {
            db.CircleMessages.Remove(db.CircleMessages.Single(m => m.Id == parent.Id));
            return db.SaveChangesAsync();
        }));
        Assert.True(Is(refused, PostgresErrorCodes.ForeignKeyViolation));
    }
}
