using System.Security.Cryptography;
using Circloo.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Circles;

public static class Roles
{
    public const string Animator = "animator";
    public const string Participant = "participant";
}

/// <summary>The characters participants pick from (spec 003 US2, 49 since #205; build-your-own ids are accepted too). Ids match the web cast.</summary>
public static class Characters
{
    /// <summary>How many people may share one character, each with their own ring 0–5 (spec 008 FR-803).</summary>
    public const int RingsInUse = 6;

    /// <summary>The most people a circle can hold: the configured maximum, never more than character/ring pairs.</summary>
    public static int Capacity(int maxPeople) => Math.Min(maxPeople, All.Length * RingsInUse);

    public static readonly string[] All =
    [
        "panda", "fox", "frog", "cat", "owl", "octopus", "bear", "bunny", "robot", "ghost", "chick", "dino",
        "penguin", "lion", "koala", "hamster", "whale", "hedgehog", "monkey", "bee", "cactus", "axolotl", "raccoon", "llama",
        // Heroes
        "superhero", "ninja", "knight", "wizard", "pirate", "astronaut", "viking", "detective",
        // Plants
        "sunflower", "mushroom", "tulip", "sprout", "pumpkin", "cherry", "pineapple", "tree",
        // Other friends
        "alien", "unicorn", "dragon", "snowman", "cloud", "sun", "moon", "star",
        // For people who prefer not to be seen
        "anonymous",
    ];
    public static bool IsKnown(string? id) => id is not null && (All.Contains(id) || Avatars.IsValid(id));
}

/// <summary>
/// Build-your-own characters (#205): "me:" and one digit per option (face, skin, hair, hair colour, beard, glasses, outfit,
/// mouth). Ids are short so they fit the Character column; keep the counts in step with the web (components/avatarCode.ts).
/// </summary>
public static class Avatars
{
    private const string Prefix = "me:";
    private static readonly int[] Counts = [4, 6, 9, 8, 5, 4, 8, 4];

    public static bool IsValid(string? id)
    {
        if (id is null || id.Length != Prefix.Length + Counts.Length || !id.StartsWith(Prefix, StringComparison.Ordinal))
        {
            return false;
        }
        for (var i = 0; i < Counts.Length; i++)
        {
            var d = id[Prefix.Length + i] - '0';
            if (d < 0 || d >= Counts[i])
            {
                return false;
            }
        }
        return true;
    }
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

    /// <param name="keepLines">Multi-line text (a long answer): line breaks are kept, as <c>\n</c>.</param>
    public static string? Clean(string? value, int max, bool keepLines = false)
    {
        var text = (value ?? "").Trim();
        if (keepLines)
        {
            text = text.ReplaceLineEndings("\n");
        }
        if (text.Length == 0 || text.Length > max || text.Any(c => (char.IsControl(c) && !(keepLines && c == '\n')) || IsBidiControl(c)))
        {
            return null;
        }
        return text;
    }

    /// <summary>
    /// <see cref="Clean"/> for typed text: LRM, RLM and ALM are ordinary when typing Arabic, so they are dropped rather
    /// than refused; overrides and isolates (which can spoof text) are still refused.
    /// </summary>
    public static string? CleanTyped(string? value, int max, bool keepLines = false) =>
        Clean(value is null ? null : new string([.. value.Where(c => c is not ((char)0x200E or (char)0x200F or (char)0x061C))]), max, keepLines);

    /// <summary>Directional overrides and isolates let a name visually spoof another (e.g. U+202E).</summary>
    public static bool IsBidiControl(char c) =>
        c is '‎' or '‏' or '؜' || (c >= '‪' && c <= '‮') || (c >= '⁦' && c <= '⁩');
}

/// <summary>A person in a circle; <see cref="Ring"/> tells apart people sharing a character (spec 008).</summary>
public sealed record MemberDto(Guid Id, string Role, string Name, string Character, int Ring = 0)
{
    public static MemberDto From(CircleMember m) => new(m.Id, m.Role, m.Name, m.Character, m.Ring);
}

/// <summary>
/// A chat message (spec 003), with its likes and whether the reader liked it (spec 008). <see cref="Hidden"/> is only
/// ever true in the animator's view: members never receive hidden messages.
/// </summary>
public sealed record MessageDto(long Id, string? ActivityId, Guid? MemberId, string Kind, string Text, DateTimeOffset At,
    int Likes = 0, bool Liked = false, bool Hidden = false, long? ReplyToId = null)
{
    /// <param name="likes">Counted from the likes when read, so a deleted account never leaves a stale count.</param>
    public static MessageDto From(CircleMessage m, int likes = 0, bool liked = false) =>
        new(m.Id, m.ActivityId, m.MemberId, m.Kind, m.Text, m.CreatedAt, likes, liked, m.HiddenAt is not null, m.ReplyToId);
}

/// <summary>The live room's switches (spec 008, contracts/hub.md <c>RoomSettings</c>).</summary>
public sealed record RoomSettings(string Chat, bool Reactions, bool PirikooQuiet)
{
    public static RoomSettings Of(Circle c) => new(c.ChatMode, c.ReactionsOn, c.PirikooQuiet);

    /// <summary>What a room starts with, and goes back to when the activity changes.</summary>
    public static readonly RoomSettings Default = new(RoomChatModes.Open, true, false);
}

/// <summary>One raised hand in the queue (member id only: names come from the member list).</summary>
public sealed record HandView(Guid MemberId, DateTimeOffset RaisedAt);

/// <summary>The raised hands, oldest first, and who has the floor (spec 008, contracts/hub.md <c>HandsView</c>).</summary>
public sealed record HandsView(IReadOnlyList<HandView> Queue, Guid? Floor)
{
    public static readonly HandsView Empty = new([], null);
}

/// <summary>
/// A grouped burst of reactions: how many of each kind, never who sent them (spec 008, contracts/hub.md
/// <c>ReactionBurst</c>). Sent as a plain <c>{ "clap": 12, "heart": 3 }</c> object; kinds with no reaction are left out.
/// </summary>
public sealed class ReactionBurst : Dictionary<string, int>
{
    public ReactionBurst() : base(StringComparer.Ordinal) { }
}

/// <summary>The emoji reactions a room can send (spec 008 FR-815), and their per-presentation totals (FR-818).</summary>
public static class ReactionKinds
{
    public static readonly string[] All = ["clap", "heart", "laugh", "wow", "like", "party"];

    /// <summary>The emoji of each kind, in <see cref="All"/>'s order, for reports. The web draws its own.</summary>
    public static readonly string[] Emoji = ["👏", "❤️", "😂", "😮", "👍", "🎉"];

    public static bool IsValid(string? kind) => kind is not null && All.Contains(kind);

    /// <summary>
    /// A session's stored totals (<c>PresentationSession.ReactionTotals</c>), known kinds only, in <see cref="All"/>'s
    /// order, without zeros. A broken value reads as no reactions.
    /// </summary>
    public static ReactionBurst Totals(string? json)
    {
        var totals = new ReactionBurst();
        if (string.IsNullOrWhiteSpace(json))
        {
            return totals;
        }
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object)
            {
                return totals;
            }
            foreach (var kind in All)
            {
                if (doc.RootElement.TryGetProperty(kind, out var n) && n.ValueKind == System.Text.Json.JsonValueKind.Number && n.TryGetInt32(out var count) && count > 0)
                {
                    totals[kind] = count;
                }
            }
        }
        catch (System.Text.Json.JsonException)
        {
        }
        return totals;
    }

    /// <summary>"👏 42 · ❤️ 18 · 😂 9": the counts in <see cref="All"/>'s order; empty when there are none.</summary>
    public static string Line(IReadOnlyDictionary<string, int> totals) =>
        string.Join(" · ", All.Select((kind, i) => (Emoji: Emoji[i], Count: totals.GetValueOrDefault(kind)))
            .Where(k => k.Count > 0).Select(k => $"{k.Emoji} {k.Count.ToString(System.Globalization.CultureInfo.InvariantCulture)}"));
}

public sealed record CanvasNoteDto(long Id, string ActivityId, string Text, double X, double Y, string Color, string Size, string Shape, string? Sticker, Guid AuthorId)
{
    public static CanvasNoteDto From(CanvasNote n) => new(n.Id, n.ActivityId, n.Text, n.X, n.Y, n.Color, n.Size, n.Shape, n.Sticker, n.AuthorMemberId);
}

public sealed record BoardNoteDto(long Id, string ActivityId, string Column, string Text, string Color, Guid AuthorId, Guid[] Voters)
{
    public static BoardNoteDto From(BoardNote n) =>
        new(n.Id, n.ActivityId, n.Column, n.Text, n.Color, n.AuthorMemberId, [.. n.Votes.Select(v => v.MemberId)]);
}

/// <summary>Raised hands as everyone sees them: the queue oldest first, and who has the floor (spec 008 US5).</summary>
public static class Hands
{
    public static HandsView View(IEnumerable<RaisedHand> hands)
    {
        var all = hands.OrderBy(h => h.RaisedAt).ThenBy(h => h.Id).ToList();
        return new HandsView([.. all.Where(h => !h.HasFloor).Select(h => new HandView(h.MemberId, h.RaisedAt))], all.FirstOrDefault(h => h.HasFloor)?.MemberId);
    }

    /// <summary>The circle's hands as stored now; only people still in the circle count.</summary>
    public static async Task<HandsView> LoadAsync(CirclooDbContext db, Guid circleId, CancellationToken ct = default) =>
        View(await db.RaisedHands.AsNoTracking()
            .Where(h => h.CircleId == circleId && db.CircleMembers.Any(m => m.Id == h.MemberId && m.LeftAt == null))
            .ToListAsync(ct));
}

/// <summary>Which copies of a character are taken and which rings are still free (spec 008 FR-803/805).</summary>
public static class Rings
{
    public static CharacterUse Use(string character, IEnumerable<int> taken)
    {
        var used = taken.ToHashSet();
        return new CharacterUse(character, used.Count, [.. Enumerable.Range(0, Characters.RingsInUse).Where(r => !used.Contains(r))]);
    }
}
