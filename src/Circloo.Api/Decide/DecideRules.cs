using System.Text.Json;
using Circloo.Api.Circles;
using Circloo.Api.Data;

namespace Circloo.Api.Decide;

/// <summary>Where a Q&A question stands (spec 007 US2).</summary>
public static class QaStates
{
    public const string Open = "open";
    public const string Answered = "answered";
    public const string Hidden = "hidden";
}

/// <summary>The question types of a feedback form (spec 007 FR-712).</summary>
public static class FormQuestionTypes
{
    public const string Rating5 = "rating5";
    public const string Nps = "nps";
    public const string SingleChoice = "single";
    public const string MultipleChoice = "multiple";
    public const string YesNo = "yesno";
    public const string Text = "text";

    public static readonly string[] All = [Rating5, Nps, SingleChoice, MultipleChoice, YesNo, Text];
    public static bool HasOptions(string type) => type is SingleChoice or MultipleChoice;
}

/// <summary>A poll as the animator writes it (contracts/hub.md <c>PollInput</c>); option ids are assigned by the server.</summary>
public sealed record PollInput(string? Question, IReadOnlyList<string>? Options, bool MultipleChoice = false, bool ResultsLive = true);

/// <summary>A form question as the builder sends it (contracts/hub.md <c>FormQuestionInput</c>).</summary>
public sealed record FormQuestionInput(string? Type, string? Label, bool Required = false, string? Look = null, bool? LongText = null, IReadOnlyList<string>? Options = null);

/// <summary>A whole form as the builder sends it.</summary>
public sealed record FormInput(string? Title, bool ShowNames, IReadOnlyList<FormQuestionInput>? Questions);

/// <summary>
/// Limits and validation for polls, Q&A and forms (spec 007). Errors use stable codes the web translates, keyed by
/// field (<c>question</c>, <c>options[1]</c>, <c>questions[2].label</c>…). Text is cleaned (direction marks typed in Arabic
/// dropped, spoofing controls refused) and must pass the safety filter (<c>message-unsafe</c>).
/// </summary>
public static class DecideRules
{
    public const int PollQuestionMax = 140;
    public const int OptionMax = 80;
    public const int MinOptions = 2;
    public const int MaxOptions = 6;
    public const int QaQuestionMax = 200;
    public const int QaAnswerMax = 500;
    public const int FormTitleMax = 80;
    public const int FormLabelMax = 140;
    public const int MaxFormQuestions = 10;
    public const int ShortTextMax = 200;
    public const int LongTextMax = 1000;
    public const int SavedFormNameMax = 80;

    public static readonly string[] OptionIds = ["a", "b", "c", "d", "e", "f"];
    public static readonly string[] RatingLooks = ["stars", "smileys"];

    /// <summary>Cleans and safety-checks one text; returns the text, or the error code.</summary>
    public static (string? Text, string? Error) Text(string? value, int max, Func<string, bool> isSafe, string lengthCode)
    {
        var text = TextRules.CleanTyped(value, max);
        if (text is null)
        {
            return (null, lengthCode);
        }
        return isSafe(text) ? (text, null) : (null, "message-unsafe");
    }

    public static (Poll? Poll, Dictionary<string, string[]> Errors) ValidatePoll(PollInput input, Func<string, bool> isSafe)
    {
        var errors = new Dictionary<string, string[]>();
        var (question, questionError) = Text(input.Question, PollQuestionMax, isSafe, "question-length");
        if (questionError is not null)
        {
            errors["question"] = [questionError];
        }
        var options = Options(input.Options, "options", isSafe, errors);
        if (errors.Count > 0)
        {
            return (null, errors);
        }
        return (new Poll { Question = question!, Options = options, MultipleChoice = input.MultipleChoice, ResultsLive = input.ResultsLive }, errors);
    }

    /// <summary>Validates a Q&A question or answer; returns the cleaned text or the error code.</summary>
    public static (string? Text, string? Error) QaText(string? value, int max, Func<string, bool> isSafe) =>
        Text(value, max, isSafe, "text-length");

    public static (List<FormQuestion>? Questions, string? Title, Dictionary<string, string[]> Errors) ValidateForm(FormInput input, Func<string, bool> isSafe)
    {
        var errors = new Dictionary<string, string[]>();
        string? title = null;
        if (!string.IsNullOrWhiteSpace(input.Title))
        {
            var (clean, error) = Text(input.Title, FormTitleMax, isSafe, "title-length");
            if (error is not null)
            {
                errors["title"] = [error];
            }
            title = clean;
        }
        var raw = input.Questions ?? [];
        if (raw.Count is < 1 or > MaxFormQuestions)
        {
            errors["questions"] = ["questions-count"];
            return (null, title, errors);
        }
        var questions = new List<FormQuestion>();
        for (var i = 0; i < raw.Count; i++)
        {
            var q = raw[i];
            var field = $"questions[{i}]";
            if (q.Type is null || !FormQuestionTypes.All.Contains(q.Type))
            {
                errors[$"{field}.type"] = ["type"];
                continue;
            }
            var (label, labelError) = Text(q.Label, FormLabelMax, isSafe, "label-length");
            if (labelError is not null)
            {
                errors[$"{field}.label"] = [labelError];
            }
            string? look = null;
            if (q.Type == FormQuestionTypes.Rating5)
            {
                look = q.Look ?? "stars";
                if (!RatingLooks.Contains(look))
                {
                    errors[$"{field}.look"] = ["look"];
                }
            }
            var options = FormQuestionTypes.HasOptions(q.Type) ? Options(q.Options, $"{field}.options", isSafe, errors) : [];
            questions.Add(new FormQuestion
            {
                Id = $"q{i + 1}",
                Type = q.Type,
                Label = label ?? "",
                Required = q.Required,
                Look = look,
                LongText = q.Type == FormQuestionTypes.Text ? q.LongText ?? false : null,
                Options = options,
            });
        }
        return errors.Count > 0 ? (null, title, errors) : (questions, title, errors);
    }

    /// <summary>
    /// Checks one response against the form: every required question answered, values in range (rating 1–5, NPS 0–10,
    /// known option ids, text within its length and safe). Returns the cleaned answers as JSON, or field errors keyed by
    /// question id.
    /// </summary>
    public static (string? Json, Dictionary<string, string[]> Errors) ValidateResponse(IReadOnlyList<FormQuestion> questions,
        IReadOnlyDictionary<string, JsonElement>? answers, Func<string, bool> isSafe)
    {
        var errors = new Dictionary<string, string[]>();
        var clean = new Dictionary<string, object>();
        answers ??= new Dictionary<string, JsonElement>();
        foreach (var q in questions)
        {
            var has = answers.TryGetValue(q.Id, out var value) && value.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined)
                && !(value.ValueKind == JsonValueKind.String && string.IsNullOrWhiteSpace(value.GetString()))
                && !(value.ValueKind == JsonValueKind.Array && value.GetArrayLength() == 0);
            if (!has)
            {
                if (q.Required)
                {
                    errors[q.Id] = ["required"];
                }
                continue;
            }
            var (answer, error) = Answer(q, value, isSafe);
            if (error is not null)
            {
                errors[q.Id] = [error];
            }
            else
            {
                clean[q.Id] = answer!;
            }
        }
        return errors.Count > 0 ? (null, errors) : (JsonSerializer.Serialize(clean), errors);
    }

    private static (object? Value, string? Error) Answer(FormQuestion q, JsonElement value, Func<string, bool> isSafe)
    {
        var ids = q.Options.Select(o => o.Id).ToHashSet(StringComparer.Ordinal);
        switch (q.Type)
        {
            case FormQuestionTypes.Rating5:
            case FormQuestionTypes.Nps:
                var (min, max) = q.Type == FormQuestionTypes.Rating5 ? (1, 5) : (0, 10);
                return value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var n) && n >= min && n <= max
                    ? (n, null) : (null, "out-of-range");
            case FormQuestionTypes.YesNo:
                return value.ValueKind is JsonValueKind.True or JsonValueKind.False ? (value.GetBoolean(), null) : (null, "out-of-range");
            case FormQuestionTypes.SingleChoice:
                return value.ValueKind == JsonValueKind.String && ids.Contains(value.GetString()!) ? (value.GetString(), null) : (null, "out-of-range");
            case FormQuestionTypes.MultipleChoice:
                if (value.ValueKind != JsonValueKind.Array)
                {
                    return (null, "out-of-range");
                }
                var chosen = value.EnumerateArray().Select(e => e.ValueKind == JsonValueKind.String ? e.GetString() : null).ToArray();
                return chosen.All(c => c is not null && ids.Contains(c)) && chosen.Distinct().Count() == chosen.Length
                    ? (chosen.Order(StringComparer.Ordinal).ToArray(), null) : (null, "out-of-range");
            case FormQuestionTypes.Text:
                if (value.ValueKind != JsonValueKind.String)
                {
                    return (null, "out-of-range");
                }
                var (text, error) = Text(value.GetString(), q.LongText == true ? LongTextMax : ShortTextMax, isSafe, "too-long");
                return (text, error);
            default:
                return (null, "out-of-range");
        }
    }

    /// <summary>2–6 options of 1–80 characters, ids assigned by position ("a"…"f").</summary>
    private static List<ChoiceOption> Options(IReadOnlyList<string>? raw, string field, Func<string, bool> isSafe, Dictionary<string, string[]> errors)
    {
        raw ??= [];
        if (raw.Count is < MinOptions or > MaxOptions)
        {
            errors[field] = ["options-count"];
            return [];
        }
        var options = new List<ChoiceOption>();
        for (var i = 0; i < raw.Count; i++)
        {
            var (text, error) = Text(raw[i], OptionMax, isSafe, "option-length");
            if (error is not null)
            {
                errors[$"{field}[{i}]"] = [error];
                continue;
            }
            options.Add(new ChoiceOption { Id = OptionIds[i], Text = text! });
        }
        return options;
    }
}
