using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Circloo.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class LiveCircles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Purpose",
                table: "AiGenerations",
                type: "character varying(12)",
                maxLength: 12,
                nullable: false,
                defaultValue: "sparks");

            migrationBuilder.CreateTable(
                name: "Circles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    JoinCode = table.Column<string>(type: "character(10)", fixedLength: true, maxLength: 10, nullable: false),
                    Activities = table.Column<string[]>(type: "text[]", nullable: false),
                    CurrentActivity = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    Locale = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ClosedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Circles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Circles_Users_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CircleMembers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CircleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Character = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    JoinedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LeftAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CircleMembers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CircleMembers_Circles_CircleId",
                        column: x => x.CircleId,
                        principalTable: "Circles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CircleMembers_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CircleMessages",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CircleId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActivityId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    MemberId = table.Column<Guid>(type: "uuid", nullable: true),
                    Kind = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    Text = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CircleMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CircleMessages_Circles_CircleId",
                        column: x => x.CircleId,
                        principalTable: "Circles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CircleMembers_CircleId_Character",
                table: "CircleMembers",
                columns: new[] { "CircleId", "Character" },
                unique: true,
                filter: "\"LeftAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CircleMembers_CircleId_UserId",
                table: "CircleMembers",
                columns: new[] { "CircleId", "UserId" },
                unique: true,
                filter: "\"UserId\" IS NOT NULL AND \"LeftAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CircleMembers_UserId",
                table: "CircleMembers",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_CircleMessages_CircleId_Id",
                table: "CircleMessages",
                columns: new[] { "CircleId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Circles_JoinCode",
                table: "Circles",
                column: "JoinCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Circles_OwnerUserId_CreatedAt",
                table: "Circles",
                columns: new[] { "OwnerUserId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CircleMembers");

            migrationBuilder.DropTable(
                name: "CircleMessages");

            migrationBuilder.DropTable(
                name: "Circles");

            migrationBuilder.DropColumn(
                name: "Purpose",
                table: "AiGenerations");
        }
    }
}
