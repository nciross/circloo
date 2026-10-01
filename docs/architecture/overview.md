# Architecture overview

> Target architecture. Application code doesn't exist yet: it's built feature by feature through Spec-Kit (`specs/`). Change this file when a plan changes a decision here.

## Stack
| Concern | Choice | Why |
|---|---|---|
| Web app | **Next.js** (App Router, TypeScript) in `src/web`, standalone Docker image | One deployable for UI and API; good i18n/RTL support |
| Data | **PostgreSQL** (Azure Flexible Server) via **Prisma** | Relational data (circles, members, invites, SSO config) |
| Auth | **Auth.js** | Email magic link plus per-organization OIDC/SAML (see below) |
| Email | **Azure Communication Services Email** | Magic links and invitations |
| Real-time boards | **Azure Web PubSub** + a CRDT (**Yjs**) document per board | Live cursors and conflict-free edits, managed WebSockets |
| Files | **Azure Blob Storage** (managed identity, no keys) | Avatars, board images/exports |
| i18n | `next-intl`, locales `en`, `fr`, `ar` (RTL), `es`; messages in `src/web/messages/*.json` | |
| Hosting | **Azure Container Apps** (scale to zero) + ACR | Simple, cheap, WebSocket-capable |
| Secrets | **Key Vault**, read by the app's user-assigned managed identity | |
| Telemetry | Application Insights + Log Analytics | |

## Infrastructure (`infra/`)
- `infra/main.bicep` (subscription scope) creates **one resource group `rg-circloo-<env>`**. `infra/modules/app.bicep` puts every resource inside it.
- Driven by the Azure Developer CLI (`azure.yaml`). The scripts in `scripts/` wrap it:
  - `scripts/deploy.ps1|sh [env] [location]`: generates secrets once (stored in `.azure/<env>/.env`, gitignored), then runs `azd up`, or only `azd provision` while `src/web/Dockerfile` doesn't exist.
  - `scripts/destroy.ps1|sh [env]`: runs `azd down --purge` (Key Vault is purged so the name can be reused). If there's no local azd env, it runs `az group delete`.
- The container app starts from a placeholder image until the first `azd deploy`. The app must listen on `PORT` (3000).
- Secrets reach the app as env vars from Key Vault: `DATABASE_URL`, `AUTH_SECRET`, `WEB_PUBSUB_CONNECTION_STRING`, `ACS_CONNECTION_STRING`. Other env: `EMAIL_FROM`, `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER`, `AZURE_CLIENT_ID`, `APPLICATIONINSIGHTS_CONNECTION_STRING`.

## Configurable enterprise SSO
SSO is **data, not code**:
- Table `IdentityProvider { organizationId, kind: 'oidc'|'saml', issuer, clientId, clientSecretRef, domains[], enabled }`. Secrets are stored in Key Vault, and only a reference is kept in the DB.
- On sign-in, the email domain is looked up. If a verified domain maps to an enabled IdP, the user is redirected there. Otherwise the email magic link is used (if the org policy allows it).
- OIDC uses Auth.js's generic OIDC provider, built dynamically per request from the DB row. SAML goes through a SAML→OIDC bridge (e.g. BoxyHQ SAML Jackson, embedded) so the auth layer only speaks OIDC.
- Org admins manage IdPs from an admin screen. Adding a company requires no redeploy.

## Invitations
- `Invite { circleId, kind: 'email'|'link', email?, codeHash, expiresAt, maxUses, uses, createdBy }`.
- Link/code invites let a person join with only a display name (a "guest member" without email). They can attach an email later to get magic-link sign-in. Org policy may disable link invites.

## Domain model (initial)
`User`, `Organization`, `IdentityProvider`, `Circle` (kind: friends|family|team; optional `organizationId`), `Membership` (role), `Invite`, `CheckIn` (mood 1–5, note, need, date), `Reaction`, `Board` (template, Yjs snapshot), `Spark` (lang, kind, tags, circleId nullable for global seed content).
