# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What circloo is
A private collaboration space for circles of friends, families and companies: daily mood/motivation check-ins, real-time shared boards (Klaxoon-style) and icebreakers/jokes in English, French, Arabic (RTL) and Spanish. Sign-up is an email one-time code (OTP). AI (Microsoft Foundry) generates icebreakers. Integrations with Microsoft 365/Teams, Jira, Confluence, Notion and Salesforce are planned. Members invite others by email or by link/code without email. Companies plug in their own SSO through runtime configuration.

Read before product or design work: `PRODUCT.md` (product truth, also read by Impeccable), `docs/product/prd.md` (epics E1–E7), `docs/design/anti-ai-look.md`.
Read before technical work: `.specify/memory/constitution.md` (binding rules), `docs/architecture/overview.md` (stack, env vars, SSO/invite model).

## Rule #1: no issue, no development
Never start implementing without a GitHub issue. If there is none, create one through the **GitHub MCP server** (`.mcp.json`, server `github`), or route ideas through the flow below. Full detail: `docs/workflow/issue-driven-development.md`.

```
type:idea issue → /speckit-specify → /speckit-clarify → /speckit-plan → /speckit-tasks → /speckit-analyze
→ /speckit-taskstoissues (task issues "T001: …", only after the plan) → implement one issue → PR "Closes #N"
```
- **Branches**: `<type>/<number>-<slug>` (e.g. `feat/42-daily-checkin`). **Commits**: Conventional Commits with `#N` (`feat(mood): one-tap check-in (#42)`). **PR title** must be a conventional subject with `(#N)`, because it becomes the single squash commit on `main`. See `docs/workflow/git-conventions.md`. The git hooks (`reference-transaction`, `commit-msg`, `pre-push`, all enabled by `scripts/setup`) block bad branch names, bad commits and any push to `main`.
- `main` only changes through squash merges done by Nicolas. Merged branches are deleted. Never push or commit to `main`.
- PRs must contain `Closes #N`; `.github/workflows/pr-checks.yml` fails otherwise and also compiles the Bicep.
- Bugs and chores need an issue but may skip Spec-Kit.

## Tooling in this repo
- **Spec-Kit** (`.specify/`, skills in `.claude/skills/speckit-*`): specs live in `specs/NNN-slug/`. The git extension creates feature branches `NNN-slug` on `/speckit-specify`.
- **Impeccable** design plugin: enabled in `.claude/settings.json` from the `pbakaus/impeccable` marketplace. Run all UI work through `/impeccable shape|craft|critique|audit|harden`. The root `DESIGN.md` doesn't exist yet. The first `/impeccable craft` creates it, so don't hand-write it. The UI must not look AI-generated (banned patterns in `docs/design/anti-ai-look.md`).
- **GitHub MCP**: remote server `https://api.githubcopilot.com/mcp/`. Auth comes from `scripts/mcp-github-headers.mjs`, which uses `GITHUB_PERSONAL_ACCESS_TOKEN` or else `gh auth token`. Nothing is stored in the repo.
- **Subagents** (`.claude/agents/`): `product-owner` (ideas → idea issues), `architect` (plans), `ux-designer` (Impeccable), `issue-planner` (tasks → issues), `developer` (one issue), `reviewer` (PR checklist), `azure-infra` (IaC), and **`nicolas`**, the lead maintainer who makes the final call on a PR.
- **Nicolas** (`/nicolas <PR#> | sweep | ship <issue#>`, skill in `.claude/skills/nicolas/`): the skill fans out to `reviewer`, plus `ux-designer` for UI changes and `azure-infra` for infra changes. The `nicolas` subagent then verifies their findings, pushes small in-scope fixes, squash-merges when every gate passes, and updates the linked issues, `tasks.md` and the parent idea issue. Gates and limits: `docs/workflow/nicolas.md`. Never merge on pending/failing CI, never `--admin`, never force-push.

## Commands
The `.ps1` scripts need PowerShell 7 (`pwsh`); bash twins (`.sh`) exist.
```powershell
./scripts/setup.ps1                       # once: gh login, git hooks, GitHub labels   (bash: ./scripts/setup.sh)
./scripts/protect-repo.ps1                # admin: squash-only, auto-delete branches, rulesets (needs Pro/public)
./scripts/deploy.ps1 [-Environment dev] [-Location francecentral]   # azd up → rg-circloo-<env>
./scripts/destroy.ps1 [-Environment dev] [-Yes]                     # azd down --purge (whole RG)
az bicep build --file infra/main.bicep --stdout > $null             # validate IaC
```
Never run destroy, `azd down` or `az group delete` unless the user asks for it in the current conversation.

## Architecture (big picture)
- **App**: .NET Aspire. `src/Circloo.AppHost` (orchestration), `src/Circloo.ServiceDefaults`, `src/Circloo.Api` (ASP.NET Core minimal API, EF Core + PostgreSQL) and `src/web` (React + TS + Vite, Zustand + TanStack Query, i18next). In prod a single container (`src/Circloo.Api/Dockerfile`) serves the API and the SPA on `PORT`=3000.
- **Dev = zero cost**: `dotnet run --project src/Circloo.AppHost` starts Postgres and Mailpit containers, the API and Vite (Docker or Podman with `ASPIRE_CONTAINER_RUNTIME=podman`). Tests: `dotnet test` (Testcontainers), `npm test` / `npx playwright test` in `src/web`.
- **Data/services**: PostgreSQL (EF Core), OTP + cookie sessions (per-org OIDC/SAML later), Microsoft Foundry behind `IAiProvider`, SignalR + Yjs for boards, ACS Email (prod) / Mailpit (dev), Blob Storage via managed identity.
- **Infra**: `infra/main.bicep` (subscription scope) creates the single resource group `rg-circloo-<env>`. `infra/modules/app.bicep` holds every resource: Container Apps, ACR, Postgres Flexible, Web PubSub, ACS Email, Storage, Key Vault, Log Analytics/App Insights and a user-assigned identity. App secrets are Key Vault references. `POSTGRES_ADMIN_PASSWORD` and `AUTH_SECRET` are generated by the deploy script into `.azure/<env>/.env` (gitignored).
- **Fun content**: seed icebreakers and jokes in `content/fun/{en,fr,ar,es}.json` (`kind`, `tags` incl. `kids-safe`). Write jokes natively per language, keep them kind, and never translate them literally.

## Conventions
- Every UI string exists in all four locales. Use logical CSS properties for RTL.
- Enterprise behaviour (SSO, policies) is configuration, never customer-specific code.
- New Azure resources go into the Bicep, never the portal.
