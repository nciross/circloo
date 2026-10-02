# REST contract: presentations library (006)

Base `/api`. JSON, camelCase. Unsafe methods need the `X-XSRF-TOKEN` header (existing antiforgery). Errors are
RFC 9457 problem details with a stable `type` (used as i18n key on the client). All endpoints require a signed-in
user (`RequireAuthorization()`), except slide images (see below). New endpoint file:
`src/Circloo.Api/Presentations/PresentationEndpoints.cs`.

## Library

| Method & path | Body | Success | Errors |
|---|---|---|---|
| `GET /presentations` | – | `200 PresentationSummary[]` (owner's, newest first) | – |
| `POST /presentations` | `multipart/form-data`: `file` (.pptx ≤ 50 MB) | `202 PresentationSummary` (`status: processing`) | `400 not-pptx \| encrypted \| macros \| too-many-slides`, `413 too-large`, `429` (rate limit `PresentationUpload`: 10 per user per hour) |
| `GET /presentations/{id}` | – | `200 PresentationDetail` (bumps `LastUsedAt`) | `404 presentation-not-found` (also when not the owner) |
| `PATCH /presentations/{id}` | `{ name?, showPodium?, version }` | `200 PresentationDetail` | `400` validation, `409 stale` |
| `DELETE /presentations/{id}` | – | `204` | `404`; if a session uses it, the session ends (hub `PresentationEnded`) |

## Slides and questions

| Method & path | Body | Success | Errors |
|---|---|---|---|
| `POST /presentations/{id}/questions` | `QuestionInput & { afterSlideId?: Guid, version }` | `201 PresentationDetail` | `400` validation (`options-count`, `quiz-correct`, `timer-range`, `question-length`, `option-length`, `too-many-questions`), `409 stale` |
| `PUT /presentations/{id}/slides/{slideId}` | `QuestionInput` (question slides) or `{ hidden }` (deck slides), plus `version` | `200 PresentationDetail` | `400`, `404`, `409 stale` |
| `PUT /presentations/{id}/order` | `{ slideIds: Guid[], version }` (full order, same set) | `200 PresentationDetail` | `400 order-mismatch`, `409 stale` |
| `DELETE /presentations/{id}/slides/{slideId}` | – (`?version=`) | `200 PresentationDetail` | `404`, `409 stale` |

```ts
type PresentationSummary = {
  id: string; name: string; status: 'processing' | 'ready' | 'failed'; error?: string
  slideCount: number; processedSlides: number; questionCount: number
  thumbnail?: string            // image URL of the first visible slide
  lastUsedAt: string; deletesInDays?: number   // set when idle > 335 days
}
type PresentationDetail = PresentationSummary & {
  showPodium: boolean; version: number
  slides: Array<
    | { id: string; kind: 'deck'; position: number; hidden: boolean; notes?: string; image: string; thumbnail: string }
    | ({ id: string; kind: 'poll' | 'quiz'; position: number } & QuestionInput)
  >
}
type QuestionInput = {
  kind: 'poll' | 'quiz'
  question: string                          // 1–140
  options: { id: string; text: string }[]   // 2–6, text 1–80, ids a–f
  multipleChoice?: boolean                  // poll
  correctOption?: string                    // quiz, required
  timerSeconds?: number                     // quiz, 10–60, default 20
  showFirst?: boolean                       // default true
  showLive?: boolean                        // poll, default false
}
```

## Slide images

`GET /api/slides/{slideId}/image?size=full|thumb` → `200 image/webp`, `Cache-Control: private, max-age=3600`,
`ETag`. Allowed when the caller is the owner (user session), **or** a member (user or guest cookie) of a circle whose
active or ended session's snapshot contains this slide and whose current position has reached it at least once
(`MaxPosition ≥ index`). Otherwise `404` (never `403`, no existence leak).

## Audit events (FR-619)

`presentation.uploaded`, `presentation.converted`, `presentation.failed`, `presentation.deleted`,
`presentation.purged` (janitor), `session.started`, `session.ended`, with user id and presentation id; never file
contents or names of participants.
