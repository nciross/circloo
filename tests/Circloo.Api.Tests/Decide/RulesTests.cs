using System.Text.Json;
using Circloo.Api.Common;
using Circloo.Api.Data;
using Circloo.Api.Decide;

namespace Circloo.Api.Tests.Decide;

/// <summary>Spec 007: percentages, poll and form validation, response checks.</summary>
public sealed class RulesTests
{
    private static bool Safe(string text) => !text.Contains("idiot", StringComparison.OrdinalIgnoreCase);

    [Theory]
    [InlineData(new[] { 1, 1, 1 }, new[] { 34, 33, 33 })]
    [InlineData(new[] { 2, 1 }, new[] { 67, 33 })]
    [InlineData(new[] { 0, 0, 0 }, new[] { 0, 0, 0 })]
    [InlineData(new[] { 3, 0, 0 }, new[] { 100, 0, 0 })]
    [InlineData(new[] { 1, 1, 1, 1, 1, 1 }, new[] { 17, 17, 17, 17, 16, 16 })]
    public void Percentages_add_up_to_100_by_largest_remainder(int[] counts, int[] expected)
    {
        var result = Percentages.Of(counts);
        Assert.Equal(expected, result);
        Assert.True(counts.Sum() == 0 || result.Sum() == 100);
    }

    [Fact]
    public void A_poll_needs_a_question_and_two_to_six_safe_answers()
    {
        var (poll, errors) = DecideRules.ValidatePoll(new PollInput("Where do we eat?", ["Pizza", " Sushi ", "Tacos"], MultipleChoice: true), Safe);
        Assert.Empty(errors);
        Assert.Equal(["a", "b", "c"], poll!.Options.Select(o => o.Id));
        Assert.Equal("Sushi", poll.Options[1].Text);
        Assert.True(poll.MultipleChoice);
        Assert.True(poll.ResultsLive);

        Assert.Equal("question-length", DecideRules.ValidatePoll(new PollInput(" ", ["A", "B"]), Safe).Errors["question"][0]);
        Assert.Equal("options-count", DecideRules.ValidatePoll(new PollInput("Q?", ["A"]), Safe).Errors["options"][0]);
        Assert.Equal("options-count", DecideRules.ValidatePoll(new PollInput("Q?", ["1", "2", "3", "4", "5", "6", "7"]), Safe).Errors["options"][0]);
        Assert.Equal("option-length", DecideRules.ValidatePoll(new PollInput("Q?", ["A", new string('x', 81)]), Safe).Errors["options[1]"][0]);
        Assert.Equal("message-unsafe", DecideRules.ValidatePoll(new PollInput("Who is the idiot?", ["A", "B"]), Safe).Errors["question"][0]);
    }

    [Fact]
    public void Direction_marks_typed_in_Arabic_are_dropped_but_spoofing_controls_refused()
    {
        var (poll, errors) = DecideRules.ValidatePoll(new PollInput("‏أين نأكل؟", ["بيتزا", "سوشي"]), Safe);
        Assert.Empty(errors);
        Assert.Equal("أين نأكل؟", poll!.Question);
        Assert.Equal("question-length", DecideRules.ValidatePoll(new PollInput("‮evil", ["A", "B"]), Safe).Errors["question"][0]);
    }

    private static FormInput Form(params FormQuestionInput[] questions) => new("Session feedback", false, questions);

    [Fact]
    public void A_form_takes_one_to_ten_questions_of_known_types()
    {
        var (validated, title, errors) = DecideRules.ValidateForm(Form(
            new FormQuestionInput("rating5", "How was it?", Required: true),
            new FormQuestionInput("nps", "Would you recommend it?"),
            new FormQuestionInput("single", "Length?", Options: ["Too short", "Just right", "Too long"]),
            new FormQuestionInput("multiple", "Best parts?", Options: ["Talk", "Games"]),
            new FormQuestionInput("yesno", "Come again?"),
            new FormQuestionInput("text", "Anything else?", LongText: true)), Safe);
        Assert.Empty(errors);
        var questions = validated!;
        Assert.Equal("Session feedback", title);
        Assert.Equal(["q1", "q2", "q3", "q4", "q5", "q6"], questions.Select(q => q.Id));
        Assert.Equal("stars", questions[0].Look);
        Assert.Equal(["a", "b", "c"], questions[2].Options.Select(o => o.Id));
        Assert.Empty(questions[4].Options);
        Assert.True(questions[5].LongText);
        Assert.Null(questions[0].LongText);

        Assert.Equal("questions-count", DecideRules.ValidateForm(Form(), Safe).Errors["questions"][0]);
        Assert.Equal("questions-count", DecideRules.ValidateForm(Form([.. Enumerable.Range(0, 11).Select(i => new FormQuestionInput("yesno", $"Q{i}"))]), Safe).Errors["questions"][0]);
        var bad = DecideRules.ValidateForm(Form(
            new FormQuestionInput("slider", "?"),
            new FormQuestionInput("rating5", "Rate", Look: "hearts"),
            new FormQuestionInput("single", "Pick", Options: ["Only one"]),
            new FormQuestionInput("yesno", "")), Safe).Errors;
        Assert.Equal("type", bad["questions[0].type"][0]);
        Assert.Equal("look", bad["questions[1].look"][0]);
        Assert.Equal("options-count", bad["questions[2].options"][0]);
        Assert.Equal("label-length", bad["questions[3].label"][0]);
    }

    private static readonly List<FormQuestion> Questions =
    [
        new() { Id = "q1", Type = "rating5", Label = "How was it?", Required = true },
        new() { Id = "q2", Type = "nps", Label = "Recommend?" },
        new() { Id = "q3", Type = "single", Label = "Length?", Options = [new() { Id = "a", Text = "Short" }, new() { Id = "b", Text = "Long" }] },
        new() { Id = "q4", Type = "multiple", Label = "Best?", Options = [new() { Id = "a", Text = "Talk" }, new() { Id = "b", Text = "Games" }] },
        new() { Id = "q5", Type = "yesno", Label = "Again?" },
        new() { Id = "q6", Type = "text", Label = "More?", LongText = false },
    ];

    private static Dictionary<string, JsonElement> Answers(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    [Fact]
    public void A_response_answers_required_questions_with_values_in_range()
    {
        var (json, errors) = DecideRules.ValidateResponse(Questions,
            Answers("""{"q1":4,"q2":9,"q3":"b","q4":["b","a"],"q5":true,"q6":" Great day "}"""), Safe);
        Assert.Empty(errors);
        var saved = Answers(json!);
        Assert.Equal(4, saved["q1"].GetInt32());
        Assert.Equal(["a", "b"], saved["q4"].EnumerateArray().Select(e => e.GetString()));
        Assert.Equal("Great day", saved["q6"].GetString());

        // Optional questions may stay empty; the required one may not.
        Assert.Equal("required", DecideRules.ValidateResponse(Questions, Answers("""{"q2":3}"""), Safe).Errors["q1"][0]);
        Assert.Empty(DecideRules.ValidateResponse(Questions, Answers("""{"q1":1,"q6":"  "}"""), Safe).Errors);

        var bad = DecideRules.ValidateResponse(Questions,
            Answers("""{"q1":6,"q2":-1,"q3":"z","q4":["a","a"],"q5":"yes","q6":"you idiot"}"""), Safe).Errors;
        Assert.Equal("out-of-range", bad["q1"][0]);
        Assert.Equal("out-of-range", bad["q2"][0]);
        Assert.Equal("out-of-range", bad["q3"][0]);
        Assert.Equal("out-of-range", bad["q4"][0]);
        Assert.Equal("out-of-range", bad["q5"][0]);
        Assert.Equal("message-unsafe", bad["q6"][0]);
        Assert.Equal("too-long", DecideRules.ValidateResponse(Questions, Answers($$"""{"q1":3,"q6":"{{new string('x', 201)}}"}"""), Safe).Errors["q6"][0]);
    }

    [Fact]
    public void A_long_answer_keeps_its_line_breaks_a_short_one_stays_on_one_line()
    {
        List<FormQuestion> questions =
        [
            new() { Id = "q1", Type = "text", Label = "Short?", LongText = false },
            new() { Id = "q2", Type = "text", Label = "Long?", LongText = true },
        ];
        var (json, errors) = DecideRules.ValidateResponse(questions, Answers("""{"q2":"Good pace.\r\nMore games next time.\u0007"}"""), Safe);
        Assert.Equal("too-long", errors["q2"][0]);
        (json, errors) = DecideRules.ValidateResponse(questions, Answers("""{"q2":" Good pace.\r\n\r\nMore games next time. "}"""), Safe);
        Assert.Empty(errors);
        Assert.Equal("Good pace.\n\nMore games next time.", Answers(json!)["q2"].GetString());
        Assert.Equal("too-long", DecideRules.ValidateResponse(questions, Answers("""{"q1":"Good\nday"}"""), Safe).Errors["q1"][0]);
    }
}
