<!--
Sync Impact Report
Version: 1.0.0 → 1.1.0 (git conventions: conventional branches/commits, squash-only main via Nicolas)
Principles added: I–VII. Sections added: Technology & Infrastructure Constraints, Development Workflow, Governance.
Templates: plan/spec/tasks templates are compatible (Constitution Check reads the principles below).
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

## Technology & Infrastructure Constraints
- Next.js (App Router, TypeScript strict) in `src/web`; PostgreSQL via Prisma; Auth.js; next-intl; Azure Web PubSub + Yjs for boards; ACS Email; Blob Storage. Deviations require a justified entry in the plan's Complexity Tracking.
- The container listens on `PORT`; configuration only via environment variables (see `docs/architecture/overview.md`).
- Humour content is kind: no jokes targeting religion, ethnicity, gender, nationality or politics.

## Development Workflow
- Branches are `<type>/<number>-<slug>` (Spec-Kit creates `feat/NNN-slug`). Commits are Conventional Commits with `#N`. PR titles are conventional subjects with `(#N)`.
- `main` receives only squash merges (one commit per PR, subject `<PR title> (#PR)`), performed by Nicolas after the `nicolas/review` approval. Branches are deleted on merge. Nobody pushes to `main`. See `docs/workflow/git-conventions.md`.
- PR checks: linked issue, Bicep compiles, tests pass. UI PRs include Impeccable audit results.
- Product truth lives in `PRODUCT.md`; epics in `docs/product/prd.md`; architecture in `docs/architecture/overview.md`. Plans that change these decisions update the documents in the same PR.

## Governance
This constitution supersedes other practices. Amendments are made with `/speckit-constitution` in a PR linked to an issue, with a version bump (MAJOR: principle removed/redefined; MINOR: principle added; PATCH: wording). Every plan's Constitution Check gate must pass or carry a justified exception.

**Version**: 1.1.0 | **Ratified**: 2026-10-01 | **Last Amended**: 2026-10-01
