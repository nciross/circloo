using Circloo.Api.Data;
using Circloo.Api.Presentations;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Circloo.Api.Tests.Presentations;

/// <summary>Issue #108: answering from phones, live counts and server-timed quizzes (spec 006 US4, contracts/hub.md).</summary>
public sealed partial class PresentingHubTests
{
    /// <summary>A deck of two questions: a poll (showing results live when asked) then a 20-second quiz whose answer is "b".</summary>
    private async Task<Guid> QuestionDeckAsync(Guid ownerUserId, bool showLive = false, bool multiple = false)
    {
        var deck = new Presentation { OwnerUserId = ownerUserId, Name = "Quiz night", SourceFileName = "quiz.pptx", Status = PresentationStatus.Ready, SlideCount = 0 };
        Slide[] slides =
        [
            new()
            {
                PresentationId = deck.Id, Kind = SlideKinds.Poll, Position = 0, Question = "Lunch?", ShowLive = showLive, MultipleChoice = multiple,
                Options = [new SlideOption { Id = "a", Text = "Pizza" }, new SlideOption { Id = "b", Text = "Sushi" }],
            },
            new()
            {
                PresentationId = deck.Id, Kind = SlideKinds.Quiz, Position = 1, Question = "7 × 8?", CorrectOption = "b", TimerSeconds = 20,
                Options = [new SlideOption { Id = "a", Text = "54" }, new SlideOption { Id = "b", Text = "56" }],
            },
        ];
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        db.Presentations.Add(deck);
        db.Slides.AddRange(slides);
        await db.SaveChangesAsync();
        return deck.Id;
    }

    private Task<List<SessionAnswer>> AnswersAsync(Guid circleId) =>
        DbAsync(db => db.SessionAnswers.Where(a => db.PresentationSessions.Any(s => s.Id == a.SessionId && s.CircleId == circleId)).ToListAsync());

    [Fact]
    public async Task A_poll_takes_one_answer_per_person_that_can_change_until_it_locks()
    {
        Inbox<AnswerCountView>? counts = null;
        Inbox<PresentationStateView>? guestStates = null;
        Inbox<AnswerCountView>? guestCounts = null;
        Inbox<MyAnswerView>? mine = null;
        await using var room = await RoomAsync(
            a => counts = new Inbox<AnswerCountView>(a, "AnswerCount"),
            g =>
            {
                guestStates = new Inbox<PresentationStateView>(g, "PresentationState");
                guestCounts = new Inbox<AnswerCountView>(g, "AnswerCount");
                mine = new Inbox<MyAnswerView>(g, "MyAnswer");
            });
        await room.Animator.InvokeAsync("StartPresentation", await QuestionDeckAsync(room.AnimatorUserId));
        var poll = (await guestStates!.NextAsync()).Slide.SlideId;

        // Not open yet.
        Assert.Contains("answers-closed", await RefusedAsync(() => room.Guest.InvokeAsync<MyAnswerView>("Answer", poll, new[] { "a" })));
        await room.Animator.InvokeAsync("OpenQuestion");
        Assert.Equal(SessionPhases.Answering, (await guestStates.NextAsync()).Phase);
        var none = await counts!.NextAsync();
        Assert.Equal((0, 1), (none.Answered, none.Of));

        var first = await room.Guest.InvokeAsync<MyAnswerView>("Answer", poll, new[] { "a" });
        Assert.Equal(["a"], first.Options);
        Assert.Equal(["a"], (await mine!.NextAsync()).Options);
        var counted = await counts.NextAsync(c => c.Answered == 1);
        Assert.Equal((1, 1), (counted.Answered, counted.Of));
        Assert.Empty(counted.Pending);
        var firstAt = (await AnswersAsync(room.CircleId)).Single().FirstReceivedAt;

        _factory.Clock.Advance(TimeSpan.FromSeconds(3));
        await room.Guest.InvokeAsync<MyAnswerView>("Answer", poll, new[] { "b" });
        var stored = (await AnswersAsync(room.CircleId)).Single();
        Assert.Equal(["b"], stored.Options);
        Assert.Equal(firstAt, stored.FirstReceivedAt);
        Assert.True(stored.ReceivedAt > firstAt);

        // Two options on a single-choice poll, an unknown option, none, the same one twice.
        string[][] invalid = [["a", "b"], ["z"], [], ["a", "a"]];
        foreach (var options in invalid)
        {
            Assert.Contains("invalid-options", await RefusedAsync(() => room.Guest.InvokeAsync<MyAnswerView>("Answer", poll, options)));
        }
        Assert.Contains("animator-cannot-answer", await RefusedAsync(() => room.Animator.InvokeAsync<MyAnswerView>("Answer", poll, new[] { "a" })));
        Assert.Contains("not-current-question", await RefusedAsync(() => room.Guest.InvokeAsync<MyAnswerView>("Answer", Guid.NewGuid(), new[] { "a" })));

        await room.Animator.InvokeAsync("LockQuestion");
        Assert.Equal(SessionPhases.Locked, (await guestStates.NextAsync(s => s.Phase == SessionPhases.Locked)).Phase);
        Assert.Contains("answers-closed", await RefusedAsync(() => room.Guest.InvokeAsync<MyAnswerView>("Answer", poll, new[] { "a" })));
        Assert.Contains("not-answering", await RefusedAsync(() => room.Animator.InvokeAsync("LockQuestion")));

        // Without "show live", nothing about counts or results ever reached the participant.
        Assert.False(guestCounts!.Any());
    }

    [Fact]
    public async Task One_person_answering_from_two_devices_at_once_leaves_one_answer()
    {
        Inbox<PresentationStateView>? states = null;
        await using var room = await RoomAsync(beforeGuestEnters: g => states = new Inbox<PresentationStateView>(g, "PresentationState"));
        await room.Animator.InvokeAsync("StartPresentation", await QuestionDeckAsync(room.AnimatorUserId));
        await room.Animator.InvokeAsync("GoToSlide", 1);
        await room.Animator.InvokeAsync("OpenQuestion");
        var quiz = (await states!.NextAsync(s => s.Phase == SessionPhases.Answering)).Slide.SlideId;

        // The guest's cookies on a second connection: the same person on another device.
        await using var phone = Hub(room.GuestCookies);
        await phone.StartAsync();
        await phone.InvokeAsync<Guid[]>("Enter", room.CircleId);

        var tries = Enumerable.Range(0, 6).Select(i => (i % 2 == 0 ? room.Guest : phone).InvokeAsync<MyAnswerView>("Answer", quiz, new[] { i < 3 ? "a" : "b" }));
        var outcomes = await Task.WhenAll(tries.Select(async t =>
        {
            try
            {
                await t;
                return "ok";
            }
            catch (Microsoft.AspNetCore.SignalR.HubException e)
            {
                return e.Message;
            }
        }));
        Assert.Single(outcomes, o => o == "ok");
        Assert.All(outcomes.Where(o => o != "ok"), o => Assert.Contains("quiz-final", o));
        Assert.Single(await AnswersAsync(room.CircleId));
    }

    [Fact]
    public async Task A_quiz_locks_itself_on_the_server_deadline_and_late_answers_are_refused()
    {
        Inbox<PresentationStateView>? states = null;
        await using var room = await RoomAsync(beforeGuestEnters: g => states = new Inbox<PresentationStateView>(g, "PresentationState"));
        var (_, lateCookies) = await GuestAsync(room.JoinCode, "Lucía", "fox");
        await using var late = Hub(lateCookies);
        await late.StartAsync();
        await late.InvokeAsync<Guid[]>("Enter", room.CircleId);

        await room.Animator.InvokeAsync("StartPresentation", await QuestionDeckAsync(room.AnimatorUserId));
        await room.Animator.InvokeAsync("GoToSlide", 1);
        var opensAt = _factory.Clock.GetUtcNow();
        await room.Animator.InvokeAsync("OpenQuestion");
        var open = await states!.NextAsync(s => s.Phase == SessionPhases.Answering);
        Assert.Equal(opensAt.AddSeconds(20), open.Deadline);
        Assert.Equal(20, open.Slide.TimerSeconds);

        await room.Guest.InvokeAsync<MyAnswerView>("Answer", open.Slide.SlideId, new[] { "b" });
        Assert.Contains("quiz-final", await RefusedAsync(() => room.Guest.InvokeAsync<MyAnswerView>("Answer", open.Slide.SlideId, new[] { "a" })));
        // The correct answer stays on the server: the participant only gets their own choice back.
        var stored = (await AnswersAsync(room.CircleId)).Single();
        Assert.True(stored.Correct);

        _factory.Clock.Advance(TimeSpan.FromSeconds(20));
        var locked = await states.NextAsync(s => s.Phase == SessionPhases.Locked);
        Assert.Equal(open.Slide.SlideId, locked.Slide.SlideId);
        var session = await DbAsync(db => db.PresentationSessions.SingleAsync(s => s.CircleId == room.CircleId));
        Assert.Equal(opensAt.AddSeconds(20), session.LockedAt);
        Assert.Contains("answers-closed", await RefusedAsync(() => late.InvokeAsync<MyAnswerView>("Answer", open.Slide.SlideId, new[] { "b" })));
    }

    [Fact]
    public async Task The_quiz_clock_leaves_alone_a_quiz_the_animator_already_moved_on_from()
    {
        Inbox<PresentationStateView>? states = null;
        await using var room = await RoomAsync(beforeGuestEnters: g => states = new Inbox<PresentationStateView>(g, "PresentationState"));
        await room.Animator.InvokeAsync("StartPresentation", await QuestionDeckAsync(room.AnimatorUserId));
        await room.Animator.InvokeAsync("GoToSlide", 1);
        await room.Animator.InvokeAsync("OpenQuestion");
        var open = await states!.NextAsync(s => s.Phase == SessionPhases.Answering);

        // Back to the poll: leaving the quiz locks it, and the clock then has nothing to do.
        await room.Animator.InvokeAsync("GoToSlide", 0);
        var session = await DbAsync(db => db.PresentationSessions.SingleAsync(s => s.CircleId == room.CircleId));
        var clock = _factory.Services.GetRequiredService<QuizClock>();
        Assert.False(await clock.LockDueAsync(session.Id, open.Deadline!.Value));
        Assert.Equal(SessionPhases.Idle, (await DbAsync(db => db.PresentationSessions.SingleAsync(s => s.CircleId == room.CircleId))).Phase);
    }

    [Fact]
    public async Task A_poll_showing_results_live_updates_everyone_and_a_reload_gets_its_own_answer_back()
    {
        Inbox<PresentationStateView>? states = null;
        await using var room = await RoomAsync(beforeGuestEnters: g => states = new Inbox<PresentationStateView>(g, "PresentationState"));
        await room.Animator.InvokeAsync("StartPresentation", await QuestionDeckAsync(room.AnimatorUserId, showLive: true, multiple: true));
        await room.Animator.InvokeAsync("OpenQuestion");
        var open = await states!.NextAsync(s => s.Phase == SessionPhases.Answering);
        Assert.Equal(0, open.Results!.Total);

        await room.Guest.InvokeAsync<MyAnswerView>("Answer", open.Slide.SlideId, new[] { "b", "a" });
        var live = await states.NextAsync(s => s.Results is { Total: 1 });
        Assert.Equal([(1, 50), (1, 50)], live.Results!.Options.Select(o => (o.Count, o.Percent)));

        // A reload lands on the question with its own answer marked (FR-608).
        await using var reloaded = Hub(room.GuestCookies);
        var mine = new Inbox<MyAnswerView>(reloaded, "MyAnswer");
        await reloaded.StartAsync();
        await reloaded.InvokeAsync<Guid[]>("Enter", room.CircleId);
        Assert.Equal(["a", "b"], (await mine.NextAsync()).Options);
    }
}
