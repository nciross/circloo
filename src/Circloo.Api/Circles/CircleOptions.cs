using System.ComponentModel.DataAnnotations;

namespace Circloo.Api.Circles;

/// <summary>Service-wide circle settings (spec 008): configuration, never customer-specific code (constitution V).</summary>
public sealed class CircleOptions
{
    public const string Section = "Circles";

    /// <summary>
    /// Active people per circle, animators included (FR-801). At most 288: 48 characters × 6 rings. Use
    /// <see cref="Characters.Capacity"/> for the number a circle really holds.
    /// </summary>
    [Range(2, 288)]
    public int MaxPeople { get; set; } = 100;
}
