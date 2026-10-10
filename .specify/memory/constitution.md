<!--
Sync Impact Report
Version: 1.1.0 → 2.0.0 (MAJOR: technology constraints redefined; founder stack decision #17)
Modified: Technology & Infrastructure Constraints (Next.js/Prisma/Auth.js → .NET Aspire/EF Core/React+TS), VI (test tooling named).
Added principles: VIII. Secure by Design, IX. Zero-Cost Development.
Templates: plan/spec/tasks templates remain compatible (Constitution Check reads the principles below).
Docs updated: docs/architecture/overview.md, PRODUCT.md (Stack), CLAUDE.md.
-->

# circloo Constitution

## Core Principles

### I. No Issue, No Development (NON-NEGOTIABLE)
Every change traces to a GitHub issue. Features flow idea issue → spec → plan → tasks → task issues (`/speckit-taskstoissues`) → code. Task issues are created only **after** the plan exists. Commits reference `#N`; PRs contain `Closes #N`. Branch names and commit messages follow Conventional Commits (`docs/workflow/git-conventions.md`). Bugs and chores need an issue but may skip the spec.

### II. Spec Before Code
`spec.md` describes user value and acceptance scenarios without implementation detail. `plan.md` holds the technical decisions and must pass the Constitution Check. Ambiguities are resolved with `/speckit-clarify`, never guessed in code.

### III. Four Languages, RTL First-Class
Every user-facing string exists in `en`, `fr`, `ar` and `es`, with no hard-coded UI text. Layouts use logical CSS properties and are verified in Arabic RTL. Acceptance criteria for UI stories include an RTL check. Fun content (sparks) ships in all four languages and is written natively per language, not machine-literal.

### IV. Human-Crafted Design (No AI Look)
All UI is shaped and reviewed with the Impeccable skill (`/impeccable shape`, `audit`, `critique`) and follows `docs/design/anti-ai-look.md`. A UI task is not done while audit anti-pattern findings remain unaddressed. WCAG 2.2 AA is the floor.

### V. Private by Default, Configurable for Enterprises
Circle content is visible only to members. Invitations work with or without email and are revocable and expiring. Enterprise concerns (SSO via OIDC/SAML, domain routing, sign-in and invite policies) are **runtime configuration** stored in data plus Key Vault, never per-customer code or redeploys. Secrets never live in the repo or the database.

### VI. Test What Matters
Domain logic and API routes have automated tests written with or before the code. Every user story in a spec has at least one end-to-end acceptance test (Playwright), including one non-Latin locale run. Tests must pass in CI before merge.

### VII. Simple, Disposable Infrastructure
All Azure resources for an environment live in **one** resource group `rg-circloo-<env>`, defined in Bicep under `infra/` and driven by `azd`. Any environment can be created with `scripts/deploy` and removed with `scripts/destroy`. New Azure resources are added to the IaC, never created by hand in the portal. Prefer managed services and managed identity over self-hosted components and keys.

### VIII. Secure by Design (NON-NEGOTIABLE)
Security is designed in, not bolted on. Every plan carries a threat model for what it adds. Defaults: least privilege and managed identity, secrets only in user-secrets (dev) or Key Vault (prod), HttpOnly host-prefixed session cookies, CSRF protection on every unsafe request, a strict Content-Security-Policy without inline scripts, server-side validation of all input, rate limits on anything that sends email, costs money or can be brute-forced, no account enumeration, no secrets or raw personal data in logs (hash them), and errors without internal detail. Security-relevant events are audited. AI features filter inputs and outputs for safety and never receive more personal data than they need.

### IX. Zero-Cost Development
Running, testing and demoing circloo locally needs no paid cloud resource. The Aspire AppHost provides every dependency as a local container or an emulator (database, mail capture, AI fallback). Paid services (Microsoft Foundry, ACS, Azure hosting) are enabled only by configuration in deployed environments, and each one has a free local stand-in.

## Technology & Infrastructure Constraints
- **Backend**: .NET 10, ASP.NET Core minimal APIs (`src/Circloo.Api`), EF Core + PostgreSQL, orchestrated by **.NET Aspire** (`src/Circloo.AppHost`, `src/Circloo.ServiceDefaults`).
- **Frontend**: React + TypeScript (strict) + Vite in `src/web`. **Zustand** holds client state and **TanStack Query** holds server state. i18next provides `en|fr|ar|es`.
- **AI**: Microsoft Foundry (Azure AI Foundry models) behind an `IAiProvider` abstraction, with a free local provider in dev.
- **Real time**: SignalR (Azure SignalR Service / Web PubSub in prod) + Yjs for boards. **Email**: ACS Email in prod, Mailpit in dev. **Files**: Blob Storage (Azurite in dev).
- Deviations require a justified entry in the plan's Complexity Tracking.
- Production is one container (the API serves the SPA) listening on `PORT`. Configuration comes only from environment variables and Key Vault (see `docs/architecture/overview.md`).
- Tests: xUnit + Testcontainers (API), Vitest (web), Playwright (e2e).
- Humour content is kind: no jokes targeting religion, ethnicity, gender, nationality or politics.

## Development Workflow
- Branches are `<type>/<number>-<slug>` (Spec-Kit creates `feat/NNN-slug`). Commits are Conventional Commits with `#N`. PR titles are conventional subjects with `(#N)`.
- `main` receives only squash merges (one commit per PR, subject `<PR title> (#PR)`), performed by Nicolas after the `nicolas/review` approval. Branches are deleted on merge. Nobody pushes to `main`. See `docs/workflow/git-conventions.md`.
- PR checks: linked issue, Bicep compiles, tests pass. UI PRs include Impeccable audit results.
- Product truth lives in `PRODUCT.md`; epics in `docs/product/prd.md`; architecture in `docs/architecture/overview.md`. Plans that change these decisions update the documents in the same PR.

## Governance
This constitution supersedes other practices. Amendments are made with `/speckit-constitution` in a PR linked to an issue, with a version bump (MAJOR: principle removed/redefined; MINOR: principle added; PATCH: wording). Every plan's Constitution Check gate must pass or carry a justified exception.

**Version**: 2.0.0 | **Ratified**: 2026-10-01 | **Last Amended**: 2026-10-01
