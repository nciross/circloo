// headersHelper for the GitHub MCP server in .mcp.json.
// Prints the Authorization header as JSON. Token source, in order:
//   1. GITHUB_PERSONAL_ACCESS_TOKEN env var
//   2. the GitHub CLI login (`gh auth token`) — run `gh auth login` once; nothing is stored in the repo.
import { execFileSync } from 'node:child_process';

let token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
if (!token) {
  try {
    token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    console.error('No GitHub token: set GITHUB_PERSONAL_ACCESS_TOKEN or run `gh auth login`.');
    process.exit(1);
  }
}
process.stdout.write(JSON.stringify({ Authorization: `Bearer ${token}` }));
