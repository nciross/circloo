using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Circloo.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class LivePresentations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Presentations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    SourceFileName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Status = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                    Error = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: true),
                    SlideCount = table.Column<int>(type: "integer", nullable: false),
                    ProcessedSlides = table.Column<int>(type: "integer", nullable: false),
                    ShowPodium = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastUsedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    ConvertingBy = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    LeaseUntil = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Presentations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Presentations_Users_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PresentationSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CircleId = table.Column<Guid>(type: "uuid", nullable: false),
                    PresentationId = table.Column<Guid>(type: "uuid", nullable: true),
                    StartedByMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    Snapshot = table.Column<string>(type: "jsonb", nullable: false),
                    ShowPodium = table.Column<bool>(type: "boolean", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    MaxPosition = table.Column<int>(type: "integer", nullable: false),
                    Blank = table.Column<bool>(type: "boolean", nullable: false),
                    Phase = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    OpenedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Deadline = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LockedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    QuestionPhases = table.Column<string>(type: "jsonb", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PresentationSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PresentationSessions_CircleMembers_StartedByMemberId",
                        column: x => x.StartedByMemberId,
                        principalTable: "CircleMembers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PresentationSessions_Circles_CircleId",
                        column: x => x.CircleId,
                        principalTable: "Circles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PresentationSessions_Presentations_PresentationId",
                        column: x => x.PresentationId,
                        principalTable: "Presentations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "Slides",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PresentationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    Kind = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: false),
                    Hidden = table.Column<bool>(type: "boolean", nullable: false),
                    SourceIndex = table.Column<int>(type: "integer", nullable: true),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Question = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: true),
                    CorrectOption = table.Column<string>(type: "character varying(1)", maxLength: 1, nullable: true),
                    MultipleChoice = table.Column<bool>(type: "boolean", nullable: false),
                    TimerSeconds = table.Column<int>(type: "integer", nullable: true),
                    ShowFirst = table.Column<bool>(type: "boolean", nullable: false),
                    ShowLive = table.Column<bool>(type: "boolean", nullable: false),
                    Options = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Slides", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Slides_Presentations_PresentationId",
                        column: x => x.PresentationId,
                        principalTable: "Presentations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SessionAnswers",
                columns: table => new
                {
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SlideId = table.Column<Guid>(type: "uuid", nullable: false),
                    MemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    Options = table.Column<string[]>(type: "text[]", nullable: false),
                    FirstReceivedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ReceivedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Correct = table.Column<bool>(type: "boolean", nullable: true),
                    Points = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SessionAnswers", x => x.Seq);
                    table.ForeignKey(
                        name: "FK_SessionAnswers_CircleMembers_MemberId",
                        column: x => x.MemberId,
                        principalTable: "CircleMembers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SessionAnswers_PresentationSessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "PresentationSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Presentations_LastUsedAt",
                table: "Presentations",
                column: "LastUsedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Presentations_OwnerUserId_UpdatedAt",
                table: "Presentations",
                columns: new[] { "OwnerUserId", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Presentations_Status",
                table: "Presentations",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_PresentationSessions_CircleId",
                table: "PresentationSessions",
                column: "CircleId",
                unique: true,
                filter: "\"EndedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PresentationSessions_PresentationId",
                table: "PresentationSessions",
                column: "PresentationId");

            migrationBuilder.CreateIndex(
                name: "IX_PresentationSessions_StartedByMemberId",
                table: "PresentationSessions",
                column: "StartedByMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_SessionAnswers_MemberId",
                table: "SessionAnswers",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_SessionAnswers_SessionId_SlideId_MemberId",
                table: "SessionAnswers",
                columns: new[] { "SessionId", "SlideId", "MemberId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Slides_PresentationId_Position",
                table: "Slides",
                columns: new[] { "PresentationId", "Position" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SessionAnswers");

            migrationBuilder.DropTable(
                name: "Slides");

            migrationBuilder.DropTable(
                name: "PresentationSessions");

            migrationBuilder.DropTable(
                name: "Presentations");
        }
    }
}
