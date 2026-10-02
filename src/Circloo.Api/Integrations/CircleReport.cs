using Circloo.Api.Circles;
using Circloo.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Integrations;

public sealed record ReportNote(string Text, int Votes);
public sealed record ReportColumn(string Id, string Name, List<ReportNote> Notes);
public sealed record ReportSection(string ActivityId, string Title, List<ReportColumn> Columns, string? Summary);
public sealed record CircleReport(string Name, DateTimeOffset At, int People, List<ReportSection> Sections)
{
    /// <summary>The notes worth turning into tasks: the "action" column of each board, most-voted first.</summary>
    public IEnumerable<ReportNote> Actions(int max) =>
        Sections.SelectMany(s => s.Columns.Where(c => ActionColumns.Contains(c.Id)).SelectMany(c => c.Notes))
            .OrderByDescending(n => n.Votes).Take(max);

    private static readonly string[] ActionColumns = ["start", "improve", "next"];
}

/// <summary>Collects what a circle produced: board columns sorted by votes and circloo's last word per activity.</summary>
public static class CircleReports
{
    public static async Task<CircleReport> BuildAsync(CirclooDbContext db, Circle circle, IReadOnlyDictionary<string, string> titles, DateTimeOffset now, CancellationToken ct)
    {
        var notes = await db.BoardNotes.AsNoTracking().Where(n => n.CircleId == circle.Id)
            .Select(n => new { n.ActivityId, n.Column, n.Text, Votes = n.Votes.Count }).ToListAsync(ct);
        var lastAi = await db.CircleMessages.AsNoTracking().Where(m => m.CircleId == circle.Id && m.Kind == "ai")
            .GroupBy(m => m.ActivityId).Select(g => g.OrderByDescending(m => m.Id).First()).ToListAsync(ct);
        var people = await db.CircleMembers.CountAsync(m => m.CircleId == circle.Id && m.LeftAt == null, ct);

        var sections = new List<ReportSection>();
        foreach (var activityId in circle.Activities)
        {
            var columns = ActivityCatalog.ColumnsOf(activityId)
                .Select(c => new ReportColumn(c, CirclooCoach.ColumnName(circle.Locale, c),
                    [.. notes.Where(n => n.ActivityId == activityId && n.Column == c).OrderByDescending(n => n.Votes).Select(n => new ReportNote(n.Text, n.Votes))]))
                .Where(c => c.Notes.Count > 0)
                .ToList();
            var summary = lastAi.FirstOrDefault(m => m.ActivityId == activityId)?.Text;
            if (columns.Count == 0 && summary is null)
            {
                continue;
            }
            sections.Add(new ReportSection(activityId, titles.GetValueOrDefault(activityId, activityId), columns, summary));
        }
        return new CircleReport(circle.Name, now, people, sections);
    }
}
