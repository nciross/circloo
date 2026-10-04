---

description: "Tasks for live presentations (spec 006)"
---

# Tasks: Live presentations with votes and quizzes

**Input**: Design documents from `specs/006-live-presentations/` (plan, spec, research, data-model, contracts, quickstart)

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rest.md, contracts/hub.md

**Tests**: required by the constitution (VI): every task ships its API tests (xUnit + Testcontainers) and, for UI
tasks, its Playwright journey in `en` (desktop) and `ar` (phone) with axe.

**Organization**: one task = one GitHub task issue = one PR (repo convention, see specs 004/005). Each task lists the
concrete steps and files; IDs use the 6xx range of this spec. Paths follow plan.md (API `src/Circloo.Api`, tests
`tests/Circloo.Api.Tests`, web `src/web`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel with the other [P] tasks of the same phase (different files, no dependency)
- **[Story]**: user story from spec.md (US1–US6)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: local and Azure plumbing every story needs.

- [x] T601 Platform for presentations: in `src/Circloo.AppHost/AppHost.cs` add `AddAzureStorage("storage").RunAsEmulator()` with `.AddBlobs("blobs")` and a `converter` container (`gotenberg/gotenberg:8`, HTTP endpoint 3000, no published external port), referenced by the API as `Presentations__ConverterUrl`; add packages to `Directory.Packages.props` and `src/Circloo.Api/Circloo.Api.csproj` (`DocumentFormat.OpenXml`, `PDFtoImage`, `SkiaSharp.NativeAssets.Linux.NoDependencies`, `Aspire.Azure.Storage.Blobs`) and to the AppHost (`Aspire.Hosting.Azure.Storage`); add `qrcode` + `@types/qrcode` to `src/web/package.json`; in `infra/modules/app.bicep` add blob container `presentations`, a converter Container App (`gotenberg/gotenberg:8`, **internal ingress only**, scale 0→1, no managed identity, no secrets) and API env vars `Presentations__ConverterUrl` and `ConnectionStrings__blobs` (blob endpoint, managed identity); pin the app to `maxReplicas: 1` (hub groups, presence and the quiz clock are per replica until the Web PubSub backplane, plan "Scale/Scope"); verify `az bicep build --file infra/main.bicep`; update `docs/architecture/overview.md` (stack "Files", local topology, converter, threat-model note) and record the Complexity Tracking deviation there (#100)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: data, rules and storage shared by all stories. ⚠️ No story starts before T602 is merged.

- [x] T602 Presentation domain foundation: entities `Presentation`, `Slide`, `PresentationSession`, `SessionAnswer` in `src/Circloo.Api/Data/Entities.cs` + `CirclooDbContext.cs` exactly as `data-model.md` (e.g. Presentation `Name` "1–80 chars", `Status` "`processing` | `ready` | `failed`", Slide `Kind` "`deck` | `poll` | `quiz`", `Options` jsonb "2–6 `{ id: "a"…"f", text: 1–80 chars }`", `TimerSeconds` "10–60, default 20", `ShowFirst` "default true", `ShowLive` "default false", unique index `(SessionId, SlideId, MemberId)`, filtered unique index one active session per circle on `EndedAt IS NULL`, `Version` concurrency tokens, Presentation `ConvertingBy`/`LeaseUntil` conversion lease, PresentationSession `MaxPosition` and `QuestionPhases` jsonb, cascades); migration `src/Circloo.Api/Data/Migrations/*_LivePresentations.cs`; `src/Circloo.Api/Presentations/PresentationRules.cs` (limits: 50 MB, 100 deck slides, 50 question slides, question 1–140, option 1–80, quiz exactly one correct, timer 10–60) with unit tests; `src/Circloo.Api/Presentations/SlideStore.cs` (blob paths `presentations/{ownerId}/{presentationId}/{slideId}.webp|.thumb.webp|source.pptx`, put/get/delete-prefix) with an Azurite Testcontainers test; rate limit `PresentationUpload` (10 per user per hour) in `src/Circloo.Api/Security/RateLimits.cs`; activity `presentation` (category `present`) in `src/Circloo.Api/Circles/ActivityCatalog.cs` and `src/web/src/features/circles/catalog.ts` with its i18n keys in all four locales (#101)

**Checkpoint**: migration applies on a fresh database; rules and store tests green.

---

## Phase 3: User Story 1 - Prepare a presentation from PowerPoint (Priority: P1) 🎯 MVP

**Goal**: an animator uploads a .pptx and gets ordered slide pictures with notes in their library.

**Independent Test**: upload the 12-slide fixture, see 12 thumbnails in order with slide 7 hidden, rename, delete a
slide, reload: state kept (quickstart A1–A2).

- [x] T603 [US1] Library API and conversion: `src/Circloo.Api/Presentations/DeckInspector.cs` (Open XML: must be a `.pptx` presentation, reject encrypted → `encrypted`, `vbaProject`/`.pptm` → `macros`, uncompressed total > 300 MB or part > 100 MB or > 5 000 entries → `too-large`, > 100 slides → `too-many-slides`; read notes ≤ 2 000 chars and hidden flags); `SlideConverter.cs` behind `IDeckConverter` (Gotenberg `POST /forms/libreoffice/convert` with `exportHiddenSlides=true`, 120 s timeout; PDFtoImage → WebP 1920 px q82 + 480 px thumb; fall back to visible-order mapping if page count ≠ slide count); `PresentationConverterService.cs` (bounded `Channel<Guid>`, 2 concurrent, claims work with the lease update `Status = processing AND (LeaseUntil IS NULL OR LeaseUntil < now)` and renews it every minute, `ProcessedSlides` progress, re-queue `processing` on start, `timeout` after 10 min, delete `source.pptx` when done); `PresentationEndpoints.cs` for `GET/POST /api/presentations`, `GET/PATCH/DELETE /api/presentations/{id}`, `PUT /api/presentations/{id}/slides/{slideId}` with `{ hidden }` for deck slides, and `GET /api/slides/{slideId}/image` (owner access only in this task; 404 otherwise) per `contracts/rest.md`; `PresentationJanitor.cs` (delete after 365 days idle, `deletesInDays` when idle > 335, orphan blob sweep); audit `presentation.uploaded|converted|failed|deleted|purged`; fixtures in `tests/Circloo.Api.Tests/fixtures/decks/` (demo 12 slides with hidden slide 7 and notes on 2 and 5, encrypted, macro `.pptm`, renamed PDF, 101 slides, zip bomb) and tests in `tests/Circloo.Api.Tests/Presentations/` (inspector cases, pipeline with a fake converter, one Gotenberg Testcontainer integration test that also asserts a 30-slide fixture is `ready` in under 60 s (SC-601), endpoint auth/ownership/CSRF/rate limit, janitor with fake `TimeProvider`) (#102). Deviation: decks are generated in code by `TestDecks` instead of binary fixtures (no real decks in the repo), follow-ups #123 and #124
- [x] T604 [US1] Library UI: route and nav entry "My presentations" in `src/web/src/app` + shell; `src/web/src/features/presentations/api.ts` (TanStack Query hooks, polling every 1 s while `processing`); `Library.tsx` (upload drop zone + file button accepting `.pptx`, progress "n of N", cards with first thumbnail, status, `deletesInDays` warning, delete with confirm) and the slide strip of `Editor.tsx` (thumbnails in order, rename, hide/show, delete slide, one-time "animations and media are shown as still pictures" note); error messages for every `error` code; `src/web/src/styles/presentations.css` with logical properties; strings in `en/fr/ar/es`; `/impeccable shape` before building and `/impeccable audit` results in the PR (constitution IV); e2e `src/web/e2e/presentations.spec.ts` (upload, refusals, rename, hide, reload) in en + ar with axe (#103). Deviation: the hooks live in `src/web/src/api/presentations.ts` like the other API modules, and the Impeccable gate was a manual ux-designer review recorded on #115 (plugin run #126), follow-ups #125 and #126

**Checkpoint**: US1 demoable on its own.

---

## Phase 4: User Story 2 - Add poll and quiz questions (Priority: P1)

**Goal**: question slides between deck slides, validated and reorderable.

**Independent Test**: add a poll after slide 3 and a quiz after slide 8, reorder with the keyboard, reload: kept
(quickstart A3).

- [x] T605 [P] [US2] Questions API: `POST /api/presentations/{id}/questions` (`afterSlideId`), `PUT /api/presentations/{id}/slides/{slideId}` for question slides, `PUT /api/presentations/{id}/order` (full order, same set → else `order-mismatch`), `DELETE /api/presentations/{id}/slides/{slideId}`, all with optimistic `version` (`409 stale`) and validation codes `options-count`, `quiz-correct`, `timer-range`, `question-length`, `option-length`, `too-many-questions` per `contracts/rest.md`; `ShowPodium` via `PATCH`; positions stay dense; tests in `tests/Circloo.Api.Tests/Presentations/QuestionEndpointsTests.cs` (#104). Deviation: `POST /questions` also refuses `409 not-ready`; the same guard on slide edits and deletes during conversion is follow-up #123
- [x] T606 [US2] Question editor UI: `src/web/src/features/presentations/QuestionForm.tsx` (poll: question, 2–6 options, single/multiple, "Show who answered first" default on, "Show results live" default off; quiz: one correct option marked by icon and label, timer 10–60 s default 20, "Show who answered first"), insert points between slides in `Editor.tsx`, drag reorder plus "Move up / Move down" buttons for keyboard, presentation setting "Show the podium"; inline validation messages; i18n ×4; `/impeccable shape` before building and `/impeccable audit` results in the PR (constitution IV); e2e (add poll + quiz, reorder by keyboard, reload) en + ar with axe. Depends on T604, T605 (#105). Deviations: no insert points between slides; "Add poll" / "Add quiz" add the question after the selected slide, and "Move slide earlier" puts it first; the Impeccable gate was a manual ux-designer audit/critique recorded on #117, the real plugin run is tracked in #126

---

## Phase 5: User Story 3 - Present and everyone follows live (Priority: P1)

**Goal**: the animator runs the deck in a circle; participants and an audience screen follow within 1 s.

**Independent Test**: animator + two phone participants + audience window; arrow through 5 slides; late joiner lands
on the current slide (quickstart B1–B2, B8).

- [x] T607 [US3] Presenting hub: `src/Circloo.Api/Presentations/LiveSession.cs` (pure state machine per `data-model.md` phases, snapshot builder from visible slides) with unit tests; in `src/Circloo.Api/Circles/CircleHub.cs` and `ICircleClient` add `StartPresentation`, `GoToSlide`, `SetBlank`, `EndPresentation`, `EnterAudience` (animator only, joins `audience:{circleId}`, no presence), `PresentationState`, `PresenterNotes` (animator connections only), `PresentationEnded`; `Enter` returns the current `PresentationState`; `MaxPosition` tracking; moving away from a question in `answering` locks it and `QuestionPhases` restores locked/revealed/podium on return (never reopens, timers never restart); animator actions are last-write-wins on `Version` and broadcast the full state to all the animator's tabs; extend `GET /api/slides/{slideId}/image` so circle members (user or guest) may fetch slides of their circle's session up to `MaxPosition`; ending the session when its presentation is deleted; audit `session.started|ended`; hub tests in `tests/Circloo.Api.Tests/Presentations/PresentingHubTests.cs` (animator-only refusals, sync payloads, late join, notes never sent to participants, image access rules). Depends on T602, T603 (#106)
- [x] T608 [US3] Presenting UI: `src/web/src/features/circles/present/presentation.ts` (Zustand slice fed by hub events), `PresenterView.tsx` (current + next slide, notes, n/N, followers, Prev/Next, Blank, End, "Open audience screen"; keys ←/→, PageUp/PageDown, space, B), `ParticipantView.tsx` (slide fit to width, full-screen button, blank state, "waiting for the animator"), `AudienceScreen.tsx` at `/app/circles/:id/audience` (signed-in animator only, no app chrome) (control-free, join code + QR via `qrcode` between questions); presentation picker when starting the activity in `CircleRoom.tsx`; prefetch next slide image; i18n ×4, RTL (deck pictures never flipped); `/impeccable shape` before building and `/impeccable audit` results in the PR (constitution IV); e2e (two participant contexts + audience page follow 5 slides, each change rendered in under 1 s on the local stack (SC-603), late join) en + ar with axe. Depends on T604, T607 (#107). Impeccable: the plugin was unavailable; the `ux-designer` manual review against its rules is recorded on PR #134 and #126 tracks a real run of these screens.

---

## Phase 6: User Story 4 - Participants answer from their device (Priority: P1)

**Goal**: one server-enforced answer per participant, live counts for the animator, server-timed quizzes.

**Independent Test**: three phones answer a poll; animator sees counts climb; double taps count once; a quiz locks at
0 s by itself (quickstart B3, B5).

- [x] T609 [US4] Answering (hub + UI): hub `OpenQuestion`, `LockQuestion`, `Answer` (upsert guarded by `Phase = answering` and quiz `now < Deadline`, poll replace keeps `FirstReceivedAt`, quiz final → `quiz-final`, animator refused), `AnswerCount` to animator + audience throttled to 4/s, `MyAnswer` to the member's connections, live `Results` for polls with `ShowLive`; `src/Circloo.Api/Presentations/QuizClock.cs` (hosted, locks at deadline and broadcasts, reloads open sessions on start); answer rate limit 10/s per connection; tests (concurrency: parallel answers from one member → one row; late answer refused; clock with fake `TimeProvider`; counts never leak before reveal). UI: participant answer buttons (≥ 44 px, multiple-choice confirm), "your answer" mark, closed state, `Countdown.tsx` corrected with `serverNow`, animator/audience "n of N answered" with pending characters; i18n ×4; `/impeccable shape` before building and `/impeccable audit` results in the PR (constitution IV); e2e (answer, change, lock, quiz auto-lock) en + ar. Depends on T607, T608 (#108). Impeccable: the plugin was unavailable; the `ux-designer` manual audit against its rules is recorded on PR #161 and #126 tracks a real run of these screens.

---

## Phase 7: User Story 5 - Reveal results with a fastest-answer spotlight (Priority: P1)

**Goal**: the fancy, accessible reveal on every screen.

**Independent Test**: after three answers, Reveal shows identical bars, counts and percentages summing to 100 and the
spotlight on the first answerer; with spotlight off, no name (quickstart B4, B7).

- [x] T610 [US5] Reveal (hub + UI): hub `RevealResults` (locks first) computing `Results` per `contracts/hub.md` (largest-remainder percentages summing to 100, ties as multiple winners, `first` = lowest `Seq` with name, character and ms, omitted when `ShowFirst` is false, "no answers" case); returning to a revealed question shows stored results; tests. UI: `Results.tsx` (bars `scaleX` from the inline start, 900 ms count-up, winner marked by icon + label, text table for screen readers, one polite announcement), `Spotlight.tsx` (character cheers, name, "2.4 s"), `Confetti.tsx` (canvas, ≤ 80 character-coloured circles and hearts, 1.2 s), all skipped under `prefers-reduced-motion`; maths in `src/web/src/features/presentations/reveal.ts` with `reveal.test.ts`; the same results, spotlight and confetti on `AudienceScreen.tsx` (FR-609a); i18n ×4; `/impeccable shape` before building and `/impeccable audit` results in the PR (constitution IV); e2e (reveal on all screens, spotlight on/off, reduced motion) en + ar with axe. Depends on T609 (#109)

---

## Phase 8: User Story 6 - Quiz: first correct answer and podium (Priority: P2)

**Goal**: correct option, first-correct celebration, speed points and a podium.

**Independent Test**: two quizzes, three participants at different speeds; correct option and first correct shown;
podium ranks by points with shared places (quickstart B5–B6).

- [ ] T611 [US6] Quiz extras (hub + UI): on reveal mark `correct`, set `Correct` and `Points` = `round(1000 − 500 × min(elapsed, timer) / timer)` (0 if wrong or missing), `first` = lowest `Seq` correct answer, kind "Nobody found it this time"; hub `ShowPodium` (quiz slide, `revealed`, `ShowPodium` on → else `podium-off`/`not-revealed`) with dense ranking (ties share a place) and each member's own rank in `MyAnswer`; tests (scoring edges at 0 s and at the deadline, ties, podium off). UI: correct option shown with icon + label, per-phone right/wrong + points, `Podium.tsx` rising 3rd → 2nd → 1st with characters, own rank card, also on `AudienceScreen.tsx`; reduced motion; i18n ×4; `/impeccable shape` before building and `/impeccable audit` results in the PR (constitution IV); e2e (two quizzes, podium) en + ar. Depends on T610 (#110)

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T612 Journey, docs and audit: full Playwright journey covering quickstart B1–B8 across stories in `src/web/e2e/presentations.spec.ts` (en desktop, ar phone, axe, reduced motion); `/impeccable audit` and `/impeccable critique` on library, editor, presenter, participant, audience and reveal with findings fixed or justified; update `PRODUCT.md`, `docs/product/prd.md` (E-presentations slice 1 done) and `docs/architecture/overview.md`; run `quickstart.md` end to end and tick `checklists/requirements.md`; comment progress on idea #64. Depends on T611 (#111)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T601)** → **Foundational (T602)** → user stories.
- **US1 (T603 → T604)** first: every later story needs a ready presentation.
- **US2**: T605 can start right after T603 (parallel with T604); T606 needs T604 + T605.
- **US3**: T607 needs T602 + T603; T608 needs T604 + T607. US3 does not need US2 (decks without questions present fine).
- **US4 → US5 → US6** are sequential (answering → reveal → quiz extras) and need US2 (questions) and US3 (sessions).
- **Polish (T612)** last.

```
T601 → T602 → T603 ─┬─ T604 ─┬─ T606 ─┐
                    ├─ T605 ─┘        ├─ T609 → T610 → T611 → T612
                    └─ T607 → T608 ───┘
```

### Within each task

Tests first or alongside (red → green), API before UI, `/impeccable shape` before any new screen, i18n in all four
locales before the PR, e2e in en + ar before merge.

### Parallel Opportunities

- T604 (library UI) ∥ T605 (questions API) ∥ T607 (presenting hub) once T603 is merged.
- T606 (editor UI) ∥ T608 (presenting UI) once their dependencies are merged.

## Parallel Example: after T603

```text
developer A: T604 Library UI            (src/web/src/features/presentations/*)
developer B: T605 Questions API         (src/Circloo.Api/Presentations/PresentationEndpoints.cs, tests)
developer C: T607 Presenting hub        (src/Circloo.Api/Circles/CircleHub.cs, Presentations/LiveSession.cs, tests)
```

## Implementation Strategy

### MVP First (User Story 1, then 3)

1. T601 → T602 → T603 → T604: animators can import decks (US1).
2. T607 → T608: present a plain deck live with an audience screen (US3) — already useful as "PowerPoint in circloo".
3. **Stop and validate** with quickstart A and B1–B2.

### Incremental Delivery

4. T605 → T606: questions (US2).
5. T609 → T610: answering and the reveal (US4, US5) — the interactive core.
6. T611: quiz extras (US6), then T612 polish.

Each task is merged by Nicolas (`/nicolas <PR#>`) before the next dependent one starts.

## Notes

- One task issue per T6xx (`/speckit-taskstoissues`), titled `T6xx: …`, labels `type:task` + area + priority, parent
  idea #64; branch `feat/<issue>-<slug>`; PR `Closes #<issue>`.
- Never present real customer decks in tests; fixtures are generated and committed under `tests/Circloo.Api.Tests/fixtures/decks/`.
