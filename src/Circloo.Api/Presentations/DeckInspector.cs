using System.IO.Compression;
using System.Text;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Presentation;
using A = DocumentFormat.OpenXml.Drawing;

namespace Circloo.Api.Presentations;

/// <summary>One slide as found in the file, in presentation order.</summary>
public sealed record DeckSlide(int Index, bool Hidden, string? Notes);

/// <summary>What the inspector learned, and the deck to convert with external links removed.</summary>
public sealed record DeckInspection(IReadOnlyList<DeckSlide> Slides, byte[] Deck);

/// <summary>A deck circloo will not convert, with a stable code the web translates (contracts/rest.md).</summary>
public sealed class DeckRejectedException(string code) : Exception(code)
{
    public string Code { get; } = code;
}

/// <summary>
/// Checks an uploaded deck before LibreOffice ever sees it (research R2, plan threat model): a genuine .pptx,
/// not encrypted, no macros, no zip bomb, at most 100 slides. Reads speaker notes and hidden flags, and removes every
/// external relationship (linked pictures, media, OLE objects, templates) so the converter never fetches a URL.
/// Hyperlinks are kept: they are text in a picture and are never followed.
/// </summary>
public static class DeckInspector
{
    public const long MaxUncompressedTotal = 300L * 1024 * 1024;
    public const long MaxUncompressedPart = 100L * 1024 * 1024;
    public const int MaxEntries = 5000;

    private static readonly byte[] Zip = [0x50, 0x4B, 0x03, 0x04];
    private static readonly byte[] Ole = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    private static readonly byte[] EncryptionInfo = Encoding.Unicode.GetBytes("EncryptionInfo");

    public static DeckInspection Inspect(byte[] file)
    {
        if (file.Length > PresentationRules.MaxUploadBytes)
        {
            throw new DeckRejectedException("too-large");
        }
        if (file.AsSpan().StartsWith(Ole))
        {
            // Password-protected Office files are OLE containers holding an EncryptionInfo stream; other OLE files
            // are legacy .ppt decks.
            throw new DeckRejectedException(file.AsSpan().IndexOf(EncryptionInfo) >= 0 ? "encrypted" : "not-pptx");
        }
        if (!file.AsSpan().StartsWith(Zip))
        {
            throw new DeckRejectedException("not-pptx");
        }

        CheckArchive(file);

        var copy = new MemoryStream();
        copy.Write(file);
        copy.Position = 0;
        var slides = new List<DeckSlide>();
        try
        {
            using (var doc = PresentationDocument.Open(copy, isEditable: true))
            {
                if (doc.DocumentType is PresentationDocumentType.MacroEnabledPresentation
                    or PresentationDocumentType.MacroEnabledSlideshow or PresentationDocumentType.MacroEnabledTemplate
                    || doc.GetAllParts().Any(p => p is VbaProjectPart))
                {
                    throw new DeckRejectedException("macros");
                }
                if (doc.DocumentType is not (PresentationDocumentType.Presentation or PresentationDocumentType.Slideshow))
                {
                    throw new DeckRejectedException("not-pptx");
                }

                var part = doc.PresentationPart ?? throw new DeckRejectedException("not-pptx");
                var ids = part.Presentation?.SlideIdList?.Elements<SlideId>().ToList() ?? [];
                if (ids.Count == 0)
                {
                    throw new DeckRejectedException("not-pptx");
                }
                if (ids.Count > PresentationRules.MaxDeckSlides)
                {
                    throw new DeckRejectedException("too-many-slides");
                }
                for (var i = 0; i < ids.Count; i++)
                {
                    var rel = ids[i].RelationshipId?.Value;
                    if (rel is null || part.GetPartById(rel) is not SlidePart slidePart)
                    {
                        throw new DeckRejectedException("not-pptx");
                    }
                    var hidden = slidePart.Slide?.Show is { } show && !show.Value;
                    slides.Add(new DeckSlide(i, hidden, NotesOf(slidePart)));
                }

                RemoveExternalLinks(doc);
            }
        }
        catch (OpenXmlPackageException)
        {
            throw new DeckRejectedException("not-pptx");
        }
        catch (InvalidDataException)
        {
            throw new DeckRejectedException("not-pptx");
        }
        return new DeckInspection(slides, copy.ToArray());
    }

    /// <summary>Refuses archives that would explode when unpacked, before any XML parser touches them.</summary>
    private static void CheckArchive(byte[] file)
    {
        try
        {
            using var zip = new ZipArchive(new MemoryStream(file), ZipArchiveMode.Read);
            if (zip.Entries.Count > MaxEntries)
            {
                throw new DeckRejectedException("too-large");
            }
            long total = 0;
            foreach (var entry in zip.Entries)
            {
                if (entry.Length > MaxUncompressedPart)
                {
                    throw new DeckRejectedException("too-large");
                }
                total += entry.Length;
                if (total > MaxUncompressedTotal)
                {
                    throw new DeckRejectedException("too-large");
                }
            }
        }
        catch (InvalidDataException)
        {
            throw new DeckRejectedException("not-pptx");
        }
    }

    /// <summary>The text of the notes placeholder, one line per paragraph, bounded.</summary>
    private static string? NotesOf(SlidePart slide)
    {
        var notes = slide.NotesSlidePart?.NotesSlide;
        if (notes is null)
        {
            return null;
        }
        var lines = notes.Descendants<Shape>()
            .Where(s => s.NonVisualShapeProperties?.ApplicationNonVisualDrawingProperties?.PlaceholderShape?.Type?.Value == PlaceholderValues.Body)
            .SelectMany(s => s.Descendants<A.Paragraph>())
            .Select(p => string.Concat(p.Descendants<A.Text>().Select(t => t.Text)).Trim())
            .Where(l => l.Length > 0);
        var text = string.Join('\n', lines);
        text = new string([.. text.Where(c => c == '\n' || !char.IsControl(c))]);
        if (text.Length == 0)
        {
            return null;
        }
        return text.Length > PresentationRules.NotesMax ? text[..PresentationRules.NotesMax] : text;
    }

    /// <summary>Drops every external relationship of every part, so nothing in the deck points outside it.</summary>
    private static void RemoveExternalLinks(PresentationDocument doc)
    {
        foreach (var part in doc.GetAllParts().ToList())
        {
            foreach (var link in part.ExternalRelationships.ToList())
            {
                part.DeleteExternalRelationship(link);
            }
        }
        foreach (var link in doc.ExternalRelationships.ToList())
        {
            doc.DeleteExternalRelationship(link);
        }
    }

    /// <summary>For tests and diagnostics: how many external relationships a deck still has.</summary>
    public static int CountExternalLinks(byte[] deck)
    {
        using var doc = PresentationDocument.Open(new MemoryStream(deck), isEditable: false);
        return doc.ExternalRelationships.Count() + doc.GetAllParts().Sum(p => p.ExternalRelationships.Count());
    }
}
