# Research: Live discussion stage (spec 009)

Decisions taken while planning. Each one lists what was chosen, why, and what else was considered. The open questions of the spec are closed here (the number refers to the spec's list).

## R1. Media path: browser to browser (WebRTC mesh), signalling over SignalR only

- **Decision**: audio and video travel in `RTCPeerConnection`s between browsers. The circle hub carries only `offer`, `answer` and `ice` messages (`Signal`). No SFU, no media server, no recording of media, in any environment.
- **Rationale**: the founder's clarifications (peer mesh, signalling over SignalR only, no media stored anywhere). It costs nothing to run and keeps media out of circloo's trust boundary.
- **Alternatives**: an SFU or Azure Communication Services calling (media on servers, paid, ruled out); a separate signalling service (a new service for no need).

## R2. Topology and the limit of a mesh (open question 7)

- **Decision**: two kinds of seat in memory.
  - **Stage** (senders): at most `Discussion:StageMax` (default 8, range 2 to 12), the animator included. Stage to stage is a full mesh (8 people = 28 links, 7 uploads each).
  - **Viewers** (receive only): opt in with "Watch the stage" (`WatchStage`), at most `Discussion:ListenersMax` (default 8, range 0 to 24). A viewer opens one `recvonly` link to each stage member. Everyone else uses chat, hands and the roster ("Amina is on stage").
- **Upload budget**: a sender splits about 1.2 Mbps of video across its links (`clamp(1 200 000 / links, 120 000, 700 000)` bits per second, re-applied when links change); audio is 32 kbps per link. Capture defaults to 640x360 at 24 fps (audio only if the person chooses).
- **Rationale**: FR-907 says larger circles "watch and listen", but a mesh needs one upload per viewer, so 100 watchers is physically impossible on home connections. Capping and opting in is honest and safe. The cap is configuration.
- **Alternatives**: everyone auto-connected as a viewer (breaks the stage's own links); audio-only broadcast to the audience (still 90 uploads); a media server (the only real way to broadcast, see founder decision D1).

## R3. Link design: transceivers up front, `replaceTrack`, no renegotiation

- **Decision**: when a link opens, both sides add an audio and a video transceiver. The side that offers is the **viewer** for viewer links, and the member with the smaller id for stage-to-stage links (no glare). Mic and camera later start with `sender.replaceTrack(track)` and stop with `replaceTrack(null)` plus `track.stop()`. The only renegotiation is an ICE restart, offered by the same side that offered first.
- **`linkId`**: a UUID chosen by the offerer, repeated in the answer and ICE messages. Messages for a link that was closed or replaced are discarded, so a rejoin never mixes with a stale link.
- **Rationale**: it avoids the perfect-negotiation state machine for tracks, which is the usual source of bugs, and gives instant mic and camera toggles.
- **Alternatives**: add and remove tracks with renegotiation each time (more signalling, glare handling).

## R4. Signalling authorisation and limits (FR-909, FR-921)

- **Decision**: `Signal(Guid toMemberId, string kind, Guid linkId, string payload)`. The server re-resolves the sender (`CurrentAsync`), requires Live discussion on, finds both seats in the circle's `StageRegistry` and allows only stage and stage, or a viewer and a stage seat in either direction (offers go viewer to stage, answers and ICE both ways); never viewer and viewer. The sender id on the wire is the server's. Delivery is to the target seat's `ConnectionId`.
  - `kind` in `offer`, `answer`, `ice`. `payload`: SDP at most 16 KB (starts with `v=0`), ICE at most 2 KB (valid JSON object or the empty end-of-candidates marker).
  - Limits per member (across tabs): 40 offers/answers and 300 ICE per 10 s.
  - Every refusal is the single code `signal-refused`.
- **Rationale**: a single refusal code gives an attacker nothing to probe. Seat membership is the authorisation, and it is the server's own data.
- **Alternatives**: a signed token per link (extra complexity: the seat check already proves the right).

## R5. ICE servers from configuration (open question 9, founder: STUN only at launch)

- **Decision**: `Discussion:IceUrls` (string array) with the default `["stun:stun.cloudflare.com:3478"]`. A blank entry is dropped. Only `stun:`, `stuns:`, `turn:` and `turns:` schemes are accepted at start-up. `GET /api/circles/{id}/discussion/ice` (members only, rate limited) returns `{ iceServers, ttlSeconds }`. The client fetches it when it first joins or watches, not at page load.
  - **Local and e2e**: the AppHost sets `Discussion__IceUrls__0` blank, so only host candidates are used. Fake devices on one machine connect with no internet (constitution IX).
  - **Later TURN**: the response shape already has room for `username` and `credential`. TURN credentials are short-lived and issued by the API (REST time-limited credentials), so a TURN secret would live in Key Vault and never reach the repo or the client for longer than its TTL. That is a separate task, not part of this feature.
- **Privacy**: the STUN operator sees the public IP of whoever opens a link (binding requests only). The primer says so briefly (R14 text), and the URL is configuration so a self-hosted STUN replaces it without code.
- **Alternatives**: hard-coding STUN in the client (not configurable); TURN at launch (cost and hosting, deferred by the founder).

## R6. Where state lives

- **Decision**:
  - **Database**: the setting (`Circle.DiscussionOn`, `DiscussionVideo`, who and when), recordings, recording events, reply links. Hands stay in 008's `RaisedHand`.
  - **Memory** (`StageRegistry`, singleton, one replica): seats (`stage` or `viewer`, `invited` or `onStage` or `reconnecting`, connection id, `MutedByAnimator`, `AudioOn`, `VideoOn`), the animator's presence and the away clock, the active-recording cache.
- **Rationale**: spec says stage and mute state reset when the room ends and are "not stored beyond what the transcript records". Seats are bound to connection ids anyway. A process restart ends the stage, and the clients fall back to listening and re-join.
- **Alternatives**: a `StageSeat` table (a write per event and still needs connection ids).

## R7. Floor, mute and stage rules (open questions 4 and 6, FR-904 to FR-908)

- **Decision**:
  - One animator controls the stage and the recording. Co-animators are out of scope; a second animator connection (a second tab or device) works and nothing breaks.
  - `GiveFloor(memberId)` (008 method, extended): with Live discussion **off** it behaves as in 008. With it **on**, it needs the person's hand up (`hand-invalid`), refuses when stage seats (senders, invited ones included) are at `StageMax` (`stage-full`), deletes the person's hand and **reserves a seat** (`invited`). The 008 single "speaking" marker is not used while discussion is on, because many people can speak. The invited person's client then calls `JoinStage`, which confirms the seat (`onStage`) and opens links. An invitation expires after 60 s.
  - The animator seats themselves with `JoinStage` (no hand needed).
  - `TakeFloor(memberId)`: the animator ends someone's turn kindly (back to the audience, no re-raise needed). `RemoveFromStage(memberId)`: moderation, audited, the person is told in neutral words, and the person needs a new hand and floor. `LeaveStage()`: self.
  - `MuteMember(memberId)` sets `MutedByAnimator`, forces `AudioOn=false`. The person **stays muted until `AllowUnmute(memberId)`** (decision from the spec's defaults). Allowing does not switch anything on: the person chooses (FR-908). Leaving and being given the floor again clears it.
  - `SetMedia(audioOn, videoOn)` is how a seat reports its devices, so every tile and every receiver has the server's view. It is refused for audio while muted (`muted-by-animator`) and for video when `DiscussionVideo` is false (`video-not-allowed`).
  - A person who drops loses the seat after `Discussion:SeatGraceSeconds` (30); if they reconnect, `JoinStage` from the new connection takes the same seat over.
- **Rationale**: the server never switches a device on. It records what the seat reports and lets honest receivers gate playback on the server's state (R4 threat model).
- **Alternatives**: the server tracks nothing about media (receivers could not honour mute); the animator can force-unmute (violates FR-908).

## R8. Animator away (open question 5)

- **Decision**: the registry counts animator connections. When the last one closes, an away clock starts, but only if the animator had been connected in this room session (a circle left on, with participants early and no animator yet, just shows "waiting for the animator" and never ends).
  - After 60 s: **frozen**. `Discussion.away = 'frozen'` is broadcast, `JoinStage` and `WatchStage` are refused for non-animators (`animator-away`), existing links keep running, hands keep queueing, recording keeps its state.
  - After 5 min: **ended**. The setting is switched off (audit `discussion.off`, reason `animator-away`), the stage is cleared, a running recording is stopped and saved, and the room shows "The animator ended the discussion". Switching it back on is the animator's call.
  - If the animator returns before then, the freeze lifts and `Discussion.away` goes back to `none`.
- **Mechanism**: `DiscussionWatchdog.TickAsync(now)` every 5 s over circles in the registry. Tests advance a `FakeTimeProvider` and call `TickAsync`.
- **Alternatives**: pause rather than end (a stage nobody can control for an unbounded time); a per-circle timer (R6 of the plan's complexity table).

## R9. Recording lifecycle, notice and consent (clarification: notice plus indicator, no accept step)

- **Decision**: `StartRecording(title?)` creates a `Recording` row in phase `notice` and broadcasts `Recording` to the circle group (the audience screen too). Capture begins at `CaptureFrom = StartedAt + Discussion:RecordingNoticeSeconds` (5 s); nothing before is captured. `AcknowledgeRecordingNotice(recordingId)` is what each client calls once its notice and indicator are on screen. It is not a user choice: there is no accept button.
  - **Gate**: while a recording runs, a non-animator connection that has not acknowledged cannot `Say`, `Reply`, `RaiseHand` or `JoinStage` (`notice-required`). So everything captured comes from someone whose client showed the notice, and a joiner or reconnecter sees it on entry before they can send (FR-917). `Enter` pushes `Recording` first.
  - One recording per circle: a partial unique index on `CircleId` where `EndedAt IS NULL`. A second `StartRecording` is idempotent and returns the running one (two animator tabs give exactly one recording). `StopRecording` is idempotent too.
  - **Ends**: animator stops; Live discussion switched off; animator away 5 min; maximum length (`RecordingMaxMinutes`, 240, warning to the animator at `RecordingWarnMinutes` = 15 minutes before); circle closed; event cap (50 000); server restart (orphans are closed with reason `restart` by the watchdog at start-up). Everyone gets `Recording(null)` and a system line "Recording stopped".
  - **Limits**: at most 50 recordings kept per circle (`too-many-recordings`, delete one first); at most 6 starts per hour per animator.
- **Rationale**: it is the founder's consent model, enforced on the server where it can be, with no dark patterns. A fixed 5 s notice is simple and testable, and the ack gate closes the gap for slow or late connections.
- **Alternatives**: wait for every connection's ack before capturing (one stale tab blocks the recording); explicit accept (rejected by the founder).

## R10. What is captured and how (FR-915, FR-918)

- **Decision**: `Recorder.Capture(...)` adds one `RecordingEvent` in the caller's unit of work. Kinds: `message`, `hand.raised`, `hand.lowered`, `stage.joined`, `stage.left` (reason: `self`, `taken`, `removed`, `dropped`, `ended`), `floor.given`, `floor.taken`, `muted`, `unmute.allowed`, `recording.started`, `recording.stopped`. Fields: time, actor member id, subject member id, message id, reply-to message id, a short reason, and `Text` only for `message`. A database check constraint refuses text on any other kind.
  - Messages are a **snapshot** of the text, so deleting or changing chat later does not rewrite the record.
  - **No names stored.** Names come from `CircleMember` at read time ("Former member" if the member row is gone).
  - **Hidden messages**: marked at read time by joining `CircleMessage.HiddenAt` through `MessageId`. Only the animator reads transcripts, and it shows them with a "hidden" label.
  - **Replies** carry the parent's message id in `ReplyToMessageId`, so exports can indent them.
  - **Nothing else**: no audio, no video, no speech-to-text, no device labels, no IP, no SDP. A test lists the allowed kinds and columns and inspects every stored row (SC-906).
- **Erasure** (open question 2): retention until the animator deletes it. A member who leaves keeps their earlier lines. A member's request to remove their lines is handled by the animator deleting the transcript (hard delete). Row-level self-service removal is out of scope. `ActorMemberId` and `SubjectMemberId` are plain columns without a foreign key, so a removed member row never blocks or silently rewrites a transcript. Backups keep deleted rows until the platform backup window ends, which the privacy text must state (decision D5).
- **Alternatives**: storing names (needs scrubbing on every rename or leave); referencing live chat rows (changes under the record).

## R11. Export (FR-919, spec US6)

- **Decision**: `GET .../export?format=txt|md&lang=en|fr|ar|es` renders server-side from `Resources/transcript/*.json` (labels, "hidden", "removed by", etc.). Markdown escapes message text and names; every name and message is wrapped in Unicode bidi isolates (FSI, PDI) so Arabic and Latin mix correctly. Headers: `Content-Disposition: attachment; filename="circloo-<ascii-slug>-<yyyy-MM-dd>-<id8>.md"`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. Export is audited (`recording.exported`) and rate limited.
- **Alternatives**: client-side generation (the browser would need the whole transcript and its own escaping); PDF (not asked).

## R12. Threads (open question 8)

- **Decision**: reuse the circle chat. `CircleMessage.ReplyToId` (nullable, one level deep). A new hub method `Reply(long parentId, string text)` shares the existing send path (`TextRules.Clean`, `SafetyPolicy`, 008's per-member and slow-mode limits, hiding, likes). The parent must be a member message of the same circle, not hidden and not itself a reply (`reply-invalid`). The circle view returns `replyToId`; the UI nests replies under the parent. A reply to a hidden message later is hidden from view with its parent for members.
- **System lines** (FR-913): persisted `system` messages for discussion on/off, stage joined/left/removed, floor given/taken, muted, recording started/stopped (extending the `verb:arg` text format that `Chat.tsx` already parses). **Hand raised/lowered are drawn locally from `Hands` events** (grouped, not stored), so a room of 100 does not fill the chat table; they are in the transcript through `RecordingEvent`.
- **Alternatives**: a new threads table (second chat, forbidden by the spec).

## R13. Kids-safe circles (open question 10)

- **Decision**: no kids-safe circle flag exists in the code today (only Sparks have `KidsSafe`; 008 mentions kids-safe circles in prose). This feature adds `Circle.DiscussionVideo` (default true), switched in the discussion settings as **"Allow cameras"**. When off, `SetMedia` refuses video and the UI offers audio and chat only. `DiscussionRules.VideoAllowed(circle)` is the single place to also force it off once a circle-level kids-safe flag exists. Founder decision D3.
- **Alternatives**: add a `KidsSafe` circle flag now (a creation-flow change outside this feature).

## R14. Browser support, device handling and fallbacks (US4)

- **Decision**: `media.ts` feature-detects `RTCPeerConnection` and `navigator.mediaDevices?.getUserMedia`. Without them the panel says "This browser cannot join the live discussion. You can still chat and raise your hand." and nothing else changes.
  - **Primer**: before the first `getUserMedia` call, a one-sentence explanation: "Your camera and microphone go straight to the people on stage. circloo does not keep them. They can see your network address." (plus the STUN line in a "more" disclosure) with a Continue button. It is shown once per session per device kind, not remembered across sessions.
  - **Error mapping**: `NotAllowedError` becomes `denied` (how to allow it again in the browser), `NotFoundError` and `OverconstrainedError` become `no-device` (offer audio only or listen), `NotReadableError` and `AbortError` become `busy` (Try again), `SecurityError` becomes `blocked` (policy). Camera failing with audio working falls back to audio only. `getUserMedia` is requested per kind, never both at once, so one failure never blocks the other.
  - **Weak link**: `link.ts` reads `getStats()` every 3 s. Packet loss above 15 % or round trip above 800 ms over two samples sets `weak`, the sender sets that link's video off (`replaceTrack(null)`), audio stays, and the tile shows "Weak connection". It recovers after 10 s of good samples.
  - **Other**: `iceConnectionState` `failed` triggers one ICE restart, then "Can't connect to Amina. Chat and hands still work" for that link only. Safari and phones are tested in the manual session (quickstart C); `playsinline` and muted-autoplay rules apply to the remote video elements, and remote audio plays through the tile's `<audio>`.
  - **TURN later**: people on strict networks will see the link-failed message. Founder decision D2. Container Apps has no UDP ingress (to verify with azure-infra), so coturn there is not an option; candidates for the later task are Azure Communication Services Network Traversal (the project already has an ACS resource for email) or a managed TURN provider, each with short-lived credentials.
- **Alternatives**: requesting camera and microphone together (one denial fails both).

## R15. Content Security Policy and Permissions-Policy

- **Decision**: CSP is unchanged. WebRTC ICE and STUN traffic is not governed by `connect-src`, and a `MediaStream` assigned to `video.srcObject` is not governed by `media-src`. The e2e test fails if the console shows a CSP violation during a call. `Permissions-Policy` stays `camera=(), microphone=(), geolocation=()` everywhere **except** `/c/{guid}` and `/app/circles/{guid}`, where it is `camera=(self), microphone=(self), geolocation=()`. The audience route `/app/circles/{guid}/audience` keeps the deny-all value. A header test covers all three.
- **Alternatives**: relax it globally (wider than needed).

## R16. Tests and the "test skill" (open question 14, FR-926)

- **Decision**: no new skill. Hub tests (xUnit + Testcontainers) enforce the server rules; Vitest covers the mesh manager on a fake `RTCPeerConnection`; Playwright uses `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream` for happy paths and an init script that rejects `getUserMedia` (`NotAllowedError`, `NotFoundError`, `NotReadableError`) for the fallback stories. Tiles expose `data-link-state` and `data-receiving` computed from `getStats()`, which the browser tests read. The 8-person speed test (SC-903) runs with 4 pages in CI and 8 pages with `E2E_STAGE_PEERS=8` before a release.
- **A test skill** would only be useful if the founder wants a reusable "run the live-room checks" command. It would be its own idea issue, not part of this feature.

## R17. Projector (open question 11)

- **Decision**: the audience screen (the animator's own window, `EnterAudience`) renders only the recording indicator and the number of raised hands, as in 008. No speaker names, no video. The spec's optional "show speaker names if the animator chooses" is not built; it can be a later setting.

## R18. Infra (constitution VII, azure-infra)

- **Decision**: no Bicep change and no new secret. New settings are plain environment variables with code defaults: `Discussion__StageMax`, `Discussion__ListenersMax`, `Discussion__IceUrls__0..n`, `Discussion__SeatGraceSeconds`, `Discussion__InviteSeconds`, `Discussion__AwayFreezeSeconds`, `Discussion__AwayEndSeconds`, `Discussion__RecordingMaxMinutes`, `Discussion__RecordingWarnMinutes`, `Discussion__RecordingNoticeSeconds`, `Discussion__RecordingMaxEvents`, `Discussion__RecordingsPerCircle`. They are added to the env list in `docs/architecture/overview.md` (task T901). The app stays on one replica (the registry and watchdog are in memory).
- **Later**: a TURN relay is a separate azure-infra task: pick the provider, add its secret to Key Vault and `infra/`, return time-limited credentials from the ICE endpoint, state the monthly cost. It is not blocking this feature.

## Founder decisions

D1 to D4 were answered on 2026-10-05 and are recorded in the spec's Clarifications (cap of 8 opt-in viewers; STUN only, TURN later; "Allow cameras" switch, default on; Cloudflare STUN). D5 to D7 still need the founder.

- **D1. Watching limit**: viewers are opt-in and capped at 8 (configurable). A real audience of 100 needs a media server (SFU), which contradicts "no media through servers". Is the cap acceptable until a later decision?
- **D2. Strict networks**: with STUN only, some people (corporate firewalls, some mobile carriers) cannot connect. Accept until a TURN task, or ask for TURN sooner?
- **D3. Kids-safe**: there is no kids-safe circle flag in the product. The plan adds an "Allow cameras" switch (default on). OK, or should kids-safe circles get a real flag first?
- **D4. STUN provider**: the default is Cloudflare's public STUN, which sees participants' public IPs. Prefer another provider, or self-hosting later?
- **D5. Privacy text**: transcripts hold personal data (names via members, message text). The notice says what is recorded; backups keep a deleted transcript for the platform backup window. Needs a sentence in the privacy policy.
- **D6. Animator away for 5 minutes switches the discussion off** (not just ends the session). It stays off until the animator switches it on again.
- **D7. Transcript retention and a member's own data** (spec open question 2, not in the Clarifications): the default here is "kept until the animator deletes it" with no upper limit, and a member's erasure request depends on the animator deleting the whole transcript (R10). The PRD promises "export and delete my data". Confirm, or choose a maximum retention and/or redaction of a member's `Text` and ids when they delete their account or ask for erasure. Whatever is chosen, the later E6 "export and delete my data" feature must cover `RecordingEvent` rows where the member is actor or subject.
