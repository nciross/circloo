using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Circloo.Api.Ai;

/// <summary>
/// Local, deterministic safety layer around any model (FR-105/106). It complements the model prompt and the
/// Microsoft Foundry content filters; it never relies on them.
/// </summary>
public sealed partial class SafetyPolicy
{
    // Harmful in any spark (theme or output), per language, matched on normalized words/prefixes.
    private static readonly string[] Harmful =
    [
        // en
        "sex", "porn", "nude", "naked", "kill", "murder", "suicide", "drunk", "cocaine", "heroin", "weed", "gun", "bomb", "terroris",
        "stupid", "idiot", "ugly", "loser", "hate",
        // fr
        "sexe", "porno", "nu ", "tuer", "meurtre", "suicid", "ivre", "drogue", "cocaine", "arme", "bombe", "terroris", "debile", "idiot", "moche", "connard",
        // es
        "sexo", "desnud", "matar", "asesin", "suicid", "borrach", "droga", "cocaina", "pistola", "bomba", "terroris", "estupid", "idiota", "feo ", "imbecil",
        // ar
        "جنس", "اباحي", "عاري", "قتل", "انتحار", "سكران", "مخدر", "كوكايين", "مسدس", "قنبلة", "ارهاب", "غبي", "احمق", "قبيح",
    ];

    // Topics jokes must never be about (PRODUCT.md): fine in a respectful question, refused in a joke.
    private static readonly string[] JokeTaboo =
    [
        "god", "allah", "jesus", "church", "mosque", "synagogue", "muslim", "christian", "jewish", "religion", "priest", "imam", "rabbi",
        "politic", "president", "election", "immigrant", "blonde", "women are", "men are",
        "dieu", "eglise", "mosquee", "musulman", "chretien", "juif", "religion", "pretre", "politique", "president", "immigre", "les femmes", "les hommes",
        "dios", "iglesia", "mezquita", "musulman", "cristiano", "judio", "religion", "cura", "politic", "presidente", "inmigrante", "las mujeres", "los hombres",
        "الله", "مسجد", "كنيسة", "مسلم", "مسيحي", "يهودي", "دين", "شيخ", "سياس", "رئيس", "مهاجر", "النساء", "الرجال",
    ];

    private static readonly string[] InjectionMarkers =
    [
        "ignore", "instruction", "system prompt", "previous", "disregard", "jailbreak", "you are now", "act as", "assistant",
        "ignora", "instrucc", "consigne", "oublie", "تجاهل", "تعليمات",
    ];

    [GeneratedRegex(@"[^\s@]+@[^\s@]+\.[^\s@]+|https?://|www\.|\d[\d\s().-]{6,}\d", RegexOptions.IgnoreCase)]
    private static partial Regex PersonalData();

    [GeneratedRegex(@"[<>{}`]|```")]
    private static partial Regex Markup();

    public static string Normalize(string text)
    {
        var decomposed = text.ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length + 2).Append(' ');
        foreach (var c in decomposed)
        {
            var cat = CharUnicodeInfo.GetUnicodeCategory(c);
            // Drop Latin accents and Arabic diacritics (harakat) so variants match the lists.
            if (cat is UnicodeCategory.NonSpacingMark)
            {
                continue;
            }
            sb.Append(c switch
            {
                'أ' or 'إ' or 'آ' => 'ا',
                'ة' => 'ه',
                'ى' => 'ي',
                _ when !char.IsLetterOrDigit(c) => ' ',
                _ => c,
            });
        }
        return sb.Append(' ').ToString().Normalize(NormalizationForm.FormC);
    }

    private sealed record Term(string Core, bool Arabic, bool WholeWord);

    private static Term[] Prepare(string[] terms) =>
        terms.Select(t => (Raw: t, Core: Normalize(t).Trim()))
            .Where(x => x.Core.Length > 0)
            .Select(x => new Term(x.Core, x.Core.Any(IsArabic), x.Raw.EndsWith(' ')))
            .ToArray();

    private static readonly Term[] HarmfulTerms = Prepare(Harmful);
    private static readonly Term[] JokeTabooTerms = Prepare(JokeTaboo);
    private static readonly Term[] InjectionTerms = Prepare(InjectionMarkers);

    /// <summary>Latin terms match at a word start (prefix) or as a whole word; Arabic terms match anywhere, since Arabic attaches prefixes (و، ب، ال).</summary>
    private static bool ContainsAny(string normalized, Term[] terms) =>
        terms.Any(t => t.Arabic
            ? normalized.Contains(t.Core, StringComparison.Ordinal)
            : normalized.Contains(t.WholeWord ? $" {t.Core} " : $" {t.Core}", StringComparison.Ordinal));

    /// <summary>Refuses unsafe themes before any model call, so they cost nothing and never reach a model.</summary>
    public bool IsThemeSafe(string? theme)
    {
        if (string.IsNullOrWhiteSpace(theme))
        {
            return true;
        }
        if (theme.Any(char.IsControl) || Markup().IsMatch(theme) || PersonalData().IsMatch(theme))
        {
            return false;
        }
        var n = Normalize(theme);
        return !ContainsAny(n, HarmfulTerms) && !ContainsAny(n, InjectionTerms);
    }

    /// <summary>Checks one generated item: script matches the language, lengths, no harmful content, no personal data.</summary>
    public bool IsOutputSafe(GeneratedItem item, string lang, string requestedKind)
    {
        if (item.Kind != requestedKind || string.IsNullOrWhiteSpace(item.Text) || item.Text.Length > Sparks.SparkKinds.MaxTextLength)
        {
            return false;
        }
        if (item.Kind == "riddle" ? string.IsNullOrWhiteSpace(item.Answer) || item.Answer.Length > Sparks.SparkKinds.MaxAnswerLength : item.Answer is not null && item.Answer.Length > 0)
        {
            return false;
        }
        var all = item.Text + " " + item.Answer;
        if (PersonalData().IsMatch(all) || Markup().IsMatch(all) || !ScriptMatches(item.Text, lang))
        {
            return false;
        }
        var n = Normalize(all);
        return !ContainsAny(n, HarmfulTerms) && !(item.Kind == "joke" && ContainsAny(n, JokeTabooTerms));
    }

    private static bool IsArabic(char c) => c is >= '\u0600' and <= '\u06FF';

    private static bool ScriptMatches(string text, string lang)
    {
        var letters = text.Where(char.IsLetter).ToArray();
        if (letters.Length == 0)
        {
            return false;
        }
        var arabic = letters.Count(IsArabic);
        return lang == "ar" ? arabic * 2 >= letters.Length : arabic == 0;
    }
}

/// <summary>One generation in flight per member: double taps never double-spend (spec edge case).</summary>
public sealed class InFlightGate
{
    private readonly System.Collections.Concurrent.ConcurrentDictionary<Guid, byte> _running = new();

    public bool TryEnter(Guid userId) => _running.TryAdd(userId, 0);

    public void Exit(Guid userId) => _running.TryRemove(userId, out _);
}
