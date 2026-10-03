using Circloo.Api.Circles;
using Circloo.Api.Data;
using Circloo.Api.Decide;
using Circloo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Circloo.Api.Tests.Decide;

/// <summary>Spec 007: the database guarantees one vote, one upvote and one response per member, and one open poll/form per circle (SC-703).</summary>
[Collection(ApiCollection.Name)]
public sealed class DecideDataTests(PostgresFixture pg) : IAsyncLifetime
{
    private ApiFactory _factory = null!;

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString());
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private async Task SaveAsync(params object[] entities)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
        db.AddRange(entities);
        await db.SaveChangesAsync();
    }

    private async Task<(Circle Circle, CircleMember Animator, CircleMember Guest)> CircleAsync()
    {
        var user = new User { Email = $"decide-{Guid.NewGuid():N}@example.test", Locale = "en" };
        var circle = new Circle { OwnerUserId = user.Id, Name = "Retro", JoinCode = Guid.NewGuid().ToString("N")[..10], Locale = "en", Activities = ["poll", "qa", "feedback"], ExpiresAt = DateTimeOffset.UtcNow.AddDays(7) };
        var animator = new CircleMember { CircleId = circle.Id, Role = Roles.Animator, UserId = user.Id, Name = "Amina", Character = "panda" };
        var guest = new CircleMember { CircleId = circle.Id, Role = Roles.Participant, Name = "Kenji", Character = "fox" };
        await SaveAsync(user, circle, animator, guest);
        return (circle, animator, guest);
    }

    private static Poll OpenPoll(Guid circleId, Guid by) => new()
    {
        CircleId = circleId, Question = "Lunch?", CreatedByMemberId = by, OpenedAt = DateTimeOffset.UtcNow,
        Options = [new() { Id = "a", Text = "Pizza" }, new() { Id = "b", Text = "Sushi" }],
    };

    private static Form OpenForm(Guid circleId) => new()
    {
        CircleId = circleId, OpenedAt = DateTimeOffset.UtcNow,
        Questions = [new() { Id = "q1", Type = FormQuestionTypes.Rating5, Label = "How was it?", Look = "stars", Required = true }],
    };

    [Fact]
    public async Task One_vote_one_upvote_and_one_response_per_member()
    {
        var (circle, animator, guest) = await CircleAsync();
        var poll = OpenPoll(circle.Id, animator.Id);
        var question = new QaQuestion { CircleId = circle.Id, AuthorMemberId = animator.Id, Text = "When?", State = QaStates.Open };
        var form = OpenForm(circle.Id);
        await SaveAsync(poll, question, form);

        await SaveAsync(new PollVote { PollId = poll.Id, MemberId = guest.Id, Options = ["a"] });
        await Assert.ThrowsAsync<DbUpdateException>(() => SaveAsync(new PollVote { PollId = poll.Id, MemberId = guest.Id, Options = ["b"] }));

        await SaveAsync(new QaUpvote { QuestionId = question.Id, MemberId = guest.Id });
        await Assert.ThrowsAsync<DbUpdateException>(() => SaveAsync(new QaUpvote { QuestionId = question.Id, MemberId = guest.Id }));

        await SaveAsync(new FormResponse { FormId = form.Id, MemberId = guest.Id, Answers = """{"q1":5}""" });
        await Assert.ThrowsAsync<DbUpdateException>(() => SaveAsync(new FormResponse { FormId = form.Id, MemberId = guest.Id, Answers = """{"q1":1}""" }));
    }

    [Fact]
    public async Task One_open_poll_and_one_open_form_per_circle_while_closed_ones_stay()
    {
        var (circle, animator, _) = await CircleAsync();
        await SaveAsync(OpenPoll(circle.Id, animator.Id), OpenForm(circle.Id));
        await Assert.ThrowsAsync<DbUpdateException>(() => SaveAsync(OpenPoll(circle.Id, animator.Id)));
        await Assert.ThrowsAsync<DbUpdateException>(() => SaveAsync(OpenForm(circle.Id)));

        // Closed and draft ones are not limited.
        var closed = OpenPoll(circle.Id, animator.Id);
        closed.ClosedAt = DateTimeOffset.UtcNow;
        var draft = OpenPoll(circle.Id, animator.Id);
        draft.OpenedAt = null;
        await SaveAsync(closed, draft);
    }

    [Fact]
    public async Task Questions_and_options_round_trip_as_json_and_go_with_their_circle()
    {
        var (circle, animator, guest) = await CircleAsync();
        var form = new Form
        {
            CircleId = circle.Id,
            Questions =
            [
                new() { Id = "q1", Type = FormQuestionTypes.SingleChoice, Label = "Length?", Options = [new() { Id = "a", Text = "Short" }, new() { Id = "b", Text = "Long" }] },
                new() { Id = "q2", Type = FormQuestionTypes.Text, Label = "Anything else?", LongText = true },
            ],
        };
        var poll = OpenPoll(circle.Id, animator.Id);
        await SaveAsync(form, poll, new PollVote { PollId = poll.Id, MemberId = guest.Id, Options = ["a", "b"] });

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CirclooDbContext>();
            var loaded = await db.Forms.AsNoTracking().SingleAsync(f => f.Id == form.Id);
            Assert.Equal(["Short", "Long"], loaded.Questions[0].Options.Select(o => o.Text));
            Assert.True(loaded.Questions[1].LongText);
            Assert.Equal(["a", "b"], (await db.PollVotes.SingleAsync(v => v.PollId == poll.Id)).Options);

            // Deleting the circle takes its polls, votes and forms with it.
            await db.Circles.Where(c => c.Id == circle.Id).ExecuteDeleteAsync();
            Assert.False(await db.Polls.AnyAsync(p => p.CircleId == circle.Id));
            Assert.False(await db.PollVotes.AnyAsync(v => v.PollId == poll.Id));
            Assert.False(await db.Forms.AnyAsync(f => f.Id == form.Id));
        }
    }
}
