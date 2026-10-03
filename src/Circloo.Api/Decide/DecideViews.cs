using Circloo.Api.Data;

namespace Circloo.Api.Decide;

/// <summary>A poll as members see it (contracts/hub.md <c>PollView</c>); <c>MyVote</c> only in a member's own payloads.</summary>
public sealed record PollView(Guid Id, string Question, IReadOnlyList<ChoiceView> Options, bool MultipleChoice, bool ResultsLive, string State,
    IReadOnlyList<string>? MyVote = null)
{
    public static string StateOf(Poll p) => p.ClosedAt is not null ? "closed" : p.OpenedAt is not null ? "open" : "draft";
}

public sealed record ChoiceView(string Id, string Text)
{
    public static ChoiceView From(ChoiceOption o) => new(o.Id, o.Text);
}

/// <summary>Aggregated poll results; raw votes never leave the server.</summary>
public sealed record PollResultsView(Guid PollId, int Votes, IReadOnlyList<PollOptionResult> Options);

public sealed record PollOptionResult(string Id, int Count, int Percent, bool Winner);

/// <summary>A finished poll kept in the circle.</summary>
public sealed record FinishedPollView(Guid Id, string Question, DateTimeOffset ClosedAt, PollResultsView Results);

/// <summary>A Q&A question; the author is omitted for anonymous questions, for everyone (contracts/hub.md).</summary>
public sealed record QaQuestionView(long Id, string Text, QaAuthorView? Author, int Upvotes, string State, string? Answer,
    DateTimeOffset CreatedAt, DateTimeOffset? AnsweredAt, bool Mine, bool UpvotedByMe);

public sealed record QaAuthorView(Guid MemberId, string Name, string Character);

public sealed record QaView(bool AllowAnonymous, IReadOnlyList<QaQuestionView> Questions);

/// <summary>A form in the circle; <c>MyResponse</c> only in a member's own payloads.</summary>
public sealed record FormView(Guid Id, string? Title, IReadOnlyList<FormQuestionView> Questions, bool ShowNames, bool SummaryShared, string State)
{
    public static string StateOf(Form f) => f.ClosedAt is not null ? "closed" : f.OpenedAt is not null ? "open" : "draft";
}

public sealed record FormQuestionView(string Id, string Type, string Label, bool Required, string? Look, bool? LongText, IReadOnlyList<ChoiceView> Options)
{
    public static FormQuestionView From(FormQuestion q) => new(q.Id, q.Type, q.Label, q.Required, q.Look, q.LongText, [.. q.Options.Select(ChoiceView.From)]);
}

/// <summary>The circle's polls, Q&A and form, for late joiners and reloads (contracts/rest.md <c>decide</c>, FR-722).</summary>
public sealed record DecideView(PollView? Poll, IReadOnlyList<FinishedPollView> Polls, QaView Qa, FormView? Form)
{
    public static DecideView Empty(Circle circle) => new(null, [], new QaView(circle.QaAllowAnonymous, []), null);
}
