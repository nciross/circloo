# Implementation Plan: Platform foundation, OTP sign-in and landing page

**Branch**: `feat/001-platform-otp-landing` | **Date**: 2026-10-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-platform-otp-landing/spec.md`. Linked issues: #2, #17, #18.

## Summary

Re-platform circloo on **.NET Aspire 13** with an ASP.NET Core minimal API (`Circloo.Api`) and a **React 19 + TypeScript + Vite** SPA (`src/web`). Client state is managed with **Zustand**, server state with **TanStack Query**. The feature ships:
1. a fun, four-language public landing page with a live icebreaker teaser and an honest integrations teaser;
2. passwordless sign-up/sign-in with a 6-digit email one-time code, with security by design (hashed codes, attempt and rate limits, no enumeration, HttpOnly host-prefixed cookie, server-side sessions with sign-out everywhere, CSRF protection, strict CSP);
3. a profile step and an authenticated home;
4. a one-command, zero-cost local platform (Aspire AppHost: Postgres + Mailpit containers, OpenTelemetry dashboard).

In production the API serves the built SPA as static files from a **single container** on Azure Container Apps (scale to zero).

## Technical Context

**Language/Version**: C# 14 / .NET 10 (LTS), Aspire 13.5. TypeScript 5.x (strict), Node 24.

**Primary Dependencies**: ASP.NET Core minimal APIs, EF Core 10 + Npgsql, ASP.NET Core Data Protection, built-in rate limiter, antiforgery, cookie authentication, MailKit (SMTP for dev), Azure.Communication.Email (prod), Aspire.Hosting.PostgreSQL, CommunityToolkit.Aspire.Hosting.MailPit, Aspire.Hosting.JavaScript (Vite app). Web: React 19, react-router 7, Zustand 5, TanStack Query 5, i18next + react-i18next, Vite 7, self-hosted fonts via Fontsource.

**Storage**: PostgreSQL 17 (Aspire container in dev, Azure Database for PostgreSQL Flexible Server in prod). EF Core migrations. Data Protection keys stored in the DB (dev) and protected with Key Vault (prod).

**Testing**: xUnit v3 + `Microsoft.AspNetCore.Mvc.Testing` + Testcontainers.PostgreSql (API integration and security tests). Vitest + Testing Library (web units). Playwright (e2e in `en` and `ar`). axe-core through `@axe-core/playwright` (a11y).

**Target Platform**: Linux container (ACA) in prod, Windows/macOS/Linux dev with Docker or Podman. Evergreen browsers, mobile-first.

**Project Type**: Web application (API + SPA) orchestrated by Aspire.

**Performance Goals**: Landing page LCP under 2 s on a mid-range phone over 4G (SC-004). JS bundle for the landing route under 150 KB gzip. OTP request API p95 under 300 ms (email sending is asynchronous).

**Constraints**: Zero cloud cost in dev. No inline scripts (CSP). All UI strings in 4 locales. RTL via logical CSS properties. WCAG 2.2 AA.

**Scale/Scope**: MVP. Thousands of users, 5 screens (landing, sign-in, code, profile, home).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against constitution **2.0.0**, amended in this feature (see #17). The previous 1.1.0 named Next.js/Prisma/Auth.js, and the founder's stack decision supersedes that.

| Principle | Status | Evidence |
|---|---|---|
| I. No issue, no development | PASS | Idea issues #2, #18, chore #17. Task issues are created after this plan with `/speckit-taskstoissues`. |
| II. Spec before code | PASS | spec.md has no implementation detail. Technical decisions live here. |
| III. Four languages, RTL first-class | PASS | i18next with `en/fr/ar/es`, `dir` set on `<html>`, logical CSS only, Arabic Playwright run. Server-side email templates in 4 locales. |
| IV. Human-crafted design | PASS | Landing and app shell go through `/impeccable shape` → `craft` (creates `DESIGN.md`) → `audit`/`critique`. Fonts are chosen for Arabic glyph quality. |
| V. Private by default, configurable | PASS | No public user data. The OTP flow keeps a domain-lookup hook point for E6 SSO. Secrets come from user-secrets (dev) or Key Vault (prod), never the repo or the DB. |
| VI. Test what matters | PASS | Domain and security logic are covered by integration tests with a real Postgres. Each user story has a Playwright test, including an `ar` run. |
| VII. Simple, disposable infra | PASS | Dev uses no Azure at all. Prod keeps one RG via Bicep/azd, and the container image changes (single container). |
| VIII. Secure by design (new) | PASS | Threat model in research.md R4. Controls in FR-010..FR-015, FR-022..FR-025. |
| IX. Zero-cost dev (new) | PASS | Aspire runs Postgres and Mailpit containers locally. No paid service is required to run, test or demo. |

Post-design re-check (after Phase 1): PASS. No violations, so Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-platform-otp-landing/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   └── ui-routes.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
Circloo.slnx                         # solution (AppHost, ServiceDefaults, Api, tests)
Directory.Build.props                # nullable, warnings as errors, analyzers
Directory.Packages.props             # central package versions
global.json                          # SDK pin (10.0.x)
src/
├── Circloo.AppHost/                 # Aspire orchestration: postgres, mailpit, api, web (Vite)
├── Circloo.ServiceDefaults/         # OpenTelemetry, health checks, resilience, service discovery
├── Circloo.Api/
│   ├── Program.cs                   # composition root
│   ├── Auth/                        # OTP service, code hasher, session store, cookie events, endpoints
│   ├── Users/                       # profile endpoints
│   ├── Sparks/                      # public teaser endpoint (read-only seed sparks)
│   ├── Email/                       # IEmailSender, SMTP + ACS senders, localized templates, outbox worker
│   ├── Security/                    # headers middleware, antiforgery filter, rate-limit policies, audit
│   ├── Data/                        # CircloDbContext, entities, migrations
│   ├── Resources/emails/{en,fr,ar,es}.json
│   └── Dockerfile                   # multi-stage: build web + api → one image
└── web/                             # React SPA
    ├── index.html
    ├── src/
    │   ├── app/                     # router, providers, layout shells
    │   ├── features/landing/        # landing page sections + icebreaker teaser
    │   ├── features/auth/           # email step, code step
    │   ├── features/profile/
    │   ├── features/home/
    │   ├── stores/                  # Zustand stores (ui/locale, auth flow)
    │   ├── api/                     # fetch client (CSRF), TanStack Query hooks
    │   ├── i18n/                    # i18next setup + locales/{en,fr,ar,es}.json
    │   └── styles/                  # tokens.css, global.css (from DESIGN.md)
    ├── e2e/                         # Playwright specs
    └── vite.config.ts
tests/
└── Circloo.Api.Tests/               # xUnit integration + security tests (Testcontainers)
content/fun/                         # seed sparks (copied into the API at build)
```

**Structure Decision**: An Aspire solution with one deployable API that serves the SPA in production. In dev the SPA runs under Vite, proxied to the API so cookies stay same-origin. Next.js is dropped (constitution 2.0.0).

## Complexity Tracking

No violations.
