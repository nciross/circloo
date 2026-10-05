using Circloo.Api.Data;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Circloo.Api.Tests.Discussion;

/// <summary>Issue #216 (T901): the rules the database itself enforces for replies and recordings (spec 009 data-model).</summary>
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

    private Recording Run(Guid circleId, DateTimeOffset? ended = null) => new()
    {
        CircleId = circleId, Title = "Weekly", StartedAt = _factory.Clock.GetUtcNow(), CaptureFrom = _factory.Clock.GetUtcNow().AddSeconds(5),
        MaxAt = _factory.Clock.GetUtcNow().AddHours(4), EndedAt = ended, EndedReason = ended is null ? null : "animator",
    };

    [Fact]
    public async Task One_recording_runs_per_circle_and_a_finished_one_does_not_count()
    {
        var circle = await _host.Room.CircleAsync();
        await _host.Room.DbAsync(async db =>
        {
            db.Recordings.AddRange(Run(circle.Id, _factory.Clock.GetUtcNow()), Run(circle.Id, _factory.Clock.GetUtcNow()), Run(circle.Id));
            return await db.SaveChangesAsync();
        });
        var second = await Assert.ThrowsAsync<DbUpdateException>(() => _host.Room.DbAsync(async db =>
        {
            db.Recordings.Add(Run(circle.Id));
            return await db.SaveChangesAsync();
        }));
        Assert.True(Is(second, PostgresErrorCodes.UniqueViolation));
    }

    [Fact]
    public async Task Text_is_stored_for_messages_and_only_for_messages()
    {
        var circle = await _host.Room.CircleAsync();
        var recording = Run(circle.Id);
        await _host.Room.DbAsync(async db =>
        {
            db.Recordings.Add(recording);
            db.RecordingEvents.Add(new RecordingEvent { RecordingId = recording.Id, At = recording.CaptureFrom, Kind = "message", Text = "Hello" });
            db.RecordingEvents.Add(new RecordingEvent { RecordingId = recording.Id, At = recording.CaptureFrom, Kind = "stage.joined" });
            return await db.SaveChangesAsync();
        });

        foreach (var bad in new[]
        {
            new RecordingEvent { RecordingId = recording.Id, At = recording.CaptureFrom, Kind = "stage.joined", Text = "sneaky" },
            new RecordingEvent { RecordingId = recording.Id, At = recording.CaptureFrom, Kind = "message" },
        })
        {
            var refused = await Assert.ThrowsAsync<DbUpdateException>(() => _host.Room.DbAsync(async db =>
            {
                db.RecordingEvents.Add(bad);
                return await db.SaveChangesAsync();
            }));
            Assert.True(Is(refused, PostgresErrorCodes.CheckViolation));
        }
    }

    [Fact]
    public async Task Deleting_a_recording_deletes_its_events()
    {
        var circle = await _host.Room.CircleAsync();
        var recording = Run(circle.Id, _factory.Clock.GetUtcNow());
        await _host.Room.DbAsync(async db =>
        {
            db.Recordings.Add(recording);
            db.RecordingEvents.Add(new RecordingEvent { RecordingId = recording.Id, At = recording.CaptureFrom, Kind = "message", Text = "Hello" });
            return await db.SaveChangesAsync();
        });
        await _host.Room.DbAsync(db => db.Recordings.Where(r => r.Id == recording.Id).ExecuteDeleteAsync());
        Assert.Equal(0, await _host.Room.DbAsync(db => db.RecordingEvents.CountAsync(e => e.RecordingId == recording.Id)));
    }

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
