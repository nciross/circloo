# Research: 001 platform, OTP sign-in, landing

## R1. Orchestration and zero-cost dev
- **Decision**: Aspire 13.5 AppHost runs `postgres` (with a persistent data volume and pgAdmin off by default), `mailpit` (SMTP and web UI), `api` (project) and `web` (Vite via `AddViteApp`). Docker or Podman both work (`ASPIRE_CONTAINER_RUNTIME=podman`). The Aspire dashboard provides logs, traces and metrics.
- **Rationale**: One command (`dotnet run --project src/Circloo.AppHost`), no cloud, and real Postgres parity.
- **Alternatives**: docker-compose (no service discovery or telemetry dashboard). SQLite in dev (diverges from prod and hides constraint bugs).

## R2. Frontend state management
- **Decision**: **Zustand** for client and UI state (locale/direction, sign-in flow step and email, toast queue) and **TanStack Query** for server state (`/api/me`, sparks). Neither store holds auth tokens: the session is an HttpOnly cookie.
- **Rationale**: Small (~1 KB), explicit, testable stores without boilerplate. Query handles caching, retries and invalidation.
- **Alternatives**: Redux Toolkit (heavier for this scope), Jotai (atom sprawl), plain Context (re-render fan-out).

## R3. One-time code design
- **Decision**:
  - The code is 6 digits from `RandomNumberGenerator.GetInt32(0, 1_000_000)`, zero-padded.
  - It is stored as `HMAC-SHA256(key = OtpPepper, msg = normalizedEmail + ":" + code)`. The pepper comes from configuration (user-secrets in dev, Key Vault in prod). Comparison uses `CryptographicOperations.FixedTimeEquals`.
  - One active challenge per email. A new request supersedes older ones (`SupersededAt`).
  - The challenge expires 10 min after issue and allows 5 attempts. Consuming it is atomic: the conditional update `WHERE ConsumedAt IS NULL AND Attempts < 5`, together with a concurrency token, prevents a double use in a race.
  - The account is created **on successful verify**, not on request, so a code request never touches user state (no enumeration).
- **Rationale**: Codes work across devices and in in-app browsers. The HMAC with a pepper defeats offline brute force of a leaked DB (10^6 space).
- **Alternatives**: Magic link (the founder chose OTP), TOTP (needs an authenticator app).

## R4. Threat model (STRIDE-lite) and controls
| Threat | Control |
|---|---|
| Code brute force | 5 attempts per code. IP verify limiter (30/10 min). Supersede on new request. 10^6 space. |
| Email bombing / cost abuse | Per-email 3/15 min (DB-backed, so it holds across instances). Per-IP 20/h (fixed window). |
| Account enumeration | Identical 202 response and body for every syntactically valid email. Email sending is async through an outbox, so timing doesn't depend on SMTP. Verify failures return one generic error. |
| Session theft (XSS) | `__Host-circloo` cookie: HttpOnly, Secure, SameSite=Lax, Path=/. Strict CSP (`script-src 'self'`, no inline). React escapes output by default. No `dangerouslySetInnerHTML`. |
| CSRF | SameSite=Lax plus antiforgery: `GET /api/auth/csrf` issues an `XSRF-TOKEN` cookie (readable) and a header `X-XSRF-TOKEN` is required on every unsafe method by an endpoint filter. |
| Session fixation / stale sessions | The session id is regenerated at sign-in. A server-side `UserSession` row is validated every request (30 s memory cache, so revocation takes effect in ≤ 30 s). Sliding expiry is 30 days. |
| Open redirect | `returnTo` is accepted only if it is a relative path starting with `/` and not `//` or `/\`. |
| Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY`. |
| Info disclosure | ProblemDetails without stack traces outside Development. Emails are HMAC-hashed in audit and logs. The OTP is never logged. |
| Key compromise | Data Protection key ring persisted in the DB and encrypted with Key Vault in prod. The pepper is rotated through configuration. |
| Supply chain | Central package management, `npm ci` with a lockfile, Dependabot (later chore), pinned SDK. |

## R5. Email delivery
- **Decision**: `IEmailSender` with `SmtpEmailSender` (MailKit → Mailpit in dev) and `AcsEmailSender` (prod, managed identity). Requests write an `EmailOutbox` row and a hosted `EmailOutboxWorker` sends it, retrying 3 times with backoff. Templates are JSON per locale with plain text and minimal inline-styled HTML, without remote images.
- **Rationale**: The async path removes timing leaks and survives transient failures.

## R6. i18n and RTL
- **Decision**: i18next with bundled JSON resources (en loaded eagerly, others lazy-loaded). The detector order is `localStorage` → profile → `navigator.languages` → `en`. `<html lang dir>` is updated on change. Only logical CSS properties are used, and directional icons are mirrored with `:dir(rtl)`.
- **Fonts**: chosen during `/impeccable craft`. They must cover Arabic and Latin (candidates: *Baloo Bhaijaan 2* for display, *Rubik* or *IBM Plex Sans Arabic* for text). They are self-hosted through Fontsource, with no third-party font CDN, to keep the CSP and privacy clean.

## R7. Serving and deployment
- **Decision**: In prod the API serves `wwwroot` (Vite build output) with `MapFallbackToFile("index.html")` for client routes, and `/api/*` is excluded from the fallback. A multi-stage Dockerfile (node build → dotnet publish → `aspnet:10.0-noble-chiseled` non-root) listens on `PORT` 3000. `azure.yaml` points service `web` at `src/Circloo.Api/Dockerfile` with the repo root as context.
- **Rationale**: One container, same-origin cookies, no CORS.

## R8. Rate limiting implementation
- **Decision**: The ASP.NET Core `RateLimiter` uses IP-partitioned fixed windows (`otp-request`: 20/h, `otp-verify`: 30/10 min). The per-email limit is counted in the DB (challenges in the last 15 min). `ForwardedHeaders` trust only the ACA ingress (known networks set by configuration). A rejection returns 429 with `Retry-After`.

## R9. Testing strategy
- **Decision**: API integration tests run against real Postgres (Testcontainers; Ryuk disabled under Podman) through `WebApplicationFactory`, with a fake `IEmailSender` that captures codes. The security suite maps 1:1 to SC-006. Playwright runs against the Aspire-started stack in dev and against the composed container in CI (later). In CI: `dotnet test`, `npm run lint && npm test && npm run build`.
