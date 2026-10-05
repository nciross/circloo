using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Circloo.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PresentationAutoOpen : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AutoOpen",
                table: "PresentationSessions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "AutoOpen",
                table: "Presentations",
                type: "boolean",
                nullable: false,
                // Existing presentations open answers automatically too (#170); running sessions keep how they started.
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AutoOpen",
                table: "PresentationSessions");

            migrationBuilder.DropColumn(
                name: "AutoOpen",
                table: "Presentations");
        }
    }
}
