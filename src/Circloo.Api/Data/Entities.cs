namespace Circloo.Api.Data;

public sealed class User
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public required string Email { get; set; }
    public string? DisplayName { get; set; }
    public required string Locale { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }

    public bool ProfileCompleted => DisplayName is not null;
}

public sealed class OtpChallenge
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public required string Email { get; set; }
    public required byte[] CodeHash { get; set; }
    public required string Locale { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
    public DateTimeOffset? SupersededAt { get; set; }
    public byte[]? RequestIpHash { get; set; }
}

public sealed class UserSession
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public string? UserAgent { get; set; }
}

public sealed class AuditEvent
{
    public long Id { get; set; }
    public required string Type { get; set; }
    public DateTimeOffset At { get; set; }
    public Guid? UserId { get; set; }
    public byte[]? EmailHash { get; set; }
    public byte[]? IpHash { get; set; }
    public string? Detail { get; set; }
}

public sealed class EmailOutboxMessage
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public required string To { get; set; }
    public required string Template { get; set; }
    public required string Locale { get; set; }
    public required string PayloadProtected { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset? FailedAt { get; set; }
}

public sealed class Spark
{
    public required string Id { get; set; }
    public required string Lang { get; set; }
    public required string Kind { get; set; }
    public required string Tone { get; set; }
    public string[] Audiences { get; set; } = [];
    public bool KidsSafe { get; set; }
    public required string Text { get; set; }
    public string? Answer { get; set; }
    public required string Source { get; set; }
    public Guid? OwnerId { get; set; }
    public User? Owner { get; set; }
    public bool Retired { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class SparkFavorite
{
    public Guid UserId { get; set; }
    public required string SparkId { get; set; }
    public Spark? Spark { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class AiGeneration
{
    public long Id { get; set; }
    public Guid UserId { get; set; }
    public DateTimeOffset At { get; set; }
    public required string Provider { get; set; }
    public required string Model { get; set; }
    public int? InputTokens { get; set; }
    public int? OutputTokens { get; set; }
    public int Requested { get; set; }
    public int Accepted { get; set; }
    public required string Outcome { get; set; }
    public int LatencyMs { get; set; }
    /// <summary>What the call was for: "sparks" (fresh cards) or "coach" (circloo in a circle).</summary>
    public string Purpose { get; set; } = "sparks";
}

/// <summary>A live session: the animator creates it, people join with a link (spec 003).</summary>
public sealed class Circle
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid OwnerUserId { get; set; }
    public required string Name { get; set; }
    public required string JoinCode { get; set; }
    public string[] Activities { get; set; } = [];
    public string? CurrentActivity { get; set; }
    public required string Locale { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }
    /// <summary>Q&A: whether members may ask anonymously (spec 007, off by default).</summary>
    public bool QaAllowAnonymous { get; set; }

    public bool IsOpen(DateTimeOffset now) => ClosedAt is null && ExpiresAt > now;
}

public sealed class CircleMember
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid CircleId { get; set; }
    public Circle? Circle { get; set; }
    public required string Role { get; set; }
    public Guid? UserId { get; set; }
    public required string Name { get; set; }
    public required string Character { get; set; }
    public DateTimeOffset JoinedAt { get; set; }
    public DateTimeOffset? LeftAt { get; set; }
}

public sealed class CircleMessage
{
    public long Id { get; set; }
    public Guid CircleId { get; set; }
    public string? ActivityId { get; set; }
    public Guid? MemberId { get; set; }
    public required string Kind { get; set; }
    public required string Text { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>A sticky note on a circle's live board (spec 004).</summary>
public sealed class BoardNote
{
    public long Id { get; set; }
    public Guid CircleId { get; set; }
    public required string ActivityId { get; set; }
    public required string Column { get; set; }
    public required string Text { get; set; }
    public required string Color { get; set; }
    public Guid AuthorMemberId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public List<BoardVote> Votes { get; set; } = [];
}

/// <summary>A sticky note on a live canvas (issue #93), placed anywhere and styled by its author.</summary>
public sealed class CanvasNote
{
    public long Id { get; set; }
    public Guid CircleId { get; set; }
    public required string ActivityId { get; set; }
    public required string Text { get; set; }
    public double X { get; set; }
    public double Y { get; set; }
    public required string Color { get; set; }
    public required string Size { get; set; }
    public required string Shape { get; set; }
    public string? Sticker { get; set; }
    public Guid AuthorMemberId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class BoardVote
{
    public long NoteId { get; set; }
    public Guid MemberId { get; set; }
}

/// <summary>A person's connection to an outside service (spec 005). The config, secrets included, is encrypted.</summary>
public sealed class IntegrationConnection
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid UserId { get; set; }
    public required string Provider { get; set; }
    public required string ConfigProtected { get; set; }
    public required string Hint { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastUsedAt { get; set; }
}

/// <summary>A deck in its owner's library (spec 006): a converted .pptx plus the question slides added to it.</summary>
public sealed class Presentation
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid OwnerUserId { get; set; }
    public required string Name { get; set; }
    public required string SourceFileName { get; set; }
    /// <summary>"processing", "ready" or "failed" (<see cref="Presentations.PresentationStatus"/>).</summary>
    public required string Status { get; set; }
    /// <summary>Why it failed, as a stable code the web translates (e.g. "encrypted", "timeout").</summary>
    public string? Error { get; set; }
    public int SlideCount { get; set; }
    public int ProcessedSlides { get; set; }
    public bool ShowPodium { get; set; } = true;
    /// <summary>Answers open as soon as a question slide is shown (#170); off, the animator opens them.</summary>
    public bool AutoOpen { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    /// <summary>Opened in the editor or presented; drives the 12-month idle clean-up (FR-604a).</summary>
    public DateTimeOffset LastUsedAt { get; set; }
    /// <summary>Bumped on every edit; clients send it back and get 409 when it moved (optimistic concurrency).</summary>
    public int Version { get; set; }
    /// <summary>The replica converting it, so only one does (research R4).</summary>
    public string? ConvertingBy { get; set; }
    public DateTimeOffset? LeaseUntil { get; set; }
    public List<Slide> Slides { get; set; } = [];
}

/// <summary>One item of a presentation, in order: a deck slide (a picture) or a poll/quiz question.</summary>
public sealed class Slide
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid PresentationId { get; set; }
    public int Position { get; set; }
    /// <summary>"deck", "poll" or "quiz" (<see cref="Presentations.SlideKinds"/>).</summary>
    public required string Kind { get; set; }
    public bool Hidden { get; set; }
    /// <summary>Deck slides: the slide's index in the .pptx.</summary>
    public int? SourceIndex { get; set; }
    /// <summary>Deck slides: speaker notes, shown to the animator only.</summary>
    public string? Notes { get; set; }
    public string? Question { get; set; }
    public List<SlideOption> Options { get; set; } = [];
    public string? CorrectOption { get; set; }
    public bool MultipleChoice { get; set; }
    public int? TimerSeconds { get; set; }
    public bool ShowFirst { get; set; } = true;
    public bool ShowLive { get; set; }
}

/// <summary>One answer choice of a question, stored as JSON with its slide. Ids are "a" to "f".</summary>
public sealed class SlideOption
{
    public required string Id { get; set; }
    public required string Text { get; set; }
}

/// <summary>One run of a presentation in a circle (spec 006 US3): the shared state everyone follows.</summary>
public sealed class PresentationSession
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid CircleId { get; set; }
    public Guid? PresentationId { get; set; }
    public Guid StartedByMemberId { get; set; }
    /// <summary>The visible slides and questions frozen at start (JSON), so edits never change a running session.</summary>
    public required string Snapshot { get; set; }
    public bool ShowPodium { get; set; }
    /// <summary>Copied from the presentation at start: questions open when shown (#170).</summary>
    public bool AutoOpen { get; set; }
    public int Position { get; set; }
    /// <summary>The furthest slide shown so far: members may load pictures up to here.</summary>
    public int MaxPosition { get; set; }
    public bool Blank { get; set; }
    /// <summary>"idle", "answering", "locked", "revealed" or "podium" (<see cref="Presentations.SessionPhases"/>).</summary>
    public required string Phase { get; set; }
    public DateTimeOffset? OpenedAt { get; set; }
    public DateTimeOffset? Deadline { get; set; }
    public DateTimeOffset? LockedAt { get; set; }
    /// <summary>Per question slide id, its stored phase and times (JSON), so coming back to a question restores it.</summary>
    public string QuestionPhases { get; set; } = "{}";
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public int Version { get; set; }
}

/// <summary>A participant's answer to one question of a session. <see cref="Seq"/> is the order received: lowest is first.</summary>
public sealed class SessionAnswer
{
    public long Seq { get; set; }
    public Guid SessionId { get; set; }
    public Guid SlideId { get; set; }
    public Guid MemberId { get; set; }
    public string[] Options { get; set; } = [];
    /// <summary>When this person first answered; kept when a poll answer is replaced.</summary>
    public DateTimeOffset FirstReceivedAt { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }
    public bool? Correct { get; set; }
    public int Points { get; set; }
}

// ---------- Polls, Q&A and feedback forms in a circle (spec 007) ----------

/// <summary>One answer people can choose: a poll option or a form choice. Ids are "a"…"f", assigned by position.</summary>
public sealed class ChoiceOption
{
    public required string Id { get; set; }
    public required string Text { get; set; }
}

/// <summary>A live poll in a circle: draft (not opened), open, then closed with its result kept (spec 007 US1).</summary>
public sealed class Poll
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid CircleId { get; set; }
    public required string Question { get; set; }
    public List<ChoiceOption> Options { get; set; } = [];
    public bool MultipleChoice { get; set; }
    /// <summary>Members see results while voting; off means "show results when the vote closes" (clarification Q1).</summary>
    public bool ResultsLive { get; set; } = true;
    public Guid CreatedByMemberId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? OpenedAt { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }
    public int Version { get; set; }
}

/// <summary>A member's vote: one per poll, replaced until the poll closes.</summary>
public sealed class PollVote
{
    public long Id { get; set; }
    public Guid PollId { get; set; }
    public Guid MemberId { get; set; }
    public string[] Options { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>A question asked in Q&A (spec 007 US2). The author is always stored, never shown when anonymous.</summary>
public sealed class QaQuestion
{
    public long Id { get; set; }
    public Guid CircleId { get; set; }
    public Guid AuthorMemberId { get; set; }
    public bool Anonymous { get; set; }
    public required string Text { get; set; }
    /// <summary>"open", "answered" or "hidden" (<see cref="Decide.QaStates"/>).</summary>
    public required string State { get; set; }
    public string? Answer { get; set; }
    /// <summary>Kept equal to the number of <see cref="QaUpvote"/> rows, updated in the same transaction.</summary>
    public int Upvotes { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? AnsweredAt { get; set; }
}

/// <summary>One upvote per member per question; never on one's own question.</summary>
public sealed class QaUpvote
{
    public long QuestionId { get; set; }
    public Guid MemberId { get; set; }
}

/// <summary>A question of a feedback form, stored inside the form (JSON). See data-model.md "FormQuestion".</summary>
public sealed class FormQuestion
{
    /// <summary>"q1"…"q10", assigned by position.</summary>
    public required string Id { get; set; }
    /// <summary>"rating5", "nps", "single", "multiple", "yesno" or "text" (<see cref="Decide.FormQuestionTypes"/>).</summary>
    public required string Type { get; set; }
    public required string Label { get; set; }
    public bool Required { get; set; }
    /// <summary>rating5 only: "stars" or "smileys".</summary>
    public string? Look { get; set; }
    /// <summary>text only: long answers (up to 1 000 characters) instead of short (up to 200).</summary>
    public bool? LongText { get; set; }
    public List<ChoiceOption> Options { get; set; } = [];
}

/// <summary>A feedback form in a circle (spec 007 US3): a copy of a saved form or built in place.</summary>
public sealed class Form
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid CircleId { get; set; }
    public string? Title { get; set; }
    public List<FormQuestion> Questions { get; set; } = [];
    /// <summary>Free-text answers show who wrote them; fixed once the form opens, and announced on the form.</summary>
    public bool ShowNames { get; set; }
    /// <summary>After closing, the animator shared the (non free-text) summary with the circle (clarification Q3).</summary>
    public bool SummaryShared { get; set; }
    public Guid? SavedFormId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? OpenedAt { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }
    public int Version { get; set; }
}

/// <summary>A member's answers to a form: one per form, replaced until it closes. Answers are JSON keyed by question id.</summary>
public sealed class FormResponse
{
    public long Id { get; set; }
    public Guid FormId { get; set; }
    public Guid MemberId { get; set; }
    public string Answers { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>A form in the animator's My forms library (clarification Q2); copied into a circle when picked.</summary>
public sealed class SavedForm
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid OwnerUserId { get; set; }
    public required string Name { get; set; }
    public string? Title { get; set; }
    public List<FormQuestion> Questions { get; set; } = [];
    public bool ShowNames { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    /// <summary>Saved forms unused for 365 days are deleted (like presentations).</summary>
    public DateTimeOffset LastUsedAt { get; set; }
    public int Version { get; set; }
}
