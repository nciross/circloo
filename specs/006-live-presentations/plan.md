# Implementation Plan: Live presentations with votes and quizzes

**Branch**: `docs/64-live-presentations-spec` (plan); code on `feat/<task-issue>-*` | **Date**: 2026-10-02 |
**Spec**: [spec.md](spec.md) | **Parent idea**: #64

**Input**: Feature specification from `specs/006-live-presentations/spec.md`

## Summary

Animators upload a .pptx into a personal library; circloo validates it, converts it to one picture per slide in an
isolated converter, keeps speaker notes, and lets the animator insert poll and quiz slides. In a circle, the new
**Presentation** activity keeps everyone on the animator's slide over the existing circle hub, collects one answer per
participant (server-enforced, server-timed), and reveals results with an animated, character-led reveal: a "first
answer" spotlight, a "first correct answer" celebration, and a podium. An audience screen mirrors the session on a
projector. See [research.md](research.md) for every decision and its alternatives.

## Technical Context

**Language/Version**: C# / .NET 10 (API), TypeScript strict / React 19 (web)

**Primary Dependencies**: existing ASP.NET Core minimal APIs, SignalR, EF Core (Npgsql), Aspire 13; new:
`DocumentFormat.OpenXml` (validation, notes), `PDFtoImage` + `SkiaSharp.NativeAssets.Linux.NoDependencies`
(PDF → WebP), `Aspire.Azure.Storage.Blobs` (blobs), Aspire hosting `Aspire.Hosting.Azure.Storage` (Azurite);
container `gotenberg/gotenberg:8` (.pptx → PDF); web: `qrcode` (audience QR)

**Storage**: PostgreSQL (presentations, slides, sessions, answers); Azure Blob Storage `presentations` container
(Azurite in dev) for slide pictures and the transient source file

**Testing**: xUnit + Testcontainers (Postgres, Azurite, Gotenberg), Vitest, Playwright (en desktop + ar phone)

**Target Platform**: Azure Container Apps (Linux, chiseled .NET image) + modern browsers, phones first for
participants

**Project Type**: web application (API + SPA in one production container) + one converter sidecar app

**Performance Goals**: 30-slide deck ready < 60 s (SC-601); slide/question/reveal fan-out < 1 s (SC-603); slide
pictures ≤ 250 KB at 1920 px, thumbnails ≤ 30 KB; reveal animation 60 fps on mid-range phones, ≤ 1.5 s

**Constraints**: zero-cost dev (constitution IX); uploads ≤ 50 MB / 100 slides; private by default (no public
blobs); WCAG 2.2 AA; four locales with RTL; reduced motion respected

**Scale/Scope**: circles of up to 12 people (spec 003 `MaxPeople`); presentations ≤ 100 deck + 50 question slides;
2 conversions in parallel per API replica

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design: PASS (one justified deviation).*

| Principle | How this plan complies |
|---|---|
| I. No issue, no development | Idea #64 → this spec/plan → task issues via `/speckit-taskstoissues`; each PR `Closes #N` |
| II. Spec before code | spec.md has no implementation detail; decisions live here and in research.md; 3 clarifications recorded |
| III. Four languages, RTL | New strings in `en/fr/ar/es` (`presentations.*`); bars and podium use logical properties and grow from the inline start; e2e in ar |
| IV. Human-crafted design | `/impeccable shape` for library, editor, presenter, participant, audience and reveal before code; `audit` + `critique` before PRs; no banned patterns (R7) |
| V. Private by default | Library is per owner; slide images through an access-checked endpoint; members see only slides already shown; no public blobs; notes animator-only |
| VI. Test what matters | Unit + integration tests for validation, conversion, hub rules and scoring; one Playwright journey per user story incl. Arabic |
| VII. Simple, disposable infra | New resources only in Bicep: blob container `presentations`, converter Container App, env vars; destroyable with the RG |
| VIII. Secure by design | Threat model below; rate limits on upload and answers; validation server-side; audit events; no file contents in logs |
| IX. Zero-cost development | Azurite and Gotenberg run as local containers from the AppHost; no cloud service needed to demo |
| Tech constraints: "one production container" | **Deviation**: the converter is a second Container App. Justified in Complexity Tracking |

## Threat model (constitution VIII)

| Threat | Mitigation |
|---|---|
| Malicious .pptx exploiting the office parser (RCE in LibreOffice) | Conversion in a separate Gotenberg container with no secrets, no managed identity, internal ingress only, no outbound internet (Container Apps internal environment rule / dev: no published ports except to the API), 120 s timeout, killed and restarted on failure; API pre-validates with Open XML |
| Zip bomb / huge decks exhausting memory or disk | 50 MB request limit on the endpoint; uncompressed size, entry count and slide count caps before conversion; 2 conversions per replica; PDFium renders page by page |
| Macro or embedded active content reaching browsers | Macro files refused; only rasterised WebP pictures are ever served; notes are plain text and rendered as text |
| Reading someone else's deck or future slides | Owner check on library endpoints; image endpoint requires owner or a circle member whose session already reached that slide; 404 on any denial |
| Vote stuffing / double answers | Unique (session, question, member) index; upsert guarded by phase and server deadline; participants only; answer rate limit 10/s per connection |
| Answering after time / clock tampering | Server timestamps only; deadline checked in the same transaction; client countdown is display only (corrected with `serverNow`) |
| Leaking who answered what | Before reveal only counts go to animator/audience; results are aggregates; only the first/first-correct person is named and only when the spotlight is on |
| Upload abuse / storage cost | `PresentationUpload` rate limit (10/user/hour), 12-month idle purge, source file deleted after conversion |
| Logs leaking content | Audit stores ids and outcomes only; file names truncated in UI only, never logged; no notes or question text in logs |
| CSRF on uploads and edits | Existing antiforgery header on every unsafe method, multipart included |

## Project Structure

### Documentation (this feature)

```text
specs/006-live-presentations/
├── plan.md              # this file
├── research.md          # decisions R1–R10
├── data-model.md        # entities, phases, validation
├── quickstart.md        # validation scenarios
├── contracts/
│   ├── rest.md          # library, questions, slide images
│   └── hub.md           # presenting over /hubs/circle
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (next)
```

### Source Code (repository root)

```text
src/Circloo.AppHost/AppHost.cs                 # + storage (Azurite) with blobs, + converter (gotenberg) container
src/Circloo.Api/
├── Presentations/
│   ├── PresentationEndpoints.cs               # REST contract
│   ├── DeckInspector.cs                       # Open XML validation, slide count, notes, hidden flags
│   ├── SlideConverter.cs                      # Gotenberg client + PDFium rasteriser (IDeckConverter for tests)
│   ├── PresentationConverterService.cs        # BackgroundService + Channel, progress, restart recovery
│   ├── SlideStore.cs                          # blob paths, read/write/delete
│   ├── PresentationRules.cs                   # limits and question validation
│   ├── LiveSession.cs                         # session state machine, results, scoring, podium (pure, unit-tested)
│   ├── QuizClock.cs                           # hosted deadline locker
│   └── PresentationJanitor.cs                 # 12-month purge + orphan sweep
├── Circles/CircleHub.cs                       # + presentation methods/events (hub contract)
├── Circles/ActivityCatalog.cs                 # + "presentation" activity (category "present")
├── Data/Entities.cs, CirclooDbContext.cs      # + Presentation, Slide, PresentationSession, SessionAnswer
├── Data/Migrations/*_LivePresentations.cs
└── Security/RateLimits.cs                     # + PresentationUpload
tests/Circloo.Api.Tests/
├── Presentations/*Tests.cs                    # inspector, converter (fake + container), endpoints, live session, clock
└── fixtures/decks/*.pptx|pptm                 # demo, encrypted, macro, fake, 101 slides, zip bomb
src/web/src/
├── features/presentations/
│   ├── Library.tsx, Editor.tsx, QuestionForm.tsx   # US1–US2
│   ├── api.ts                                      # TanStack Query hooks for the REST contract
│   └── reveal.ts (+ reveal.test.ts)                # percentages, winners, countdown maths
├── features/circles/present/
│   ├── PresenterView.tsx, ParticipantView.tsx, AudienceScreen.tsx
│   ├── Results.tsx, Spotlight.tsx, Podium.tsx, Confetti.tsx, Countdown.tsx
│   └── presentation.ts                             # Zustand slice fed by hub events
├── styles/presentations.css
└── i18n/locales/{en,fr,ar,es}.json                 # presentations.*
src/web/e2e/presentations.spec.ts
infra/modules/app.bicep                              # + blob container, converter app (internal), env vars
docs/architecture/overview.md                        # topology, files, converter
```

**Structure Decision**: follow the existing feature-folder layout (`Circles/`, `features/circles`) with a new
`Presentations/` API folder and `features/presentations` web folder; presenting UI lives under the circle room
because it is an activity of a circle.

## Delivery slices (for /speckit-tasks)

1. **Infra and plumbing**: AppHost (Azurite, Gotenberg), blob store, Bicep (container, converter app, env), entities
   + migration, rate limit.
2. **US1 library** (API + web): upload, inspector, converter service, progress, thumbnails, rename/hide/delete,
   janitor.
3. **US2 questions** (API + web): question CRUD, reorder, validation, editor UI.
4. **US3 presenting** (hub + web): session, sync, presenter view, notes, blank, late join, audience screen with QR.
5. **US4 answering** (hub + web): answer rules, counts, quiz clock, live polls.
6. **US5 reveal** (hub + web): results, spotlight, animated reveal, reduced motion, text alternative.
7. **US6 quiz extras**: correct/first-correct, scoring, podium.
8. **Docs and e2e**: overview, PRODUCT/PRD touch-ups, Playwright journeys, Impeccable audit.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Second production container (Gotenberg converter app) besides the single app container | Rendering arbitrary .pptx needs LibreOffice; running an untrusted-file parser isolated from the API's identity and secrets is a security requirement (VIII) | LibreOffice inside the API image: +1 GB, slow deploys, parser shares the API's managed identity and Key Vault access; paid conversion APIs or Microsoft Graph: cost, third-party data sharing, no zero-cost dev |
| Native PDF engine (PDFium via PDFtoImage) in the API | Server-side rasterisation keeps hidden slides, notes and future slides off participants' devices | Client-side pdf.js would ship the whole deck to every participant (privacy, size) |
