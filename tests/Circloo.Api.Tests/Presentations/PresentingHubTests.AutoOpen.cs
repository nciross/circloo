using Circloo.Api.Data;
using Circloo.Api.Presentations;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Tests.Presentations;

/// <summary>Issue #170: answers open automatically when a question slide is shown, unless the animator turned it off.</summary>
public sealed partial class PresentingHubTests
{
    [Fact]
    public async Task A_question_shown_for_the_first_time_opens_at_once_and_a_quiz_runs_its_clock()
    {
        Inbox<PresentationStateView>? states = null;
        await using var room = await RoomAsync(beforeGuestEnters: g => states = new Inbox<PresentationStateView>(g, "PresentationState"));
        // The deck starts on the poll: presenting opens it straight away.
        await room.Animator.InvokeAsync("StartPresentation", await QuestionDeckAsync(room.AnimatorUserId, autoOpen: true));
        var poll = await states!.NextAsync();
        Assert.Equal(SessionPhases.Answering, poll.Phase);
        await room.Guest.InvokeAsync<MyAnswerView>("Answer", poll.Slide.SlideId, new[] { "a" });

        // Moving to the quiz opens it with its server deadline, and the quiz clock locks it.
        var shownAt = _factory.Clock.GetUtcNow();
        await room.Animator.InvokeAsync("GoToSlide", 1);
        var quiz = await states.NextAsync(s => s.Position == 1);
        Assert.Equal((SessionPhases.Answering, shownAt.AddSeconds(20)), (quiz.Phase, quiz.Deadline));
        _factory.Clock.Advance(TimeSpan.FromSeconds(20));
        Assert.Equal(SessionPhases.Locked, (await states.NextAsync(s => s.Position == 1 && s.Phase == SessionPhases.Locked)).Phase);

        // Back to the poll (locked when it was left): it is never reopened.
        await room.Animator.InvokeAsync("GoToSlide", 0);
        Assert.Equal(SessionPhases.Locked, (await states.NextAsync(s => s.Position == 0)).Phase);
        Assert.Contains("answers-closed", await RefusedAsync(() => room.Guest.InvokeAsync<MyAnswerView>("Answer", poll.Slide.SlideId, new[] { "b" })));
    }

    [Fact]
    public async Task With_automatic_opening_off_the_animator_opens_answers()
    {
        Inbox<PresentationStateView>? states = null;
        await using var room = await RoomAsync(beforeGuestEnters: g => states = new Inbox<PresentationStateView>(g, "PresentationState"));
        await room.Animator.InvokeAsync("StartPresentation", await QuestionDeckAsync(room.AnimatorUserId, autoOpen: false));
        Assert.Equal(SessionPhases.Idle, (await states!.NextAsync()).Phase);
        await room.Animator.InvokeAsync("GoToSlide", 1);
        Assert.Equal(SessionPhases.Idle, (await states.NextAsync(s => s.Position == 1)).Phase);
        var session = await DbAsync(db => db.PresentationSessions.SingleAsync(s => s.CircleId == room.CircleId));
        Assert.False(session.AutoOpen);
    }

    [Fact]
    public async Task The_animator_turns_automatic_opening_off_in_the_editor()
    {
        await using var room = await RoomAsync();
        var deckId = await QuestionDeckAsync(room.AnimatorUserId, autoOpen: true);
        var version = await DbAsync(db => db.Presentations.Where(p => p.Id == deckId).Select(p => p.Version).SingleAsync());
        var res = await room.AnimatorHttp.SendAsync(new HttpRequestMessage(HttpMethod.Patch, $"/api/presentations/{deckId}")
        {
            Content = System.Net.Http.Json.JsonContent.Create(new { autoOpen = false, version }),
            Headers = { { "X-XSRF-TOKEN", room.AnimatorCsrf } },
        });
        res.EnsureSuccessStatusCode();
        var detail = await System.Net.Http.Json.HttpContentJsonExtensions.ReadFromJsonAsync<PresentationDetail>(res.Content);
        Assert.False(detail!.AutoOpen);
        Assert.False(await DbAsync(db => db.Presentations.Where(p => p.Id == deckId).Select(p => p.AutoOpen).SingleAsync()));
    }
}
