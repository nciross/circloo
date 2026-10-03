using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Circloo.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class CirclePollsQaForms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "QaAllowAnonymous",
                table: "Circles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "Polls",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CircleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Question = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: false),
                    MultipleChoice = table.Column<bool>(type: "boolean", nullable: false),
                    ResultsLive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedByMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    OpenedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ClosedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    Options = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Polls", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Polls_CircleMembers_CreatedByMemberId",
                        column: x => x.CreatedByMemberId,
                        principalTable: "CircleMembers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Polls_Circles_CircleId",
                        column: x => x.CircleId,
                        principalTable: "Circles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "QaQuestions",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    CircleId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    Anonymous = table.Column<bool>(type: "boolean", nullable: false),
                    Text = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    State = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    Answer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Upvotes = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AnsweredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QaQuestions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QaQuestions_CircleMembers_AuthorMemberId",
                        column: x => x.AuthorMemberId,
                        principalTable: "CircleMembers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_QaQuestions_Circles_CircleId",
                        column: x => x.CircleId,
                        principalTable: "Circles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SavedForms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Title = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    ShowNames = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastUsedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    Questions = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavedForms", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SavedForms_Users_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PollVotes",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    PollId = table.Column<Guid>(type: "uuid", nullable: false),
                    MemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    Options = table.Column<string[]>(type: "text[]", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PollVotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PollVotes_CircleMembers_MemberId",
                        column: x => x.MemberId,
                        principalTable: "CircleMembers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PollVotes_Polls_PollId",
                        column: x => x.PollId,
                        principalTable: "Polls",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "QaUpvotes",
                columns: table => new
                {
                    QuestionId = table.Column<long>(type: "bigint", nullable: false),
                    MemberId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QaUpvotes", x => new { x.QuestionId, x.MemberId });
                    table.ForeignKey(
                        name: "FK_QaUpvotes_CircleMembers_MemberId",
                        column: x => x.MemberId,
                        principalTable: "CircleMembers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_QaUpvotes_QaQuestions_QuestionId",
                        column: x => x.QuestionId,
                        principalTable: "QaQuestions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Forms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CircleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    ShowNames = table.Column<bool>(type: "boolean", nullable: false),
                    SummaryShared = table.Column<bool>(type: "boolean", nullable: false),
                    SavedFormId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    OpenedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ClosedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    Questions = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Forms", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Forms_Circles_CircleId",
                        column: x => x.CircleId,
                        principalTable: "Circles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Forms_SavedForms_SavedFormId",
                        column: x => x.SavedFormId,
                        principalTable: "SavedForms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "FormResponses",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    FormId = table.Column<Guid>(type: "uuid", nullable: false),
                    MemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    Answers = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FormResponses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FormResponses_CircleMembers_MemberId",
                        column: x => x.MemberId,
                        principalTable: "CircleMembers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FormResponses_Forms_FormId",
                        column: x => x.FormId,
                        principalTable: "Forms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FormResponses_FormId_MemberId",
                table: "FormResponses",
                columns: new[] { "FormId", "MemberId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FormResponses_MemberId",
                table: "FormResponses",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_Forms_CircleId",
                table: "Forms",
                column: "CircleId");

            migrationBuilder.CreateIndex(
                name: "IX_Forms_CircleId_Open",
                table: "Forms",
                column: "CircleId",
                unique: true,
                filter: "\"OpenedAt\" IS NOT NULL AND \"ClosedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Forms_SavedFormId",
                table: "Forms",
                column: "SavedFormId");

            migrationBuilder.CreateIndex(
                name: "IX_Polls_CircleId",
                table: "Polls",
                column: "CircleId");

            migrationBuilder.CreateIndex(
                name: "IX_Polls_CircleId_Open",
                table: "Polls",
                column: "CircleId",
                unique: true,
                filter: "\"OpenedAt\" IS NOT NULL AND \"ClosedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Polls_CreatedByMemberId",
                table: "Polls",
                column: "CreatedByMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_PollVotes_MemberId",
                table: "PollVotes",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_PollVotes_PollId_MemberId",
                table: "PollVotes",
                columns: new[] { "PollId", "MemberId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QaQuestions_AuthorMemberId",
                table: "QaQuestions",
                column: "AuthorMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_QaQuestions_CircleId_State",
                table: "QaQuestions",
                columns: new[] { "CircleId", "State" });

            migrationBuilder.CreateIndex(
                name: "IX_QaUpvotes_MemberId",
                table: "QaUpvotes",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_SavedForms_OwnerUserId",
                table: "SavedForms",
                column: "OwnerUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FormResponses");

            migrationBuilder.DropTable(
                name: "PollVotes");

            migrationBuilder.DropTable(
                name: "QaUpvotes");

            migrationBuilder.DropTable(
                name: "Forms");

            migrationBuilder.DropTable(
                name: "Polls");

            migrationBuilder.DropTable(
                name: "QaQuestions");

            migrationBuilder.DropTable(
                name: "SavedForms");

            migrationBuilder.DropColumn(
                name: "QaAllowAnonymous",
                table: "Circles");
        }
    }
}
