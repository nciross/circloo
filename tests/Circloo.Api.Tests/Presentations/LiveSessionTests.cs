using Circloo.Api.Data;
using Circloo.Api.Presentations;

namespace Circloo.Api.Tests.Presentations;

/// <summary>The presenting state machine (spec 006 US3–US4, data-model.md phase transitions).</summary>
public sealed class LiveSessionTests
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 3, 9, 0, 0, TimeSpan.Zero);

    private static Slide Deck(int position, bool hidden = false, string? notes = null) =>
        new() { Kind = SlideKinds.Deck, Position = position, Hidden = hidden, Notes = notes };

    private static Slide Poll(int position) => new()
    {
        Kind = SlideKinds.Poll, Position = position, Question = "Lunch?", MultipleChoice = true, ShowLive = true,
        Options = [new SlideOption { Id = "a", Text = "Pizza" }, new SlideOption { Id = "b", Text = "Sushi" }],
    };

    private static Slide Quiz(int position, int timer = 20) => new()
    {
        Kind = SlideKinds.Quiz, Position = position, Question = "7 × 8?", CorrectOption = "b", TimerSeconds = timer, ShowLive = true, MultipleChoice = true,
        Options = [new SlideOption { Id = "a", Text = "54" }, new SlideOption { Id = "b", Text = "56" }],
    };

    /// <summary>deck, hidden deck, poll, deck, quiz → visible: deck(0), poll(1), deck(2), quiz(3).</summary>
    private static (PresentationSession Session, IReadOnlyList<SnapshotSlide> Slides) Running()
    {
        var snapshot = LiveSession.BuildSnapshot([Quiz(4), Deck(0, notes: "Hello"), Deck(1, hidden: true), Poll(2), Deck(3)]);
        var session = LiveSession.Start(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), snapshot, showPodium: true, T0);
        return (session, snapshot);
    }

    [Fact]
    public void Snapshot_keeps_visible_slides_in_order_and_cleans_question_fields()
    {
        var (_, slides) = Running();
        Assert.Equal([SlideKinds.Deck, SlideKinds.Poll, SlideKinds.Deck, SlideKinds.Quiz], slides.Select(s => s.Kind));
        Assert.True(slides[0].HasNotes);
        Assert.False(slides[2].HasNotes);
        Assert.Equal(["Pizza", "Sushi"], slides[1].Options!.Select(o => o.Text));
        Assert.True(slides[1].Multiple);
        Assert.Null(slides[1].Correct);
        // A quiz never takes several answers or live results, whatever the row says.
        Assert.Equal("b", slides[3].Correct);
        Assert.False(slides[3].Multiple);
        Assert.False(slides[3].ShowLive);
        Assert.Equal(20, slides[3].Timer);
    }

    [Fact]
    public void An_empty_presentation_cannot_start()
    {
        var snapshot = LiveSession.BuildSnapshot([Deck(0, hidden: true)]);
        var refused = Assert.Throws<LiveSessionException>(() => LiveSession.Start(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), snapshot, true, T0));
        Assert.Equal("presentation-empty", refused.Code);
    }

    [Fact]
    public void Moving_shows_the_slide_unblanked_and_tracks_the_furthest_one()
    {
        var (s, _) = Running();
        LiveSession.SetBlank(s, true);
        LiveSession.GoTo(s, 2, T0);
        Assert.False(s.Blank);
        Assert.Equal(2, s.MaxPosition);
        LiveSession.GoTo(s, 0, T0);
        Assert.Equal(0, s.Position);
        Assert.Equal(2, s.MaxPosition);
        Assert.Equal("out-of-range", Assert.Throws<LiveSessionException>(() => LiveSession.GoTo(s, 4, T0)).Code);
        Assert.Equal("out-of-range", Assert.Throws<LiveSessionException>(() => LiveSession.GoTo(s, -1, T0)).Code);
    }

    [Fact]
    public void Leaving_an_open_question_locks_it_and_coming_back_never_reopens_it()
    {
        var (s, _) = Running();
        LiveSession.GoTo(s, 3, T0);
        LiveSession.Open(s, T0);
        Assert.Equal(SessionPhases.Answering, s.Phase);
        Assert.Equal(T0.AddSeconds(20), s.Deadline);

        LiveSession.GoTo(s, 2, T0.AddSeconds(5));
        Assert.Equal(SessionPhases.Idle, s.Phase);
        Assert.Null(s.Deadline);

        LiveSession.GoTo(s, 3, T0.AddSeconds(60));
        Assert.Equal(SessionPhases.Locked, s.Phase);
        Assert.Equal(T0, s.OpenedAt);
        Assert.Equal(T0.AddSeconds(5), s.LockedAt);
        // The timer never restarts: the deadline is the original one.
        Assert.Equal(T0.AddSeconds(20), s.Deadline);
        Assert.Equal("already-open", Assert.Throws<LiveSessionException>(() => LiveSession.Open(s, T0.AddSeconds(61))).Code);

        // Locked questions can still be revealed, and a revealed one stays revealed.
        LiveSession.Reveal(s, T0.AddSeconds(62));
        LiveSession.GoTo(s, 0, T0.AddSeconds(63));
        LiveSession.GoTo(s, 3, T0.AddSeconds(64));
        Assert.Equal(SessionPhases.Revealed, s.Phase);
    }

    [Fact]
    public void A_quiz_left_after_its_deadline_locks_at_the_deadline()
    {
        var (s, _) = Running();
        LiveSession.GoTo(s, 3, T0);
        LiveSession.Open(s, T0);
        LiveSession.GoTo(s, 0, T0.AddSeconds(45));
        LiveSession.GoTo(s, 3, T0.AddSeconds(46));
        Assert.Equal(T0.AddSeconds(20), s.LockedAt);
    }

    [Fact]
    public void Question_phases_follow_the_rules()
    {
        var (s, _) = Running();
        Assert.Equal("not-a-question", Assert.Throws<LiveSessionException>(() => LiveSession.Open(s, T0)).Code);
        LiveSession.GoTo(s, 1, T0);
        Assert.Equal("not-answering", Assert.Throws<LiveSessionException>(() => LiveSession.Lock(s, T0)).Code);
        Assert.Equal("not-open", Assert.Throws<LiveSessionException>(() => LiveSession.Reveal(s, T0)).Code);

        LiveSession.Open(s, T0);
        Assert.Null(s.Deadline); // polls have no timer
        LiveSession.Reveal(s, T0.AddSeconds(3)); // reveal locks first
        Assert.Equal(SessionPhases.Revealed, s.Phase);
        Assert.Equal(T0.AddSeconds(3), s.LockedAt);
        // The podium is for quizzes only.
        Assert.Equal("podium-off", Assert.Throws<LiveSessionException>(() => LiveSession.ShowPodium(s)).Code);

        LiveSession.GoTo(s, 3, T0.AddSeconds(4));
        LiveSession.Open(s, T0.AddSeconds(4));
        Assert.Equal("not-revealed", Assert.Throws<LiveSessionException>(() => LiveSession.ShowPodium(s)).Code);
        LiveSession.Lock(s, T0.AddSeconds(6));
        LiveSession.Reveal(s, T0.AddSeconds(7));
        LiveSession.ShowPodium(s);
        Assert.Equal(SessionPhases.Podium, s.Phase);
    }

    [Fact]
    public void The_podium_stays_off_when_the_presentation_turned_it_off()
    {
        var snapshot = LiveSession.BuildSnapshot([Quiz(0)]);
        var s = LiveSession.Start(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), snapshot, showPodium: false, T0);
        LiveSession.Open(s, T0);
        LiveSession.Reveal(s, T0.AddSeconds(1));
        Assert.Equal("podium-off", Assert.Throws<LiveSessionException>(() => LiveSession.ShowPodium(s)).Code);
    }

    [Fact]
    public void Members_see_pictures_only_of_slides_already_shown()
    {
        var (s, slides) = Running();
        Assert.True(LiveSession.HasShown(s, slides[0].SlideId));
        Assert.False(LiveSession.HasShown(s, slides[2].SlideId));
        LiveSession.GoTo(s, 2, T0);
        LiveSession.GoTo(s, 0, T0);
        Assert.True(LiveSession.HasShown(s, slides[2].SlideId));
        Assert.False(LiveSession.HasShown(s, slides[3].SlideId));
        Assert.False(LiveSession.HasShown(s, Guid.NewGuid()));
    }

    [Fact]
    public void The_view_carries_what_screens_need_and_the_next_slide_is_for_the_animator()
    {
        var (s, slides) = Running();
        var view = LiveSession.View(s, "Kickoff", T0);
        Assert.Equal(("deck", 0, 4), (view.Slide.Kind, view.Position, view.Count));
        Assert.Equal($"/api/slides/{slides[0].SlideId}/image", view.Slide.Image);
        Assert.Null(view.Slide.Question);
        Assert.Equal(T0, view.ServerNow);

        var next = LiveSession.Next(s)!;
        Assert.Equal((SlideKinds.Poll, "Lunch?"), (next.Kind, next.Question));
        Assert.Null(next.Image);

        LiveSession.GoTo(s, 3, T0);
        var quiz = LiveSession.View(s, "Kickoff", T0).Slide;
        Assert.Equal(("7 × 8?", 20), (quiz.Question, quiz.TimerSeconds));
        Assert.Null(LiveSession.Next(s));
    }

    [Fact]
    public void Moving_to_the_slide_already_shown_only_unblanks_it()
    {
        var (s, _) = Running();
        LiveSession.GoTo(s, 1, T0);
        LiveSession.Open(s, T0);
        Assert.False(LiveSession.GoTo(s, 1, T0.AddSeconds(2)));
        Assert.Equal(SessionPhases.Answering, s.Phase);
        Assert.True(LiveSession.SetBlank(s, true));
        Assert.False(LiveSession.SetBlank(s, true));
        Assert.True(LiveSession.GoTo(s, 1, T0.AddSeconds(3)));
        Assert.False(s.Blank);
        Assert.Equal(SessionPhases.Answering, s.Phase);
    }

    [Fact]
    public void Answers_are_taken_only_on_the_current_open_question_and_a_quiz_only_before_its_deadline()
    {
        var (s, slides) = Running();
        Assert.Equal("not-current-question", LiveSession.AnswerRefusal(s, slides[0].SlideId, T0));
        LiveSession.GoTo(s, 1, T0);
        Assert.Equal("answers-closed", LiveSession.AnswerRefusal(s, slides[1].SlideId, T0));
        LiveSession.Open(s, T0);
        Assert.Null(LiveSession.AnswerRefusal(s, slides[1].SlideId, T0.AddMinutes(5)));
        Assert.Equal("not-current-question", LiveSession.AnswerRefusal(s, slides[3].SlideId, T0));

        LiveSession.GoTo(s, 3, T0);
        LiveSession.Open(s, T0);
        Assert.Null(LiveSession.AnswerRefusal(s, slides[3].SlideId, T0.AddSeconds(19.9)));
        // At the deadline the server refuses, even before the quiz clock has locked it.
        Assert.Equal("answers-closed", LiveSession.AnswerRefusal(s, slides[3].SlideId, T0.AddSeconds(20)));
    }

    [Fact]
    public void Chosen_options_must_be_known_distinct_and_single_unless_the_poll_takes_several()
    {
        var (_, slides) = Running();
        var poll = slides[1];
        var quiz = slides[3];
        Assert.Equal(["a", "b"], LiveSession.CleanOptions(poll, ["b", "a"])!);
        Assert.Null(LiveSession.CleanOptions(poll, ["a", "a"]));
        Assert.Null(LiveSession.CleanOptions(poll, ["c"]));
        Assert.Null(LiveSession.CleanOptions(poll, []));
        Assert.Null(LiveSession.CleanOptions(poll, null));
        // The quiz keeps one answer even though its slide had "multiple" switched on.
        Assert.Equal(["b"], LiveSession.CleanOptions(quiz, ["b"])!);
        Assert.Null(LiveSession.CleanOptions(quiz, ["a", "b"]));
    }

    [Fact]
    public void Live_results_show_only_for_polls_that_ask_for_them_once_answering_opened()
    {
        var (s, _) = Running();
        LiveSession.GoTo(s, 1, T0);
        Assert.False(LiveSession.ShowsLiveResults(s));
        LiveSession.Open(s, T0);
        Assert.True(LiveSession.ShowsLiveResults(s));
        LiveSession.Lock(s, T0);
        Assert.True(LiveSession.ShowsLiveResults(s));

        // A quiz never shows its results before the reveal, whatever its slide said.
        LiveSession.GoTo(s, 3, T0);
        LiveSession.Open(s, T0);
        Assert.False(LiveSession.ShowsLiveResults(s));
    }

    [Fact]
    public void Results_count_each_option_add_up_to_100_and_crown_every_tie()
    {
        var (_, slides) = Running();
        var results = ResultsBuilder.Build(slides[1], [["a"], ["a", "b"], ["b"]]);
        Assert.Equal(3, results.Total);
        Assert.Equal([(2, 50, true), (2, 50, true)], results.Options.Select(o => (o.Count, o.Percent, o.Winner)));

        var none = ResultsBuilder.Build(slides[1], []);
        Assert.All(none.Options, o => Assert.Equal((0, 0, false), (o.Count, o.Percent, o.Winner)));
    }
}
