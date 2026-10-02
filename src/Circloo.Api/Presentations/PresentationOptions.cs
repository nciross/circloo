namespace Circloo.Api.Presentations;

/// <summary>Where decks are converted and stored (spec 006, research R1 and R3).</summary>
public sealed class PresentationOptions
{
    public const string Section = "Presentations";

    /// <summary>The name of the HTTP client that talks to the converter.</summary>
    public const string ConverterClient = "converter";

    /// <summary>Base URL of the Gotenberg converter: an Aspire container in dev, an internal Container App in Azure.</summary>
    public string? ConverterUrl { get; set; }

    /// <summary>Blob container holding slide pictures, under <c>{ownerId}/{presentationId}/</c>.</summary>
    public string Container { get; set; } = "presentations";
}
