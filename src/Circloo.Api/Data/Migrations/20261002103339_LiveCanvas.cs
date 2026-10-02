using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Circloo.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class LiveCanvas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CanvasNotes",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CircleId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActivityId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Text = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: false),
                    X = table.Column<double>(type: "double precision", nullable: false),
                    Y = table.Column<double>(type: "double precision", nullable: false),
                    Color = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Size = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    Shape = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Sticker = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    AuthorMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CanvasNotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CanvasNotes_CircleMembers_AuthorMemberId",
                        column: x => x.AuthorMemberId,
                        principalTable: "CircleMembers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CanvasNotes_Circles_CircleId",
                        column: x => x.CircleId,
                        principalTable: "Circles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CanvasNotes_AuthorMemberId",
                table: "CanvasNotes",
                column: "AuthorMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_CanvasNotes_CircleId_ActivityId",
                table: "CanvasNotes",
                columns: new[] { "CircleId", "ActivityId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CanvasNotes");
        }
    }
}
