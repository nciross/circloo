# Implementation Plan: Live polls, Q&A and satisfaction forms in a circle

**Branch**: `feat/136-circle-polls-qa-forms` (spec and plan); code on `feat/<task-issue>-*` | **Date**: 2026-10-03 |
**Spec**: [spec.md](spec.md) | **Parent idea**: #136

**Input**: Feature specification from `specs/007-circle-polls-qa-forms/spec.md`

## Summary

Three new circle activities: **Poll** (live vote with optional hidden results), **Q&A** (questions, upvotes,
answers, optional anonymity, moderation) and **Feedback form** (a form of up to 10 rating, recommend, choice, yes/no
and free-text questions, built in the room or picked from a personal **My forms** library). Everything runs over the
existing circle hub with server-enforced uniqueness, safety filtering and privacy (no raw votes or responses reach
members; free text stays with the animator). Results are kept with the circle and included in "Send results". See
[research.md](research.md) for the decisions.

## Technical Context

**Language/Version**: C# / .NET 10 (API), TypeScript strict / React 19 (web)

**Primary Dependencies**: existing ASP.NET Core minimal APIs, SignalR circle hub, EF Core (Npgsql), Zustand, TanStack
Query, i18next. No new packages.

**Storage**: PostgreSQL: `Poll`, `PollVote`, `QaQuestion`, `QaUpvote`, `Form`, `FormResponse`, `SavedForm`
(+ `Circle.QaAllowAnonymous`), one migration.

**Testing**: xUnit + Testcontainers (Postgres), Vitest, Playwright (en desktop + ar phone, axe)

**Target Platform**: Azure Container Apps (existing single container) + modern browsers, phones first for participants

**Project Type**: web application (API + SPA in one production container)

**Performance Goals**: vote / upvote / question fan-out < 1 s on the local stack (SC-702); counts throttled to 4/s
per item; summary computed on demand for ≤ 12 responses

**Constraints**: zero-cost dev; WCAG 2.2 AA; four locales with RTL; reduced motion; safety filter on all text;
single replica (spec 006 pin) for hub groups

**Scale/Scope**: circles of ≤ 12 people; ≤ 6 options per poll; ≤ 10 questions per form; one open poll and one open
form per circle; saved forms per user unbounded but purged after 365 idle days

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design: PASS (no deviation).*

| Principle | How this plan complies |
|---|---|
| I. No issue, no development | Idea #136 → this spec/plan → task issues via `/speckit-taskstoissues`; each PR `Closes #N` |
| II. Spec before code | spec.md is free of implementation detail; 3 clarifications recorded; decisions here and in research.md |
| III. Four languages, RTL | All strings in `en/fr/ar/es` (`decide.*`, `forms.*`); bars and the 0–10 scale use logical properties; e2e in ar |
| IV. Human-crafted design | `/impeccable shape` for poll, Q&A, form builder, form filling, summary and My forms before code; `audit` + `critique` in each UI PR |
| V. Private by default | Circle-only data; hidden results and anonymous authors never sent to members; free text animator-only; saved forms owner-only |
| VI. Test what matters | Unit tests for percentages, summary maths, validation; hub integration tests for rules, privacy and uniqueness; one Playwright journey per story incl. Arabic |
| VII. Simple, disposable infra | No new Azure resource |
| VIII. Secure by design | Threat model below; rate limits; server-side validation; audit events |
| IX. Zero-cost development | Runs fully on the local AppHost |

## Threat model (constitution VIII)

| Threat | Mitigation |
|---|---|
| Vote/upvote/response stuffing (several tabs, replays) | Unique indexes `(PollId, MemberId)`, `(QuestionId, MemberId)`, `(FormId, MemberId)`; upserts in one transaction; participants only; per-connection rate limits |
| Leaking hidden poll results or form answers through the network | Server sends only aggregates; hidden results only to the animator group; free text only via the animator's summary endpoint |
| De-anonymising Q&A authors | Payloads never include the author of an anonymous question (animator included); exports keep anonymity; the author id stays server-side for moderation and audit |
| Abusive or unsafe text | `TextRules.Clean` + `SafetyPolicy` on every text field; animator can hide questions; refused text is never stored |
| Flooding a circle | Ask ≤ 5/min, vote/upvote ≤ 10/s, submit ≤ 1/s per connection; REST library writes 30/min per user |
| Reading another user's saved forms | Owner check, 404 otherwise |
| Acting in a closed circle or after removal | Membership and `IsOpen` re-checked on every hub call (existing) |
| CSRF on library writes | Existing antiforgery filter on `/api` |
| Logs leaking content | Audit stores ids and outcomes (`poll.opened/closed`, `form.opened/closed/shared`, `qa.hidden`), never text |

## Project Structure

### Documentation (this feature)

```text
specs/007-circle-polls-qa-forms/
├── plan.md              # This file
├── research.md          # Decisions R1–R12
├── data-model.md        # Entities and derived views
├── quickstart.md        # Manual validation guide
├── contracts/
│   ├── hub.md           # Circle hub methods and events
│   └── rest.md          # My forms, circle view, summary, export
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/Circloo.Api/
├── Common/Percentages.cs                 # largest remainder (shared with spec 006)
├── Circles/ActivityCatalog.cs            # + poll, qa, feedback
├── Circles/CircleHub.Decide.cs           # poll, Q&A, form hub methods
├── Circles/CircleEndpoints.cs            # CircleView.decide
├── Decide/PollRules.cs                   # validation, results
├── Decide/FormRules.cs                   # question validation, answer validation
├── Decide/FormSummary.cs                 # averages, NPS, distributions
├── Decide/FormEndpoints.cs               # My forms REST + circle form summary/save
├── Decide/FormJanitor.cs                 # 365-day idle purge of saved forms
├── Data/Entities.cs, CirclooDbContext.cs, Migrations/*_CirclePollsQaForms.cs
└── Integrations/CircleReport.cs          # report items for polls, Q&A, forms

src/web/src/
├── api/forms.ts                          # My forms + summary hooks
├── features/circles/decide/
│   ├── decide.ts                         # Zustand slice fed by hub events
│   ├── PollPanel.tsx, PollEditor.tsx, PollResults.tsx
│   ├── QaPanel.tsx
│   ├── FormBuilder.tsx (shared with My forms), FormFill.tsx, FormSummary.tsx
├── features/forms/MyForms.tsx, FormEditorPage.tsx   # /app/forms, /app/forms/:id
├── styles/decide.css
└── i18n/locales/{en,fr,ar,es}.json       # decide.*, forms.*

tests/Circloo.Api.Tests/Decide/           # rules, summary, hub, endpoints
src/web/e2e/decide.spec.ts                # poll, Q&A, form journeys (en + ar, axe)
```

**Structure Decision**: same web-application layout as specs 003–006; the new server code lives in a `Decide`
folder, hub methods in a `CircleHub` partial, UI under `features/circles/decide` plus a My forms page.

## Complexity Tracking

No constitution deviation. Note: hub groups and throttles are per replica; the app stays pinned to one replica as
decided in spec 006 until the Web PubSub backplane issue lands.
