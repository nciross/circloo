using System.Net.Http.Headers;
using Microsoft.Extensions.Options;
using PDFtoImage;
using SkiaSharp;

namespace Circloo.Api.Presentations;

/// <summary>Turns a (sanitised) .pptx into a PDF with one page per slide. Faked in tests.</summary>
public interface IDeckConverter
{
    Task<byte[]> ToPdfAsync(byte[] deck, CancellationToken ct);
}

/// <summary>A conversion that failed for a reason worth telling the owner, as a stable code.</summary>
public sealed class ConversionFailedException(string code, string message, Exception? inner = null) : Exception(message, inner)
{
    public string Code { get; } = code;
}

/// <summary>
/// The Gotenberg LibreOffice route (research R1). Hidden slides are exported too, so pages map 1:1 to the slides in
/// the file and circloo decides what to hide.
/// </summary>
public sealed class GotenbergConverter(IHttpClientFactory http, IOptions<PresentationOptions> options) : IDeckConverter
{
    public async Task<byte[]> ToPdfAsync(byte[] deck, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(options.Value.ConverterUrl))
        {
            throw new ConversionFailedException("conversion-failed", "No converter is configured (Presentations:ConverterUrl).");
        }
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(deck);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.presentationml.presentation");
        form.Add(file, "files", "deck.pptx");
        form.Add(new StringContent("true"), "exportHiddenSlides");

        var client = http.CreateClient(PresentationOptions.ConverterClient);
        try
        {
            using var res = await client.PostAsync(new Uri("forms/libreoffice/convert", UriKind.Relative), form, ct);
            if (!res.IsSuccessStatusCode)
            {
                throw new ConversionFailedException("conversion-failed", $"The converter answered {(int)res.StatusCode}.");
            }
            return await res.Content.ReadAsByteArrayAsync(ct);
        }
        catch (TaskCanceledException e) when (!ct.IsCancellationRequested)
        {
            throw new ConversionFailedException("timeout", "The converter took too long.", e);
        }
        catch (HttpRequestException e)
        {
            throw new ConversionFailedException("conversion-failed", "The converter could not be reached.", e);
        }
    }
}

/// <summary>One rendered slide: the full picture and its thumbnail, both WebP.</summary>
public sealed record RenderedSlide(byte[] Full, byte[] Thumb);

// PDFtoImage lists the platforms PDFium ships for; circloo runs on Linux (Azure) and Windows/macOS (dev), all of them.
#pragma warning disable CA1416
/// <summary>PDF pages to WebP pictures with PDFium (research R1): 1920 px wide for the screen, 480 px for thumbnails.</summary>
public static class SlideRenderer
{
    public const int FullWidth = 1920;
    public const int ThumbWidth = 480;
    private const int FullQuality = 82;
    private const int ThumbQuality = 75;

    public static int PageCount(byte[] pdf) => Conversion.GetPageCount(pdf);

    /// <summary>Renders one page; pages are rendered one at a time so memory stays flat for big decks.</summary>
    public static RenderedSlide Render(byte[] pdf, int page)
    {
        using var bitmap = Conversion.ToImage(pdf, page, options: new RenderOptions(Width: FullWidth, WithAspectRatio: true, BackgroundColor: SKColors.White));
        var full = Encode(bitmap, FullQuality);
        var thumbHeight = Math.Max(1, (int)Math.Round(bitmap.Height * (ThumbWidth / (double)bitmap.Width)));
        using var thumb = bitmap.Resize(new SKImageInfo(ThumbWidth, thumbHeight), new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
        return new RenderedSlide(full, Encode(thumb, ThumbQuality));
    }

    private static byte[] Encode(SKBitmap bitmap, int quality)
    {
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Webp, quality);
        return data.ToArray();
    }
}
#pragma warning restore CA1416
