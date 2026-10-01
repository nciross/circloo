---
description: "Tasks for 001 platform foundation, OTP sign-in and landing page"
---

# Tasks: Platform foundation, OTP sign-in and landing page

**Input**: `specs/001-platform-otp-landing/` (plan, spec, research, data-model, contracts)
**Tests**: Required by constitution VI (domain/API tests, one Playwright test per story, Arabic run).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Amend the constitution to 2.0.0 (Aspire/.NET + React/TS, principles VIII secure by design and IX zero-cost dev) and update `docs/architecture/overview.md`, `PRODUCT.md` Stack, `CLAUDE.md`, `.gitignore` in `.specify/memory/constitution.md` (#20)
- [ ] T002 Scaffold the Aspire solution: `Circloo.slnx`, `global.json`, `Directory.Build.props`, `Directory.Packages.props`, `src/Circloo.AppHost`, `src/Circloo.ServiceDefaults`, `src/Circloo.Api`, `tests/Circloo.Api.Tests` (#21)
- [ ] T003 [P] Scaffold the React 19 + TS strict + Vite SPA in `src/web` with ESLint, Vitest, Zustand, TanStack Query, react-router, i18next and a `/api` dev proxy (#22)
- [ ] T004 Wire the AppHost: postgres (+ volume), mailpit, api (references db and mailpit), web via `AddViteApp`, Podman support, in `src/Circloo.AppHost/AppHost.cs` (#23)
- [ ] T005 [P] CI: add a `build-test` job (dotnet build/test with Testcontainers, web lint/test/build) to `.github/workflows/pr-checks.yml` (#24)

## Phase 2: Foundational (blocks all stories)

- [ ] T006 EF Core `CirclooDbContext` with User, OtpChallenge, UserSession, AuditEvent, EmailOutbox and DataProtection keys, plus the initial migration and migrate-on-start in dev, in `src/Circloo.Api/Data/` (#25)
- [ ] T007 Security baseline: security headers/CSP middleware, ProblemDetails without internals, forwarded headers, antiforgery endpoint filter and `GET /api/auth/csrf`, in `src/Circloo.Api/Security/` (#26)
- [ ] T008 [P] Email pipeline: `IEmailSender` (SMTP/Mailpit and ACS), outbox, `EmailOutboxWorker`, localized `otp-code` templates in 4 languages, in `src/Circloo.Api/Email/` (#27)
- [ ] T009 [P] Audit service with HMAC email/IP hashing in `src/Circloo.Api/Security/Audit.cs` (#28)
- [ ] T010 [P] Web foundation: i18n with `en/fr/ar/es` resources and `dir` switching, `useUiStore`, API client with CSRF header, `["me"]` query, router with guards, in `src/web/src/{i18n,stores,api,app}` (#29)
- [ ] T011 Design system: `/impeccable shape` + `craft` for the landing and the app shell. Creates `DESIGN.md`, `src/web/src/styles/tokens.css` and self-hosted Arabic+Latin fonts (#30)

## Phase 3: User Story 1 - Landing page (P1) 🎯 MVP

- [ ] T012 [P] [US1] `GET /api/public/sparks/random` serving kids-safe icebreakers from `content/fun` in `src/Circloo.Api/Sparks/`, with tests (#31)
- [ ] T013 [US1] Landing page sections (hero, three jobs, icebreaker teaser with Shuffle, integrations "coming soon", how it works, CTA, footer language switcher) in `src/web/src/features/landing/`, in 4 languages (#32)
- [ ] T014 [US1] Playwright: landing in `en` and `ar` (RTL, shuffle, language persistence, axe) in `src/web/e2e/landing.spec.ts` (#33)

## Phase 4: User Story 2 - OTP sign-in (P1)

- [ ] T015 [US2] OTP service (generate, HMAC hash, supersede, attempts, expiry, atomic consume, per-email limit) plus `POST /api/auth/otp/request|verify`, session creation and the cookie, in `src/Circloo.Api/Auth/` (#34)
- [ ] T016 [US2] Security tests: reuse, expiry, 5-attempt lockout, supersede, enumeration parity, rate limit 429, CSRF required, headers present, in `tests/Circloo.Api.Tests/OtpSecurityTests.cs` (#35)
- [ ] T017 [US2] Sign-in UI: email step, code step (one-time-code autocomplete, paste, resend timer), `useSignInStore`, in `src/web/src/features/auth/` (#36)
- [ ] T018 [US2] Playwright: sign in through the Mailpit API in `en` and `ar` in `src/web/e2e/signin.spec.ts` (#37)

## Phase 5: User Story 3 - Profile and home (P2)

- [ ] T019 [US3] `GET /api/me`, `PUT /api/me/profile` with validation and tests in `src/Circloo.Api/Users/` (#38)
- [ ] T020 [US3] Welcome (profile) screen, home with "coming next" modules, settings, returnTo handling, in `src/web/src/features/{profile,home}/` (#39)

## Phase 6: User Story 4 - Sign out (P2)

- [ ] T021 [US4] Session validation (30 s cache), sign-out, sign-out-everywhere endpoints and tests in `src/Circloo.Api/Auth/Sessions.cs`, `tests/Circloo.Api.Tests/SessionTests.cs`, plus UI actions (#40)

## Phase 7: User Story 5 - Zero-cost local platform (P3) and polish

- [ ] T022 [US5] Production container: multi-stage `src/Circloo.Api/Dockerfile` (SPA in wwwroot, chiseled, non-root, PORT 3000), `azure.yaml` service path, README quickstart (#41)
- [ ] T023 Impeccable `audit` + `critique` + `harden` on landing, sign-in, profile and home. Fix the findings (#42)

## Dependencies
- T001 → everything. T002 → T004, T006–T009. T003 → T010 → T011 → T013, T017, T020.
- US1 (T012–T014) and US2 (T015–T018) can run in parallel after Phase 2. US3 needs US2. US4 needs US2.
