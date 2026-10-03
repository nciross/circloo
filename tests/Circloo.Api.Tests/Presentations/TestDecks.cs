using System.IO.Compression;
using System.Text;
using Circloo.Api.Presentations;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using SkiaSharp;

namespace Circloo.Api.Tests.Presentations;

/// <summary>
/// Builds real, minimal .pptx decks in memory (master, layout, theme, slides, notes), so tests never ship binary
/// fixtures or anyone's real deck. LibreOffice opens them too.
/// </summary>
public static class TestDecks
{
    private const string Ns = "xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"";
    private const string Group = "<p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>";

    /// <summary>A deck of <paramref name="count"/> slides titled "Slide n".</summary>
    /// <param name="hidden">0-based indexes of hidden slides.</param>
    /// <param name="notes">Speaker notes by 0-based slide index.</param>
    /// <param name="externalPictureOn">0-based index of a slide that links a picture from the internet.</param>
    /// <param name="linkAsHyperlink">Declares that picture link as a hyperlink relationship (LibreOffice still fetches it).</param>
    /// <param name="linkTarget">Where the linked picture points.</param>
    public static byte[] Build(int count, int[]? hidden = null, Dictionary<int, string>? notes = null, int? externalPictureOn = null,
        PresentationDocumentType type = PresentationDocumentType.Presentation, bool linkAsHyperlink = false,
        string linkTarget = "http://169.254.169.254/latest/meta-data/pic.png")
    {
        using var ms = new MemoryStream();
        using (var doc = PresentationDocument.Create(ms, type))
        {
            var presentation = doc.AddPresentationPart();
            var master = presentation.AddNewPart<SlideMasterPart>("rIdM");
            var layout = master.AddNewPart<SlideLayoutPart>("rIdL");
            layout.AddPart(master, "rIdM");
            var theme = master.AddNewPart<ThemePart>("rIdT");
            presentation.AddPart(theme, "rIdT");
            Feed(theme, Theme);
            Feed(layout, $"<p:sldLayout {Ns}><p:cSld><p:spTree>{Group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>");
            Feed(master, $"<p:sldMaster {Ns}><p:cSld><p:spTree>{Group}</p:spTree></p:cSld>"
                + "<p:clrMap bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/>"
                + "<p:sldLayoutIdLst><p:sldLayoutId id=\"2147483649\" r:id=\"rIdL\"/></p:sldLayoutIdLst></p:sldMaster>");

            var ids = new StringBuilder();
            for (var i = 0; i < count; i++)
            {
                var slide = presentation.AddNewPart<SlidePart>($"rIdS{i}");
                slide.AddPart(layout, "rIdL");
                var show = hidden?.Contains(i) == true ? " show=\"0\"" : "";
                var picture = "";
                if (externalPictureOn == i)
                {
                    var target = new Uri(linkTarget);
                    var rel = linkAsHyperlink
                        ? slide.AddHyperlinkRelationship(target, isExternal: true, "rIdX").Id
                        : slide.AddExternalRelationship("http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", target, "rIdX").Id;
                    picture = "<p:pic><p:nvPicPr><p:cNvPr id=\"3\" name=\"Linked\"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>"
                        + $"<p:blipFill><a:blip r:link=\"{rel}\"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>"
                        + "<p:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"914400\" cy=\"914400\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></p:spPr></p:pic>";
                }
                Feed(slide, $"<p:sld {Ns}{show}><p:cSld><p:spTree>{Group}"
                    + "<p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title\"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>"
                    + "<p:spPr><a:xfrm><a:off x=\"838200\" y=\"2365125\"/><a:ext cx=\"10515600\" cy=\"1325563\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></p:spPr>"
                    + $"<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang=\"en-US\" sz=\"4400\"/><a:t>Slide {i + 1}</a:t></a:r></a:p></p:txBody></p:sp>"
                    + $"{picture}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>");
                if (notes?.TryGetValue(i, out var text) == true)
                {
                    var notesPart = slide.AddNewPart<NotesSlidePart>("rIdN");
                    Feed(notesPart, $"<p:notes {Ns}><p:cSld><p:spTree>{Group}"
                        + "<p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Notes\"/><p:cNvSpPr/><p:nvPr><p:ph type=\"body\" idx=\"1\"/></p:nvPr></p:nvSpPr><p:spPr/>"
                        + string.Concat("<p:txBody><a:bodyPr/><a:lstStyle/>", string.Concat(text.Split('\n').Select(l => $"<a:p><a:r><a:t>{System.Security.SecurityElement.Escape(l)}</a:t></a:r></a:p>")), "</p:txBody>")
                        + "</p:sp></p:spTree></p:cSld></p:notes>");
                }
                ids.Append(System.Globalization.CultureInfo.InvariantCulture, $"<p:sldId id=\"{256 + i}\" r:id=\"rIdS{i}\"/>");
            }
            Feed(presentation, $"<p:presentation {Ns}><p:sldMasterIdLst><p:sldMasterId id=\"2147483648\" r:id=\"rIdM\"/></p:sldMasterIdLst>"
                + $"<p:sldIdLst>{ids}</p:sldIdLst><p:sldSz cx=\"12192000\" cy=\"6858000\"/><p:notesSz cx=\"6858000\" cy=\"9144000\"/></p:presentation>");
        }
        return ms.ToArray();
    }

    /// <summary>The reference deck of the quickstart: 12 slides, slide 7 hidden, notes on slides 2 and 5.</summary>
    public static byte[] Demo() => Build(12, hidden: [6], notes: new() { [1] = "Welcome everyone\nKeep it short", [4] = "Ask for questions" });

    /// <summary>What a password-protected Office file looks like from outside: an OLE container with EncryptionInfo.</summary>
    public static byte[] Encrypted()
    {
        var bytes = new byte[4096];
        new byte[] { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 }.CopyTo(bytes, 0);
        Encoding.Unicode.GetBytes("EncryptionInfo").CopyTo(bytes, 1024);
        return bytes;
    }

    /// <summary>A legacy .ppt (OLE container without encryption).</summary>
    public static byte[] LegacyPpt()
    {
        var bytes = new byte[4096];
        new byte[] { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 }.CopyTo(bytes, 0);
        return bytes;
    }

    public static byte[] RenamedPdf() => Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF");

    /// <summary>A tiny zip that unpacks to more than 100 MB.</summary>
    public static byte[] ZipBomb()
    {
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            var entry = zip.CreateEntry("ppt/big.bin", CompressionLevel.SmallestSize);
            using var stream = entry.Open();
            var chunk = new byte[1024 * 1024];
            for (var i = 0; i < 101; i++)
            {
                stream.Write(chunk);
            }
        }
        return ms.ToArray();
    }

    /// <summary>A genuine deck whose presentation.xml is cut off mid-element.</summary>
    public static byte[] BrokenXml()
    {
        using var ms = new MemoryStream();
        ms.Write(Build(1));
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Update, leaveOpen: true))
        {
            zip.GetEntry("ppt/presentation.xml")!.Delete();
            using var stream = zip.CreateEntry("ppt/presentation.xml").Open();
            stream.Write(Encoding.UTF8.GetBytes("<?xml version=\"1.0\"?><p:presentation xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"><p:sldIdLst"));
        }
        return ms.ToArray();
    }

    /// <summary>A real PDF of <paramref name="pages"/> blank 16:9 pages, as a converter would return.</summary>
    public static byte[] Pdf(int pages, float width = 960, float height = 540)
    {
        using var ms = new MemoryStream();
        using (var document = SKDocument.CreatePdf(ms))
        {
            for (var i = 0; i < pages; i++)
            {
                var canvas = document.BeginPage(width, height);
                canvas.Clear(SKColors.White);
                using var paint = new SKPaint { Color = SKColors.Navy };
                canvas.DrawRect(80, 80, 200 + i * 10, 120, paint);
                document.EndPage();
            }
            document.Close();
        }
        return ms.ToArray();
    }

    private static void Feed(OpenXmlPart part, string xml)
    {
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" + xml));
        part.FeedData(stream);
    }

    private static readonly string Theme =
        "<a:theme xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" name=\"Office\"><a:themeElements>"
        + "<a:clrScheme name=\"Office\"><a:dk1><a:srgbClr val=\"000000\"/></a:dk1><a:lt1><a:srgbClr val=\"FFFFFF\"/></a:lt1>"
        + "<a:dk2><a:srgbClr val=\"0F2537\"/></a:dk2><a:lt2><a:srgbClr val=\"F5F7F9\"/></a:lt2>"
        + string.Concat(Enumerable.Range(1, 6).Select(i => $"<a:accent{i}><a:srgbClr val=\"0D5BD7\"/></a:accent{i}>"))
        + "<a:hlink><a:srgbClr val=\"0D5BD7\"/></a:hlink><a:folHlink><a:srgbClr val=\"5F6F82\"/></a:folHlink></a:clrScheme>"
        + "<a:fontScheme name=\"Office\"><a:majorFont><a:latin typeface=\"Arial\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:majorFont>"
        + "<a:minorFont><a:latin typeface=\"Arial\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:minorFont></a:fontScheme>"
        + "<a:fmtScheme name=\"Office\">"
        + "<a:fillStyleLst>" + string.Concat(Enumerable.Repeat("<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>", 3)) + "</a:fillStyleLst>"
        + "<a:lnStyleLst>" + string.Concat(Enumerable.Repeat("<a:ln w=\"9525\"><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:ln>", 3)) + "</a:lnStyleLst>"
        + "<a:effectStyleLst>" + string.Concat(Enumerable.Repeat("<a:effectStyle><a:effectLst/></a:effectStyle>", 3)) + "</a:effectStyleLst>"
        + "<a:bgFillStyleLst>" + string.Concat(Enumerable.Repeat("<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>", 3)) + "</a:bgFillStyleLst>"
        + "</a:fmtScheme></a:themeElements></a:theme>";
}

/// <summary>Stands in for Gotenberg: returns a real PDF with one page per slide in the deck (or a set number).</summary>
public sealed class FakeConverter : IDeckConverter
{
    public int? Pages { get; set; }
    public Exception? Fail { get; set; }
    public byte[]? LastDeck { get; private set; }

    public Task<byte[]> ToPdfAsync(byte[] deck, CancellationToken ct)
    {
        LastDeck = deck;
        if (Fail is not null)
        {
            throw Fail;
        }
        return Task.FromResult(TestDecks.Pdf(Pages ?? DeckInspector.Inspect(deck).Slides.Count));
    }
}
