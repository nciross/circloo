using Circloo.Api.Circles;
using Circloo.Api.Data;

namespace Circloo.Api.Presentations;

public static class PresentationStatus
{
    public const string Processing = "processing";
    public const string Ready = "ready";
    public const string Failed = "failed";
}

public static class SlideKinds
{
    public const string Deck = "deck";
    public const string Poll = "poll";
    public const string Quiz = "quiz";

    public static bool IsQuestion(string kind) => kind is Poll or Quiz;
}

/// <summary>Where a question is in a running session (data-model.md, phase transitions).</summary>
public static class SessionPhases
{
    public const string Idle = "idle";
    public const string Answering = "answering";
    public const string Locked = "locked";
    public const string Revealed = "revealed";
    public const string Podium = "podium";
}

/// <summary>A poll or quiz as the editor sends it (contracts/rest.md, <c>QuestionInput</c>).</summary>
public sealed record QuestionInput(
    string Kind,
    string? Question,
    IReadOnlyList<OptionInput>? Options,
    bool? MultipleChoice = null,
    string? CorrectOption = null,
    int? TimerSeconds = null,
    bool? ShowFirst = null,
    bool? ShowLive = null);

public sealed record OptionInput(string? Id, string? Text);

/// <summary>Limits and validation for presentations and their questions (spec 006 FR-602, FR-605, FR-606).</summary>
public static class PresentationRules
{
    public const long MaxUploadBytes = 50L * 1024 * 1024;
    public const int MaxDeckSlides = 100;
    public const int MaxQuestionSlides = 50;
    public const int NameMax = 80;
    public const int NotesMax = 2000;
    public const int QuestionMax = 140;
    public const int OptionMax = 80;
    public const int MinOptions = 2;
    public const int MaxOptions = 6;
    public const int TimerMin = 10;
    public const int TimerMax = 60;
    public const int TimerDefault = 20;
    /// <summary>Idle presentations are flagged after this many days and deleted after <see cref="IdleDeleteDays"/> (FR-604a).</summary>
    public const int IdleWarnDays = 335;
    public const int IdleDeleteDays = 365;

    public static readonly string[] OptionIds = ["a", "b", "c", "d", "e", "f"];

    /// <summary>The name shown for a fresh upload: the file name without its extension, cleaned and bounded.</summary>
    public static string NameFromFile(string fileName)
    {
        var name = Path.GetFileNameWithoutExtension(fileName ?? "").Trim();
        name = new string([.. name.Where(c => !char.IsControl(c) && !TextRules.IsBidiControl(c))]);
        if (name.Length == 0)
        {
            return "Presentation";
        }
        return name.Length > NameMax ? name[..NameMax].TrimEnd() : name;
    }

    /// <summary>
    /// Checks a question and turns it into slide fields. Errors use stable codes the web translates:
    /// <c>kind</c>, <c>question-length</c>, <c>options-count</c>, <c>option-length</c>, <c>quiz-correct</c>, <c>timer-range</c>.
    /// </summary>
    public static (Slide? Slide, Dictionary<string, string[]> Errors) Validate(QuestionInput input)
    {
        var errors = new Dictionary<string, string[]>();
        void Add(string field, string code) => errors[field] = [code];

        if (!SlideKinds.IsQuestion(input.Kind))
        {
            Add("kind", "kind");
            return (null, errors);
        }

        var question = TextRules.Clean(input.Question, QuestionMax);
        if (question is null)
        {
            Add("question", "question-length");
        }

        var raw = input.Options ?? [];
        var options = new List<SlideOption>();
        if (raw.Count is < MinOptions or > MaxOptions)
        {
            Add("options", "options-count");
        }
        else
        {
            for (var i = 0; i < raw.Count; i++)
            {
                var text = TextRules.Clean(raw[i].Text, OptionMax);
                if (text is null)
                {
                    Add($"options[{i}]", "option-length");
                    continue;
                }
                // Ids are assigned by position: clients cannot smuggle their own, and "a".."f" stay stable for answers.
                options.Add(new SlideOption { Id = OptionIds[i], Text = text });
            }
        }

        var isQuiz = input.Kind == SlideKinds.Quiz;
        string? correct = null;
        int? timer = null;
        if (isQuiz)
        {
            // The editor names the correct option by its position id ("a".."f").
            correct = input.CorrectOption;
            var index = correct is null ? -1 : Array.IndexOf(OptionIds, correct);
            if (index < 0 || index >= raw.Count)
            {
                Add("correctOption", "quiz-correct");
            }
            timer = input.TimerSeconds ?? TimerDefault;
            if (timer is < TimerMin or > TimerMax)
            {
                Add("timerSeconds", "timer-range");
            }
        }

        if (errors.Count > 0)
        {
            return (null, errors);
        }

        return (new Slide
        {
            Kind = input.Kind,
            Question = question,
            Options = options,
            CorrectOption = correct,
            MultipleChoice = !isQuiz && (input.MultipleChoice ?? false),
            TimerSeconds = timer,
            ShowFirst = input.ShowFirst ?? true,
            ShowLive = !isQuiz && (input.ShowLive ?? false),
        }, errors);
    }

    /// <summary>Days left before an idle presentation is deleted, or null while it is not yet flagged (FR-604a).</summary>
    public static int? DeletesInDays(DateTimeOffset lastUsedAt, DateTimeOffset now)
    {
        var idle = (now - lastUsedAt).TotalDays;
        if (idle <= IdleWarnDays)
        {
            return null;
        }
        return Math.Max(0, (int)Math.Ceiling(IdleDeleteDays - idle));
    }
}
