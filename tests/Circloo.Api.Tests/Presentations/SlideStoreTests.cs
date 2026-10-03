using Azure.Storage.Blobs;
using Circloo.Api.Presentations;
using Microsoft.Extensions.Options;
using Testcontainers.Azurite;

namespace Circloo.Api.Tests.Presentations;

/// <summary>Slide pictures in Blob Storage, against a real Azurite (research R3).</summary>
public sealed class SlideStoreTests : IAsyncLifetime
{
    private readonly AzuriteContainer _azurite = new AzuriteBuilder("mcr.microsoft.com/azure-storage/azurite:3.35.0").WithInMemoryPersistence()
        // The Azure SDK can be ahead of Azurite on storage API versions; the emulator should not refuse it.
        .WithCommand("--skipApiVersionCheck").Build();
    private SlideStore _store = null!;
    private BlobContainerClient _container = null!;

    public async Task InitializeAsync()
    {
        Environment.SetEnvironmentVariable("TESTCONTAINERS_RYUK_DISABLED", "true");
        await _azurite.StartAsync();
        var service = new BlobServiceClient(_azurite.GetConnectionString());
        var options = Options.Create(new PresentationOptions { Container = "presentations" });
        _store = new SlideStore(service, options);
        _container = service.GetBlobContainerClient("presentations");
        await _store.EnsureContainerAsync(default);
    }

    public Task DisposeAsync() => _azurite.DisposeAsync().AsTask();

    [Fact]
    public async Task Container_is_private()
    {
        var properties = await _container.GetPropertiesAsync();

        Assert.Equal(Azure.Storage.Blobs.Models.PublicAccessType.None, properties.Value.PublicAccess);
    }

    [Fact]
    public async Task Slides_round_trip_with_type_and_etag()
    {
        var (owner, deck, slide) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        await _store.PutSlideAsync(owner, deck, slide, thumb: false, new MemoryStream([1, 2, 3]), default);

        var stored = await _store.GetSlideAsync(owner, deck, slide, thumb: false, default);
        var thumb = await _store.GetSlideAsync(owner, deck, slide, thumb: true, default);

        Assert.NotNull(stored);
        Assert.Equal("image/webp", stored.ContentType);
        Assert.False(string.IsNullOrEmpty(stored.ETag));
        using var copy = new MemoryStream();
        await stored.Content.CopyToAsync(copy);
        Assert.Equal([1, 2, 3], copy.ToArray());
        Assert.Null(thumb);
        Assert.Equal($"{owner:N}/{deck:N}/{slide:N}.webp", SlideStore.SlidePath(owner, deck, slide));
    }

    [Fact]
    public async Task Deleting_a_presentation_removes_only_its_blobs()
    {
        var owner = Guid.NewGuid();
        var (deck, other) = (Guid.NewGuid(), Guid.NewGuid());
        await _store.PutSlideAsync(owner, deck, Guid.NewGuid(), thumb: false, new MemoryStream([1]), default);
        await _store.PutSlideAsync(owner, deck, Guid.NewGuid(), thumb: true, new MemoryStream([1]), default);
        await _store.PutSourceAsync(owner, deck, new MemoryStream([1]), default);
        var keep = Guid.NewGuid();
        await _store.PutSlideAsync(owner, other, keep, thumb: false, new MemoryStream([1]), default);

        var deleted = await _store.DeletePresentationAsync(owner, deck, default);

        Assert.Equal(3, deleted);
        Assert.Null(await _store.OpenSourceAsync(owner, deck, default));
        Assert.NotNull(await _store.GetSlideAsync(owner, other, keep, thumb: false, default));
    }

    [Fact]
    public async Task Lists_presentation_folders_for_the_orphan_sweep()
    {
        var (owner, deck) = (Guid.NewGuid(), Guid.NewGuid());
        await _store.PutSlideAsync(owner, deck, Guid.NewGuid(), thumb: false, new MemoryStream([1]), default);

        var found = new List<(Guid, Guid)>();
        await foreach (var item in _store.ListPresentationsAsync(default))
        {
            found.Add(item);
        }

        Assert.Contains((owner, deck), found);
    }
}
