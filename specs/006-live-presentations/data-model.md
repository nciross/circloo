# Data model: Live presentations (006)

EF Core entities in `src/Circloo.Api/Data/Entities.cs`, one migration `LivePresentations`. Times are
`DateTimeOffset` (UTC). Ids follow the existing style: `Guid.CreateVersion7()` for aggregates, `long` identity for
high-volume rows.

## Presentation (library, owned by a user)

| Field | Type | Rules |
|---|---|---|
| Id | Guid | PK |
| OwnerUserId | Guid | FK → User, cascade delete; index |
| Name | string | 1–80 chars, defaults to file name without extension |
| SourceFileName | string | ≤ 200 chars, display only |
| Status | string | `processing` \| `ready` \| `failed` |
| Error | string? | `not-pptx`, `encrypted`, `macros`, `too-large`, `too-many-slides`, `conversion-failed`, `timeout` |
| SlideCount | int | slides found in the file (≤ 100) |
| ProcessedSlides | int | progress, 0…SlideCount |
| ShowPodium | bool | default true (FR-606) |
| CreatedAt, UpdatedAt, LastUsedAt | DateTimeOffset | LastUsedAt drives the 12-month clean-up (FR-604a) |
| Version | int | concurrency token, bumped on every edit |
| ConvertingBy | string? | replica id holding the conversion lease |
| LeaseUntil | DateTimeOffset? | lease end (2 min, renewed while converting); a conversion is claimed with a guarded update `Status = processing AND (LeaseUntil IS NULL OR LeaseUntil < now)`, so only one replica converts |

State: `processing → ready` or `processing → failed`; `failed` can be retried (re-upload). Deleting removes slides,
questions and blobs.

## Slide (ordered items of a presentation)

| Field | Type | Rules |
|---|---|---|
| Id | Guid | PK; also the blob name |
| PresentationId | Guid | FK, cascade; index (PresentationId, Position) |
| Position | int | 0-based, dense after every reorder (kept by the endpoints; the index is not unique so a reorder never collides mid-update) |
| Kind | string | `deck` \| `poll` \| `quiz` |
| Hidden | bool | deck slides only; pre-set from the file's hidden flag |
| SourceIndex | int? | deck slides: index in the .pptx (for re-render and tests) |
| Notes | string? | deck slides: speaker notes, ≤ 2 000 chars, animator-only |
| Question | string? | poll/quiz: 1–140 chars |
| Options | jsonb | poll/quiz: 2–6 `{ id: "a"…"f", text: 1–80 chars }` |
| CorrectOption | string? | quiz: exactly one option id |
| MultipleChoice | bool | poll only |
| TimerSeconds | int? | quiz: 10–60, default 20 |
| ShowFirst | bool | poll/quiz, default true |
| ShowLive | bool | poll only, default false |

Validation (server-side, FR-605/606): option ids unique; quiz has exactly one valid `CorrectOption`; deck slides
cannot carry question fields; at most 100 deck slides and 50 question slides per presentation.

## PresentationSession (one run in a circle)

| Field | Type | Rules |
|---|---|---|
| Id | Guid | PK |
| CircleId | Guid | FK → Circle, cascade; at most one **active** session per circle (filtered unique index on `EndedAt IS NULL`) |
| PresentationId | Guid? | FK, set null on delete (session then ends) |
| StartedByMemberId | Guid | animator member |
| Snapshot | jsonb | frozen visible slides at start: `[{ slideId, kind, question, options, correct, multiple, timer, showFirst, showLive, hasNotes }]` (notes are read live from Slide for the animator only) |
| ShowPodium | bool | copied at start |
| Position | int | index into Snapshot |
| MaxPosition | int | furthest position shown so far; slide images up to it are viewable by members (REST contract) |
| Blank | bool | |
| Phase | string | `idle` \| `answering` \| `locked` \| `revealed` \| `podium` |
| OpenedAt | DateTimeOffset? | when the current question opened |
| Deadline | DateTimeOffset? | quiz only: OpenedAt + timer |
| LockedAt | DateTimeOffset? | |
| StartedAt, EndedAt | DateTimeOffset / ? | |
| Version | int | concurrency token; animator actions use last-write-wins and every change broadcasts the full state to all the animator's tabs |
| QuestionPhases | jsonb | per question slide id: stored phase (`locked`, `revealed`, `podium`) and `OpenedAt`/`LockedAt`, so returning to a question restores it |

Phase transitions (animator only, except the clock):

```
deck slide:  idle
question:    idle --open--> answering --lock|deadline--> locked --reveal--> revealed --podium(quiz, ShowPodium)--> podium
             answering --reveal--> revealed   (reveal locks first)
moving away from a question in answering locks it first (LockedAt = now); moving to another slide sets Phase to idle
for deck slides; returning to a question shows its stored phase: locked (can be revealed, never reopened), revealed or
podium with stored results; quiz timers never restart
```

## SessionAnswer

| Field | Type | Rules |
|---|---|---|
| Seq | long | identity PK: received order, decides "first" |
| SessionId | Guid | FK, cascade |
| SlideId | Guid | question slide id from the snapshot |
| MemberId | Guid | FK → CircleMember; participant only |
| Options | string[] | 1 option (single/quiz) or 1–6 (multiple) |
| FirstReceivedAt | DateTimeOffset | set once; keeps poll "first" stable when an answer is replaced |
| ReceivedAt | DateTimeOffset | last change |
| Correct | bool? | quiz only |
| Points | int | quiz only, 0–1000 (R9) |

Unique index `(SessionId, SlideId, MemberId)` enforces one answer per participant per question (FR-610, SC-606).
Upsert allowed only while `Phase = answering` and (for quizzes) `now < Deadline`, and never replaces a quiz answer.

## Derived views (not stored)

- **Results**: per option `count`, `percent` (largest-remainder rounding so the total is 100), `winners` (max count,
  ties allowed), `correct` (quiz), `first` = the lowest `Seq` answer (poll) or the lowest `Seq` correct answer (quiz),
  with member name, character and `FirstReceivedAt − OpenedAt`.
- **Podium**: `SUM(Points)` per member over the session, dense rank, top 3 places plus each member's own rank.

## Retention

- Presentations: deleted 365 days after `LastUsedAt` (janitor), flagged in the UI after 335 days.
- Sessions and answers: removed with their circle (cascade).
- Blobs: `presentations/{ownerId}/{presentationId}/…`; deleted with the presentation; orphan sweep daily.
