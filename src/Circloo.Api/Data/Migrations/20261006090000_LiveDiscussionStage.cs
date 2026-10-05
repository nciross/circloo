using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Circloo.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class LiveDiscussionStage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "ReplyToId",
                table: "CircleMessages",
                type: "bigint",
                nullable: true);

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

            // Circles from before keep working as they did: the discussion is off (spec 009 FR-901).
            migrationBuilder.AddColumn<bool>(
                name: "DiscussionOn",
                table: "Circles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "DiscussionVideo",
                table: "Circles",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateTable(
                name: "Recordings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CircleId = table.Column<Guid>(type: "uuid", nullable: false),
                    StartedByMemberId = table.Column<Guid>(type: "uuid", nullable: true),
                    Title = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CaptureFrom = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    MaxAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    EndedReason = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true)
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
                    RecordingId = table.Column<Guid>(type: "uuid", nullable: false),
                    At = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ActorMemberId = table.Column<Guid>(type: "uuid", nullable: true),
                    SubjectMemberId = table.Column<Guid>(type: "uuid", nullable: true),
                    MessageId = table.Column<long>(type: "bigint", nullable: true),
                    ReplyToMessageId = table.Column<long>(type: "bigint", nullable: true),
                    Reason = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: true),
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
                name: "IX_CircleMessages_ReplyToId",
                table: "CircleMessages",
                column: "ReplyToId");

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

            migrationBuilder.AddForeignKey(
                name: "FK_CircleMessages_CircleMessages_ReplyToId",
                table: "CircleMessages",
                column: "ReplyToId",
                principalTable: "CircleMessages",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CircleMessages_CircleMessages_ReplyToId",
                table: "CircleMessages");

            migrationBuilder.DropTable(
                name: "RecordingEvents");

            migrationBuilder.DropTable(
                name: "Recordings");

            migrationBuilder.DropIndex(
                name: "IX_CircleMessages_ReplyToId",
                table: "CircleMessages");

            migrationBuilder.DropColumn(
                name: "ReplyToId",
                table: "CircleMessages");

            migrationBuilder.DropColumn(
                name: "DiscussionChangedAt",
                table: "Circles");

            migrationBuilder.DropColumn(
                name: "DiscussionChangedByMemberId",
                table: "Circles");

            migrationBuilder.DropColumn(
                name: "DiscussionOn",
                table: "Circles");

            migrationBuilder.DropColumn(
                name: "DiscussionVideo",
                table: "Circles");
        }
    }
}
