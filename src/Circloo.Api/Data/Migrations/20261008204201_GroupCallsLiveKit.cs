using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Circloo.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class GroupCallsLiveKit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Only chat messages are stored (spec 009 FR-930). The recording tables were created empty by
            // LiveDiscussionStage and never written; the call's change history goes too. Dropping a table drops its
            // indexes and its check constraint with it.
            migrationBuilder.DropTable(
                name: "RecordingEvents");

            migrationBuilder.DropTable(
                name: "Recordings");

            migrationBuilder.DropColumn(
                name: "DiscussionChangedAt",
                table: "Circles");

            migrationBuilder.DropColumn(
                name: "DiscussionChangedByMemberId",
                table: "Circles");

            migrationBuilder.AddColumn<string>(
                name: "DiscussionSpeaking",
                table: "Circles",
                type: "character varying(8)",
                maxLength: 8,
                nullable: false,
                // Circles from before get Hand to speak, the calmer mode (spec 009 data-model).
                defaultValue: "hand");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Circles_DiscussionSpeaking",
                table: "Circles",
                sql: "\"DiscussionSpeaking\" IN ('hand', 'open')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Circles_DiscussionSpeaking",
                table: "Circles");

            migrationBuilder.DropColumn(
                name: "DiscussionSpeaking",
                table: "Circles");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DiscussionChangedAt",
                table: "Circles",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DiscussionChangedByMemberId",
                table: "Circles",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Recordings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CaptureFrom = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CircleId = table.Column<Guid>(type: "uuid", nullable: false),
                    EndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    EndedReason = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    MaxAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    StartedByMemberId = table.Column<Guid>(type: "uuid", nullable: true),
                    Title = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Recordings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Recordings_Circles_CircleId",
                        column: x => x.CircleId,
                        principalTable: "Circles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RecordingEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    ActorMemberId = table.Column<Guid>(type: "uuid", nullable: true),
                    At = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    MessageId = table.Column<long>(type: "bigint", nullable: true),
                    Reason = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: true),
                    RecordingId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReplyToMessageId = table.Column<long>(type: "bigint", nullable: true),
                    SubjectMemberId = table.Column<Guid>(type: "uuid", nullable: true),
                    Text = table.Column<string>(type: "character varying(280)", maxLength: 280, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RecordingEvents", x => x.Id);
                    table.CheckConstraint("CK_RecordingEvents_TextOnlyForMessages", "(\"Kind\" = 'message' AND \"Text\" IS NOT NULL) OR (\"Kind\" <> 'message' AND \"Text\" IS NULL)");
                    table.ForeignKey(
                        name: "FK_RecordingEvents_Recordings_RecordingId",
                        column: x => x.RecordingId,
                        principalTable: "Recordings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RecordingEvents_RecordingId_Id",
                table: "RecordingEvents",
                columns: new[] { "RecordingId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Recordings_CircleId_Running",
                table: "Recordings",
                column: "CircleId",
                unique: true,
                filter: "\"EndedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Recordings_CircleId_StartedAt",
                table: "Recordings",
                columns: new[] { "CircleId", "StartedAt" },
                descending: new[] { false, true });
        }
    }
}
