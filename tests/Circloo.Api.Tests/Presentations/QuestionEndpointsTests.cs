using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Circloo.Api.Tests.Infrastructure;

namespace Circloo.Api.Tests.Presentations;

/// <summary>Poll and quiz slides between deck slides (spec 006 US2, FR-605/606, contracts/rest.md).</summary>
[Collection(ApiCollection.Name)]
public sealed class QuestionEndpointsTests(PostgresFixture pg) : IAsyncLifetime
{
    private readonly PresentationHost _host = new(pg);

    public Task InitializeAsync() => _host.StartAsync();

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private static object[] Options(params string[] texts) => [.. texts.Select(t => new { text = t })];

    private async Task<(Guid Id, JsonElement Detail)> DeckAsync(int slides = 4)
    {
        var id = await _host.UploadReadyAsync(TestDecks.Build(slides));
        return (id, await _host.DetailAsync(id));
    }

    private Task<HttpResponseMessage> AddAsync(Guid id, int version, object question) =>
        _host.SendAsync(HttpMethod.Post, $"/api/presentations/{id}/questions", Merge(question, new { version }));

    private static Dictionary<string, object?> Merge(object a, object b)
    {
        var json = JsonSerializer.SerializeToElement(a).EnumerateObject().Concat(JsonSerializer.SerializeToElement(b).EnumerateObject());
        return json.ToDictionary(p => p.Name, p => (object?)p.Value);
    }

    [Fact]
    public async Task A_poll_and_a_quiz_go_where_they_are_put()
    {
        var (id, detail) = await DeckAsync();
        var deck = detail.GetProperty("slides").EnumerateArray().Select(s => s.GetProperty("id").GetGuid()).ToList();

        var poll = await AddAsync(id, detail.GetProperty("version").GetInt32(),
            new { kind = "poll", question = "Where do we eat?", options = Options("Pizza", "Sushi", "Tacos"), afterSlideId = deck[1], multipleChoice = true, showLive = true });
        Assert.Equal(HttpStatusCode.Created, poll.StatusCode);
        var afterPoll = await poll.Content.ReadFromJsonAsync<JsonElement>();
        var quiz = await AddAsync(id, afterPoll.GetProperty("version").GetInt32(),
            new { kind = "quiz", question = "2 + 2?", options = Options("3", "4"), correctOption = "b", timerSeconds = 15 });
        Assert.Equal(HttpStatusCode.Created, quiz.StatusCode);

        var slides = (await quiz.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("slides").EnumerateArray().ToList();
        Assert.Equal(["deck", "deck", "poll", "deck", "deck", "quiz"], slides.Select(s => s.GetProperty("kind").GetString()));
        Assert.Equal(Enumerable.Range(0, 6), slides.Select(s => s.GetProperty("position").GetInt32()));
        var p = slides[2];
        Assert.Equal(["a", "b", "c"], p.GetProperty("options").EnumerateArray().Select(o => o.GetProperty("id").GetString()));
        Assert.True(p.GetProperty("multipleChoice").GetBoolean());
        Assert.True(p.GetProperty("showLive").GetBoolean());
        Assert.True(p.GetProperty("showFirst").GetBoolean());
        var q = slides[5];
        Assert.Equal("b", q.GetProperty("correctOption").GetString());
        Assert.Equal(15, q.GetProperty("timerSeconds").GetInt32());
        Assert.False(q.GetProperty("showLive").GetBoolean());
        Assert.Equal(2, (await _host.DetailAsync(id)).GetProperty("questionCount").GetInt32());
    }

    [Fact]
    public async Task Invalid_questions_are_refused_with_codes()
    {
        var (id, detail) = await DeckAsync(1);
        var version = detail.GetProperty("version").GetInt32();

        var res = await AddAsync(id, version, new { kind = "quiz", question = "", options = Options("only one"), timerSeconds = 5 });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var errors = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors");
        Assert.Equal("question-length", errors.GetProperty("question")[0].GetString());
        Assert.Equal("options-count", errors.GetProperty("options")[0].GetString());
        Assert.Equal("quiz-correct", errors.GetProperty("correctOption")[0].GetString());
        Assert.Equal("timer-range", errors.GetProperty("timerSeconds")[0].GetString());
    }

    [Fact]
    public async Task Questions_can_be_edited_and_switched_between_poll_and_quiz()
    {
        var (id, detail) = await DeckAsync(1);
        var added = await (await AddAsync(id, detail.GetProperty("version").GetInt32(),
            new { kind = "poll", question = "Tea or coffee?", options = Options("Tea", "Coffee") })).Content.ReadFromJsonAsync<JsonElement>();
        var slide = added.GetProperty("slides")[1].GetProperty("id").GetGuid();

        var edited = await _host.SendAsync(HttpMethod.Put, $"/api/presentations/{id}/slides/{slide}", new
        {
            version = added.GetProperty("version").GetInt32(),
            kind = "quiz",
            question = "Which is a bean?",
            options = Options("Tea", "Coffee", "Water"),
            correctOption = "b",
            showFirst = false,
        });

        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        var s = (await edited.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("slides")[1];
        Assert.Equal("quiz", s.GetProperty("kind").GetString());
        Assert.Equal("Which is a bean?", s.GetProperty("question").GetString());
        Assert.Equal(3, s.GetProperty("options").GetArrayLength());
        Assert.Equal(20, s.GetProperty("timerSeconds").GetInt32());
        Assert.False(s.GetProperty("showFirst").GetBoolean());
    }

    [Fact]
    public async Task Reordering_needs_the_full_set_and_a_current_version()
    {
        var (id, detail) = await DeckAsync(3);
        var ids = detail.GetProperty("slides").EnumerateArray().Select(s => s.GetProperty("id").GetGuid()).ToList();
        var version = detail.GetProperty("version").GetInt32();

        var partial = await _host.SendAsync(HttpMethod.Put, $"/api/presentations/{id}/order", new { slideIds = ids.Take(2), version });
        var duplicate = await _host.SendAsync(HttpMethod.Put, $"/api/presentations/{id}/order", new { slideIds = new[] { ids[0], ids[0], ids[1] }, version });
        var ok = await _host.SendAsync(HttpMethod.Put, $"/api/presentations/{id}/order", new { slideIds = new[] { ids[2], ids[0], ids[1] }, version });
        var stale = await _host.SendAsync(HttpMethod.Put, $"/api/presentations/{id}/order", new { slideIds = ids, version });

        Assert.Equal(HttpStatusCode.BadRequest, partial.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Equal([ids[2], ids[0], ids[1]],
            (await ok.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("slides").EnumerateArray().Select(s => s.GetProperty("id").GetGuid()));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }

    [Fact]
    public async Task Deleting_a_question_keeps_positions_dense()
    {
        var (id, detail) = await DeckAsync(2);
        var first = detail.GetProperty("slides")[0].GetProperty("id").GetGuid();
        var added = await (await AddAsync(id, detail.GetProperty("version").GetInt32(),
            new { kind = "poll", question = "Ready?", options = Options("Yes", "No"), afterSlideId = first })).Content.ReadFromJsonAsync<JsonElement>();
        var question = added.GetProperty("slides")[1].GetProperty("id").GetGuid();

        var res = await _host.SendAsync(HttpMethod.Delete, $"/api/presentations/{id}/slides/{question}?version={added.GetProperty("version").GetInt32()}");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var after = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal([0, 1], after.GetProperty("slides").EnumerateArray().Select(s => s.GetProperty("position").GetInt32()));
        Assert.Equal(2, after.GetProperty("slideCount").GetInt32());
        Assert.Equal(0, after.GetProperty("questionCount").GetInt32());
    }

    [Fact]
    public async Task At_most_fifty_questions()
    {
        var (id, detail) = await DeckAsync(1);
        var version = detail.GetProperty("version").GetInt32();
        for (var i = 0; i < 50; i++)
        {
            var res = await AddAsync(id, version, new { kind = "poll", question = $"Q{i}", options = Options("A", "B") });
            Assert.Equal(HttpStatusCode.Created, res.StatusCode);
            version++;
        }

        var over = await AddAsync(id, version, new { kind = "poll", question = "One more", options = Options("A", "B") });

        Assert.Equal(HttpStatusCode.BadRequest, over.StatusCode);
        Assert.Equal("too-many-questions", (await over.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors").GetProperty("questions")[0].GetString());
    }

    [Fact]
    public async Task Strangers_cannot_add_questions()
    {
        var (id, detail) = await DeckAsync(1);
        var stranger = _host.Browser();
        var csrf = await stranger.SignInAsync(_host.Root, $"stranger-{Guid.NewGuid():N}@example.test");

        var res = await stranger.PostJsonAsync($"/api/presentations/{id}/questions",
            new { version = detail.GetProperty("version").GetInt32(), kind = "poll", question = "Hi", options = Options("A", "B") }, csrf);

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        var version = detail.GetProperty("version").GetInt32();
        var slide = detail.GetProperty("slides")[0].GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PutJsonAsync($"/api/presentations/{id}/slides/{slide}", new { version, hidden = true }, csrf)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PutJsonAsync($"/api/presentations/{id}/order", new { version, slideIds = new[] { slide } }, csrf)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.DeleteAsync($"/api/presentations/{id}/slides/{slide}?version={version}", csrf)).StatusCode);
    }

    [Fact]
    public async Task A_deck_that_is_not_ready_takes_no_questions()
    {
        _host.Converter.Fail = new Circloo.Api.Presentations.ConversionFailedException("conversion-failed", "broken");
        var upload = await PresentationHost.UploadAsync(_host.Owner, _host.Csrf, TestDecks.Build(2));
        var detail = await _host.WaitReadyAsync((await upload.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid());
        Assert.Equal("failed", detail.GetProperty("status").GetString());

        var res = await AddAsync(detail.GetProperty("id").GetGuid(), detail.GetProperty("version").GetInt32(),
            new { kind = "poll", question = "Too early?", options = Options("Yes", "No") });

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Equal("not-ready", (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("type").GetString());
    }
}
