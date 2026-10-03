# REST contract: polls, Q&A and forms (007)

All routes under `/api`, cookie session, antiforgery header on unsafe methods (existing filter). Errors are RFC 9457
problems; validation errors carry field codes like spec 006.

## My forms (signed-in users; owner only, others 404)

| Method | Route | Body / result |
|---|---|---|
| GET | `/api/forms` | `SavedFormSummary[]` (id, name, questionCount, lastUsedAt, deletesInDays?) newest first |
| POST | `/api/forms` | `{ name, title?, showNames, questions }` → `201 SavedFormDetail` |
| GET | `/api/forms/{id}` | `SavedFormDetail` (with `version`) |
| PUT | `/api/forms/{id}` | `{ name, title?, showNames, questions, version }` → `200` or `409 stale` |
| POST | `/api/forms/{id}/duplicate` | `201 SavedFormDetail` ("… (copy)") |
| DELETE | `/api/forms/{id}` | `204` (circles keep their copies) |
| POST | `/api/circles/{circleId}/forms/{formId}/save` | animator: saves the circle's form to My forms → `201 SavedFormDetail` |

Validation codes: `name-length`, `title-length`, `questions-count` (1–10), `label-length`, `options-count` (2–6),
`option-length`, `type`, `look`, `message-unsafe`. Rate limit: 30 writes per user per minute.

## Circle view (extended)

`GET /api/circles/{id}` adds:

```ts
decide: {
  poll?: PollView & { results?: PollResults; votes?: number }   // results only when live or closed (or for the animator)
  polls: { id: string; question: string; closedAt: string; results: PollResults }[]   // finished polls, newest first
  qa: { allowAnonymous: boolean; questions: QaQuestionView[] }   // hidden ones only for the animator
  form?: FormView & { myResponse?: Record<string, unknown>; summary?: FormSummaryView }   // summary: animator, or shared
}
```

## Form summary (animator)

`GET /api/circles/{circleId}/forms/{formId}/summary` → `FormSummaryView`:

```ts
type FormSummaryView = { formId: string; responded: number; of: number
  questions: (
    | { id: string; type: 'rating5'; average: number | null; distribution: number[] }        // index 0 = 1 star
    | { id: string; type: 'nps'; score: number | null; promoters: number; passives: number; detractors: number; distribution: number[] }
    | { id: string; type: 'single' | 'multiple' | 'yesno'; options: { id: string; count: number; percent: number }[] }
    | { id: string; type: 'text'; answers: { text: string; name?: string; character?: string }[] }   // animator only
  )[] }
```

Members get the same shape without `text` questions when the summary is shared.

## Export

`POST /api/circles/{id}/export` (existing) includes, for each finished poll: question + options with percentages; for
Q&A: questions by upvotes with answers (anonymous stay anonymous, hidden excluded); for each closed form: per-question
summary (free text without names unless `ShowNames`).
