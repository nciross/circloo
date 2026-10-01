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
    // A trailing space marks a whole word: "kill " refuses "kill" but not "killer whale"; everyday words such as
    // "hate" ("which chore do you hate?") or "ugly" ("ugly sweater party") are deliberately absent.
    private static readonly string[] Harmful =
    [
        // en
        "sex", "porn", "nude", "naked", "kill ", "killing", "murder", "suicide", "drunk", "cocaine", "heroin", "weed", "gun ", "guns ", "bomb", "terroris",
        "stupid", "idiot", "loser",
        // fr
        "sexe", "porno", "nu ", "tuer", "meurtre", "suicid", "ivre", "drogue", "cocaine", "arme", "bombe", "terroris", "debile", "idiot", "moche", "connard",
        // es
        "sexo", "desnud", "matar", "asesin", "suicid", "borrach", "droga", "cocaina", "pistola", "bomba", "terroris", "estupid", "idiota", "feo ", "imbecil",
        // ar
        "جنس ", "اباحي", "عاري", "قتل", "انتحار", "سكران", "مخدر", "كوكايين", "مسدس", "قنبلة", "ارهاب", "غبي", "احمق", "قبيح",
    ];

    // Topics humour must never be about (PRODUCT.md, spec FR-106): religion, politics, nationality, ethnicity, gender
    // and sexuality. Fine in a respectful question; refused as a joke or riddle theme and in joke or riddle output.
    private static readonly string[] JokeTaboo =
    [
        "god ", "gods ", "allah", "jesus", "church", "mosque", "synagogue", "muslim", "christian", "jew ", "jews ", "jewish", "religio", "priest", "imam", "rabbi",
        "politic", "president", "election", "immigrant", "refugee", "blonde", "women are", "men are", "gay", "lesbian", "trans ",
        "french", "arab", "mexican", "asian", "african", "chinese", "indian", "black people", "white people", "race ", "ethnic", "nationalit",
        "dieu", "eglise", "mosquee", "musulman", "chretien", "juif", "juive", "religio", "pretre", "politique", "president", "immigre", "refugie",
        "les femmes", "les hommes", "homosexuel", "francais", "arabe", "mexicain", "asiatique", "africain", "chinois", "les noirs", "les blancs", "ethni",
        "dios", "iglesia", "mezquita", "musulman", "cristiano", "judio", "religio", "cura ", "presidente", "inmigrante", "refugiad",
        "las mujeres", "los hombres", "homosexual", "frances", "mexicano", "asiatico", "africano", "chino", "los negros", "gitano", "etnia",
        "الله", "مسجد", "كنيسه", "مسلم", "مسيحي", "يهود", "دين ", "اديان", "سياس", "رئيس", "انتخاب", "مهاجر", "لاجئ", "النساء", "الرجال",
        "عرب", "افارقه", "افريقي", "صيني", "فرنسي", "مكسيكي", "عنصري",
    ];

    // Arabic attaches clitics and verb prefixes to the front of a word ("والمدينة", "بالدين", "سأقتل"); a term matches at a
    // word start after any of them, never inside another word ("دين" must not match "مدينة").
    private static readonly string[] ArabicProclitics =
        ["", "ال", "و", "ف", "ب", "ل", "ك", "وال", "فال", "بال", "كال", "لل", "ولل", "س", "سا", "سي", "ست", "سن", "ي", "ت", "ن", "ا", "وي", "وت", "ون", "فا"];

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

    /// <summary>Terms match at a word start (prefix) or, when marked, as a whole word. Arabic terms may follow a proclitic.</summary>
    private static bool ContainsAny(string normalized, Term[] terms) =>
        terms.Any(t => t.Arabic
            ? ArabicProclitics.Any(p => normalized.Contains(t.WholeWord ? $" {p}{t.Core} " : $" {p}{t.Core}", StringComparison.Ordinal))
            : normalized.Contains(t.WholeWord ? $" {t.Core} " : $" {t.Core}", StringComparison.Ordinal));

    /// <summary>Kinds that are humour: their themes and output must stay off the taboo topics.</summary>
    public static bool IsHumour(string? kind) => kind is "joke" or "riddle";

    /// <summary>Refuses unsafe themes before any model call, so they cost nothing and never reach a model.</summary>
    public bool IsThemeSafe(string? theme, string? kind = null)
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
        return !ContainsAny(n, HarmfulTerms) && !ContainsAny(n, InjectionTerms) && !(IsHumour(kind) && ContainsAny(n, JokeTabooTerms));
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
        return !ContainsAny(n, HarmfulTerms) && !(IsHumour(item.Kind) && ContainsAny(n, JokeTabooTerms));
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
