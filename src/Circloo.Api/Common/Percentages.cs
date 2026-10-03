namespace Circloo.Api.Common;

/// <summary>Whole percentages that add up to exactly 100 (spec 006 results, spec 007 SC-704).</summary>
public static class Percentages
{
    /// <summary>
    /// Largest remainder: each share is rounded down, then the points left go to the largest remainders, earlier
    /// entries first on a tie. No answers gives all zeros.
    /// </summary>
    public static int[] Of(IReadOnlyList<int> counts)
    {
        var total = counts.Sum();
        var result = new int[counts.Count];
        if (total == 0)
        {
            return result;
        }
        var remainders = new (double Remainder, int Index)[counts.Count];
        var given = 0;
        for (var i = 0; i < counts.Count; i++)
        {
            var exact = counts[i] * 100.0 / total;
            result[i] = (int)Math.Floor(exact);
            given += result[i];
            remainders[i] = (exact - result[i], i);
        }
        foreach (var (_, index) in remainders.OrderByDescending(r => r.Remainder).ThenBy(r => r.Index).Take(100 - given))
        {
            result[index]++;
        }
        return result;
    }
}
