using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Circloo.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class LiveRoomBigCircles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CircleMembers_CircleId_Character",
                table: "CircleMembers");

            migrationBuilder.AddColumn<string>(
                name: "ReactionTotals",
                table: "PresentationSessions",
                type: "jsonb",
                nullable: false,
                // Sessions from before start with no reactions (spec 008 FR-818).
                defaultValueSql: "'{}'::jsonb");

            migrationBuilder.AddColumn<string>(
                name: "ChatMode",
                table: "Circles",
                type: "character varying(8)",
                maxLength: 8,
                nullable: false,
                // Existing circles get an open chat (spec 008 FR-811).
                defaultValue: "open");

            migrationBuilder.AddColumn<bool>(
                name: "PirikooQuiet",
                table: "Circles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "ReactionsOn",
                table: "Circles",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "HiddenAt",
                table: "CircleMessages",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Ring",
                table: "CircleMembers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "MessageLikes",
                columns: table => new
                {
                    MessageId = table.Column<long>(type: "bigint", nullable: false),
                    MemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    At = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MessageLikes", x => new { x.MessageId, x.MemberId });
                    table.ForeignKey(
                        name: "FK_MessageLikes_CircleMembers_MemberId",
                        column: x => x.MemberId,
                        principalTable: "CircleMembers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MessageLikes_CircleMessages_MessageId",
                        column: x => x.MessageId,
                        principalTable: "CircleMessages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RaisedHands",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    CircleId = table.Column<Guid>(type: "uuid", nullable: false),
                    MemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    RaisedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    HasFloor = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RaisedHands", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RaisedHands_CircleMembers_MemberId",
                        column: x => x.MemberId,
                        principalTable: "CircleMembers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RaisedHands_Circles_CircleId",
                        column: x => x.CircleId,
                        principalTable: "Circles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CircleMembers_CircleId_Character_Ring",
                table: "CircleMembers",
                columns: new[] { "CircleId", "Character", "Ring" },
                unique: true,
                filter: "\"LeftAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_MessageLikes_MemberId",
                table: "MessageLikes",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_RaisedHands_CircleId_Floor",
                table: "RaisedHands",
                column: "CircleId",
                unique: true,
                filter: "\"HasFloor\"");

            migrationBuilder.CreateIndex(
                name: "IX_RaisedHands_CircleId_MemberId",
                table: "RaisedHands",
                columns: new[] { "CircleId", "MemberId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RaisedHands_MemberId",
                table: "RaisedHands",
                column: "MemberId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MessageLikes");

            migrationBuilder.DropTable(
                name: "RaisedHands");

            migrationBuilder.DropIndex(
                name: "IX_CircleMembers_CircleId_Character_Ring",
                table: "CircleMembers");

            migrationBuilder.DropColumn(
                name: "ReactionTotals",
                table: "PresentationSessions");

            migrationBuilder.DropColumn(
                name: "ChatMode",
                table: "Circles");

            migrationBuilder.DropColumn(
                name: "PirikooQuiet",
                table: "Circles");

            migrationBuilder.DropColumn(
                name: "ReactionsOn",
                table: "Circles");

            migrationBuilder.DropColumn(
                name: "HiddenAt",
                table: "CircleMessages");

            migrationBuilder.DropColumn(
                name: "Ring",
                table: "CircleMembers");

            // Going back only works while no character is shared: two active members on one character would break this
            // unique index. Free the extra copies (set LeftAt) before rolling back.
            migrationBuilder.CreateIndex(
                name: "IX_CircleMembers_CircleId_Character",
                table: "CircleMembers",
                columns: new[] { "CircleId", "Character" },
                unique: true,
                filter: "\"LeftAt\" IS NULL");
        }
    }
}
