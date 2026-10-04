using Circloo.Api.Common;

namespace Circloo.Api.Presentations;

/// <summary>One option's share of the answers (contracts/hub.md <c>Results.options</c>).</summary>
public sealed record OptionResult(string Id, int Count, int Percent, bool Winner, bool? Correct = null);

/// <summary>Who answered first, and how fast (spotlight, US5). Filled in with the reveal.</summary>
public sealed record FirstAnswer(Guid MemberId, string Name, string Character, long Ms);

/// <summary>The results of a question (contracts/hub.md <c>Results</c>): live for polls that show them, otherwise at reveal.</summary>
public sealed record ResultsView(int Total, IReadOnlyList<OptionResult> Options, FirstAnswer? First = null);

/// <summary>"n of N answered" and who is still to answer: the animator's and the audience screen's eyes only.</summary>
public sealed record AnswerCountView(Guid SlideId, int Answered, int Of, IReadOnlyList<Guid> Pending);

/// <summary>A participant's own answer, sent to all of their connections (contracts/hub.md <c>MyAnswer</c>).</summary>
public sealed record MyAnswerView(Guid SlideId, IReadOnlyList<string> Options, bool? Correct = null, int? Points = null, int? Rank = null);

/// <summary>One stored answer as the reveal needs it: received order, who, what, when, and for a quiz whether it was right.</summary>
public sealed record AnswerRow(long Seq, Guid MemberId, IReadOnlyList<string> Options, DateTimeOffset FirstReceivedAt, bool? Correct);

/// <summary>Counting answers into results: pure, so the maths is unit-tested.</summary>
public static class ResultsBuilder
{
    /// <summary>
    /// Counts each option over the answers given (one per person; several options each for multiple choice), with
    /// percentages that add up to 100. With <paramref name="winners"/> (the reveal), the most chosen options are
    /// winners, ties included; nobody wins without answers. Live results crown nobody.
    /// </summary>
    public static ResultsView Build(SnapshotSlide slide, IReadOnlyCollection<IReadOnlyList<string>> answers, bool winners = false)
    {
        var options = slide.Options ?? [];
        var counts = options.Select(o => answers.Count(a => a.Contains(o.Id))).ToArray();
        var percents = Percentages.Of(counts);
        var max = counts.Length == 0 ? 0 : counts.Max();
        return new ResultsView(answers.Count, [.. options.Select((o, i) => new OptionResult(o.Id, counts[i], percents[i], winners && max > 0 && counts[i] == max))]);
    }

    /// <summary>
    /// The revealed results (spec 006 US5, US6): a quiz marks its correct option, and when the question shows who was
    /// first, the spotlight goes to the earliest answer received (for a quiz, the earliest correct one), with the time
    /// since answering opened. Nobody is named when the spotlight is off or nobody qualifies.
    /// </summary>
    public static ResultsView Reveal(SnapshotSlide slide, IReadOnlyList<AnswerRow> answers, DateTimeOffset? openedAt, IReadOnlyDictionary<Guid, (string Name, string Character)> members)
    {
        var counted = Build(slide, [.. answers.Select(a => a.Options)], winners: true);
        var quiz = slide.Kind == SlideKinds.Quiz;
        var options = quiz ? [.. counted.Options.Select(o => o with { Correct = o.Id == slide.Correct })] : counted.Options;
        FirstAnswer? first = null;
        if (slide.ShowFirst
            && answers.Where(a => !quiz || a.Correct == true).MinBy(a => a.Seq) is { } earliest
            && members.TryGetValue(earliest.MemberId, out var who))
        {
            var ms = openedAt is { } opened ? Math.Max(0, (long)Math.Round((earliest.FirstReceivedAt - opened).TotalMilliseconds)) : 0;
            first = new FirstAnswer(earliest.MemberId, who.Name, who.Character, ms);
        }
        return counted with { Options = options, First = first };
    }
}
