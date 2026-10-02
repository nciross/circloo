using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Options;

namespace Circloo.Api.Presentations;

/// <summary>A stored blob ready to stream: its content, type and entity tag.</summary>
public sealed record StoredBlob(Stream Content, string ContentType, string ETag);

/// <summary>
/// Slide pictures and the transient source file, in one private container (research R3):
/// <c>{ownerId}/{presentationId}/{slideId}.webp</c>, <c>….thumb.webp</c> and <c>…/source.pptx</c>.
/// Nothing here is public: the API streams pictures after its own access check.
/// </summary>
public sealed class SlideStore(BlobServiceClient service, IOptions<PresentationOptions> options)
{
    public const string SourceName = "source.pptx";
    private const string Webp = "image/webp";

    private BlobContainerClient Container => service.GetBlobContainerClient(options.Value.Container);

    public static string Prefix(Guid ownerId, Guid presentationId) => $"{ownerId:N}/{presentationId:N}/";

    public static string SlidePath(Guid ownerId, Guid presentationId, Guid slideId, bool thumb = false) =>
        $"{Prefix(ownerId, presentationId)}{slideId:N}{(thumb ? ".thumb" : "")}.webp";

    public static string SourcePath(Guid ownerId, Guid presentationId) => Prefix(ownerId, presentationId) + SourceName;

    /// <summary>Creates the container in dev (Azurite); in Azure the Bicep already did.</summary>
    public async Task EnsureContainerAsync(CancellationToken ct) =>
        await Container.CreateIfNotExistsAsync(PublicAccessType.None, cancellationToken: ct);

    public Task PutSlideAsync(Guid ownerId, Guid presentationId, Guid slideId, bool thumb, Stream content, CancellationToken ct) =>
        PutAsync(SlidePath(ownerId, presentationId, slideId, thumb), content, Webp, ct);

    public Task PutSourceAsync(Guid ownerId, Guid presentationId, Stream content, CancellationToken ct) =>
        PutAsync(SourcePath(ownerId, presentationId), content, "application/vnd.openxmlformats-officedocument.presentationml.presentation", ct);

    public async Task<Stream?> OpenSourceAsync(Guid ownerId, Guid presentationId, CancellationToken ct) =>
        (await GetAsync(SourcePath(ownerId, presentationId), ct))?.Content;

    public Task<StoredBlob?> GetSlideAsync(Guid ownerId, Guid presentationId, Guid slideId, bool thumb, CancellationToken ct) =>
        GetAsync(SlidePath(ownerId, presentationId, slideId, thumb), ct);

    public async Task DeleteSourceAsync(Guid ownerId, Guid presentationId, CancellationToken ct) =>
        await Container.DeleteBlobIfExistsAsync(SourcePath(ownerId, presentationId), cancellationToken: ct);

    public async Task DeleteSlideAsync(Guid ownerId, Guid presentationId, Guid slideId, CancellationToken ct)
    {
        await Container.DeleteBlobIfExistsAsync(SlidePath(ownerId, presentationId, slideId), cancellationToken: ct);
        await Container.DeleteBlobIfExistsAsync(SlidePath(ownerId, presentationId, slideId, thumb: true), cancellationToken: ct);
    }

    /// <summary>Removes every blob of a presentation (deletion, idle clean-up).</summary>
    public async Task<int> DeletePresentationAsync(Guid ownerId, Guid presentationId, CancellationToken ct)
    {
        var deleted = 0;
        await foreach (var blob in Container.GetBlobsAsync(BlobTraits.None, BlobStates.None, Prefix(ownerId, presentationId), ct))
        {
            await Container.DeleteBlobIfExistsAsync(blob.Name, DeleteSnapshotsOption.IncludeSnapshots, cancellationToken: ct);
            deleted++;
        }
        return deleted;
    }

    /// <summary>Every presentation folder that has blobs, as (owner, presentation) pairs: for the orphan sweep.</summary>
    public async IAsyncEnumerable<(Guid Owner, Guid Presentation)> ListPresentationsAsync([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        await foreach (var owner in Container.GetBlobsByHierarchyAsync(BlobTraits.None, BlobStates.None, "/", null, ct))
        {
            if (!owner.IsPrefix || !Guid.TryParseExact(owner.Prefix.TrimEnd('/'), "N", out var ownerId))
            {
                continue;
            }
            await foreach (var item in Container.GetBlobsByHierarchyAsync(BlobTraits.None, BlobStates.None, "/", owner.Prefix, ct))
            {
                if (item.IsPrefix && Guid.TryParseExact(item.Prefix[owner.Prefix.Length..].TrimEnd('/'), "N", out var presentationId))
                {
                    yield return (ownerId, presentationId);
                }
            }
        }
    }

    private async Task PutAsync(string path, Stream content, string contentType, CancellationToken ct) =>
        await Container.GetBlobClient(path).UploadAsync(content, new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = contentType } }, ct);

    private async Task<StoredBlob?> GetAsync(string path, CancellationToken ct)
    {
        try
        {
            var result = await Container.GetBlobClient(path).DownloadStreamingAsync(cancellationToken: ct);
            return new StoredBlob(result.Value.Content, result.Value.Details.ContentType ?? Webp, result.Value.Details.ETag.ToString("H"));
        }
        catch (RequestFailedException e) when (e.Status == 404)
        {
            return null;
        }
    }
}
