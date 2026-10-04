---

description: "Tasks for live polls, Q&A and satisfaction forms (spec 007)"
---

# Tasks: Live polls, Q&A and satisfaction forms in a circle

**Input**: Design documents from `specs/007-circle-polls-qa-forms/` (plan, spec, research, data-model, contracts, quickstart)

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/hub.md, contracts/rest.md

**Tests**: required by the constitution (VI): every task ships its API tests (xUnit + Testcontainers) and, for UI
tasks, its Playwright journey in `en` (desktop) and `ar` (phone) with axe.

**Organization**: one task = one GitHub task issue = one PR (repo convention). IDs use the 7xx range of this spec.
Paths follow plan.md (API `src/Circloo.Api`, tests `tests/Circloo.Api.Tests`, web `src/web`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel with the other [P] tasks of the same phase (different files, no dependency)
- **[Story]**: user story from spec.md (US1–US4)

---

## Phase 1: Setup (Shared Infrastructure)

No setup task: no new package, container or Azure resource (plan "Technical Context").

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: data, rules and catalogue entries every story builds on.

- [x] T701 Decide foundation: entities `Poll`, `PollVote`, `QaQuestion`, `QaUpvote`, `Form`, `FormResponse`, `SavedForm` and `Circle.QaAllowAnonymous` in `src/Circloo.Api/Data/Entities.cs` + `CirclooDbContext.cs` exactly as `data-model.md` (Poll `Question` "1–140 chars", `Options` jsonb "2–6 `{ id: "a"…"f", text: 1–80 chars }`", `ResultsLive` "default true"; unique `(PollId, MemberId)`, `(QuestionId, MemberId)` as PK of `QaUpvote`, `(FormId, MemberId)`; filtered unique "one open poll / one open form per circle" on `OpenedAt IS NOT NULL AND ClosedAt IS NULL`; `QaQuestion.Text` "1–200 chars", `Answer` "≤ 500 chars", `State` "`open` \| `answered` \| `hidden`"; `Form.Questions` jsonb "1–10 `FormQuestion`"; `SavedForm.Name` "1–80 chars"; `Version` concurrency tokens; cascades from Circle and CircleMember, `Form.SavedFormId` set null); migration `src/Circloo.Api/Data/Migrations/*_CirclePollsQaForms.cs`; `src/Circloo.Api/Common/Percentages.cs` (largest remainder, sums to 100 when total > 0, ties by earlier option); `src/Circloo.Api/Decide/PollRules.cs` and `FormRules.cs` (validation codes per contracts: `poll-invalid` field codes, `questions-count`, `label-length`, `options-count`, `option-length`, `type`, `look`, text lengths short ≤ 200 / long ≤ 1 000; answer validation `required`, `out-of-range`, `too-long`) with `TextRules.Clean` + `SafetyPolicy`; activities `poll` and `qa` (category `decide`) and `feedback` (category `retro`) in `src/Circloo.Api/Circles/ActivityCatalog.cs` and `src/web/src/features/circles/catalog.ts` with no opener (skip the coach in `StartActivity` like `presentation`) and their i18n keys in all four locales; `CircleView.decide` skeleton (`polls: []`, `qa`, `poll?`, `form?`) in `src/Circloo.Api/Circles/CircleEndpoints.cs` + `src/web/src/api/circles.ts`; unit tests `tests/Circloo.Api.Tests/Decide/RulesTests.cs` (percentages incl. 1/3-1/3-1/3 → 34/33/33, validation edges) and a Postgres test for the unique indexes (#141). Deviations: one `src/Circloo.Api/Decide/DecideRules.cs` instead of `PollRules.cs` + `FormRules.cs`; the form question field is `longText` (the analyzer rejects a property named `Long`); long free-text answers keep their line breaks, short ones stay single-line.

**Checkpoint**: migration applies; catalogue shows the three activities; rules tested.

---

## Phase 3: User Story 1 - Run a quick live poll (Priority: P1) 🎯 MVP

**Goal**: an animator creates, opens and closes a poll; members vote live (spec US1).

**Independent Test**: animator + three phones; 3-option poll; live bars; a changed vote; hidden-results poll; close.

- [x] T702 [US1] Poll hub: `CreatePoll`, `UpdatePoll`, `OpenPoll` (closes any other open poll), `ClosePoll`, `VotePoll` in `src/Circloo.Api/Circles/CircleHub.Poll.cs` per `contracts/hub.md` (drafts to the animator group only; `PollResults` to the circle group when `resultsLive` or closed, else to `animator:{id}` with `PollCount` to members; throttled 4/s; `MyVote` to the voter's connections via `member:{id}` group joined in `Enter`; vote upsert guarded by state, one row per member, animator refused `animator-cannot-answer`, `invalid-options`; rate limit 10/s per connection `slow-down`); `StartActivity`/`EndActivity` close an open poll; `CircleView.decide.poll` and `polls` (results only when live, closed or animator) with `myVote`; audit `poll.opened`/`poll.closed`; tests `tests/Circloo.Api.Tests/Decide/PollHubTests.cs` (refusals, parallel votes from one member → one row, change of vote, hidden results never reach members, late join, close on switch). Depends on T701 (#142)
- [ ] T703 [US1] Poll UI: `src/web/src/features/circles/decide/decide.ts` (Zustand slice fed by hub events, versions/ids guard like spec 006), `PollEditor.tsx` (question, 2–6 answers, single/multiple, "Show results when the vote closes"), `PollPanel.tsx` (vote buttons ≥ 44 px, multiple-choice confirm, "your vote" mark, closed state, "n votes" when hidden), `PollResults.tsx` (bars from the inline start, counts, percentages, winner by icon + label, text alternative, "No votes this time", reduced motion), finished polls list; room wiring in `CircleRoom.tsx`; `src/web/src/styles/decide.css` with logical properties; strings `decide.poll.*` in en/fr/ar/es; `/impeccable shape` before building and audit/critique results in the PR; e2e `src/web/e2e/decide.spec.ts` (poll: vote, change, hidden results, close) en + ar with axe. Depends on T702 (#143)

**Checkpoint**: US1 works alone (MVP).

---

## Phase 4: User Story 2 - Ask and upvote questions (Priority: P1)

**Goal**: members ask and upvote; the animator answers, hides, allows anonymity (spec US2).

**Independent Test**: three participants, four questions, live reordering, an answered question, an unsafe question refused.

- [ ] T704 [P] [US2] Q&A hub: `SetQaAnonymous`, `Ask` (1–200 chars, safety filter, `anonymous-off`, ≤ 5 per minute per connection), `Upvote` (toggle, `own-question`, denormalised `Upvotes` updated in the same transaction, one row per member), `AnswerQuestion` (≤ 500 chars), `ReopenQuestion`, `HideQuestion` in `src/Circloo.Api/Circles/CircleHub.Qa.cs` per `contracts/hub.md` (`QaChanged` without author for anonymous questions to everyone incl. the animator, hidden questions only to the animator group and `QaRemoved` to members, `MyUpvote` to the voter); `CircleView.decide.qa` (order `Upvotes DESC, CreatedAt DESC`, answered grouped, `upvotedByMe`, `mine`); audit `qa.hidden`; tests `tests/Circloo.Api.Tests/Decide/QaHubTests.cs` (anonymity never leaks in payloads or the view, self-upvote refused, parallel upvotes → one row and a correct count, hide/unhide visibility, unsafe text refused). Depends on T701 (#144)
- [ ] T705 [US2] Q&A UI: `src/web/src/features/circles/decide/QaPanel.tsx` (ask box with "Ask anonymously" when allowed, list with upvote toggle showing count and "you upvoted" by icon + label, Answered section, animator controls: answer with text, reopen, hide, allow anonymous), live reordering without layout jumps under reduced motion, mixed-script text with `dir="auto"`; strings `decide.qa.*` ×4; Impeccable shape + audit/critique; e2e (ask, upvote, anonymous, answer, hide, unsafe refused) en + ar with axe. Depends on T704, T703 (shared `decide.ts`) (#145)

---

## Phase 5: User Story 3 - Build and fill a satisfaction form (Priority: P1)

**Goal**: My forms library, form in the room, responses, summary, sharing (spec US3).

**Independent Test**: build and save a 5-question form, open it in a circle, three responses, the animator's summary, share.

- [ ] T706 [P] [US3] Forms domain and My forms API: `src/Circloo.Api/Decide/FormSummary.cs` (pure: rating5 average to 1 decimal + distribution, NPS = round(%9–10 − %0–6) with promoters/passives/detractors, counts and percentages via `Percentages`, text list with names only when `ShowNames`, `null` average/score when no answers) with unit tests; `src/Circloo.Api/Decide/FormEndpoints.cs` for `GET/POST /api/forms`, `GET/PUT/DELETE /api/forms/{id}`, `POST /api/forms/{id}/duplicate` per `contracts/rest.md` (owner only, 404 otherwise, optimistic `version` → `409 stale`, validation codes, rate limit 30 writes/min/user); `src/Circloo.Api/Decide/FormJanitor.cs` (delete saved forms 365 days after `LastUsedAt`, `deletesInDays` when idle > 335) with a fake `TimeProvider` test; tests `tests/Circloo.Api.Tests/Decide/FormEndpointsTests.cs`. Depends on T701 (#146)
- [ ] T707 [US3] Forms in the circle (hub + REST): `CreateForm`, `CreateFormFromSaved` (copy, sets `SavedForm.LastUsedAt`), `UpdateForm` (draft only), `OpenForm`, `CloseForm`, `ShareFormSummary` (closed only), `SubmitForm` (upsert, required answers, ranges, safety filter on text, `slow-down` 1/s, animator refused) in `src/Circloo.Api/Circles/CircleHub.Form.cs` per `contracts/hub.md` (`FormChanged`, `FormCount` to the animator group throttled 4/s, `MyResponse`, `FormSummaryShared` without free text); `GET /api/circles/{circleId}/forms/{formId}/summary` (animator, or members when shared without `text`) and `POST /api/circles/{circleId}/forms/{formId}/save` (to My forms); `CircleView.decide.form` with `myResponse` and the shared summary; close on activity switch; audit `form.opened/closed/shared`; tests `tests/Circloo.Api.Tests/Decide/FormHubTests.cs` (one response per member under parallel submits, edit until close, free text never reaches members, names only when `ShowNames`, share only after close). Depends on T706 (#147)
- [ ] T708 [P] [US3] My forms UI: route `/app/forms` + nav entry "My forms" in `src/web/src/app/router.tsx` and the shell; `src/web/src/api/forms.ts` (TanStack Query hooks, edit scope like presentations); `src/web/src/features/forms/MyForms.tsx` (list, rename, duplicate, delete with confirm, `deletesInDays`), `FormEditorPage.tsx`; shared `src/web/src/features/circles/decide/FormBuilder.tsx` (add/reorder by keyboard and drag/remove up to 10 questions, per type: rating 1–5 stars or smileys, recommend 0–10, single/multiple with 2–6 answers, yes/no, short/long text, required toggle, inline validation codes); strings `forms.*` ×4; Impeccable shape + audit/critique; e2e (build, save, edit, duplicate, delete) en + ar with axe. Depends on T706 (#148)
- [ ] T709 [US3] Form in the room UI: animator picker (My forms or new, `FormBuilder` for the circle's draft, "Save to My forms", "Show names with answers"), `FormFill.tsx` for participants (one control per type: stars/smileys radio group, 0–10 radio scale read from the inline start, choices, yes/no, text with counter; required marks; errors next to fields; edit until closed; "Thank you" state; names notice when on), `FormSummary.tsx` for the animator (live "n of N responded" with pending characters, averages, distributions, NPS with promoters/passives/detractors, choice bars, free-text list) and the shared summary for members; strings `decide.form.*` ×4; Impeccable shape + audit/critique; e2e (fill, required error, edit, summary, share) en + ar with axe. Depends on T707, T708 (#149)

---

## Phase 6: User Story 4 - Keep and send the results (Priority: P2)

- [ ] T710 [US4] Export: extend `src/Circloo.Api/Integrations/CircleReport.cs` with report items for finished polls (question, options with percentages), Q&A (questions by upvotes with answers, anonymous kept anonymous, hidden excluded) and closed forms (per-question summary, free text without names unless `ShowNames`), rendered by the existing senders in `src/Circloo.Api/Integrations/Senders.cs` as bullet lists; tests in `tests/Circloo.Api.Tests/Decide/ExportTests.cs` (content and anonymity for each provider's payload). Depends on T702, T704, T707 (#150)

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T711 Journey, docs and audit: full Playwright journey covering quickstart A–D in `src/web/e2e/decide.spec.ts` (en desktop, ar phone, axe, reduced motion), including "Send results" (D) in both locales and measured fan-out for a vote, an upvote and a new question on every screen (median under 1 s, SC-702, as in spec 006's presenting journey); `/impeccable audit` and `/impeccable critique` on poll, Q&A, form builder, form filling, summary and My forms with findings fixed or justified (while the Impeccable plugin is unavailable, the `ux-designer` manual review against its rules is recorded on the PR, as for #99/#117, and #126 tracks a real run); update `PRODUCT.md`, `docs/product/prd.md` and `docs/architecture/overview.md`; run `quickstart.md` end to end and tick `checklists/requirements.md`; comment progress on idea #136. Depends on T703, T705, T709, T710 (#151)

---

## Dependencies & Execution Order

- **Foundational**: T701 blocks everything.
- **US1**: T702 → T703 (MVP).
- **US2**: T704 (parallel with T702/T706 after T701) → T705 (needs `decide.ts` from T703).
- **US3**: T706 (parallel after T701) → T707 → T709; T708 after T706, parallel with T707.
- **US4**: T710 after T702, T704, T707.
- **Polish**: T711 last.

```text
T701 ─┬─ T702 ── T703 ──┬─ T705
      ├─ T704 ──────────┘
      └─ T706 ─┬─ T707 ─┬─ T709
               └─ T708 ─┘
T702 + T704 + T707 ── T710 ── T711
```

## Parallel Example: after T701

```text
T702 Poll hub          (CircleHub.Poll.cs, PollHubTests.cs)
T704 Q&A hub           (CircleHub.Qa.cs, QaHubTests.cs)
T706 Forms domain/API  (Decide/FormSummary.cs, FormEndpoints.cs, FormJanitor.cs)
```

## Implementation Strategy

1. **MVP**: T701 → T702 → T703: a live poll is usable on its own.
2. **Increment 2**: T704 → T705 (Q&A).
3. **Increment 3**: T706 → T707 → T708 → T709 (forms).
4. **Increment 4**: T710 (export), then T711 (journey, audit, docs).

## Notes

- Each task's PR contains `Closes #<task issue>`; the parent idea is #136.
- Hub methods live in one `CircleHub` partial per activity (`CircleHub.Poll.cs`, `CircleHub.Qa.cs`, `CircleHub.Form.cs`), so T702, T704 and T707 do not touch the same file; the `member:{id}` group and the shared "close the open poll/form on activity switch" hook land with T702.
- Circle purge is out of scope (#138).
