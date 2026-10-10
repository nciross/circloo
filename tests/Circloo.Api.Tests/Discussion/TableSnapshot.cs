using System.Text.Json;
using Npgsql;

namespace Circloo.Api.Tests.Discussion;

/// <summary>
/// Every row of every table of the database, as JSON text (spec 009 SC-906). Two snapshots tell exactly which rows came
/// and went between them, so a test can prove that a call stored nothing but what the spec allows. The e2e makes the
/// same comparison against the live stack (<c>src/web/e2e/call-helpers.ts</c>, <c>dbSnapshot</c>).
/// </summary>
public sealed class TableSnapshot
{
    private readonly Dictionary<string, HashSet<string>> _tables;

    private TableSnapshot(Dictionary<string, HashSet<string>> tables) => _tables = tables;

    /// <summary>The rows each table gained and lost from this snapshot to <paramref name="after"/>; a changed row is both.</summary>
    public sealed record Change(List<JsonElement> Added, List<JsonElement> Removed);

    public static async Task<TableSnapshot> TakeAsync(string connectionString)
    {
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync();
        var names = new List<string>();
        await using (var cmd = new NpgsqlCommand(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '__EFMigrationsHistory' ORDER BY 1", conn))
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                names.Add(reader.GetString(0));
            }
        }

        var tables = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        foreach (var name in names)
        {
            var rows = new HashSet<string>(StringComparer.Ordinal);
            await using var cmd = new NpgsqlCommand($"SELECT row_to_json(t)::text FROM \"{name.Replace("\"", "\"\"", StringComparison.Ordinal)}\" t", conn);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                rows.Add(reader.GetString(0));
            }
            tables[name] = rows;
        }
        return new TableSnapshot(tables);
    }

    /// <summary>Only the tables that differ, by name.</summary>
    public SortedDictionary<string, Change> ChangesTo(TableSnapshot after)
    {
        var changes = new SortedDictionary<string, Change>(StringComparer.Ordinal);
        foreach (var name in _tables.Keys.Union(after._tables.Keys))
        {
            var was = _tables.GetValueOrDefault(name) ?? [];
            var now = after._tables.GetValueOrDefault(name) ?? [];
            var added = now.Except(was).Select(Parse).ToList();
            var removed = was.Except(now).Select(Parse).ToList();
            if (added.Count > 0 || removed.Count > 0)
            {
                changes[name] = new Change(added, removed);
            }
        }
        return changes;
    }

    private static JsonElement Parse(string row)
    {
        using var doc = JsonDocument.Parse(row);
        return doc.RootElement.Clone();
    }
}
