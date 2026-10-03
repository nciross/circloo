using Circloo.Api.Presentations;

namespace Circloo.Api.Tests.Presentations;

/// <summary>
/// The Playwright journeys upload decks from <c>src/web/e2e/fixtures</c>. They come from <see cref="TestDecks"/>;
/// run with <c>CIRCLOO_WRITE_FIXTURES=1</c> to regenerate them, otherwise this checks they still match.
/// </summary>
public sealed class E2eFixtureTests
{
    /// <summary>From this source file: tests/Circloo.Api.Tests/Presentations → repo root → src/web/e2e/fixtures.</summary>
    private static string FixtureDir([System.Runtime.CompilerServices.CallerFilePath] string source = "") =>
        Path.GetFullPath(Path.Combine(Path.GetDirectoryName(source)!, "..", "..", "..", "src", "web", "e2e", "fixtures"));

    [Fact]
    public void Fixtures_match_the_test_decks()
    {
        var dir = FixtureDir();
        var demo = Path.Combine(dir, "circloo-demo.pptx");
        var notADeck = Path.Combine(dir, "not-a-deck.pptx");
        if (Environment.GetEnvironmentVariable("CIRCLOO_WRITE_FIXTURES") == "1")
        {
            Directory.CreateDirectory(dir);
            File.WriteAllBytes(demo, TestDecks.Demo());
            File.WriteAllBytes(notADeck, TestDecks.RenamedPdf());
        }

        var slides = DeckInspector.Inspect(File.ReadAllBytes(demo)).Slides;
        Assert.Equal(12, slides.Count);
        Assert.Equal([6], slides.Where(s => s.Hidden).Select(s => s.Index));
        Assert.Equal("Ask for questions", slides[4].Notes);
        Assert.Equal("not-pptx", Assert.Throws<DeckRejectedException>(() => DeckInspector.Inspect(File.ReadAllBytes(notADeck))).Code);
    }
}
