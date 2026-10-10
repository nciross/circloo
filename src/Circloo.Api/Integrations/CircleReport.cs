using Circloo.Api.Circles;
using Circloo.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Integrations;

public sealed record ReportNote(string Text, int Votes);
public sealed record ReportColumn(string Id, string Name, List<ReportNote> Notes);
public sealed record ReportSection(string ActivityId, string Title, List<ReportColumn> Columns, string? Summary);
/// <summary>One presentation's reactions: its deck's name and the count per kind, never who reacted (spec 008 FR-818).</summary>
public sealed record ReportReactions(string Presentation, ReactionBurst Totals)
{
    /// <summary>"Reactions (Kickoff): 👏 42 · ❤️ 18 · 😂 9", the one line the senders write per presentation.</summary>
    public string Line => $"Reactions ({Presentation}): {ReactionKinds.Line(Totals)}";
}

public sealed record CircleReport(string Name, DateTimeOffset At, int People, List<ReportSection> Sections, List<ReportReactions>? Reactions = null)
{
    /// <summary>One line per presentation that received reactions, oldest first.</summary>
    public IEnumerable<string> ReactionLines => (Reactions ?? []).Select(r => r.Line);

    /// <summary>The notes worth turning into tasks: the "action" column of each board, most-voted first.</summary>
    public IEnumerable<ReportNote> Actions(int max) =>
        Sections.SelectMany(s => s.Columns.Where(c => ActionColumns.Contains(c.Id)).SelectMany(c => c.Notes))
            .OrderByDescending(n => n.Votes).Take(max);

    private static readonly string[] ActionColumns = ["start", "improve", "next"];
}

/// <summary>
/// Collects what a circle produced: board columns sorted by votes, circloo's last word per activity and the reaction
/// totals of each presentation.
/// </summary>
public static class CircleReports
{
    public static async Task<CircleReport> BuildAsync(CirclooDbContext db, Circle circle, IReadOnlyDictionary<string, string> titles, DateTimeOffset now, CancellationToken ct)
    {
        var notes = await db.BoardNotes.AsNoTracking().Where(n => n.CircleId == circle.Id)
            .Select(n => new { n.ActivityId, n.Column, n.Text, Votes = n.Votes.Count }).ToListAsync(ct);
        var lastAi = await db.CircleMessages.AsNoTracking().Where(m => m.CircleId == circle.Id && m.Kind == "ai" && m.HiddenAt == null)
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
        return new CircleReport(circle.Name, now, people, sections, await ReactionsAsync(db, circle.Id, ct));
    }

    /// <summary>The presentations that received reactions, oldest first. A deck deleted since keeps a generic name.</summary>
    private static async Task<List<ReportReactions>> ReactionsAsync(CirclooDbContext db, Guid circleId, CancellationToken ct)
    {
        var sessions = await db.PresentationSessions.AsNoTracking().Where(s => s.CircleId == circleId)
            .OrderBy(s => s.StartedAt).ThenBy(s => s.Id)
            .Select(s => new { s.ReactionTotals, Name = db.Presentations.Where(p => p.Id == s.PresentationId).Select(p => p.Name).FirstOrDefault() })
            .ToListAsync(ct);
        return [.. sessions.Select(s => new ReportReactions(s.Name ?? "Presentation", ReactionKinds.Totals(s.ReactionTotals))).Where(r => r.Totals.Count > 0)];
    }
}
