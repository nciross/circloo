using System.Text.Json;
using Circloo.Api.Data;

namespace Circloo.Api.Presentations;

/// <summary>One answer choice as participants see it.</summary>
public sealed record OptionView(string Id, string Text);

/// <summary>A slide frozen into a session at start (data-model.md, <c>Snapshot</c>). Notes stay in the Slide table.</summary>
public sealed record SnapshotSlide(
    Guid SlideId,
    string Kind,
    string? Question = null,
    IReadOnlyList<OptionView>? Options = null,
    string? Correct = null,
    bool Multiple = false,
    int? Timer = null,
    bool ShowFirst = true,
    bool ShowLive = false,
    bool HasNotes = false);

/// <summary>Where a question stood when the animator left it, so coming back restores it (never reopens it).</summary>
public sealed record QuestionPhase(string Phase, DateTimeOffset? OpenedAt, DateTimeOffset? Deadline, DateTimeOffset? LockedAt);

/// <summary>The current slide as everyone sees it (contracts/hub.md <c>PresentationState.slide</c>).</summary>
public sealed record SlideStateView(
    string Kind,
    Guid SlideId,
    string? Image = null,
    string? Question = null,
    IReadOnlyList<OptionView>? Options = null,
    bool? MultipleChoice = null,
    int? TimerSeconds = null,
    bool? ShowFirst = null,
    bool? ShowLive = null);

/// <summary>What every screen in the circle renders (contracts/hub.md). Results and podium come with US4–US6.</summary>
public sealed record PresentationStateView(
    Guid SessionId,
    string PresentationName,
    int Position,
    int Count,
    bool Blank,
    SlideStateView Slide,
    string Phase,
    DateTimeOffset? OpenedAt,
    DateTimeOffset? Deadline,
    DateTimeOffset ServerNow,
    int Version,
    ResultsView? Results = null);

/// <summary>The animator's view of the next slide, beside their notes.</summary>
public sealed record NextSlideView(Guid SlideId, string Kind, string? Image, string? Question);

/// <summary>
/// The presenting state machine (data-model.md, phase transitions), kept free of I/O so every rule is unit-tested:
/// moving, blanking, and the question phases <c>idle → answering → locked → revealed → podium</c>. Moving away from a
/// question that is still answering locks it; coming back shows the stored phase, and a quiz timer never restarts.
/// </summary>
public static class LiveSession
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>The visible slides in order: deck slides not hidden, and every question.</summary>
    public static List<SnapshotSlide> BuildSnapshot(IEnumerable<Slide> slides) =>
        [.. slides
            .Where(s => SlideKinds.IsQuestion(s.Kind) || !s.Hidden)
            .OrderBy(s => s.Position)
            .Select(s => SlideKinds.IsQuestion(s.Kind)
                ? new SnapshotSlide(s.Id, s.Kind, s.Question, [.. s.Options.Select(o => new OptionView(o.Id, o.Text))],
                    s.Kind == SlideKinds.Quiz ? s.CorrectOption : null, s.Kind == SlideKinds.Poll && s.MultipleChoice,
                    s.Kind == SlideKinds.Quiz ? s.TimerSeconds ?? PresentationRules.TimerDefault : null, s.ShowFirst, s.Kind == SlideKinds.Poll && s.ShowLive)
                : new SnapshotSlide(s.Id, s.Kind, HasNotes: !string.IsNullOrWhiteSpace(s.Notes)))];

    public static PresentationSession Start(Guid circleId, Guid presentationId, Guid animatorMemberId, IReadOnlyList<SnapshotSlide> snapshot, bool showPodium, DateTimeOffset now)
    {
        if (snapshot.Count == 0)
        {
            throw new LiveSessionException("presentation-empty");
        }
        return new PresentationSession
        {
            CircleId = circleId,
            PresentationId = presentationId,
            StartedByMemberId = animatorMemberId,
            Snapshot = JsonSerializer.Serialize(snapshot, Json),
            ShowPodium = showPodium,
            Phase = SessionPhases.Idle,
            StartedAt = now,
        };
    }

    public static IReadOnlyList<SnapshotSlide> Slides(PresentationSession s) =>
        JsonSerializer.Deserialize<List<SnapshotSlide>>(s.Snapshot, Json) ?? [];

    public static Dictionary<Guid, QuestionPhase> Phases(PresentationSession s) =>
        JsonSerializer.Deserialize<Dictionary<Guid, QuestionPhase>>(s.QuestionPhases, Json) ?? [];

    /// <summary>
    /// Moves to <paramref name="position"/>: the slide shows unblanked, and a question shows its stored phase. Moving to
    /// the slide already shown only unblanks it, and never closes its question. Returns whether anything changed.
    /// </summary>
    public static bool GoTo(PresentationSession s, int position, DateTimeOffset now)
    {
        var slides = Slides(s);
        if (position < 0 || position >= slides.Count)
        {
            throw new LiveSessionException("out-of-range");
        }
        if (position == s.Position)
        {
            if (!s.Blank)
            {
                return false;
            }
            s.Blank = false;
            return true;
        }
        var phases = Phases(s);
        Remember(s, slides[s.Position], phases, now);

        s.Position = position;
        s.MaxPosition = Math.Max(s.MaxPosition, position);
        s.Blank = false;
        var target = slides[position];
        if (SlideKinds.IsQuestion(target.Kind) && phases.TryGetValue(target.SlideId, out var stored))
        {
            (s.Phase, s.OpenedAt, s.Deadline, s.LockedAt) = (stored.Phase, stored.OpenedAt, stored.Deadline, stored.LockedAt);
        }
        else
        {
            (s.Phase, s.OpenedAt, s.Deadline, s.LockedAt) = (SessionPhases.Idle, null, null, null);
        }
        s.QuestionPhases = JsonSerializer.Serialize(phases, Json);
        return true;
    }

    /// <summary>Blank on or off; returns whether it changed.</summary>
    public static bool SetBlank(PresentationSession s, bool blank)
    {
        if (s.Blank == blank)
        {
            return false;
        }
        s.Blank = blank;
        return true;
    }

    /// <summary>Opens answering on the current question; a quiz gets its deadline from the server clock.</summary>
    public static void Open(PresentationSession s, DateTimeOffset now)
    {
        var slide = Current(s);
        if (!SlideKinds.IsQuestion(slide.Kind))
        {
            throw new LiveSessionException("not-a-question");
        }
        if (s.Phase != SessionPhases.Idle)
        {
            throw new LiveSessionException("already-open");
        }
        s.Phase = SessionPhases.Answering;
        s.OpenedAt = now;
        s.Deadline = slide.Kind == SlideKinds.Quiz ? now.AddSeconds(slide.Timer ?? PresentationRules.TimerDefault) : null;
        s.LockedAt = null;
    }

    public static void Lock(PresentationSession s, DateTimeOffset now)
    {
        if (s.Phase != SessionPhases.Answering)
        {
            throw new LiveSessionException("not-answering");
        }
        s.Phase = SessionPhases.Locked;
        // A quiz locked by its timer locks at the deadline, not when the clock noticed.
        s.LockedAt = s.Deadline is { } deadline && deadline < now ? deadline : now;
    }

    /// <summary>Reveal locks first when answering is still open.</summary>
    public static void Reveal(PresentationSession s, DateTimeOffset now)
    {
        if (s.Phase == SessionPhases.Answering)
        {
            Lock(s, now);
        }
        if (s.Phase != SessionPhases.Locked)
        {
            throw new LiveSessionException("not-open");
        }
        s.Phase = SessionPhases.Revealed;
    }

    public static void ShowPodium(PresentationSession s)
    {
        if (!s.ShowPodium || Current(s).Kind != SlideKinds.Quiz)
        {
            throw new LiveSessionException("podium-off");
        }
        if (s.Phase != SessionPhases.Revealed)
        {
            throw new LiveSessionException("not-revealed");
        }
        s.Phase = SessionPhases.Podium;
    }

    public static SnapshotSlide Current(PresentationSession s) => Slides(s)[s.Position];

    /// <summary>Whether the current slide is a question people are answering or have answered.</summary>
    public static bool AsksNow(PresentationSession s) => SlideKinds.IsQuestion(Current(s).Kind) && s.Phase != SessionPhases.Idle;

    /// <summary>Results everyone may see before the reveal: only polls that show them live, once answering has opened.</summary>
    public static bool ShowsLiveResults(PresentationSession s) =>
        Current(s) is { Kind: SlideKinds.Poll, ShowLive: true } && s.Phase is SessionPhases.Answering or SessionPhases.Locked;

    /// <summary>Whether the current question has been revealed (its results stay on screen, podium included).</summary>
    public static bool Revealed(PresentationSession s) =>
        SlideKinds.IsQuestion(Current(s).Kind) && s.Phase is SessionPhases.Revealed or SessionPhases.Podium;

    /// <summary>Whether everyone sees results now: once revealed, or live for polls that show them.</summary>
    public static bool ShowsResults(PresentationSession s) => Revealed(s) || ShowsLiveResults(s);

    /// <summary>
    /// Whether an answer to <paramref name="slideId"/> is accepted now: the current question, answering open, and for a
    /// quiz before its deadline. Returns the refusal code, or null.
    /// </summary>
    public static string? AnswerRefusal(PresentationSession s, Guid slideId, DateTimeOffset now)
    {
        var slide = Current(s);
        if (slide.SlideId != slideId || !SlideKinds.IsQuestion(slide.Kind))
        {
            return "not-current-question";
        }
        if (s.Phase != SessionPhases.Answering || (s.Deadline is { } deadline && now >= deadline))
        {
            return "answers-closed";
        }
        return null;
    }

    /// <summary>Checks the chosen options: known, distinct, one unless the poll takes several. Returns them cleaned, or null.</summary>
    public static string[]? CleanOptions(SnapshotSlide slide, IReadOnlyList<string>? chosen)
    {
        if (chosen is null || chosen.Count == 0)
        {
            return null;
        }
        var known = (slide.Options ?? []).Select(o => o.Id).ToHashSet(StringComparer.Ordinal);
        var distinct = chosen.Distinct(StringComparer.Ordinal).ToArray();
        if (distinct.Length != chosen.Count || distinct.Any(o => !known.Contains(o)) || (distinct.Length > 1 && !slide.Multiple))
        {
            return null;
        }
        return [.. distinct.OrderBy(o => o, StringComparer.Ordinal)];
    }

    /// <summary>Whether a member may load this slide's picture: it is in the session and has been shown.</summary>
    public static bool HasShown(PresentationSession s, Guid slideId)
    {
        var slides = Slides(s);
        for (var i = 0; i <= Math.Min(s.MaxPosition, slides.Count - 1); i++)
        {
            if (slides[i].SlideId == slideId)
            {
                return true;
            }
        }
        return false;
    }

    public static PresentationStateView View(PresentationSession s, string presentationName, DateTimeOffset now, ResultsView? results = null)
    {
        var slides = Slides(s);
        var slide = slides[s.Position];
        var view = SlideKinds.IsQuestion(slide.Kind)
            ? new SlideStateView(slide.Kind, slide.SlideId, Question: slide.Question, Options: slide.Options ?? [], MultipleChoice: slide.Multiple,
                TimerSeconds: slide.Timer, ShowFirst: slide.ShowFirst, ShowLive: slide.ShowLive)
            : new SlideStateView(slide.Kind, slide.SlideId, Image: PresentationEndpoints.ImageUrl(slide.SlideId));
        return new PresentationStateView(s.Id, presentationName, s.Position, slides.Count, s.Blank, view, s.Phase, s.OpenedAt, s.Deadline, now, s.Version, results);
    }

    public static NextSlideView? Next(PresentationSession s)
    {
        var slides = Slides(s);
        if (s.Position + 1 >= slides.Count)
        {
            return null;
        }
        var next = slides[s.Position + 1];
        return new NextSlideView(next.SlideId, next.Kind, SlideKinds.IsQuestion(next.Kind) ? null : PresentationEndpoints.ImageUrl(next.SlideId), next.Question);
    }

    /// <summary>Stores the phase of the question being left; one still answering locks now (or at its passed deadline).</summary>
    private static void Remember(PresentationSession s, SnapshotSlide leaving, Dictionary<Guid, QuestionPhase> phases, DateTimeOffset now)
    {
        if (!SlideKinds.IsQuestion(leaving.Kind) || s.Phase == SessionPhases.Idle)
        {
            return;
        }
        if (s.Phase == SessionPhases.Answering)
        {
            Lock(s, now);
        }
        phases[leaving.SlideId] = new QuestionPhase(s.Phase, s.OpenedAt, s.Deadline, s.LockedAt);
    }
}

/// <summary>A refused presenting action; the code is the hub error the client translates.</summary>
public sealed class LiveSessionException(string code) : Exception(code)
{
    public string Code { get; } = code;
}
