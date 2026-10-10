using Circloo.Api.Data;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;

namespace Circloo.Api.Tests.Discussion;

/// <summary>
/// Issue #258 (T918): only chat messages are stored (spec 009 FR-930, data-model). The migration <c>GroupCallsLiveKit</c>
/// drops the recording tables and the call's change history, adds the speaking mode, and can be undone.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class PersistenceTests(PostgresFixture pg) : IAsyncLifetime
{
    private const string Before = "20261006090000_LiveDiscussionStage";

    private ApiFactory _factory = null!;
    private DiscussionHost _host = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString());
        _host = new DiscussionHost(_factory);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public async Task The_migration_keeps_circles_from_before_with_the_defaults_and_drops_what_calls_no_longer_store()
    {
        await using var scratch = await ScratchDatabase.CreateAsync(pg.Container.GetConnectionString());
        await using var db = scratch.Context();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync(Before);

        // A circle as T901 left it: a call history written, and a recording row nobody should ever have written.
        var owner = Guid.CreateVersion7();
        var plain = Guid.CreateVersion7();
        var touched = Guid.CreateVersion7();
        var now = DateTimeOffset.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO "Users" ("Id","Email","Locale","CreatedAt","LastSeenAt") VALUES ({owner}, 'before@example.test', 'en', {now}, {now});
            INSERT INTO "Circles" ("Id","OwnerUserId","Name","JoinCode","Activities","Locale","CreatedAt","ExpiresAt","QaAllowAnonymous")
            VALUES ({plain}, {owner}, 'Plain', 'PLAIN00001', ARRAY[]::text[], 'en', {now}, {now.AddDays(7)}, false),
                   ({touched}, {owner}, 'Touched', 'TOUCH00001', ARRAY[]::text[], 'en', {now}, {now.AddDays(7)}, false);
            UPDATE "Circles" SET "DiscussionVideo" = false, "DiscussionChangedAt" = {now}, "DiscussionChangedByMemberId" = {owner} WHERE "Id" = {touched};
            INSERT INTO "Recordings" ("Id","CircleId","Title","StartedAt","CaptureFrom","MaxAt") VALUES ({Guid.CreateVersion7()}, {touched}, 'Old', {now}, {now}, {now});
            """);

        await migrator.MigrateAsync();

        var rows = await db.Circles.AsNoTracking().Where(c => c.OwnerUserId == owner).ToDictionaryAsync(c => c.Id);
        Assert.Equal((false, true, "hand"), (rows[plain].DiscussionOn, rows[plain].DiscussionVideo, rows[plain].DiscussionSpeaking));
        Assert.Equal((false, false, "hand"), (rows[touched].DiscussionOn, rows[touched].DiscussionVideo, rows[touched].DiscussionSpeaking));
        Assert.Empty(await scratch.TablesAsync("Recordings", "RecordingEvents"));
        Assert.Empty(await scratch.ColumnsAsync("Circles", "DiscussionChangedAt", "DiscussionChangedByMemberId"));
        Assert.Equal(new[] { "DiscussionSpeaking" }, await scratch.ColumnsAsync("Circles", "DiscussionSpeaking"));
    }

    [Fact]
    public async Task The_migration_can_be_undone_and_applied_again()
    {
        await using var scratch = await ScratchDatabase.CreateAsync(pg.Container.GetConnectionString());
        await using var db = scratch.Context();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync();

        await migrator.MigrateAsync(Before);
        Assert.Equal(new[] { "RecordingEvents", "Recordings" }, await scratch.TablesAsync("Recordings", "RecordingEvents"));
        Assert.Equal(new[] { "DiscussionChangedAt", "DiscussionChangedByMemberId" },
            await scratch.ColumnsAsync("Circles", "DiscussionChangedAt", "DiscussionChangedByMemberId", "DiscussionSpeaking"));
        Assert.Equal(new[] { "CK_RecordingEvents_TextOnlyForMessages" }, await scratch.ChecksAsync("CK_RecordingEvents_TextOnlyForMessages", "CK_Circles_DiscussionSpeaking"));
        Assert.Equal(new[] { "IX_RecordingEvents_RecordingId_Id", "IX_Recordings_CircleId_Running", "IX_Recordings_CircleId_StartedAt" },
            await scratch.IndexesAsync("IX_RecordingEvents_RecordingId_Id", "IX_Recordings_CircleId_Running", "IX_Recordings_CircleId_StartedAt"));

        await migrator.MigrateAsync();
        Assert.Empty(await scratch.TablesAsync("Recordings", "RecordingEvents"));
        Assert.Equal(new[] { "CK_Circles_DiscussionSpeaking" }, await scratch.ChecksAsync("CK_RecordingEvents_TextOnlyForMessages", "CK_Circles_DiscussionSpeaking"));
    }

    [Theory]
    [InlineData("shout")]
    [InlineData("")]
    [InlineData("HAND")]
    public async Task The_speaking_mode_is_hand_or_open_and_nothing_else(string mode)
    {
        var circle = await _host.Room.CircleAsync();
        await _host.Room.DbAsync(db => db.Circles.Where(c => c.Id == circle.Id).ExecuteUpdateAsync(s => s.SetProperty(c => c.DiscussionSpeaking, CallSpeakingModes.Open)));
        Assert.Equal("open", (await _host.CircleRowAsync(circle.Id)).DiscussionSpeaking);

        var refused = await Assert.ThrowsAnyAsync<Exception>(() => _host.Room.DbAsync(db =>
            db.Circles.Where(c => c.Id == circle.Id).ExecuteUpdateAsync(s => s.SetProperty(c => c.DiscussionSpeaking, mode))));
        var postgres = refused as PostgresException ?? refused.InnerException as PostgresException;
        Assert.Equal(PostgresErrorCodes.CheckViolation, postgres?.SqlState);
        Assert.Equal("open", (await _host.CircleRowAsync(circle.Id)).DiscussionSpeaking);
    }

    [Fact]
    public async Task Starting_changing_and_ending_a_call_writes_no_chat_row()
    {
        var circle = await _host.Room.CircleAsync();
        await using var animator = await _host.EnteredAsync(circle.Cookies, circle.Id);
        var before = await _host.Room.DbAsync(db => db.CircleMessages.CountAsync(m => m.CircleId == circle.Id));

        await animator.InvokeAsync("EnableDiscussion", true);
        await animator.InvokeAsync("EnableDiscussion", false);
        await animator.InvokeAsync("DisableDiscussion");
        await animator.InvokeAsync("EnableDiscussion", true);
        await animator.InvokeAsync("DisableDiscussion");

        Assert.Equal(before, await _host.Room.DbAsync(db => db.CircleMessages.CountAsync(m => m.CircleId == circle.Id)));
        Assert.Equal(2, (await _host.AuditAsync("discussion.off", circle.Id)).Count);
    }

    /// <summary>A throwaway database in the shared Postgres container, so migrations can go down and up without touching the others.</summary>
    private sealed class ScratchDatabase : IAsyncDisposable
    {
        private readonly string _admin;
        private readonly string _name;

        private ScratchDatabase(string admin, string name, string connectionString) => (_admin, _name, ConnectionString) = (admin, name, connectionString);

        public string ConnectionString { get; }

        public static async Task<ScratchDatabase> CreateAsync(string admin)
        {
            var name = $"migrate_{Guid.NewGuid():N}";
            await using (var conn = new NpgsqlConnection(admin))
            {
                await conn.OpenAsync();
                await using var cmd = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", conn);
                await cmd.ExecuteNonQueryAsync();
            }
            return new ScratchDatabase(admin, name, new NpgsqlConnectionStringBuilder(admin) { Database = name, Pooling = false }.ConnectionString);
        }

        public CirclooDbContext Context() => new(new DbContextOptionsBuilder<CirclooDbContext>().UseNpgsql(ConnectionString).Options);

        public Task<List<string>> TablesAsync(params string[] names) =>
            NamesAsync("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY(@names) ORDER BY 1", names);

        public Task<List<string>> ColumnsAsync(string table, params string[] names) =>
            NamesAsync($"SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '{table}' AND column_name = ANY(@names) ORDER BY 1", names);

        public Task<List<string>> ChecksAsync(params string[] names) =>
            NamesAsync("SELECT conname FROM pg_constraint WHERE contype = 'c' AND conname = ANY(@names) ORDER BY 1", names);

        public Task<List<string>> IndexesAsync(params string[] names) =>
            NamesAsync("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY(@names) ORDER BY 1", names);

        private async Task<List<string>> NamesAsync(string sql, string[] names)
        {
            await using var conn = new NpgsqlConnection(ConnectionString);
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("names", names);
            var found = new List<string>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                found.Add(reader.GetString(0));
            }
            return found;
        }

        public async ValueTask DisposeAsync()
        {
            await using var conn = new NpgsqlConnection(_admin);
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{_name}\" WITH (FORCE)", conn);
            await cmd.ExecuteNonQueryAsync();
        }
    }
}
