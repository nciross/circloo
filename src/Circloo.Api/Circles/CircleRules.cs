using System.Security.Cryptography;
using Circloo.Api.Data;

namespace Circloo.Api.Circles;

public static class Roles
{
    public const string Animator = "animator";
    public const string Participant = "participant";
}

/// <summary>The twelve characters participants pick from (spec 003 US2). Ids match the web cast.</summary>
public static class Characters
{
    public static readonly string[] All = ["panda", "fox", "frog", "cat", "owl", "octopus", "bear", "bunny", "robot", "ghost", "chick", "dino"];
    public static bool IsKnown(string? id) => id is not null && All.Contains(id);
}

/// <summary>Join codes: 10 Crockford base32 symbols (50 bits), shown as XXXXX-XXXXX, forgiving when typed.</summary>
public static class JoinCodes
{
    private const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    public const int Length = 10;

    public static string New()
    {
        Span<char> code = stackalloc char[Length];
        for (var i = 0; i < Length; i++)
        {
            code[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        }
        return new string(code);
    }

    /// <summary>Uppercases, drops separators and maps look-alikes (O→0, I/L→1); null when it cannot be a code.</summary>
    public static string? Normalize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input) || input.Length > 24)
        {
            return null;
        }
        var chars = new List<char>(Length);
        foreach (var raw in input.ToUpperInvariant())
        {
            if (raw is '-' or ' ')
            {
                continue;
            }
            var c = raw switch { 'O' => '0', 'I' or 'L' => '1', _ => raw };
            if (!Alphabet.Contains(c))
            {
                return null;
            }
            chars.Add(c);
        }
        return chars.Count == Length ? new string([.. chars]) : null;
    }

    public static string Display(string code) => $"{code[..5]}-{code[5..]}";
}

/// <summary>Plain-text rules shared by names and messages: trimmed, bounded, no control or bidi override characters.</summary>
public static class TextRules
{
    public const int NameMax = 24;
    public const int CircleNameMax = 60;
    public const int MessageMax = 280;
    public const int AskMax = 400;

    public static string? Clean(string? value, int max)
    {
        var text = (value ?? "").Trim();
        if (text.Length == 0 || text.Length > max || text.Any(c => char.IsControl(c) || IsBidiControl(c)))
        {
            return null;
        }
        return text;
    }

    /// <summary>Directional overrides and isolates let a name visually spoof another (e.g. U+202E).</summary>
    public static bool IsBidiControl(char c) =>
        c is '‎' or '‏' or '؜' || (c >= '‪' && c <= '‮') || (c >= '⁦' && c <= '⁩');
}

public sealed record MemberDto(Guid Id, string Role, string Name, string Character)
{
    public static MemberDto From(CircleMember m) => new(m.Id, m.Role, m.Name, m.Character);
}

public sealed record MessageDto(long Id, string? ActivityId, Guid? MemberId, string Kind, string Text, DateTimeOffset At)
{
    public static MessageDto From(CircleMessage m) => new(m.Id, m.ActivityId, m.MemberId, m.Kind, m.Text, m.CreatedAt);
}

public sealed record BoardNoteDto(long Id, string ActivityId, string Column, string Text, string Color, Guid AuthorId, Guid[] Voters)
{
    public static BoardNoteDto From(BoardNote n) =>
        new(n.Id, n.ActivityId, n.Column, n.Text, n.Color, n.AuthorMemberId, [.. n.Votes.Select(v => v.MemberId)]);
}
