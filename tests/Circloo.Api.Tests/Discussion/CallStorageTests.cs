using System.Net.Http.Json;
using System.Text.Json;
using Circloo.Api.Circles;
using Circloo.Api.Discussion;
using Circloo.Api.Tests.Infrastructure;
using Circloo.Api.Tests.LiveRoom;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Circloo.Api.Tests.Discussion;

/// <summary>
/// Issue #268 (T928), spec 009 SC-906: after a full call with switches, floor, mutes, removals and reactions, the
/// database holds no row about the call but the chat line and the audited switch changes, removals and refusals. Every
/// table is compared before and after (<see cref="TableSnapshot"/>), and the server's logs never carry the chat's words.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class CallStorageTests(PostgresFixture pg) : IAsyncLifetime
{
    private const string Line = "Merci pour l'appel, à jeudi";

    private static readonly CallRights Everything = new(true, true);
    private static readonly CallRights CameraOnly = new(false, true);

    /// <summary>What a call may write (contracts/hub.md, privacy rules): the switches, the mode, removals and refusals.</summary>
    private static readonly string[] CallAudits = ["call.mode", "call.removed", "discussion.off", "discussion.on", "discussion.refused"];

    private readonly FakeLiveKitRooms _rooms = new();
    private readonly CapturingLoggerProvider _logs = new();
    private readonly List<HubConnection> _open = [];
    private ApiFactory _factory = null!;
    private DiscussionHost _host = null!;

    private sealed record Person(Guid Id, HttpClient Http, HubConnection Hub);

    public Task InitializeAsync()
    {
        _factory = new ApiFactory(pg.Container.GetConnectionString(), FakeLiveKitRooms.Settings())
        {
            Configure = b =>
            {
                _rooms.Install(b);
                // At the levels the API ships with (appsettings.json), as production writes them.
                b.ConfigureLogging(l => l.AddProvider(_logs));
            },
        };
        _host = new DiscussionHost(_factory);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        foreach (var hub in _open)
        {
            await hub.DisposeAsync();
        }
        await _factory.DisposeAsync();
    }

    private async Task<HubConnection> EnterAsync(CookieContainerHandler cookies, Guid circleId)
    {
        var hub = _host.Room.Hub(cookies);
        await hub.StartAsync();
        _open.Add(hub);
        await hub.InvokeAsync<Guid[]>("Enter", circleId);
        return hub;
    }

    private async Task<Person> GuestAsync(Guid circleId, string code, string name, string character)
    {
        var (res, http, cookies) = await _host.Room.JoinAsync(code, name, character);
        res.EnsureSuccessStatusCode();
        var id = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("memberId").GetGuid();
        return new Person(id, http, await EnterAsync(cookies, circleId));
    }

    private static async Task PassAsync(HttpClient http, Guid circleId)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, $"/api/circles/{circleId}/call/token");
        req.Headers.Add("X-XSRF-TOKEN", await http.CsrfAsync());
        (await http.SendAsync(req)).EnsureSuccessStatusCode();
    }

    private static string Text(JsonElement row, string column) => row.GetProperty(column).ToString();

    [Fact]
    public async Task A_full_call_leaves_every_table_as_it_was_but_the_chat_line_and_the_audited_changes()
    {
        var circle = await _host.Room.CircleAsync();
        var room = CallRules.RoomName(circle.Id);
        var animator = await EnterAsync(circle.Cookies, circle.Id);
        var ana = await GuestAsync(circle.Id, circle.Code, "Ana", "fox");
        var ben = await GuestAsync(circle.Id, circle.Code, "Ben", "owl");
        var before = await TableSnapshot.TakeAsync(pg.Container.GetConnectionString());

        // A video call in Hand to speak; everyone takes a pass and joins the call server.
        await animator.InvokeAsync("EnableDiscussion", true, "hand");
        await PassAsync(circle.Http, circle.Id);
        await PassAsync(ana.Http, circle.Id);
        await PassAsync(ben.Http, circle.Id);
        _rooms.Join(room, ana.Id, CameraOnly, new CallTrack("TR_ana_cam", CallRights.CameraSource, false));
        _rooms.Join(room, ben.Id, CameraOnly, new CallTrack("TR_ben_cam", CallRights.CameraSource, false));

        // Hands and the floor; Ana speaks, is muted and allowed again; Ben's camera is stopped and allowed again.
        await ana.Hub.InvokeAsync("RaiseHand");
        await ben.Hub.InvokeAsync("RaiseHand");
        await animator.InvokeAsync("GiveFloor", ana.Id);
        _rooms.Join(room, ana.Id, Everything, new CallTrack("TR_ana_mic", CallRights.MicrophoneSource, false), new CallTrack("TR_ana_cam", CallRights.CameraSource, false));
        await animator.InvokeAsync("MuteMember", ana.Id, "microphone");
        await animator.InvokeAsync("AllowMember", ana.Id, "microphone");
        await animator.InvokeAsync("MuteMember", ben.Id, "camera");
        await animator.InvokeAsync("AllowMember", ben.Id, "camera");
        await animator.InvokeAsync("GiveFloor", ben.Id);
        await ben.Hub.InvokeAsync("LowerHand", (Guid?)null);

        // Open mic and Mute everyone, back to Hand to speak; video off and on again.
        await animator.InvokeAsync("SetSpeakingMode", "open");
        await animator.InvokeAsync("MuteEveryone");
        await animator.InvokeAsync("SetSpeakingMode", "hand");
        await animator.InvokeAsync("EnableDiscussion", false, "hand");
        await animator.InvokeAsync("EnableDiscussion", true, "hand");

        // Ben is removed and allowed back; he tries an animator's action and is refused.
        await animator.InvokeAsync("RemoveFromCall", ben.Id);
        await animator.InvokeAsync("AllowBack", ben.Id);
        await Assert.ThrowsAsync<HubException>(() => ben.Hub.InvokeAsync("MuteMember", ana.Id, "camera"));

        // Everyone reacts, and one line goes to the chat. Then the call ends.
        await Task.WhenAll(ana.Hub.InvokeAsync("React", "clap"), ben.Hub.InvokeAsync("React", "party"), animator.InvokeAsync("React", "heart"));
        await RoomHost.UntilAsync(() => _factory.Services.GetRequiredService<ReactionBuffer>().Waiting == 0, "the reactions to flush");
        await ana.Hub.InvokeAsync("Say", Line);
        await animator.InvokeAsync("DisableDiscussion");

        var changes = before.ChangesTo(await TableSnapshot.TakeAsync(pg.Container.GetConnectionString()));

        // Only two tables changed, and only by new rows.
        Assert.Equal(new[] { "AuditEvents", "CircleMessages" }, changes.Keys);
        Assert.All(changes.Values, c => Assert.Empty(c.Removed));

        // The chat line, as Ana wrote it: nothing about the call, no hand, no reaction became a message.
        var message = Assert.Single(changes["CircleMessages"].Added);
        Assert.Equal(("member", Line, ana.Id.ToString()), (Text(message, "Kind"), Text(message, "Text"), Text(message, "MemberId")));

        // The audit: the switches, the mode, the removal and the refusal, about this circle, with no words and no emoji.
        var audits = changes["AuditEvents"].Added;
        Assert.Equal(CallAudits, audits.Select(a => Text(a, "Type")).Distinct().Order());
        Assert.All(audits, a => Assert.Contains(circle.Id.ToString(), Text(a, "Detail"), StringComparison.Ordinal));
        Assert.All(audits, a => Assert.DoesNotContain("à jeudi", a.GetRawText(), StringComparison.Ordinal));
        Assert.All(audits, a => Assert.DoesNotMatch("clap|party|heart|👏|🎉|❤", a.GetRawText()));

        // The server's logs, at their shipped levels, never carry the chat's words (SC-906).
        Assert.NotEmpty(_logs.Lines);
        Assert.DoesNotContain(_logs.Lines, l => l.Contains("à jeudi", StringComparison.Ordinal));
    }
}
