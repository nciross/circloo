using System.ComponentModel.DataAnnotations;

namespace Circloo.Api.Circles;

/// <summary>Service-wide circle settings (spec 008): configuration, never customer-specific code (constitution V).</summary>
public sealed class CircleOptions
{
    public const string Section = "Circles";

    /// <summary>Active people per circle, animators included (FR-801).</summary>
    [Range(2, 500)]
    public int MaxPeople { get; set; } = 100;
}
