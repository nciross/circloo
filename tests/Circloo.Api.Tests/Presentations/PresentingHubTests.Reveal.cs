using Circloo.Api.Data;
using Circloo.Api.Presentations;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Circloo.Api.Tests.Presentations;

/// <summary>Issue #109: revealing results with the fastest-answer spotlight (spec 006 US5).</summary>
public sealed partial class PresentingHubTests
{
    /// <summary>Turns the spotlight off on every question of a deck.</summary>
    private async Task SpotlightOffAsync(Guid deckId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        await db.Slides.Where(s => s.PresentationId == deckId).ExecuteUpdateAsync(s => s.SetProperty(x => x.ShowFirst, false));
    }

    [Fact]
    public async Task Reveal_shows_everyone_the_same_results_and_the_first_answer_in_the_spotlight()
    {
        Inbox<PresentationStateView>? states = null;
        await using var room = await RoomAsync(beforeGuestEnters: g => states = new Inbox<PresentationStateView>(g, "PresentationState"));
        var (_, luciaCookies) = await GuestAsync(room.JoinCode, "Lucía", "fox");
        await using var lucia = Hub(luciaCookies);
        await lucia.StartAsync();
        await lucia.InvokeAsync<Guid[]>("Enter", room.CircleId);

        await room.Animator.InvokeAsync("StartPresentation", await QuestionDeckAsync(room.AnimatorUserId));
        Assert.Contains("not-open", await RefusedAsync(() => room.Animator.InvokeAsync("RevealResults")));
        var opensAt = _factory.Clock.GetUtcNow();
        await room.Animator.InvokeAsync("OpenQuestion");
        var poll = (await states!.NextAsync(s => s.Phase == SessionPhases.Answering)).Slide.SlideId;

        _factory.Clock.Advance(TimeSpan.FromMilliseconds(2400));
        await room.Guest.InvokeAsync<MyAnswerView>("Answer", poll, new[] { "a" });
        _factory.Clock.Advance(TimeSpan.FromSeconds(1));
        await lucia.InvokeAsync<MyAnswerView>("Answer", poll, new[] { "b" });
        // Kenji changes his mind later; he still answered first.
        _factory.Clock.Advance(TimeSpan.FromSeconds(1));
        await room.Guest.InvokeAsync<MyAnswerView>("Answer", poll, new[] { "b" });

        Assert.Contains("animator-only", await RefusedAsync(() => room.Guest.InvokeAsync("RevealResults")));
        // Reveal locks answering first.
        await room.Animator.InvokeAsync("RevealResults");
        var revealed = await states.NextAsync(s => s.Phase == SessionPhases.Revealed);
        var results = revealed.Results!;
        Assert.Equal(2, results.Total);
        Assert.Equal([(0, 0, false), (2, 100, true)], results.Options.Select(o => (o.Count, o.Percent, o.Winner)));
        Assert.Equal(("Kenji", "axolotl", 2400L), (results.First!.Name, results.First.Character, results.First.Ms));
        Assert.All(results.Options, o => Assert.Null(o.Correct));
        Assert.Contains("answers-closed", await RefusedAsync(() => lucia.InvokeAsync<MyAnswerView>("Answer", poll, new[] { "a" })));
        Assert.Equal(opensAt.AddSeconds(4.4), (await DbAsync(db => db.PresentationSessions.SingleAsync(s => s.CircleId == room.CircleId))).LockedAt);

        // Going on and coming back shows the stored results; a reload lands on them too.
        await room.Animator.InvokeAsync("GoToSlide", 1);
        await room.Animator.InvokeAsync("GoToSlide", 0);
        var back = await states.NextAsync(s => s.Position == 0 && s.Phase == SessionPhases.Revealed);
        Assert.Equal(2, back.Results!.Total);
        await using var reloaded = Hub(room.GuestCookies);
        var landed = new Inbox<PresentationStateView>(reloaded, "PresentationState");
        await reloaded.StartAsync();
        await reloaded.InvokeAsync<Guid[]>("Enter", room.CircleId);
        Assert.Equal("Kenji", (await landed.NextAsync()).Results!.First!.Name);
    }

    [Fact]
    public async Task A_quiz_reveal_marks_the_correct_option_and_spotlights_the_first_correct_answer()
    {
        Inbox<PresentationStateView>? states = null;
        await using var room = await RoomAsync(beforeGuestEnters: g => states = new Inbox<PresentationStateView>(g, "PresentationState"));
        var (_, luciaCookies) = await GuestAsync(room.JoinCode, "Lucía", "fox");
        await using var lucia = Hub(luciaCookies);
        await lucia.StartAsync();
        await lucia.InvokeAsync<Guid[]>("Enter", room.CircleId);

        await room.Animator.InvokeAsync("StartPresentation", await QuestionDeckAsync(room.AnimatorUserId));
        await room.Animator.InvokeAsync("GoToSlide", 1);
        await room.Animator.InvokeAsync("OpenQuestion");
        var quiz = (await states!.NextAsync(s => s.Phase == SessionPhases.Answering)).Slide.SlideId;
        // Kenji is quick but wrong; Lucía is right 3 seconds in.
        _factory.Clock.Advance(TimeSpan.FromSeconds(1));
        await room.Guest.InvokeAsync<MyAnswerView>("Answer", quiz, new[] { "a" });
        _factory.Clock.Advance(TimeSpan.FromSeconds(2));
        await lucia.InvokeAsync<MyAnswerView>("Answer", quiz, new[] { "b" });

        await room.Animator.InvokeAsync("RevealResults");
        var results = (await states.NextAsync(s => s.Phase == SessionPhases.Revealed)).Results!;
        Assert.Equal([("a", false), ("b", true)], results.Options.Select(o => (o.Id, o.Correct ?? false)));
        Assert.Equal(("Lucía", 3000L), (results.First!.Name, results.First.Ms));
    }

    [Fact]
    public async Task With_the_spotlight_off_nobody_is_named_and_no_answers_reveals_empty_results()
    {
        Inbox<PresentationStateView>? states = null;
        await using var room = await RoomAsync(beforeGuestEnters: g => states = new Inbox<PresentationStateView>(g, "PresentationState"));
        var deckId = await QuestionDeckAsync(room.AnimatorUserId);
        await SpotlightOffAsync(deckId);
        await room.Animator.InvokeAsync("StartPresentation", deckId);
        await room.Animator.InvokeAsync("OpenQuestion");
        var poll = (await states!.NextAsync(s => s.Phase == SessionPhases.Answering)).Slide.SlideId;
        await room.Guest.InvokeAsync<MyAnswerView>("Answer", poll, new[] { "a" });
        await room.Animator.InvokeAsync("RevealResults");
        var named = (await states.NextAsync(s => s.Phase == SessionPhases.Revealed)).Results!;
        Assert.Equal(1, named.Total);
        Assert.Null(named.First);

        // The quiz: nobody answered.
        await room.Animator.InvokeAsync("GoToSlide", 1);
        await room.Animator.InvokeAsync("OpenQuestion");
        await room.Animator.InvokeAsync("RevealResults");
        var empty = (await states.NextAsync(s => s.Position == 1 && s.Phase == SessionPhases.Revealed)).Results!;
        Assert.Equal(0, empty.Total);
        Assert.All(empty.Options, o => Assert.Equal((0, 0, false), (o.Count, o.Percent, o.Winner)));
        Assert.Null(empty.First);
    }
}
