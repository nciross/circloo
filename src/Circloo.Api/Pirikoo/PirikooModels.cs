namespace Circloo.Api.Pirikoo;

/// <summary>One earlier turn of the conversation, kept by the browser (the server stores no conversation).</summary>
public sealed record PirikooTurn(string? Role, string? Text);

/// <summary>A question to Pirikoo. <see cref="CircleId"/> is only a hint: circle facts are read server side after a membership check.</summary>
public sealed record PirikooRequest(string? Message, PirikooTurn[]? History, string? Lang, string? Page, Guid? CircleId);

/// <summary>What Pirikoo knows about where the person is, resolved by the server.</summary>
public sealed record PirikooContext(
    string Lang,
    string Page,
    string Who,
    string? CircleName,
    string? Role,
    string? ActivityId,
    int People,
    int Online,
    IReadOnlyList<(string Column, string Text, int Votes)> Board);

/// <summary>One server-sent event of a streamed reply: <c>delta</c>, <c>done</c> or <c>error</c>.</summary>
public sealed record PirikooEvent(string T, string? Text = null, string? Code = null, bool Replaced = false);

public static class PirikooRules
{
    public const int MessageMax = 600;
    public const int TurnMax = 1500;
    public const int HistoryMax = 12;
    public const string Purpose = "pirikoo";
    public static readonly string[] Pages = ["home", "icebreakers", "circle", "create", "integrations", "settings", "other"];

    /// <summary>Plain text with line breaks allowed; no other control or bidi override characters.</summary>
    public static string? CleanMultiline(string? value, int max)
    {
        var text = (value ?? "").Replace("\r\n", "\n", StringComparison.Ordinal).Trim();
        if (text.Length == 0 || text.Length > max)
        {
            return null;
        }
        foreach (var c in text)
        {
            if ((char.IsControl(c) && c != '\n') || Circles.TextRules.IsBidiControl(c))
            {
                return null;
            }
        }
        return text;
    }
}
