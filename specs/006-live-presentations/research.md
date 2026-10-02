# Research: Live presentations (006)

Decisions behind `plan.md`. Each one: what we chose, why, and what we rejected.

## R1. Turning a .pptx into slide pictures

**Decision**: two steps.
1. **.pptx → PDF** with **Gotenberg 8** (`gotenberg/gotenberg:8`, LibreOffice route
   `POST /forms/libreoffice/convert`), running as its **own container**: an Aspire container resource in dev and an
   internal-only Container App (scale 0→1) in Azure. The API calls it over HTTP with a 120 s timeout. Form fields:
   `exportHiddenSlides=true` (so PDF pages map 1:1 to slides in the file; circloo hides slides itself, FR-604), `quality`
   default.
2. **PDF → one WebP per page** inside the API with **PDFtoImage** (PDFium, MIT) + SkiaSharp
   (`SkiaSharp.NativeAssets.Linux.NoDependencies`, which runs on the chiseled `aspnet:10.0-noble-chiseled` image) at
   1920 px wide, quality 82, plus a 480 px thumbnail.

**Rationale**: LibreOffice is the only free engine that renders arbitrary PowerPoint layouts well; putting it in a
separate, network-isolated container keeps the parser of untrusted files away from the API's secrets and keeps the API
image small (Gotenberg is ~1.3 GB; the API image stays ~120 MB). Gotenberg is a maintained, widely used HTTP wrapper
with health checks and timeouts, so we write no LibreOffice glue. PDFium is the PDF engine of Chrome, fast and exact.
Zero cost in dev (local container), a few cents in prod (scale to zero, runs only during conversions).

**Alternatives rejected**:
- LibreOffice inside the API image: +1 GB image, slower deploys, untrusted-file parser next to Key Vault access.
- Microsoft Graph "convert to PDF" (OneDrive): needs a Microsoft 365 tenant per animator and sends decks to a third
  party; not zero-cost in dev.
- Commercial SDKs (Aspose.Slides, Syncfusion): license cost.
- Client-side rendering with pdf.js: every participant would download the whole PDF (up to tens of MB) and could read
  hidden slides and notes; server-side pictures expose only the current slide.
- Parsing slides ourselves with Open XML and drawing them: fidelity far too low.

**Verification task** (T-level): a spike test renders the reference deck in `tests/fixtures/decks/` and asserts page
count = slide count with `exportHiddenSlides=true`; if a Gotenberg version ignores the flag, fall back to mapping by
the visible-slide order from the Open XML pass (R2).

## R2. Validating the upload and reading speaker notes

**Decision**: before conversion, open the file with **DocumentFormat.OpenXml** (Microsoft, MIT):
- Reject unless it opens as a `PresentationDocument` of type `.pptx` (`application/vnd.openxmlformats-officedocument.presentationml.presentation`);
  encrypted files are OLE compound files, not zip, and fail here with a "password-protected" error.
- Reject macro-enabled content (`vbaProject` part or `.pptm`/`.potm` content types).
- Zip-bomb guard: refuse if the sum of uncompressed part sizes exceeds 300 MB or any part exceeds 100 MB, or the
  archive has more than 5 000 entries; limit upload to 50 MB (Kestrel `MaxRequestBodySize` on this endpoint only).
- Count slides (≤ 100) in presentation order and read each slide's **notes text** (plain text, trimmed to 2 000 chars),
  and the hidden flag (`show="0"`) to pre-hide those slides.

**Rationale**: cheap, in-process checks that turn most bad files into clear errors before LibreOffice sees them, and
the same pass gives us notes, which PDF does not carry.

**Alternatives rejected**: trusting the extension or MIME type only (spoofable); extracting notes from the PDF (they
are not exported).

## R3. Where slide pictures live and how they are served

**Decision**: **Azure Blob Storage**, container `presentations`, path `{ownerId}/{presentationId}/{slideId}.webp` and
`…/{slideId}.thumb.webp`. Dev uses **Azurite** through Aspire (`AddAzureStorage("storage").RunAsEmulator().AddBlobs`),
prod uses the existing storage account with the API's user-assigned managed identity (it already has Blob Data
Contributor). Pictures are **streamed through the API** (`GET /api/slides/{id}/image`), which checks access every
time: the owner, or a member of a circle whose running session uses this presentation and whose current or past
slide is this one. Response: `Cache-Control: private, max-age=3600`, `ETag`. The original .pptx is stored at
`…/source.pptx` only until conversion ends, then deleted.

**Rationale**: private by default (constitution V): no public container and no long-lived SAS links that could leak
into chats; participants can only fetch slides already shown. Volume is tiny (≤ 12 people × ≤ 100 slides × ~150 KB).

**Alternatives rejected**: public blobs (leak risk); user-delegation SAS per slide (more moving parts for no gain at
this scale); Postgres `bytea` (bloats backups).

## R4. Conversion runs in the background

**Decision**: upload returns `202` with the presentation in `processing`. A hosted `PresentationConverter`
(`BackgroundService` reading a bounded `Channel<Guid>`, 2 conversions at a time) does R2 → Gotenberg → PDFium → blobs,
updates `ProcessedSlides` for progress (polled by the client every second, TanStack Query), then sets `ready` or
`failed` with an error code. On start-up it re-queues presentations left in `processing`. A presentation stuck over
10 minutes is marked `failed` (`timeout`).

**Rationale**: conversions take seconds to a minute; a request must not hold that long, and a restart must not lose
work. Polling is simpler than a hub for a single user watching their own upload.

## R5. Live state and real time

**Decision**: extend the existing **circle hub** (`/hubs/circle`, SignalR) with presentation methods and events, and
persist the session in Postgres so reloads, late joiners and replicas read the same truth:
- `PresentationSession` row per run: frozen deck snapshot (JSON), current position, blank flag, current question
  phase (`idle | answering | locked | revealed | podium`), `OpenedAt`, `Deadline`, `LockedAt`.
- Answers are rows with a unique index on `(SessionId, QuestionId, MemberId)` and an identity `Seq`; "first" =
  lowest `Seq` (received order), `FirstAnsweredAt` kept when a poll answer is replaced (spec: first received).
- Every hub call re-checks membership and role, like boards (FR-402 pattern).
- Answer submission is an upsert guarded by `phase = answering AND now < Deadline` in the same transaction, so the
  server decides (FR-610/611); late answers get `HubException("answers-closed")`.
- **Quiz timer**: a hosted `QuizClock` keeps the open deadlines in memory and, at the deadline, locks the question
  (the same guarded update) and broadcasts `QuestionLocked`. After a restart it reloads open sessions. Answer
  submission also enforces the deadline, so correctness never depends on the clock firing.
- Broadcasts: `PresentationState` (full public state, sent on every change: small) and `AnswerCount`
  (count + who answered, animator and audience only, throttled to 4 per second). Results are computed server-side and
  sent only at reveal (or live for polls with "Show results live").

**Rationale**: reuses the hub, auth and group model that boards and canvas already use; one public state object keeps
every screen consistent and makes late join trivial (send it on `Enter`).

**Scale note**: groups are per replica (spec 003). Correctness (one answer, deadlines, first) is in the database, so
it holds across replicas, but live fan-out does not: the app is pinned to **one replica** (`maxReplicas: 1`) until the
Web PubSub backplane lands as its own issue.

## R6. Audience screen

**Decision**: a route `/circles/:id/audience` that only the animator can open (same user session). It connects to the
hub with `EnterAudience(circleId)`: joins the circle group plus an `audience:{circleId}` group, is not added to
presence, and receives the same public state plus answer counts. The join QR code is drawn client-side with
**`qrcode`** (MIT, no network) from the existing join link.

**Rationale**: no new identity type, no guest token to leak; the animator drags the window to the projector.

**Alternatives rejected**: a shareable audience link with its own token (another secret to manage, leak risk in
rooms); rendering the QR on the server (needless round trips).

## R7. "Fancy" reveal without an AI look

**Decision**: CSS and the Web Animations API only, no animation library: bars grow with `transform: scaleX` from the
inline start (RTL-correct), count-up via `requestAnimationFrame` over 900 ms with ease-out, the spotlight card slides
in with the person's **character** (existing `Character` component, which can already cheer) and a short burst of
**confetti made of tiny character-coloured circles and hearts** on a `<canvas>` (≤ 80 particles, 1.2 s). The podium
rises step by step (3rd, 2nd, 1st). Everything is skipped under `prefers-reduced-motion` (final state at once). Shaped
with `/impeccable shape` first; banned patterns from `docs/design/anti-ai-look.md` apply (no gradients, no glow).

**Rationale**: delight in the moment, calm in structure; the characters make it ours rather than a stock confetti
look. No dependency, small bundle.

## R8. Retention and clean-up

**Decision**: `Presentation.LastUsedAt` updates on open-in-editor and on session start. A daily hosted
`PresentationJanitor` deletes presentations idle for 365 days (blobs first, then rows) and the UI shows "will be
deleted in N days" when idle > 335 days. User deletion cascades (FK `OwnerUserId` with cascade, blobs removed by the
janitor's orphan sweep). Sessions and answers live with the circle and are removed with it.

## R9. Scoring and podium

**Decision**: points = `round(1000 − 500 × min(elapsed, timer) / timer)` for a correct answer, 0 otherwise; elapsed =
`answer.ReceivedAt − session.OpenedAt` on the server clock. The podium is computed on demand from answers of the
session (`SUM(points)` per member), dense ranking (ties share a place, next place follows: 1, 1, 2).

## R10. Testing approach

- API (xUnit + Testcontainers Postgres + Azurite): validation of decks (fixtures: valid, encrypted, macro, zip bomb,
  101 slides, fake extension), conversion pipeline with a **fake converter** (returns a fixture PDF) plus one
  integration test against a Gotenberg Testcontainer (tagged, runs in CI), hub flows (one answer per member, poll
  replace, quiz final, lock at deadline with a fake `TimeProvider`, first-answer and first-correct, podium ties,
  non-member and non-animator refusals, slide image access rules).
- Web (Vitest): reveal maths (percentages that sum to 100, winner ties), countdown, state reducer.
- E2E (Playwright, en + ar): upload the fixture deck, add a poll and a quiz, run a session with two participant
  contexts and an audience page, reveal, spotlight, podium, reduced-motion run, axe.
