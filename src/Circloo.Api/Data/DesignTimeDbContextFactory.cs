using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Circloo.Api.Data;

/// <summary>Used only by <c>dotnet ef</c> to build migrations; never connects.</summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<CirclooDbContext>
{
    public CirclooDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<CirclooDbContext>().UseNpgsql("Host=localhost;Database=circloo_design").Options);
}
