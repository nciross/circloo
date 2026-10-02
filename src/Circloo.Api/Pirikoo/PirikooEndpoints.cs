using System.Text.Json;
using System.Text.Json.Serialization;
using Circloo.Api.Ai;
using Circloo.Api.Auth;
using Circloo.Api.Circles;
using Circloo.Api.Security;

namespace Circloo.Api.Pirikoo;

public static class PirikooEndpoints
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingDefault };

    /// <summary>
    /// POST /api/pirikoo/chat streams the reply as server-sent events in the response to this POST. The browser reads it
    /// with fetch, so cookies and the CSRF header apply as for any other call. Open to members and circle guests.
    /// No conversation is stored: the browser sends the last turns with each question.
    /// </summary>
    public static RouteGroupBuilder MapPirikooEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/pirikoo/chat", async (PirikooRequest body, HttpContext ctx, PirikooGuide guide, SafetyPolicy safety, CancellationToken ct) =>
        {
            var errors = Validate(body, out var message, out var history);
            if (errors.Count > 0)
            {
                return Results.ValidationProblem(errors);
            }
            if (PirikooGuide.Payer(ctx.User) is not { } payer)
            {
                return Results.Unauthorized();
            }
            var lang = Locales.Normalize(body.Lang);
            var page = PirikooRules.Pages.Contains(body.Page) ? body.Page! : "other";
            var context = await guide.ContextAsync(ctx.User, lang, page, body.CircleId, ct);

            var res = ctx.Response;
            res.ContentType = "text/event-stream";
            res.Headers.CacheControl = "no-cache, no-store";
            res.Headers["X-Accel-Buffering"] = "no";
            async Task Send(PirikooEvent e)
            {
                await res.WriteAsync($"data: {JsonSerializer.Serialize(e, Json)}\n\n", ct);
                await res.Body.FlushAsync(ct);
            }

            if (!safety.IsQuestionSafe(message) || history.Any(t => !safety.IsQuestionSafe(t.Text)))
            {
                await guide.RecordAsync(payer.Id, "refused", 0, ct);
                await Send(new PirikooEvent("error", Code: "unsafe"));
                return Results.Empty;
            }
            if (await guide.RemainingAsync(payer.Id, payer.Guest, ct) <= 0)
            {
                await guide.RecordAsync(payer.Id, "limited", 0, ct);
                await Send(new PirikooEvent("error", Code: "limited"));
                return Results.Empty;
            }

            var watch = PirikooGuide.Watch();
            string text;
            try
            {
                text = (await guide.ReplyAsync(context, history, message, d => Send(new PirikooEvent("delta", d)), ct)).Trim();
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                // The person stopped the answer or left. The model may have worked anyway, so it counts like a failure.
                await guide.RecordAsync(payer.Id, "failed", (int)watch.ElapsedMilliseconds, CancellationToken.None);
                return Results.Empty;
            }
            catch (Exception e)
            {
                PirikooGuide.LogFailed(guide.Log, e);
                await guide.RecordAsync(payer.Id, "failed", (int)watch.ElapsedMilliseconds, CancellationToken.None);
                await Send(new PirikooEvent("error", Code: "failed"));
                return Results.Empty;
            }
            if (text.Length == 0)
            {
                await guide.RecordAsync(payer.Id, "failed", (int)watch.ElapsedMilliseconds, ct);
                await Send(new PirikooEvent("error", Code: "failed"));
                return Results.Empty;
            }
            var ok = safety.IsReplySafe(text);
            await guide.RecordAsync(payer.Id, ok ? "ok" : "failed", (int)watch.ElapsedMilliseconds, ct);
            // If the streamed words turn out to be unsafe, a kind line replaces them on screen.
            await Send(new PirikooEvent("done", ok ? text : CirclooCoach.Line(lang, "unsafe"), Replaced: !ok));
            return Results.Empty;
        }).RequireAuthorization(SessionAuthentication.CircleMemberPolicy).RequireRateLimiting(RateLimits.Ai);

        return api;
    }

    internal static Dictionary<string, string[]> Validate(PirikooRequest body, out string message, out List<(string Role, string Text)> history)
    {
        var errors = new Dictionary<string, string[]>();
        message = PirikooRules.CleanMultiline(body.Message, PirikooRules.MessageMax) ?? "";
        if (message.Length == 0)
        {
            errors["message"] = [$"Write 1 to {PirikooRules.MessageMax} characters of plain text."];
        }
        history = [];
        var turns = body.History ?? [];
        if (turns.Length > PirikooRules.HistoryMax)
        {
            errors["history"] = [$"Send at most {PirikooRules.HistoryMax} earlier turns."];
            return errors;
        }
        foreach (var turn in turns)
        {
            var text = PirikooRules.CleanMultiline(turn.Text, PirikooRules.TurnMax);
            if (turn.Role is not ("user" or "pirikoo") || text is null)
            {
                errors["history"] = [$"Each earlier turn needs a role (user or pirikoo) and 1 to {PirikooRules.TurnMax} characters."];
                break;
            }
            history.Add((turn.Role, text));
        }
        return errors;
    }
}
