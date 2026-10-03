using System.IO.Compression;
using System.Text;
using System.Xml;
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
/// external relationship (linked pictures, media, OLE objects, templates, hyperlinks) so the converter never fetches a
/// URL. LibreOffice resolves a picture link by relationship id whatever its declared type, so hyperlinks go too, and a
/// final scan of the raw relationship files refuses anything that still points outside the deck.
/// </summary>
public static class DeckInspector
{
    public const long MaxUncompressedTotal = 300L * 1024 * 1024;
    public const long MaxUncompressedPart = 100L * 1024 * 1024;
    public const int MaxEntries = 5000;
    /// <summary>Bounds every XML part the inspector parses into memory (presentation, notes).</summary>
    public const long MaxXmlCharacters = 5_000_000;

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
            using (var doc = PresentationDocument.Open(copy, isEditable: true, new OpenSettings { MaxCharactersInPart = MaxXmlCharacters }))
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
                    slides.Add(new DeckSlide(i, IsHidden(slidePart), NotesOf(slidePart)));
                }

                RemoveExternalLinks(doc);
            }
        }
        catch (Exception e) when (e is OpenXmlPackageException or InvalidDataException or XmlException or FormatException
            or ArgumentException or IOException or InvalidOperationException)
        {
            // Malformed packages, relationship targets or XML (or XML over the size bound) all mean "not a deck we use".
            throw new DeckRejectedException("not-pptx");
        }
        var deck = copy.ToArray();
        if (CountExternalLinks(deck) > 0)
        {
            throw new DeckRejectedException("not-pptx");
        }
        return new DeckInspection(slides, deck);
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

    /// <summary>The slide's show="0" flag, read from its root element without loading the slide into memory.</summary>
    private static bool IsHidden(SlidePart slide)
    {
        using var reader = OpenXmlReader.Create(slide);
        while (reader.Read())
        {
            if (reader.IsStartElement)
            {
                var show = reader.Attributes.FirstOrDefault(a => a.LocalName == "show" && a.NamespaceUri.Length == 0).Value;
                return show is "0" or "false";
            }
        }
        return false;
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
        if (text.Length <= PresentationRules.NotesMax)
        {
            return text;
        }
        // Never cut a surrogate pair in half: PostgreSQL refuses the lone half.
        return text[..(char.IsHighSurrogate(text[PresentationRules.NotesMax - 1]) ? PresentationRules.NotesMax - 1 : PresentationRules.NotesMax)];
    }

    /// <summary>
    /// Drops every external relationship of every part, so nothing in the deck points outside it. The SDK files
    /// hyperlink-typed relationships apart from the other external ones, so both lists are emptied.
    /// </summary>
    private static void RemoveExternalLinks(PresentationDocument doc)
    {
        foreach (var container in doc.GetAllParts().Cast<OpenXmlPartContainer>().Append(doc).ToList())
        {
            foreach (var link in container.ExternalRelationships.ToList())
            {
                container.DeleteExternalRelationship(link);
            }
            foreach (var link in container.HyperlinkRelationships.Where(h => h.IsExternal).ToList())
            {
                container.DeleteReferenceRelationship(link);
            }
        }
    }

    /// <summary>
    /// How many relationships in the raw package still have TargetMode="External", whatever their type: read straight
    /// from the .rels files, so it does not depend on how the SDK classifies them.
    /// </summary>
    public static int CountExternalLinks(byte[] deck)
    {
        using var zip = new ZipArchive(new MemoryStream(deck), ZipArchiveMode.Read);
        var count = 0;
        foreach (var entry in zip.Entries.Where(e => e.FullName.EndsWith(".rels", StringComparison.OrdinalIgnoreCase)))
        {
            using var reader = XmlReader.Create(entry.Open(), new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null });
            while (reader.Read())
            {
                if (reader.NodeType == XmlNodeType.Element && reader.LocalName == "Relationship"
                    && string.Equals(reader.GetAttribute("TargetMode"), "External", StringComparison.OrdinalIgnoreCase))
                {
                    count++;
                }
            }
        }
        return count;
    }
}
