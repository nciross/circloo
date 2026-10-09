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
- The app listens on `PORT` (3000). Key Vault secrets reach the app as env vars: `ConnectionStrings__circloodb`, `Security__Pepper`, `Email__AcsConnectionString`, `Ai__*` (later). Plain settings: `ConnectionStrings__blobs` (blob endpoint, managed identity), `Presentations__Container`, `Presentations__ConverterUrl`, `Circles__MaxPeople` (people per circle, default 100, at most 288 = 48 characters × 6 rings; spec 008). Group calls (spec 009), set by Bicep **only when `callsEnabled` is true**: `LiveKit__Url` (`wss://lk-<token>.<region>.cloudapp.azure.com`; **absent or empty means calls are unavailable**), `LiveKit__ApiUrl` (`https://lk-<token>.<region>.cloudapp.azure.com`, RoomService through Caddy), `LiveKit__ApiKey` (`circloo`, the key id, plain), `LiveKit__ApiSecret` (**Key Vault secret `livekit-api-secret`**, a Container Apps secret reference through the user-assigned identity; generated by the deploy script as `LIVEKIT_API_SECRET` into `.azure/<env>/.env`), `Discussion__AwayEndSeconds` (300). `LiveKit__TokenMinutes` keeps its code default (5). The 2026-10-05 `Discussion__*` keys for the mesh and recording (`StageMax`, `ListenersMax`, `IceUrls__*`, `SeatGraceSeconds`, `InviteSeconds`, `AwayFreezeSeconds`, `Recording*`) are removed.
- **The app runs one replica** (`maxReplicas: 1`): SignalR groups, presence and the quiz clock are in memory until the Web PubSub backplane lands. Data-side rules (one answer per person, conversion leases) already hold across replicas. During a rollout the new revision briefly runs beside the old one, so deploy outside live sessions.
- **Call server** (spec 009, research R23, founder decision D8): one small Linux VM in the same resource group (`infra/modules/livekit.bicep`), **created only when the `callsEnabled` parameter (`CALLS_ENABLED`) is true; it is false by default in every environment**, and an environment without it has none of its resources. Details, parameters and monthly costs: [Call server](#call-server-group-calls) below. Container Apps cannot host it well: its ingress has no UDP and port 443 is taken. Like the converter, it is an exception to "one production container", recorded in the spec 009 plan's Complexity Tracking and accepted by constitution 2.1.0 (D9, task T930). Without a call server, deployed environments show "Group calls are not available here". Local development uses the free `livekit` container.
- **Deck converter** (spec 006): a second Container App `ca-conv-<token>` running `gotenberg/gotenberg:8.37.0` (pinned), the one justified exception to "one production container" (plan Complexity Tracking). It has internal ingress only, no managed identity, no secrets, scales to zero, and has webhooks, download-from and Chromium routes disabled. Outbound traffic is not blocked yet (no VNet), so the API strips externally linked pictures, media and OLE objects from decks before converting them; a VNet with egress rules is later hardening.

### Call server (group calls)
Spec 009 T917 (#257), research R23 and R28. Everything below exists only when `callsEnabled` is true.

- **What runs**: an Ubuntu 24.04 LTS VM `vm-circloo-<token>` (Trusted Launch, system-assigned identity) with Docker running `livekit/livekit-server:v1.13.7` (the same pin as the AppHost and the tests) and Caddy with its layer4 module (`livekit/caddyl4:v2.11.3`), both pinned and on host networking. Caddy terminates TLS on 443 with Let's Encrypt certificates (TLS-ALPN challenge, so port 80 stays closed) for `lk-<token>` (WebSocket and Twirp, to LiveKit on 7880) and, with `callsTurnTls`, for `turn-<token>` (to LiveKit's TURN on 5349 with `external_tls` and a PROXY protocol v2 header, so TURN sees each browser's address). LiveKit's configuration is `infra/livekit/livekit.yaml`: `node_ip` = the static IP, `udp_port: 7882`, `tcp_port: 7881`, TURN/UDP on 3478, `auto_create: false`, `enable_remote_unmute: false`, the speaker-detection values of #276, webhook to `https://<web app>/api/livekit/webhook`, logging `warn` with `pion_level: error`. No egress, ingress or SIP. `CallServerConfigTests` checks it like `livekit.dev.yaml`.
- **Boot**: `infra/livekit/cloud-init.yaml` is the first-boot customData: Docker and jq, daily unattended security upgrades (with a 03:00 UTC reboot when an update needs one), journald kept 3 days, sshd masked. It holds nothing deployment-specific, because Azure cannot change customData once the VM exists. `infra/livekit/boot.sh`, filled in by Bicep, is the VM's userData (no secret in it): `circloo-calls.service` reads it from the instance metadata service and runs it at every boot. It reads `livekit-api-secret` from Key Vault with the VM's identity (Key Vault Secrets User on that one secret, retrying while the role assignment propagates) into the root-only `/etc/livekit/keys.yaml`, writes both configurations and replaces the two containers. A deployment that changes `boot.sh` or `livekit.yaml` applies at the next start (`az vm restart` in production). A change to `cloud-init.yaml` needs the VM deleted and provisioned again.
- **Network**: `vnet-circloo-<token>` (10.40.0.0/24) with an NSG on its subnet. From the internet it allows only 443/tcp, 7881/tcp, 7882/udp and 3478/udp; there is no SSH (use Run Command, and rebuild rather than repair). One more rule opens LiveKit's TURN relay ports 30000-40000/udp **to the VM's own public IP only**: TURN relays a browser's media to the call server's public address, and Azure routes a VM's traffic to its own public IP out and back in through the NSG. Standard static public IPs: `pip-circloo-<token>` with DNS label `lk-<token>` always, `pip-circloo-turn-<token>` with `turn-<token>` only with `callsTurnTls`.
- **Secrets**: `scripts/deploy` generates `LIVEKIT_API_SECRET` (64 letters and digits) and `CALLS_VM_PASSWORD` (Azure requires an administrator password on a Linux VM; it is never used) into `.azure/<env>/.env`, like `AUTH_SECRET`, in every environment, so turning calls on needs nothing else.
- **Parameters**: defaults come from `environmentName` (`prod` or anything else); each is overridden with an azd variable (`azd env set NAME value`), and an empty value means the default.

  | Parameter (azd variable) | `prod` | Other environments (dev) |
  |---|---|---|
  | `callsEnabled` (`CALLS_ENABLED`) | false | false |
  | `callsVmSize` (`CALLS_VM_SIZE`) | `Standard_B2als_v2` (2 vCPU burstable, 4 GiB) | `Standard_B2ats_v2` (2 vCPU burstable, 1 GiB); `Standard_B1ms` (1 vCPU, 2 GiB) if a 5-person video call does not hold on it |
  | `callsDiskSku` (`CALLS_DISK_SKU`) | `StandardSSD_LRS` | `Standard_LRS` (Standard HDD), 32 GiB in both |
  | `callsTurnTls` (`CALLS_TURN_TLS`) | true: a second static IP and name `turn-<token>` for TURN/TLS on 443 | false: one IP, TURN over UDP 3478 and ICE/TCP 7881 only |
  | `callsShutdownTime` (`CALLS_SHUTDOWN_TIME`) | none | `2000`, Romance Standard Time (Paris), a DevTest Labs daily auto-shutdown that deallocates the VM; `off` disables it |
- **Starting it again**: a deployment does not start a deallocated VM. `scripts/deploy` runs `scripts/calls-start` after provisioning when calls are enabled, and `./scripts/calls-start.ps1 -Environment dev` (or `./scripts/calls-start.sh dev`) starts it without a full deploy (one `az vm start`; LiveKit answers about a minute later). While it is off, starting a call answers "try again".
- **Turning it off**: setting `CALLS_ENABLED` back to false removes the app settings at the next deploy but does not delete the VM, because deployments only add or update. The deploy script warns when a VM is left. `scripts/destroy` removes everything with the resource group.
- **Monthly cost** (USD, pay-as-you-go Linux prices for francecentral from the [Azure Retail Prices API](https://prices.azure.com/api/retail/prices), queried 2026-10-09; 730 hours a month; before taxes and any discount):

  | Item | Unit price | `prod` profile | dev profile |
  |---|---|---|---|
  | VM | B2als_v2 $0.0425/h, B2ats_v2 $0.0106/h | $31.03 (always on) | $7.74 if always on; $2.80 for 264 h (12 h on 22 working days); $0 while deallocated |
  | OS disk, 32 GiB | E4 Standard SSD $2.64/month, S4 Standard HDD $1.69/month | $2.64 | $1.69 (billed while deallocated too) |
  | Standard static public IPv4 | $0.005/h each | $7.30 (two IPs) | $3.65 (one IP, billed while deallocated too) |
  | **Total before disk operations and egress** | | **$40.97** | **$13.08** always on, **$8.14** at 264 h, **$5.34** deallocated all month, **$0** with `callsEnabled` false |

  Not included: disk operations (S4 $0.0005 and E4 $0.002 per 10,000) and internet egress (the first 100 GB a month are free, then $0.087 per GB). The `Standard_B1ms` dev fallback is $0.0236/h: $17.23 if always on, $6.23 for 264 h.

## Configurable enterprise SSO (E6)
SSO is **data, not code**. The table `IdentityProvider { organizationId, kind: 'oidc'|'saml', issuer, clientId, clientSecretRef, domains[], enabled }` keeps secrets in Key Vault, with only a reference in the DB. At sign-in, the email domain is looked up **before** a code is issued: a verified domain mapped to an enabled IdP redirects there, and otherwise the OTP flow is used (if org policy allows). ASP.NET Core OIDC handlers are built per request from the DB row. SAML goes through a SAML→OIDC bridge.

## Integrations (E9)
A connector framework with OAuth per organization: Microsoft 365/Teams (Graph), Jira and Confluence (Atlassian Cloud), Notion, Salesforce. Connections are runtime configuration. Tokens are encrypted with Data Protection and stored with Key Vault-backed keys.

## Domain model (initial)
`User`, `OtpChallenge`, `UserSession`, `AuditEvent`, `EmailOutbox`, then `Organization`, `IdentityProvider`, `Circle` (kind: friends|family|team), `Membership`, `Invite`, `CheckIn`, `Reaction`, `Board`, `Spark`. Group calls store only their settings on `Circle` (`DiscussionOn`, `DiscussionVideo`, `DiscussionSpeaking`); nothing about a call itself is stored (spec 009).
