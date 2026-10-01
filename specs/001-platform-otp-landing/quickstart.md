# Quickstart: 001

## Prerequisites
- .NET SDK 10.0.1xx or later (pinned in `global.json`), Node 24 and npm.
- Docker Desktop **or** Podman. With Podman, set `ASPIRE_CONTAINER_RUNTIME=podman` and run `podman machine start`.

## Run everything (zero cost)
```bash
cd src/web && npm ci && cd ../..
dotnet run --project src/Circloo.AppHost
```
Open the Aspire dashboard URL printed in the console. It lists `postgres`, `mailpit`, `api` and `web`.

## Validate
1. **Landing** (US1): open the `web` endpoint. Check the 3 jobs and the teaser, then press **Shuffle** and check that the spark changes. Switch to العربية and check that the page mirrors. Reload and check that it stays Arabic.
2. **Sign in** (US2): click the CTA, enter `amina@example.test`, then open the `mailpit` endpoint and read the 6-digit code. Enter it and check that you land on `/app/welcome`.
3. **Profile** (US3): set the name "Amina" and the language Français, and check that the home greets "Amina" in French.
4. **Security** (US2/US4): run `dotnet test`. The `OtpSecurityTests` and `SessionTests` cover reuse, expiry, brute force, enumeration and sign-out-everywhere.
5. **E2E**: `cd src/web && npx playwright test` (stack running; `E2E_BASE_URL` set to the web endpoint, `MAILPIT_URL` to the mailpit endpoint).

## Expected outcomes
- No outbound internet email, no Azure resource used.
- Response headers include the CSP and the other headers listed in `contracts/http-api.md`.
