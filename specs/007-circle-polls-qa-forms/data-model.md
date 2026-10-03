# Data model: Live polls, Q&A and satisfaction forms (007)

Glossary: a poll's **options** are the answers people choose (the spec says "answers"); a form **question** has a
**type** and, for choices, options too.

EF Core entities in `src/Circloo.Api/Data/Entities.cs`, one migration `CirclePollsQaForms`. Times are `DateTimeOffset`
(UTC). Ids: `Guid.CreateVersion7()` for aggregates, `long` identity for high-volume rows. Every circle-owned table
cascades from `Circle`; member references cascade from `CircleMember` (votes, upvotes, responses go with the member).

## Poll

| Field | Type | Rules |
|---|---|---|
| Id | Guid | PK |
| CircleId | Guid | FK → Circle, cascade; index |
| Question | string | 1–140 chars, safety-filtered |
| Options | jsonb | 2–6 `{ id: "a"…"f", text: 1–80 chars }`, ids assigned by position |
| MultipleChoice | bool | default false |
| ResultsLive | bool | default true (clarification Q1) |
| CreatedByMemberId | Guid | animator member |
| CreatedAt, OpenedAt?, ClosedAt? | DateTimeOffset | draft → open → closed |
| Version | int | concurrency token |

State: `draft` (OpenedAt null) → `open` (OpenedAt set, ClosedAt null) → `closed`. At most one open poll per circle:
filtered unique index on `CircleId` where `OpenedAt IS NOT NULL AND ClosedAt IS NULL`.

## PollVote

| Field | Type | Rules |
|---|---|---|
| Id | long | identity PK |
| PollId | Guid | FK, cascade |
| MemberId | Guid | FK → CircleMember, cascade; participant only |
| Options | text[] | 1 option, or 1–6 for multiple choice; distinct, known ids |
| CreatedAt, UpdatedAt | DateTimeOffset | |

Unique `(PollId, MemberId)` (SC-703). Upsert only while the poll is open.

## QaQuestion

| Field | Type | Rules |
|---|---|---|
| Id | long | identity PK |
| CircleId | Guid | FK → Circle, cascade; index `(CircleId, State)` |
| AuthorMemberId | Guid | FK → CircleMember, cascade; never sent to clients when `Anonymous` |
| Anonymous | bool | allowed only when the circle's Q&A allows it |
| Text | string | 1–200 chars, safety-filtered |
| State | string | `open` \| `answered` \| `hidden` |
| Answer | string? | ≤ 500 chars, safety-filtered, animator only |
| Upvotes | int | denormalised count, updated in the same transaction as `QaUpvote` |
| CreatedAt, AnsweredAt? | DateTimeOffset | |

Ordering: `Upvotes DESC, CreatedAt DESC`; answered grouped after open; hidden visible to the animator only.

## QaUpvote

| Field | Type | Rules |
|---|---|---|
| QuestionId | long | FK, cascade; PK part |
| MemberId | Guid | FK → CircleMember, cascade; PK part; never the author |

## QaSettings (on Circle)

`Circle.QaAllowAnonymous` (bool, default false), set when the animator starts Q&A.

## Form (in a circle)

| Field | Type | Rules |
|---|---|---|
| Id | Guid | PK |
| CircleId | Guid | FK → Circle, cascade; index |
| Title | string? | ≤ 80 chars |
| Questions | jsonb | 1–10 `FormQuestion` (below), editable only in draft |
| ShowNames | bool | default false; fixed once opened |
| SummaryShared | bool | default false; settable only when closed (clarification Q3) |
| SavedFormId | Guid? | the library form it was copied from (informational, set null on delete) |
| CreatedAt, OpenedAt?, ClosedAt? | DateTimeOffset | draft → open → closed |
| Version | int | concurrency token |

At most one open form per circle (filtered unique index, as for polls).

### FormQuestion (JSON)

| Field | Type | Rules |
|---|---|---|
| id | string | `q1`…`q10`, assigned by position |
| type | string | `rating5` \| `nps` \| `single` \| `multiple` \| `yesno` \| `text` |
| label | string | 1–140 chars, safety-filtered |
| required | bool | |
| look | string? | `rating5`: `stars` \| `smileys` |
| options | `{ id, text }[]`? | `single`/`multiple`: 2–6, 1–80 chars |
| long | bool? | `text`: short ≤ 200 / long ≤ 1 000 |

## FormResponse

| Field | Type | Rules |
|---|---|---|
| Id | long | identity PK |
| FormId | Guid | FK, cascade |
| MemberId | Guid | FK → CircleMember, cascade; participant only |
| Answers | jsonb | `{ [questionId]: value }`: `rating5` 1–5, `nps` 0–10, `single` option id, `multiple` option ids, `yesno` bool, `text` string (safety-filtered) |
| CreatedAt, UpdatedAt | DateTimeOffset | |

Unique `(FormId, MemberId)`. Accepted only while open and when every required question has a value.

## SavedForm (My forms)

| Field | Type | Rules |
|---|---|---|
| Id | Guid | PK |
| OwnerUserId | Guid | FK → User, cascade; index |
| Name | string | 1–80 chars |
| Title | string? | ≤ 80 chars |
| Questions | jsonb | as `Form.Questions` |
| ShowNames | bool | default for copies |
| CreatedAt, UpdatedAt, LastUsedAt | DateTimeOffset | LastUsedAt drives the 365-day idle purge |
| Version | int | concurrency token |

## Derived views (not stored)

- **Poll results**: per option `count`, `percent` (largest remainder, sums to 100 when votes > 0), `winner` (max count, ties allowed); `votes` = number of people who voted.
- **Form summary** per question: `rating5` → average (1 decimal), distribution 1–5; `nps` → score = round(%9–10 − %0–6), promoters/passives/detractors counts, distribution 0–10; `single`/`multiple`/`yesno` → counts and percentages; `text` → list of answers (with names only when `ShowNames`), animator only. `responded` / `of` / `pending` like spec 006 `AnswerCount`.

## Retention

Circle content is deleted with its circle (cascade). Saved forms: 365 days after `LastUsedAt` (janitor), like
presentations.
