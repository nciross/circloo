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
    public DbSet<Spark> Sparks => Set<Spark>();
    public DbSet<SparkFavorite> SparkFavorites => Set<SparkFavorite>();
    public DbSet<AiGeneration> AiGenerations => Set<AiGeneration>();
    public DbSet<Circle> Circles => Set<Circle>();
    public DbSet<CircleMember> CircleMembers => Set<CircleMember>();
    public DbSet<CircleMessage> CircleMessages => Set<CircleMessage>();
    public DbSet<BoardNote> BoardNotes => Set<BoardNote>();
    public DbSet<BoardVote> BoardVotes => Set<BoardVote>();

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

        modelBuilder.Entity<Spark>(e =>
        {
            e.Property(x => x.Id).HasMaxLength(64);
            e.Property(x => x.Lang).HasMaxLength(5);
            e.Property(x => x.Kind).HasMaxLength(24);
            e.Property(x => x.Tone).HasMaxLength(12);
            e.Property(x => x.Source).HasMaxLength(8);
            e.Property(x => x.Text).HasMaxLength(240);
            e.Property(x => x.Answer).HasMaxLength(140);
            e.HasIndex(x => new { x.Lang, x.Kind, x.Tone });
            e.HasIndex(x => x.OwnerId);
            e.HasOne(x => x.Owner).WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SparkFavorite>(e =>
        {
            e.HasKey(x => new { x.UserId, x.SparkId });
            e.Property(x => x.SparkId).HasMaxLength(64);
            e.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Spark).WithMany().HasForeignKey(x => x.SparkId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AiGeneration>(e =>
        {
            e.Property(x => x.Provider).HasMaxLength(40);
            e.Property(x => x.Model).HasMaxLength(80);
            e.Property(x => x.Outcome).HasMaxLength(12);
            e.HasIndex(x => new { x.UserId, x.At });
            e.HasIndex(x => x.At);
            e.Property(x => x.Purpose).HasMaxLength(12).HasDefaultValue("sparks");
        });

        modelBuilder.Entity<Circle>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(60);
            e.Property(c => c.JoinCode).HasMaxLength(10).IsFixedLength();
            e.HasIndex(c => c.JoinCode).IsUnique();
            e.Property(c => c.CurrentActivity).HasMaxLength(40);
            e.Property(c => c.Locale).HasMaxLength(5);
            e.HasIndex(c => new { c.OwnerUserId, c.CreatedAt });
            e.HasOne<User>().WithMany().HasForeignKey(c => c.OwnerUserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CircleMember>(e =>
        {
            e.Property(m => m.Role).HasMaxLength(12);
            e.Property(m => m.Name).HasMaxLength(24);
            e.Property(m => m.Character).HasMaxLength(16);
            e.HasOne(m => m.Circle).WithMany().HasForeignKey(m => m.CircleId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<User>().WithMany().HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Cascade);
            // One person per character and one membership per account in a circle, while present.
            e.HasIndex(m => new { m.CircleId, m.Character }).IsUnique().HasFilter("\"LeftAt\" IS NULL");
            e.HasIndex(m => new { m.CircleId, m.UserId }).IsUnique().HasFilter("\"UserId\" IS NOT NULL AND \"LeftAt\" IS NULL");
        });

        modelBuilder.Entity<CircleMessage>(e =>
        {
            e.Property(m => m.ActivityId).HasMaxLength(40);
            e.Property(m => m.Kind).HasMaxLength(8);
            e.Property(m => m.Text).HasMaxLength(2000);
            e.HasIndex(m => new { m.CircleId, m.Id });
            e.HasOne<Circle>().WithMany().HasForeignKey(m => m.CircleId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BoardNote>(e =>
        {
            e.Property(n => n.ActivityId).HasMaxLength(40);
            e.Property(n => n.Column).HasMaxLength(20);
            e.Property(n => n.Text).HasMaxLength(140);
            e.Property(n => n.Color).HasMaxLength(10);
            e.HasIndex(n => new { n.CircleId, n.ActivityId });
            e.HasOne<Circle>().WithMany().HasForeignKey(n => n.CircleId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<CircleMember>().WithMany().HasForeignKey(n => n.AuthorMemberId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BoardVote>(e =>
        {
            e.HasKey(v => new { v.NoteId, v.MemberId });
            e.HasOne<BoardNote>().WithMany(n => n.Votes).HasForeignKey(v => v.NoteId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<CircleMember>().WithMany().HasForeignKey(v => v.MemberId).OnDelete(DeleteBehavior.NoAction);
        });
    }
}
