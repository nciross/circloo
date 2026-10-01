using System.Runtime.CompilerServices;
using Microsoft.Extensions.AI;

namespace Circloo.Api.Tests.Infrastructure;

/// <summary>Scripted model: returns whatever JSON the test sets, records the prompts it was given.</summary>
public sealed class FakeChatClient : IChatClient
{
    public Func<IReadOnlyList<ChatMessage>, string> Reply { get; set; } = _ => """{"items":[]}""";
    public List<IReadOnlyList<ChatMessage>> Calls { get; } = [];
    public TimeSpan Delay { get; set; } = TimeSpan.Zero;
    public bool Throw { get; set; }

    public async Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default)
    {
        var list = messages.ToList();
        lock (Calls) Calls.Add(list);
        if (Delay > TimeSpan.Zero) await Task.Delay(Delay, cancellationToken);
        if (Throw) throw new HttpRequestException("model down");
        return new ChatResponse(new ChatMessage(ChatRole.Assistant, Reply(list))) { ModelId = "fake", Usage = new UsageDetails { InputTokenCount = 10, OutputTokenCount = 20 } };
    }

    public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        foreach (var u in (await GetResponseAsync(messages, options, cancellationToken)).ToChatResponseUpdates()) yield return u;
    }

    public object? GetService(Type serviceType, object? serviceKey = null) => null;

    public void Dispose()
    {
    }
}
