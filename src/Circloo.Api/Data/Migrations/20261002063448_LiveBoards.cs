using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Circloo.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class LiveBoards : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BoardNotes",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CircleId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActivityId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Column = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Text = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: false),
                    Color = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    AuthorMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardNotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BoardNotes_CircleMembers_AuthorMemberId",
                        column: x => x.AuthorMemberId,
                        principalTable: "CircleMembers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BoardNotes_Circles_CircleId",
                        column: x => x.CircleId,
                        principalTable: "Circles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "BoardVotes",
                columns: table => new
                {
                    NoteId = table.Column<long>(type: "bigint", nullable: false),
                    MemberId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardVotes", x => new { x.NoteId, x.MemberId });
                    table.ForeignKey(
                        name: "FK_BoardVotes_BoardNotes_NoteId",
                        column: x => x.NoteId,
                        principalTable: "BoardNotes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BoardVotes_CircleMembers_MemberId",
                        column: x => x.MemberId,
                        principalTable: "CircleMembers",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_BoardNotes_AuthorMemberId",
                table: "BoardNotes",
                column: "AuthorMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_BoardNotes_CircleId_ActivityId",
                table: "BoardNotes",
                columns: new[] { "CircleId", "ActivityId" });

            migrationBuilder.CreateIndex(
                name: "IX_BoardVotes_MemberId",
                table: "BoardVotes",
                column: "MemberId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BoardVotes");

            migrationBuilder.DropTable(
                name: "BoardNotes");
        }
    }
}
