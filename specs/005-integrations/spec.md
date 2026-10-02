# Feature Specification: Integrations, send circle results out

**Issues**: #79 (API), #80 (UI) · **Parent idea**: #19 (E9 integrations hub) · **Status**: Ready

## Intent
A circle ends with decisions and ideas. The animator sends them where the team already works:
a Microsoft Teams channel, Jira issues, a Confluence page or a Notion page. Salesforce stays "coming soon".

## User stories
- **US1 (P1)** In Integrations, a signed-in person connects a service with the details it needs, tests it,
  and disconnects it. Secrets are never shown again (only a masked hint).
- **US2 (P1)** In a circle room, the animator chooses "Send results" and a connected service; circloo builds
  a report (board columns with notes sorted by votes, circloo's summaries) and sends it; the room shows a link.
- **US3 (P2)** The public site marks Teams, Jira, Confluence and Notion as available.

## What is sent
- **Teams**: an adaptive card to a Workflows (Power Automate) webhook URL of a channel.
- **Jira**: one issue per note of the action column (next / start / improve / ideas), top-voted first, max 20, in a project.
- **Confluence**: one page in a space with the whole report.
- **Notion**: one page under a parent page with the whole report.

## Security
- FR-501 Secrets encrypted with Data Protection, scoped per user; API responses carry only masked hints.
- FR-502 Outbound hosts are allow-listed per provider (https only, *.atlassian.net, api.notion.com, Teams/Power
  Automate workflow hosts); no redirects; 15 s timeout; response bodies never echoed to the client.
- FR-503 Export is animator-only, rate limited, audited.
