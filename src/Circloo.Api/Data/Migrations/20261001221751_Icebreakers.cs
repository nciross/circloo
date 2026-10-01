using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Circloo.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Icebreakers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AiGenerations",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    At = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Provider = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Model = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    InputTokens = table.Column<int>(type: "integer", nullable: true),
                    OutputTokens = table.Column<int>(type: "integer", nullable: true),
                    Requested = table.Column<int>(type: "integer", nullable: false),
                    Accepted = table.Column<int>(type: "integer", nullable: false),
                    Outcome = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                    LatencyMs = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiGenerations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Sparks",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Lang = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                    Kind = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Tone = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                    Audiences = table.Column<string[]>(type: "text[]", nullable: false),
                    KidsSafe = table.Column<bool>(type: "boolean", nullable: false),
                    Text = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    Answer = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: true),
                    Source = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: true),
                    Retired = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sparks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Sparks_Users_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SparkFavorites",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SparkId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SparkFavorites", x => new { x.UserId, x.SparkId });
                    table.ForeignKey(
                        name: "FK_SparkFavorites_Sparks_SparkId",
                        column: x => x.SparkId,
                        principalTable: "Sparks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SparkFavorites_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AiGenerations_At",
                table: "AiGenerations",
                column: "At");

            migrationBuilder.CreateIndex(
                name: "IX_AiGenerations_UserId_At",
                table: "AiGenerations",
                columns: new[] { "UserId", "At" });

            migrationBuilder.CreateIndex(
                name: "IX_SparkFavorites_SparkId",
                table: "SparkFavorites",
                column: "SparkId");

            migrationBuilder.CreateIndex(
                name: "IX_Sparks_Lang_Kind_Tone",
                table: "Sparks",
                columns: new[] { "Lang", "Kind", "Tone" });

            migrationBuilder.CreateIndex(
                name: "IX_Sparks_OwnerId",
                table: "Sparks",
                column: "OwnerId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AiGenerations");

            migrationBuilder.DropTable(
                name: "SparkFavorites");

            migrationBuilder.DropTable(
                name: "Sparks");
        }
    }
}
