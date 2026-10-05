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
| Live discussion media | **WebRTC peer mesh** between browsers (audio and video), signalling (`offer`/`answer`/`ice`) over the same SignalR circle hub. Public STUN by configuration, no TURN yet. **No media on circloo servers or at rest**; the animator-only record is text (`Recording`, `RecordingEvent`) | Free to run, keeps media out of the trust boundary. Stage ≤ 8 senders, opt-in viewers ≤ 8 (spec 009). A media server (SFU) or TURN relay would be a later decision |
| Files | Blob Storage (managed identity) · Azurite in dev | Slide pictures of presentations (container `presentations`, private, streamed by the API after an access check), avatars, board exports |
| Deck conversion | **Gotenberg 8** (LibreOffice) in its own container: .pptx → PDF; the API renders PDF pages to WebP with PDFium | Faithful PowerPoint rendering for free, with the untrusted-file parser isolated from the API (spec 006) |
| i18n | i18next, locales `en`, `fr`, `ar` (RTL), `es`. Messages in `src/web/src/i18n/locales/*.json`. Server emails in `src/Circloo.Api/Resources/emails/*.json` | |
| Hosting | **Azure Container Apps** (scale to zero) + ACR. One container: the API serves the SPA | Simple, cheap, WebSocket-capable |
| Secrets | user-secrets (dev) · **Key Vault** via managed identity (prod) | |
| Telemetry | OpenTelemetry → Aspire dashboard (dev) · Application Insights (prod) | |

## Local topology (zero cost)
```
Circloo.AppHost
├── postgres (container, data volume) ── circloodb
├── mailpit  (container: SMTP + web UI)
├── storage  (Azurite container, data volume) ── blobs
├── converter (gotenberg/gotenberg:8.37.0 container: .pptx → PDF, ~1.7 GB pulled once)
├── api      (Circloo.Api)  → circloodb, mailpit, blobs, converter
└── web      (Vite dev server) → proxies /api to api
```
Run it with `dotnet run --project src/Circloo.AppHost`. It works with Docker or Podman (`ASPIRE_CONTAINER_RUNTIME=podman`).

## Security by design (constitution VIII)
- Rate limits are in memory per replica (at most 3 replicas, reset on scale to zero), so the effective per-IP ceilings are up to 3× the configured values. The per-email limits and the daily guess budget are counted in the database and hold globally.
- Sessions use the HttpOnly, Secure, SameSite=Lax `__Host-circloo` cookie, backed by a `UserSession` row. Revocation (sign-out everywhere) takes effect in ≤ 30 s.
- CSRF uses an `XSRF-TOKEN` cookie plus an `X-XSRF-TOKEN` header, required on every unsafe method.
- One-time codes are stored as an HMAC with a pepper, single use, valid 10 min, with 5 attempts. Rate limits apply per email (DB-counted) and per IP. Responses are identical whether or not an account exists.
- A strict CSP is applied (`script-src 'self'`, no inline scripts, `frame-ancestors 'none'`), along with HSTS, nosniff and a strict referrer policy.
- `Permissions-Policy` denies camera and microphone everywhere except the two room routes (`/c/{id}`, `/app/circles/{id}`), where `self` is allowed for the live discussion (spec 009). The audience screen keeps the deny-all policy.
- The audit trail (`AuditEvent`) hashes email and IP. Codes and secrets are never logged.
- Data Protection keys are persisted in the DB and wrapped with Key Vault in prod.

## Infrastructure (`infra/`)
- `infra/main.bicep` (subscription scope) creates **one resource group `rg-circloo-<env>`**. `infra/modules/app.bicep` puts every resource inside it.
- It is driven by the Azure Developer CLI (`azure.yaml`, service `web` → `src/Circloo.Api/Dockerfile`, built from the repo root). `scripts/deploy.*` and `scripts/destroy.*` wrap it.
- The app listens on `PORT` (3000). Key Vault secrets reach the app as env vars: `ConnectionStrings__circloodb`, `Security__Pepper`, `Email__AcsConnectionString`, `Ai__*` (later). Plain settings: `ConnectionStrings__blobs` (blob endpoint, managed identity), `Presentations__Container`, `Presentations__ConverterUrl`, `Circles__MaxPeople` (people per circle, default 100, at most 288 = 48 characters × 6 rings; spec 008). Live discussion (spec 009, all plain settings with code defaults, no secret): `Discussion__StageMax` (8), `Discussion__ListenersMax` (8), `Discussion__IceUrls__0..n` (default `stun:stun.cloudflare.com:3478`; blank in local runs; a later TURN entry would carry time-limited credentials issued by the API, secret in Key Vault), `Discussion__SeatGraceSeconds` (30), `Discussion__InviteSeconds` (60), `Discussion__AwayFreezeSeconds` (60), `Discussion__AwayEndSeconds` (300), `Discussion__RecordingNoticeSeconds` (5), `Discussion__RecordingMaxMinutes` (240), `Discussion__RecordingWarnMinutes` (15), `Discussion__RecordingMaxEvents` (50000), `Discussion__RecordingsPerCircle` (50). No Bicep change: a TURN relay would need an azure-infra task (Container Apps has no UDP ingress, to verify).
- **The app runs one replica** (`maxReplicas: 1`): SignalR groups, presence and the quiz clock are in memory until the Web PubSub backplane lands. Data-side rules (one answer per person, conversion leases) already hold across replicas. During a rollout the new revision briefly runs beside the old one, so deploy outside live sessions.
- **Deck converter** (spec 006): a second Container App `ca-conv-<token>` running `gotenberg/gotenberg:8.37.0` (pinned), the one justified exception to "one production container" (plan Complexity Tracking). It has internal ingress only, no managed identity, no secrets, scales to zero, and has webhooks, download-from and Chromium routes disabled. Outbound traffic is not blocked yet (no VNet), so the API strips externally linked pictures, media and OLE objects from decks before converting them; a VNet with egress rules is later hardening.

## Configurable enterprise SSO (E6)
SSO is **data, not code**. The table `IdentityProvider { organizationId, kind: 'oidc'|'saml', issuer, clientId, clientSecretRef, domains[], enabled }` keeps secrets in Key Vault, with only a reference in the DB. At sign-in, the email domain is looked up **before** a code is issued: a verified domain mapped to an enabled IdP redirects there, and otherwise the OTP flow is used (if org policy allows). ASP.NET Core OIDC handlers are built per request from the DB row. SAML goes through a SAML→OIDC bridge.

## Integrations (E9)
A connector framework with OAuth per organization: Microsoft 365/Teams (Graph), Jira and Confluence (Atlassian Cloud), Notion, Salesforce. Connections are runtime configuration. Tokens are encrypted with Data Protection and stored with Key Vault-backed keys.

## Domain model (initial)
`User`, `OtpChallenge`, `UserSession`, `AuditEvent`, `EmailOutbox`, then `Organization`, `IdentityProvider`, `Circle` (kind: friends|family|team), `Membership`, `Invite`, `CheckIn`, `Reaction`, `Board`, `Spark`; live discussion: `Recording`, `RecordingEvent` (text only, readable by the animator only).
