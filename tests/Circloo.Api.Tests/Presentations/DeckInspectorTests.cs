using Circloo.Api.Presentations;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;

namespace Circloo.Api.Tests.Presentations;

/// <summary>Upload checks before LibreOffice sees a deck (spec 006 FR-602, research R2, plan threat model).</summary>
public sealed class DeckInspectorTests
{
    [Fact]
    public void Reads_slides_in_order_with_hidden_flags_and_notes()
    {
        var result = DeckInspector.Inspect(TestDecks.Demo());

        Assert.Equal(12, result.Slides.Count);
        Assert.Equal(Enumerable.Range(0, 12), result.Slides.Select(s => s.Index));
        Assert.Equal([6], result.Slides.Where(s => s.Hidden).Select(s => s.Index));
        Assert.Equal("Welcome everyone\nKeep it short", result.Slides[1].Notes);
        Assert.Equal("Ask for questions", result.Slides[4].Notes);
        Assert.Null(result.Slides[0].Notes);
    }

    [Fact]
    public void Long_notes_are_bounded()
    {
        var result = DeckInspector.Inspect(TestDecks.Build(1, notes: new() { [0] = new string('n', 3000) }));

        Assert.Equal(PresentationRules.NotesMax, result.Slides[0].Notes!.Length);
    }

    [Fact]
    public void Externally_linked_pictures_are_removed_before_conversion()
    {
        var deck = TestDecks.Build(2, externalPictureOn: 1);
        Assert.Equal(1, DeckInspector.CountExternalLinks(deck));

        var result = DeckInspector.Inspect(deck);

        Assert.Equal(0, DeckInspector.CountExternalLinks(result.Deck));
        Assert.Equal(2, result.Slides.Count);
    }

    public static TheoryData<string, string> Refused => new()
    {
        { "encrypted", "encrypted" },
        { "legacy", "not-pptx" },
        { "pdf", "not-pptx" },
        { "macro", "macros" },
        { "template", "not-pptx" },
        { "101", "too-many-slides" },
        { "bomb", "too-large" },
        { "empty", "not-pptx" },
    };

    [Theory]
    [MemberData(nameof(Refused))]
    public void Refuses_what_it_should_not_convert(string fixture, string code)
    {
        var file = fixture switch
        {
            "encrypted" => TestDecks.Encrypted(),
            "legacy" => TestDecks.LegacyPpt(),
            "pdf" => TestDecks.RenamedPdf(),
            "macro" => TestDecks.Build(2, type: PresentationDocumentType.MacroEnabledPresentation),
            "template" => TestDecks.Build(2, type: PresentationDocumentType.Template),
            "101" => TestDecks.Build(101),
            "bomb" => TestDecks.ZipBomb(),
            _ => TestDecks.Build(0),
        };

        var e = Assert.Throws<DeckRejectedException>(() => DeckInspector.Inspect(file));

        Assert.Equal(code, e.Code);
    }

    [Fact]
    public void Accepts_exactly_one_hundred_slides() =>
        Assert.Equal(100, DeckInspector.Inspect(TestDecks.Build(100)).Slides.Count);

    [Fact]
    public void Maps_pages_one_to_one_or_to_visible_slides()
    {
        var slides = Enumerable.Range(0, 4).Select(i => new Data.Slide { Kind = SlideKinds.Deck, SourceIndex = i, Hidden = i == 2 }).ToList();

        Assert.Equal(slides, PresentationConverterService.MapPages(4, slides));
        Assert.Equal(slides.Where(s => !s.Hidden), PresentationConverterService.MapPages(3, slides));
        Assert.Throws<ConversionFailedException>(() => PresentationConverterService.MapPages(2, slides));
    }

    [Fact]
    public void Renders_webp_pictures_and_thumbnails_from_a_pdf()
    {
        var pdf = TestDecks.Pdf(2);

        var rendered = SlideRenderer.Render(pdf, 1);

        Assert.Equal(2, SlideRenderer.PageCount(pdf));
        Assert.True(IsWebp(rendered.Full));
        Assert.True(IsWebp(rendered.Thumb));
        Assert.True(rendered.Thumb.Length < rendered.Full.Length);
    }

    private static bool IsWebp(byte[] b) => b.Length > 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
}
