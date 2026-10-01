using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Circloo.Api.Data;

public sealed class CirclooDbContext(DbContextOptions<CirclooDbContext> options)
    : DbContext(options), IDataProtectionKeyContext
{
    public DbSet<User> Users => Set<User>();
    public DbSet<OtpChallenge> OtpChallenges => Set<OtpChallenge>();
    public DbSet<UserSession> UserSessions => Set<UserSession>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
    public DbSet<EmailOutboxMessage> EmailOutbox => Set<EmailOutboxMessage>();
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(e =>
        {
            e.Property(u => u.Email).HasMaxLength(254);
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.DisplayName).HasMaxLength(40);
            e.Property(u => u.Locale).HasMaxLength(5);
            e.Ignore(u => u.ProfileCompleted);
        });

        modelBuilder.Entity<OtpChallenge>(e =>
        {
            e.Property(c => c.Email).HasMaxLength(254);
            e.Property(c => c.Locale).HasMaxLength(5);
            e.HasIndex(c => new { c.Email, c.CreatedAt }).IsDescending(false, true);
            e.HasIndex(c => c.CreatedAt);
        });

        modelBuilder.Entity<UserSession>(e =>
        {
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(s => s.UserId);
            e.Property(s => s.UserAgent).HasMaxLength(200);
        });

        modelBuilder.Entity<AuditEvent>(e =>
        {
            e.Property(a => a.Type).HasMaxLength(64);
            e.Property(a => a.Detail).HasColumnType("jsonb");
            e.HasIndex(a => a.At);
        });

        modelBuilder.Entity<EmailOutboxMessage>(e =>
        {
            e.ToTable("EmailOutbox");
            e.Property(m => m.To).HasMaxLength(254);
            e.Property(m => m.Template).HasMaxLength(64);
            e.Property(m => m.Locale).HasMaxLength(5);
            e.HasIndex(m => m.NextAttemptAt);
        });
    }
}
