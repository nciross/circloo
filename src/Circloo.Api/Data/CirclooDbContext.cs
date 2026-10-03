using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using DecideRules = Circloo.Api.Decide.DecideRules;
using PresentationRules = Circloo.Api.Presentations.PresentationRules;

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
    public DbSet<CanvasNote> CanvasNotes => Set<CanvasNote>();
    public DbSet<BoardVote> BoardVotes => Set<BoardVote>();
    public DbSet<IntegrationConnection> IntegrationConnections => Set<IntegrationConnection>();
    public DbSet<Presentation> Presentations => Set<Presentation>();
    public DbSet<Slide> Slides => Set<Slide>();
    public DbSet<PresentationSession> PresentationSessions => Set<PresentationSession>();
    public DbSet<SessionAnswer> SessionAnswers => Set<SessionAnswer>();
    public DbSet<Poll> Polls => Set<Poll>();
    public DbSet<PollVote> PollVotes => Set<PollVote>();
    public DbSet<QaQuestion> QaQuestions => Set<QaQuestion>();
    public DbSet<QaUpvote> QaUpvotes => Set<QaUpvote>();
    public DbSet<Form> Forms => Set<Form>();
    public DbSet<FormResponse> FormResponses => Set<FormResponse>();
    public DbSet<SavedForm> SavedForms => Set<SavedForm>();

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

        modelBuilder.Entity<CanvasNote>(e =>
        {
            e.Property(n => n.ActivityId).HasMaxLength(40);
            e.Property(n => n.Text).HasMaxLength(140);
            e.Property(n => n.Color).HasMaxLength(10);
            e.Property(n => n.Size).HasMaxLength(2);
            e.Property(n => n.Shape).HasMaxLength(10);
            e.Property(n => n.Sticker).HasMaxLength(10);
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

        modelBuilder.Entity<IntegrationConnection>(e =>
        {
            e.Property(c => c.Provider).HasMaxLength(16);
            e.Property(c => c.Hint).HasMaxLength(120);
            e.HasIndex(c => new { c.UserId, c.Provider }).IsUnique();
            e.HasOne<User>().WithMany().HasForeignKey(c => c.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ---------- Live presentations (spec 006, data-model.md) ----------
        modelBuilder.Entity<Presentation>(e =>
        {
            e.Property(p => p.Name).HasMaxLength(PresentationRules.NameMax);
            e.Property(p => p.SourceFileName).HasMaxLength(200);
            e.Property(p => p.Status).HasMaxLength(12);
            e.Property(p => p.Error).HasMaxLength(24);
            e.Property(p => p.ConvertingBy).HasMaxLength(64);
            e.Property(p => p.Version).IsConcurrencyToken();
            e.HasIndex(p => new { p.OwnerUserId, p.UpdatedAt });
            e.HasIndex(p => p.LastUsedAt);
            e.HasIndex(p => p.Status);
            e.HasOne<User>().WithMany().HasForeignKey(p => p.OwnerUserId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(p => p.Slides).WithOne().HasForeignKey(s => s.PresentationId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Slide>(e =>
        {
            e.Property(s => s.Kind).HasMaxLength(4);
            e.Property(s => s.Notes).HasMaxLength(PresentationRules.NotesMax);
            e.Property(s => s.Question).HasMaxLength(PresentationRules.QuestionMax);
            e.Property(s => s.CorrectOption).HasMaxLength(1);
            e.OwnsMany(s => s.Options, o =>
            {
                o.ToJson();
                o.Property(x => x.Id).HasMaxLength(1);
                o.Property(x => x.Text).HasMaxLength(PresentationRules.OptionMax);
            });
            // Positions are kept dense by the endpoints (not a unique index: a reorder would collide mid-update).
            e.HasIndex(s => new { s.PresentationId, s.Position });
        });

        modelBuilder.Entity<PresentationSession>(e =>
        {
            e.Property(s => s.Snapshot).HasColumnType("jsonb");
            e.Property(s => s.QuestionPhases).HasColumnType("jsonb");
            e.Property(s => s.Phase).HasMaxLength(10);
            e.Property(s => s.Version).IsConcurrencyToken();
            // At most one running presentation per circle.
            e.HasIndex(s => s.CircleId).IsUnique().HasFilter("\"EndedAt\" IS NULL");
            e.HasIndex(s => s.PresentationId);
            e.HasOne<Circle>().WithMany().HasForeignKey(s => s.CircleId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<Presentation>().WithMany().HasForeignKey(s => s.PresentationId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne<CircleMember>().WithMany().HasForeignKey(s => s.StartedByMemberId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<SessionAnswer>(e =>
        {
            e.HasKey(a => a.Seq);
            e.Property(a => a.Seq).UseIdentityAlwaysColumn();
            // One answer per participant per question, whatever the tabs or devices (FR-610, SC-606).
            e.HasIndex(a => new { a.SessionId, a.SlideId, a.MemberId }).IsUnique();
            e.HasOne<PresentationSession>().WithMany().HasForeignKey(a => a.SessionId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<CircleMember>().WithMany().HasForeignKey(a => a.MemberId).OnDelete(DeleteBehavior.NoAction);
        });

        // ---------- Polls, Q&A and feedback forms (spec 007, data-model.md) ----------
        modelBuilder.Entity<Poll>(e =>
        {
            e.Property(p => p.Question).HasMaxLength(DecideRules.PollQuestionMax);
            e.OwnsMany(p => p.Options, o =>
            {
                o.ToJson();
                o.Property(x => x.Id).HasMaxLength(1);
                o.Property(x => x.Text).HasMaxLength(DecideRules.OptionMax);
            });
            e.Property(p => p.Version).IsConcurrencyToken();
            e.HasIndex(p => p.CircleId);
            // At most one open poll per circle.
            e.HasIndex(p => p.CircleId, "IX_Polls_CircleId_Open").IsUnique().HasFilter("\"OpenedAt\" IS NOT NULL AND \"ClosedAt\" IS NULL");
            e.HasOne<Circle>().WithMany().HasForeignKey(p => p.CircleId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<CircleMember>().WithMany().HasForeignKey(p => p.CreatedByMemberId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<PollVote>(e =>
        {
            e.Property(v => v.Id).UseIdentityAlwaysColumn();
            // One vote per member per poll, whatever the tabs or devices (SC-703).
            e.HasIndex(v => new { v.PollId, v.MemberId }).IsUnique();
            e.HasOne<Poll>().WithMany().HasForeignKey(v => v.PollId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<CircleMember>().WithMany().HasForeignKey(v => v.MemberId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<QaQuestion>(e =>
        {
            e.Property(q => q.Id).UseIdentityAlwaysColumn();
            e.Property(q => q.Text).HasMaxLength(DecideRules.QaQuestionMax);
            e.Property(q => q.Answer).HasMaxLength(DecideRules.QaAnswerMax);
            e.Property(q => q.State).HasMaxLength(8);
            e.HasIndex(q => new { q.CircleId, q.State });
            e.HasOne<Circle>().WithMany().HasForeignKey(q => q.CircleId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<CircleMember>().WithMany().HasForeignKey(q => q.AuthorMemberId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<QaUpvote>(e =>
        {
            // One upvote per member per question (SC-703).
            e.HasKey(u => new { u.QuestionId, u.MemberId });
            e.HasOne<QaQuestion>().WithMany().HasForeignKey(u => u.QuestionId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<CircleMember>().WithMany().HasForeignKey(u => u.MemberId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Form>(e =>
        {
            e.Property(f => f.Title).HasMaxLength(DecideRules.FormTitleMax);
            ConfigureQuestions(e.OwnsMany(f => f.Questions));
            e.Property(f => f.Version).IsConcurrencyToken();
            e.HasIndex(f => f.CircleId);
            // At most one open form per circle.
            e.HasIndex(f => f.CircleId, "IX_Forms_CircleId_Open").IsUnique().HasFilter("\"OpenedAt\" IS NOT NULL AND \"ClosedAt\" IS NULL");
            e.HasOne<Circle>().WithMany().HasForeignKey(f => f.CircleId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<SavedForm>().WithMany().HasForeignKey(f => f.SavedFormId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<FormResponse>(e =>
        {
            e.Property(r => r.Id).UseIdentityAlwaysColumn();
            e.Property(r => r.Answers).HasColumnType("jsonb");
            // One response per member per form (SC-703).
            e.HasIndex(r => new { r.FormId, r.MemberId }).IsUnique();
            e.HasOne<Form>().WithMany().HasForeignKey(r => r.FormId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<CircleMember>().WithMany().HasForeignKey(r => r.MemberId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SavedForm>(e =>
        {
            e.Property(f => f.Name).HasMaxLength(DecideRules.SavedFormNameMax);
            e.Property(f => f.Title).HasMaxLength(DecideRules.FormTitleMax);
            ConfigureQuestions(e.OwnsMany(f => f.Questions));
            e.Property(f => f.Version).IsConcurrencyToken();
            e.HasIndex(f => f.OwnerUserId);
            e.HasOne<User>().WithMany().HasForeignKey(f => f.OwnerUserId).OnDelete(DeleteBehavior.Cascade);
        });
    }

    /// <summary>Form questions live in the form row as JSON, each with its own options.</summary>
    private static void ConfigureQuestions<TOwner>(OwnedNavigationBuilder<TOwner, FormQuestion> q) where TOwner : class
    {
        q.ToJson();
        q.Property(x => x.Id).HasMaxLength(3);
        q.Property(x => x.Type).HasMaxLength(8);
        q.Property(x => x.Label).HasMaxLength(DecideRules.FormLabelMax);
        q.Property(x => x.Look).HasMaxLength(8);
        q.OwnsMany(x => x.Options, o =>
        {
            o.Property(x => x.Id).HasMaxLength(1);
            o.Property(x => x.Text).HasMaxLength(DecideRules.OptionMax);
        });
    }
}
