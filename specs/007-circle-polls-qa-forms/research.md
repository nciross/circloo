# Research: Live polls, Q&A and satisfaction forms (007)

Decisions for [spec.md](spec.md). Each entry: decision, rationale, alternatives considered.

## R1. Three catalogue activities, no AI opener

- **Decision**: add `poll` (category `decide`), `qa` (category `decide`) and `feedback` (category `retro`) to `ActivityCatalog` and `catalog.ts`. Like `presentation`, they have no spark kind and no opener; `StartActivity` does not call the coach for them (same branch as spec 006). The animator can still ask circloo in the chat.
- **Rationale**: these are tools, not conversations; an AI opener would talk over the poll. Reusing the catalogue keeps the circle-creation picker, the room and the export working as for boards.
- **Alternatives**: one "Decide" activity with three modes (hides features in a sub-menu, and the circle creator cannot pick only Q&A); presentation slide types (rejected by the owner in the spec).

## R2. Real time over the existing circle hub

- **Decision**: new `CircleHub` partials, one per activity (`CircleHub.Poll.cs`, `CircleHub.Qa.cs`, `CircleHub.Form.cs`); events go to the circle group (`circle:{id}`) and, for animator-only data, the `animator:{id}` group from spec 006. Writes happen through the hub (like boards and canvas), reads for late joiners through `GET /api/circles/{id}` (extended view).
- **Rationale**: membership is already re-checked per hub call; presence, groups and reconnect exist; the app is pinned to one replica (spec 006 plan), so group broadcasts reach everyone.
- **Alternatives**: REST writes + hub notifications (two code paths for the same action); a separate hub (more connections per phone, duplicated auth).

## R3. Percentages and results maths shared with spec 006

- **Decision**: largest-remainder percentages live in one pure helper (`src/Circloo.Api/Common/Percentages.cs`) used by polls, form choice summaries and spec 006 results. Form summaries are computed by a pure `FormSummary` (average with one decimal, distribution, NPS = round(%promoters − %detractors), counts).
- **Rationale**: SC-704 (exactly 100) is the same rule as spec 006; one tested implementation.
- **Alternatives**: rounding each share (sums to 99 or 101); client-side maths (members would need raw votes, which hidden results must not reveal).

## R4. Storage: tables per concept, form questions as JSON

- **Decision**: `Poll` + `PollVote` (unique poll + member), `QaQuestion` + `QaUpvote` (unique question + member), `Form` with its questions as `jsonb`, `FormResponse` (unique form + member) with answers as `jsonb`, and `SavedForm` (owner library) with questions as `jsonb`. Votes store the chosen option ids as `text[]`.
- **Rationale**: uniqueness rules (SC-703) are enforced by the database where they matter (votes, upvotes, responses); a form has at most 10 questions edited as a whole, so a JSON document avoids a child table and keeps "edit only in draft" trivial.
- **Alternatives**: a generic "question engine" table shared with spec 006 slides (couples two features with different lifecycles); a table per form question (more joins, no query benefit at ≤ 10 questions).

## R5. One running item per activity, closing on switch

- **Decision**: at most one open poll and one open form per circle (filtered unique index on `ClosedAt IS NULL AND OpenedAt IS NOT NULL`); Q&A has no open/closed state of its own, it runs while the `qa` activity is current. Starting or ending an activity closes an open poll or form (keeping answers), mirroring spec 006's session end.
- **Rationale**: matches the room's "one activity at a time" model; makes "the current poll" unambiguous for late joiners.
- **Alternatives**: several concurrent polls (confusing on a phone; not asked for).

## R6. Hidden poll results

- **Decision**: a poll has `ResultsLive` (default true). While open, `PollResults` goes to the circle group only when live; otherwise members receive `PollCount { votes }` and the animator group receives the full results. On close, everyone receives the final results.
- **Rationale**: clarification Q1; no raw votes ever reach clients, so nothing leaks through the network tab.
- **Alternatives**: hiding results in the UI only (they would still be sent to every phone).

## R7. Q&A anonymity and moderation

- **Decision**: `QaQuestion.AuthorMemberId` is always stored; `Anonymous` is allowed only when the Q&A was started with "allow anonymous". Payloads to anyone (animator included) omit the author for anonymous questions; the server keeps the author for rate limits, upvote rules (no self-upvote) and audit. Hidden questions are sent only to the animator group; members get a `QaRemoved { id }`.
- **Rationale**: spec FR-711 and assumption ("hidden from members and exports, not from moderation or the audit trail"); the animator moderates content, not people.
- **Alternatives**: not storing the author (breaks "no self-upvote" and abuse handling).

## R8. Safety and rate limits

- **Decision**: every text (poll question/options, Q&A question/answer, form labels/options, free-text answers) passes `TextRules.Clean` + `SafetyPolicy.IsMessageSafe` server-side; refused with `message-unsafe`. Hub rate limits per connection: ask ≤ 5 per minute, vote/upvote ≤ 10 per second, form submit ≤ 1 per second (`slow-down`).
- **Rationale**: constitution VIII; the same filter the chat and boards use; limits stop a member flooding the circle (FR-720).
- **Alternatives**: client-side filtering only (bypassable).

## R9. My forms library

- **Decision**: REST endpoints `/api/forms` (owner-only, signed-in users), a "My forms" page in the app shell, and picking a saved form from the Feedback activity copies its questions into the circle's `Form`. `SavedForm.LastUsedAt` updates on copy; a janitor deletes saved forms idle for 365 days (same rule and job pattern as presentations, FR-604a).
- **Rationale**: clarification Q2; copy semantics keep circle results stable when the saved form changes.
- **Alternatives**: referencing the saved form from the circle (editing the library would rewrite running forms).

## R10. Form summary privacy and sharing

- **Decision**: while a form is open, `FormCount { responded, of, pending }` goes to the animator group only; the summary is fetched by the animator (`GET /api/circles/{id}/forms/{formId}/summary`) and refreshed on `FormCount`. After closing, `ShareFormSummary(formId, bool)` flips `SummaryShared`; members then receive `FormSummaryShared` with the non-free-text summaries. Free-text answers never go to members; names go with free text only to the animator and only when `ShowNames` was set before opening.
- **Rationale**: clarification Q3; FR-716/717.
- **Alternatives**: pushing the summary to the animator on every response (heavier; the count is enough to trigger a refresh).

## R11. Export sections

- **Decision**: `CircleReport` gains generic `ReportItem` lists for the new activities (a heading plus lines such as "Pizza — 4 votes (57 %)"), rendered by the existing senders as bullet lists. Anonymous questions and unnamed free text stay anonymous.
- **Rationale**: FR-723 with minimal change to each provider's renderer.
- **Alternatives**: one renderer per activity per provider (5 providers × 3 activities).

## R12. Late join and reload

- **Decision**: `CircleView` gains `decide`: the current or last poll (with my vote and, when allowed, results), the Q&A list (visible questions with my upvotes), and the current form (definition, my saved response, closed/shared state; the summary only when shared). Hub events then keep it fresh.
- **Rationale**: FR-722; same pattern as board notes and canvas in `CircleView`.
- **Alternatives**: one REST call per activity on enter (more round trips on phones).
