# Architecture overview

> Target architecture. It is built feature by feature through Spec-Kit (`specs/`). Change this file when a plan changes a decision here. Stack decision: #17 (constitution 2.0.0).

## Stack
| Concern | Choice | Why |
|---|---|---|
| Orchestration | **.NET Aspire 13** (`src/Circloo.AppHost`, `src/Circloo.ServiceDefaults`) | One command runs everything locally. OpenTelemetry dashboard, service discovery and health checks |
| API | **ASP.NET Core minimal APIs**, .NET 10 (`src/Circloo.Api`) | Fast, secure defaults (Data Protection, antiforgery, rate limiting) |
| Web app | **React + TypeScript (strict) + Vite** SPA in `src/web` | Rich interactive UI (boards, icebreaker games) |
| State | **Zustand** (client/UI state) + **TanStack Query** (server state) | Small, explicit stores. Caching and invalidation for API data |
| Data | **PostgreSQL** via **EF Core** (Npgsql) | Relational data (circles, members, invites, SSO config) |
| Auth | Email **one-time code** (6 digits) + cookie session (`__Host-circloo`) and server-side sessions. Per-org OIDC/SAML later (E6) | Passwordless, works across devices |
| AI | **Microsoft Foundry** (Azure AI Foundry model deployment) behind `IAiProvider`. Free local provider in dev | Fresh icebreakers tailored to a circle, with content safety |
| Email | **ACS Email** (prod) · **Mailpit** container (dev) | OTP codes, invitations |
| Real-time boards | **SignalR** (Azure SignalR in prod) + **Yjs** CRDT per board | Live cursors and conflict-free edits |
| Files | Blob Storage (managed identity) · Azurite in dev | Avatars, board exports |
| i18n | i18next, locales `en`, `fr`, `ar` (RTL), `es`. Messages in `src/web/src/i18n/locales/*.json`. Server emails in `src/Circloo.Api/Resources/emails/*.json` | |
| Hosting | **Azure Container Apps** (scale to zero) + ACR. One container: the API serves the SPA | Simple, cheap, WebSocket-capable |
| Secrets | user-secrets (dev) · **Key Vault** via managed identity (prod) | |
| Telemetry | OpenTelemetry → Aspire dashboard (dev) · Application Insights (prod) | |

## Local topology (zero cost)
```
Circloo.AppHost
├── postgres (container, data volume) ── circloodb
├── mailpit  (container: SMTP + web UI)
├── api      (Circloo.Api)  → circloodb, mailpit
└── web      (Vite dev server) → proxies /api to api
```
Run it with `dotnet run --project src/Circloo.AppHost`. It works with Docker or Podman (`ASPIRE_CONTAINER_RUNTIME=podman`).

## Security by design (constitution VIII)
- Sessions use the HttpOnly, Secure, SameSite=Lax `__Host-circloo` cookie, backed by a `UserSession` row. Revocation (sign-out everywhere) takes effect in ≤ 30 s.
- CSRF uses an `XSRF-TOKEN` cookie plus an `X-XSRF-TOKEN` header, required on every unsafe method.
- One-time codes are stored as an HMAC with a pepper, single use, valid 10 min, with 5 attempts. Rate limits apply per email (DB-counted) and per IP. Responses are identical whether or not an account exists.
- A strict CSP is applied (`script-src 'self'`, no inline scripts, `frame-ancestors 'none'`), along with HSTS, nosniff and a strict referrer policy.
- The audit trail (`AuditEvent`) hashes email and IP. Codes and secrets are never logged.
- Data Protection keys are persisted in the DB and wrapped with Key Vault in prod.

## Infrastructure (`infra/`)
- `infra/main.bicep` (subscription scope) creates **one resource group `rg-circloo-<env>`**. `infra/modules/app.bicep` puts every resource inside it.
- It is driven by the Azure Developer CLI (`azure.yaml`, service `web` → `src/Circloo.Api/Dockerfile`, built from the repo root). `scripts/deploy.*` and `scripts/destroy.*` wrap it.
- The app listens on `PORT` (3000). Key Vault secrets reach the app as env vars: `ConnectionStrings__circloodb`, `Otp__Pepper`, `Email__AcsConnectionString`, `Ai__Foundry__*`.

## Configurable enterprise SSO (E6)
SSO is **data, not code**. The table `IdentityProvider { organizationId, kind: 'oidc'|'saml', issuer, clientId, clientSecretRef, domains[], enabled }` keeps secrets in Key Vault, with only a reference in the DB. At sign-in, the email domain is looked up **before** a code is issued: a verified domain mapped to an enabled IdP redirects there, and otherwise the OTP flow is used (if org policy allows). ASP.NET Core OIDC handlers are built per request from the DB row. SAML goes through a SAML→OIDC bridge.

## Integrations (E9)
A connector framework with OAuth per organization: Microsoft 365/Teams (Graph), Jira and Confluence (Atlassian Cloud), Notion, Salesforce. Connections are runtime configuration. Tokens are encrypted with Data Protection and stored with Key Vault-backed keys.

## Domain model (initial)
`User`, `OtpChallenge`, `UserSession`, `AuditEvent`, `EmailOutbox`, then `Organization`, `IdentityProvider`, `Circle` (kind: friends|family|team), `Membership`, `Invite`, `CheckIn`, `Reaction`, `Board`, `Spark`.
