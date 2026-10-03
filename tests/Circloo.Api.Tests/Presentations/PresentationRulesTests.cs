using Circloo.Api.Presentations;

namespace Circloo.Api.Tests.Presentations;

/// <summary>Question limits and defaults (spec 006 FR-605, FR-606) and the idle clean-up countdown (FR-604a).</summary>
public sealed class PresentationRulesTests
{
    private static OptionInput[] Options(int count) => [.. Enumerable.Range(0, count).Select(i => new OptionInput(null, $"Option {i + 1}"))];

    [Fact]
    public void Poll_gets_position_ids_and_defaults()
    {
        var (slide, errors) = PresentationRules.Validate(new QuestionInput("poll", "  Where do we eat?  ", Options(3)));

        Assert.Empty(errors);
        Assert.NotNull(slide);
        Assert.Equal("Where do we eat?", slide.Question);
        Assert.Equal(["a", "b", "c"], slide.Options.Select(o => o.Id));
        Assert.True(slide.ShowFirst);
        Assert.False(slide.ShowLive);
        Assert.False(slide.MultipleChoice);
        Assert.Null(slide.TimerSeconds);
        Assert.Null(slide.CorrectOption);
    }

    [Fact]
    public void Client_option_ids_are_ignored()
    {
        var (slide, _) = PresentationRules.Validate(new QuestionInput("poll", "Pick", [new("z", "One"), new("evil", "Two")]));

        Assert.Equal(["a", "b"], slide!.Options.Select(o => o.Id));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(7)]
    public void Option_count_must_be_two_to_six(int count)
    {
        var (slide, errors) = PresentationRules.Validate(new QuestionInput("poll", "Pick", Options(count)));

        Assert.Null(slide);
        Assert.Equal(["options-count"], errors["options"]);
    }

    [Fact]
    public void Question_and_options_have_length_limits()
    {
        var (_, errors) = PresentationRules.Validate(new QuestionInput("poll", new string('q', 141), [new(null, "ok"), new(null, new string('o', 81))]));

        Assert.Equal(["question-length"], errors["question"]);
        Assert.Equal(["option-length"], errors["options[1]"]);
    }

    [Fact]
    public void Bidi_overrides_are_refused()
    {
        var (_, errors) = PresentationRules.Validate(new QuestionInput("poll", "Pick ‮one", Options(2)));

        Assert.Equal(["question-length"], errors["question"]);
    }

    [Fact]
    public void Quiz_needs_one_valid_correct_option_and_defaults_the_timer()
    {
        var (missing, missingErrors) = PresentationRules.Validate(new QuestionInput("quiz", "2 + 2?", Options(3)));
        var (outOfRange, rangeErrors) = PresentationRules.Validate(new QuestionInput("quiz", "2 + 2?", Options(3), CorrectOption: "d"));
        var (ok, okErrors) = PresentationRules.Validate(new QuestionInput("quiz", "2 + 2?", Options(3), CorrectOption: "b", ShowLive: true, MultipleChoice: true));

        Assert.Null(missing);
        Assert.Equal(["quiz-correct"], missingErrors["correctOption"]);
        Assert.Null(outOfRange);
        Assert.Equal(["quiz-correct"], rangeErrors["correctOption"]);
        Assert.Empty(okErrors);
        Assert.Equal("b", ok!.CorrectOption);
        Assert.Equal(PresentationRules.TimerDefault, ok.TimerSeconds);
        // Quizzes are single choice and never show results before the reveal.
        Assert.False(ok.ShowLive);
        Assert.False(ok.MultipleChoice);
    }

    [Theory]
    [InlineData(9, false)]
    [InlineData(10, true)]
    [InlineData(60, true)]
    [InlineData(61, false)]
    public void Quiz_timer_is_ten_to_sixty_seconds(int seconds, bool valid)
    {
        var (slide, errors) = PresentationRules.Validate(new QuestionInput("quiz", "Q", Options(2), CorrectOption: "a", TimerSeconds: seconds));

        Assert.Equal(valid, slide is not null);
        Assert.Equal(valid, !errors.ContainsKey("timerSeconds"));
    }

    [Fact]
    public void Unknown_kind_is_refused()
    {
        var (slide, errors) = PresentationRules.Validate(new QuestionInput("deck", "Q", Options(2)));

        Assert.Null(slide);
        Assert.Equal(["kind"], errors["kind"]);
    }

    [Theory]
    [InlineData("Q3 review.pptx", "Q3 review")]
    [InlineData("   .pptx", "Presentation")]
    [InlineData("‮evil.pptx", "evil")]
    public void Name_comes_from_the_file(string file, string expected) =>
        Assert.Equal(expected, PresentationRules.NameFromFile(file));

    [Fact]
    public void Names_drop_spoofing_characters_before_trimming_and_never_split_an_emoji()
    {
        Assert.Equal("evil", PresentationRules.NameFromFile($"{(char)0x202E} evil.pptx"));

        var emoji = char.ConvertFromUtf32(0x1F600);
        var name = PresentationRules.NameFromFile(new string('x', PresentationRules.NameMax - 1) + emoji + "tail.pptx");
        Assert.Equal(new string('x', PresentationRules.NameMax - 1), name);
    }

    [Fact]
    public void Arabic_direction_marks_are_dropped_but_overrides_are_refused()
    {
        string rlm = $"{(char)0x200F}", lrm = $"{(char)0x200E}", alm = $"{(char)0x061C}";
        var (slide, errors) = PresentationRules.Validate(new QuestionInput("poll", $"{rlm}أين نأكل؟{lrm}", [new(null, $"مطعم{alm}"), new(null, "Pizza")]));

        Assert.Empty(errors);
        Assert.Equal("أين نأكل؟", slide!.Question);
        Assert.Equal("مطعم", slide.Options[0].Text);

        var (_, refused) = PresentationRules.Validate(new QuestionInput("poll", $"{(char)0x202E}Pick one", Options(2)));
        Assert.Equal(["question-length"], refused["question"]);
    }

    [Fact]
    public void Idle_presentations_are_flagged_in_the_last_30_days()
    {
        var now = DateTimeOffset.Parse("2027-10-01T00:00:00Z", System.Globalization.CultureInfo.InvariantCulture);

        Assert.Null(PresentationRules.DeletesInDays(now.AddDays(-335), now));
        Assert.Equal(29, PresentationRules.DeletesInDays(now.AddDays(-336), now));
        Assert.Equal(0, PresentationRules.DeletesInDays(now.AddDays(-400), now));
    }
}
