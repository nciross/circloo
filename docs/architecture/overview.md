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
| Group calls (audio and video) | **Self-hosted LiveKit SFU**, one node, image `livekit/livekit-server:v1.13.7` (pinned). Browsers use `livekit-client` 2.22.3 (lazy-loaded). The API mints short-lived call passes (HS256 JWT signed with the LiveKit API secret, no SDK) and enforces the speaking mode, mutes and removals through LiveKit's RoomService API and one webhook. LiveKit's own STUN/TURN (UDP 7882, TCP 7881, TURN/TLS on 443); no third party. **Media is never recorded or stored**: no Egress, Ingress or SIP. Switches, hands, reactions and chat stay on the SignalR circle hub | Zoom/Teams-grade calls for the whole circle (simulcast, adaptive stream, dynacast, active speaker) with media on a server we run (founder decision 2026-10-08, spec 009). Replaces the earlier browser mesh |
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
├── livekit  (livekit/livekit-server:v1.13.7: group calls; fixed ports 7880/tcp, 7881/tcp, 7882/udp; no TURN, no egress)
├── api      (Circloo.Api)  → circloodb, mailpit, blobs, converter, livekit
└── web      (Vite dev server) → proxies /api to api
```
Run it with `dotnet run --project src/Circloo.AppHost`. It works with Docker or Podman (`ASPIRE_CONTAINER_RUNTIME=podman`). The LiveKit secret is an AppHost parameter generated once into user-secrets (`livekit-secret`); `livekit-node-ip` (default `127.0.0.1`) can be set to the LAN address to test calls from a phone.

## Security by design (constitution VIII)
- Rate limits are in memory per replica (at most 3 replicas, reset on scale to zero), so the effective per-IP ceilings are up to 3× the configured values. The per-email limits and the daily guess budget are counted in the database and hold globally.
- Sessions use the HttpOnly, Secure, SameSite=Lax `__Host-circloo` cookie, backed by a `UserSession` row. Revocation (sign-out everywhere) takes effect in ≤ 30 s.
- CSRF uses an `XSRF-TOKEN` cookie plus an `X-XSRF-TOKEN` header, required on every unsafe method.
- One-time codes are stored as an HMAC with a pepper, single use, valid 10 min, with 5 attempts. Rate limits apply per email (DB-counted) and per IP. Responses are identical whether or not an account exists.
- A strict CSP is applied (`script-src 'self'`, no inline scripts, `frame-ancestors 'none'`), along with HSTS, nosniff and a strict referrer policy.
- `Permissions-Policy` denies camera and microphone everywhere except the two room routes (`/c/{id}`, `/app/circles/{id}`), where `self` is allowed for group calls (spec 009). The audience screen keeps the deny-all policy. `connect-src` adds only the call server's origin, built from `LiveKit__Url`.
- Call passes are minted per member by `POST /api/circles/{id}/call/token` (CSRF, rate limited, 5-minute lifetime, never logged). The call server's webhook (`POST /api/livekit/webhook`) is authenticated by its HMAC signature and body hash, not by cookie.
- For calls only chat messages are stored. Calls, joins, speakers, the floor, mutes and reactions are never written to the database or logs; the audit keeps switch changes, removals and refusals with ids only (spec 009 FR-922, FR-930).
- The audit trail (`AuditEvent`) hashes email and IP. Codes and secrets are never logged.
- Data Protection keys are persisted in the DB and wrapped with Key Vault in prod.

## Infrastructure (`infra/`)
- `infra/main.bicep` (subscription scope) creates **one resource group `rg-circloo-<env>`**. `infra/modules/app.bicep` puts every resource inside it.
- It is driven by the Azure Developer CLI (`azure.yaml`, service `web` → `src/Circloo.Api/Dockerfile`, built from the repo root). `scripts/deploy.*` and `scripts/destroy.*` wrap it.
- The app listens on `PORT` (3000). Key Vault secrets reach the app as env vars: `ConnectionStrings__circloodb`, `Security__Pepper`, `Email__AcsConnectionString`, `Ai__*` (later). Plain settings: `ConnectionStrings__blobs` (blob endpoint, managed identity), `Presentations__Container`, `Presentations__ConverterUrl`, `Circles__MaxPeople` (people per circle, default 100, at most 288 = 48 characters × 6 rings; spec 008). Group calls (spec 009): `LiveKit__Url` (the call server's `wss://` address; **empty means calls are unavailable**), `LiveKit__ApiUrl` (RoomService address, defaults from `Url`), `LiveKit__ApiKey` (key id, plain), `LiveKit__ApiSecret` (**Key Vault secret `livekit-api-secret`**, generated by the deploy script as `LIVEKIT_API_SECRET` into `.azure/<env>/.env`), `LiveKit__TokenMinutes` (5), `Discussion__AwayEndSeconds` (300). The 2026-10-05 `Discussion__*` keys for the mesh and recording (`StageMax`, `ListenersMax`, `IceUrls__*`, `SeatGraceSeconds`, `InviteSeconds`, `AwayFreezeSeconds`, `Recording*`) are removed.
- **The app runs one replica** (`maxReplicas: 1`): SignalR groups, presence and the quiz clock are in memory until the Web PubSub backplane lands. Data-side rules (one answer per person, conversion leases) already hold across replicas. During a rollout the new revision briefly runs beside the old one, so deploy outside live sessions.
- **Call server** (spec 009, research R23, founder decision D8): one small Linux VM in the same resource group (`infra/modules/livekit.bicep`), **created only when the `callsEnabled` parameter (`CALLS_ENABLED`) is true; it is false by default in every environment.** An NSG opens only 443/tcp, 7881/tcp, 7882/udp and 3478/udp (no public SSH); cloud-init runs the pinned LiveKit image with host networking and Caddy for TLS; a system-assigned identity reads `livekit-api-secret` from Key Vault at boot. Per-environment parameters (defaults from `environmentName`, overridable by azd variables): **prod**: `callsVmSize` `Standard_B2als_v2`, `callsDiskSku` `StandardSSD_LRS`, `callsTurnTls` true (a second static IP and name `turn-<token>` for TURN/TLS on 443), no shutdown; about $45 a month before egress, sized up only if the load test needs it. **dev and other environments** (cost kept minimal): `Standard_B2ats_v2`, `Standard_LRS` (Standard HDD), one static IP (`lk-<token>`, no TURN/TLS on 443), `callsShutdownTime` `2000` Paris time (DevTest Labs auto-shutdown deallocates the VM); about $5 to $10 a month when used, zero while calls are disabled. A deallocated VM is started again by `scripts/deploy` (it runs `az vm start` when calls are enabled) or by `scripts/calls-start` without a full deploy; while it is off, starting a call answers "try again". Container Apps cannot host it well: its ingress has no UDP and port 443 is taken. Like the converter, it is an exception to "one production container", recorded in the spec 009 plan's Complexity Tracking and in a MINOR constitution amendment (D9, task T930). Without a call server, deployed environments show "Group calls are not available here". Local development uses the free `livekit` container.
- **Deck converter** (spec 006): a second Container App `ca-conv-<token>` running `gotenberg/gotenberg:8.37.0` (pinned), the one justified exception to "one production container" (plan Complexity Tracking). It has internal ingress only, no managed identity, no secrets, scales to zero, and has webhooks, download-from and Chromium routes disabled. Outbound traffic is not blocked yet (no VNet), so the API strips externally linked pictures, media and OLE objects from decks before converting them; a VNet with egress rules is later hardening.

## Configurable enterprise SSO (E6)
SSO is **data, not code**. The table `IdentityProvider { organizationId, kind: 'oidc'|'saml', issuer, clientId, clientSecretRef, domains[], enabled }` keeps secrets in Key Vault, with only a reference in the DB. At sign-in, the email domain is looked up **before** a code is issued: a verified domain mapped to an enabled IdP redirects there, and otherwise the OTP flow is used (if org policy allows). ASP.NET Core OIDC handlers are built per request from the DB row. SAML goes through a SAML→OIDC bridge.

## Integrations (E9)
A connector framework with OAuth per organization: Microsoft 365/Teams (Graph), Jira and Confluence (Atlassian Cloud), Notion, Salesforce. Connections are runtime configuration. Tokens are encrypted with Data Protection and stored with Key Vault-backed keys.

## Domain model (initial)
`User`, `OtpChallenge`, `UserSession`, `AuditEvent`, `EmailOutbox`, then `Organization`, `IdentityProvider`, `Circle` (kind: friends|family|team), `Membership`, `Invite`, `CheckIn`, `Reaction`, `Board`, `Spark`. Group calls store only their settings on `Circle` (`DiscussionOn`, `DiscussionVideo`, `DiscussionSpeaking`); nothing about a call itself is stored (spec 009).
