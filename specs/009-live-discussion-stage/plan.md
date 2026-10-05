# Implementation Plan: Live discussion: stage with audio and video, raised hands and a text-only session record

**Branch**: `feat/212-live-discussion-stage` (spec on `docs/212-live-discussion-spec`; task branches `feat/<task-issue>-*`) | **Date**: 2026-10-05 |
**Spec**: [spec.md](spec.md) | **Parent idea**: #212 (related: #96 superseded, #166, #174, #126)

**Input**: Feature specification from `specs/009-live-discussion-stage/spec.md`, including its Clarifications of 2026-10-05.

## Summary

The animator switches **Live discussion** on for a circle (off by default). Then people raise a hand (spec 008), the animator gives the floor, and up to 8 people send audio and video **directly between browsers** (WebRTC peer mesh). circloo only relays the offer, answer and ICE messages over the existing SignalR circle hub. No media touches a circloo server or is stored anywhere. The animator can record the session as **text only**: chat messages, hands, stage events. The transcript is readable, exportable and deletable by the animator alone.

- **Data**: `Circle.DiscussionOn/DiscussionVideo/DiscussionChanged*`, `CircleMessage.ReplyToId`, new `Recording` and `RecordingEvent`. One migration, `LiveDiscussionStage`.
- **Live state in memory** (one replica, like presence): a `StageRegistry` (who sits, who listens, muted, connection ids), the animator-away clock and the active-recording cache. A single `DiscussionWatchdog` tick (every 5 s) runs every time-based rule: seat grace, animator away, recording cap and warning.
- **Hub**: a `CircleHub.Discussion.cs` partial (switch, stage, floor, mute, media state, signalling) and `CircleHub.Recording.cs` (record, notice acknowledgement, replies capture). Every method re-resolves the caller's membership and role on the server.
- **Client**: a mesh manager in `src/web/src/features/circles/stage/` with one transceiver pair per link and `replaceTrack` for mic and camera, so there is no renegotiation after the first offer. Device failures degrade to listening, chat and hands.
- **Honest limit**: a peer mesh cannot broadcast to a hundred people. Stage = 8 senders. Watching is opt-in for up to 8 more receive-only viewers (configurable). Everyone else follows the chat, the queue and the stage roster. See R2 and the founder decisions at the end of research.md.
- **Infra**: public STUN by configuration only. **No Bicep change.** A later TURN relay is a separate azure-infra task (R5, R14).

## Technical Context

**Language/Version**: C# / .NET 10 (API), TypeScript strict / React 19 (web); browser WebRTC APIs (no new npm package)

**Primary Dependencies**: existing SignalR circle hub, `RoomLimits`, `LiveThrottle`, `SafetyPolicy`, `AuditLog`, EF Core (Npgsql), Zustand, TanStack Query, i18next. Nothing new to install.

**Storage**: PostgreSQL. `Circle.DiscussionOn`, `DiscussionVideo`, `DiscussionChangedAt`, `DiscussionChangedByMemberId`; `CircleMessage.ReplyToId`; new `Recording`, `RecordingEvent`. Stage seats, listeners, mute state and signalling are **not stored**. Migration `LiveDiscussionStage`.

**Testing**: xUnit + Testcontainers (hub, endpoint and watchdog tests on `FakeTimeProvider`), Vitest (mesh manager on a fake `RTCPeerConnection`, media error mapping, announcement batching), Playwright `e2e/discussion.spec.ts` with `--use-fake-device-for-media-stream` (en desktop and ar phone, axe), a manual two-device session (quickstart C).

**Target Platform**: Azure Container Apps (one `web` replica) + current Chrome, Edge, Firefox, Safari (iOS 16+). Phones are first-class for listening, hands and chat.

**Project Type**: web application (API + SPA in one production container)

**Performance Goals**: hand reaches the animator in < 1 s (SC-904); with 8 on the stage everyone hears and sees everyone within 3 s of a device going on (SC-903); stage events reach everyone in < 1 s; signalling handled in < 50 ms server-side.

**Constraints**: no media on servers or at rest; zero-cost dev (fake devices, no paid service); WCAG 2.2 AA; four locales with RTL; reduced motion; recording indicator always visible; single replica; CSP stays strict.

**Scale/Scope**: stage ≤ 8 senders (`Discussion:StageMax`, 2–12), ≤ 8 viewers (`Discussion:ListenersMax`, 0–24), circle up to 100 (spec 008). One recording at a time per circle, at most 50 kept per circle, at most 50 000 events each, at most 4 h.

## Dependencies on spec 008 (state on 2026-10-05)

`git log` shows only **T801 to T803** of spec 008 merged (foundation, big-circle join, shared characters). T801 already added `RaisedHand`, `MessageLike`, `Circle.ChatMode`, `RoomLimits`, `RoomSettings`, `HandsView` and `Hands.View` in the circle view. **Not merged yet** (no `Hands` event in `ICircleClient`, no `CircleHub.Room.cs`, no `room/` web folder): T804 sidebar, T805 chat hub, T806 chat UI, T809 hands hub, T810 hands UI. This plan:

- reuses 008's `RaisedHand` table, `RaiseHand`, `LowerHand`, `LowerAllHands` and the `Hands` event as they are specified there (no second queue);
- **extends** 008's `GiveFloor` (task T902): with Live discussion on it seats the person on the stage instead of setting the single speaking marker;
- therefore T902 depends on T809, the stage UI (T906) on T804 and T810, the conversation UI (T909) on T806. If a 008 task slips, the 009 task that needs it waits. Nothing here re-implements 008.

## Constitution Check

| Principle | Status |
|---|---|
| I. No issue, no development | Pass. Parent idea #212. Task issues come from `/speckit-taskstoissues` after this plan. |
| II. Spec before code | Pass. Spec plus clarifications. Open questions 4 to 12 and 14 are decided in research.md; 1 to 3 and 9 were decided by the founder. |
| III. Four languages, RTL | Pass. Strings `circles.discussion.*`, `circles.stage.*`, `circles.recording.*`, `circles.transcript.*` in en/fr/ar/es. Transcript exports are localised and bidi-isolated. Every UI task runs an ar phone e2e. |
| IV. Human-crafted design | Pass with a recorded exception: Impeccable is not installed (#126), so ux-designer reviews manually. See Complexity Tracking and "Impeccable runs per UI task". |
| V. Private by default | Pass. Circle content stays with members. Transcript readable by the animator only. Enterprise policies ("discussion allowed" per organisation) stay out of scope and would be configuration, never customer code. Third-party STUN is disclosed (Complexity Tracking). |
| VI. Test what matters | Pass. Hub tests per rule (every animator-only method refused for participants), watchdog tests, Vitest on the mesh, Playwright per story with fake devices, an ar run and axe. |
| VII. Simple, disposable infrastructure | Pass. No Azure resource, no Bicep change. TURN is deferred and would be added to `infra/` through azure-infra. |
| VIII. Secure by design | Pass. Threat model below. New rate limits, audits, no payloads in logs, strict CSP kept. One header is relaxed on room routes only (Complexity Tracking). |
| IX. Zero-cost development | Pass. Fake media devices in tests, no STUN needed locally (blank `Discussion:IceUrls` in the AppHost leaves host candidates), no paid service. |

**Gate result: PASS** with the Complexity Tracking entries. Re-checked after Phase 1 design: unchanged.

## Threat model (constitution VIII, FR-923)

| Threat | Mitigation |
|---|---|
| A participant calls animator-only methods through a crafted hub message (switch, floor, mute, remove, record) | Each method calls `CurrentAsync(animatorOnly: true)`, which re-reads the role from the database. Refusals are audited as `discussion.refused` (method name and ids only, at most 5 audit rows per member per minute so a flood cannot fill the audit table). Hub tests assert every one of these methods for a participant, a guest, a non-member and an audience connection. |
| Signalling abuse: relaying SDP/ICE to people outside the call, other circles, or flooding | `Signal` accepts only between two **registered seats** of the **same circle** (stage to stage, or viewer to stage). The sender id is taken from the server, never from the payload. Payload caps: 16 KB SDP, 2 KB ICE. Limits per member: 40 SDP and 300 ICE messages per 10 s. A single generic `signal-refused` code hides the reason. Messages are delivered to the seat's own connection id. |
| Unauthorised or silent recording | Only the animator starts or stops (server-side). A notice phase (default 5 s) precedes capture. Joiners must acknowledge the notice before `Say`, `Reply`, `RaiseHand` and `JoinStage` work (`notice-required`). One recording per circle (partial unique index). No media API is touched by the recorder. |
| Recording leaks (transcript read by others) | Endpoints require the animator role. Non-animators get 403 and an audit row. Export is `no-store`, `attachment`, `nosniff`. Responses carry no other circle's data. The recording indicator tells everyone the record exists. |
| Stored personal data in transcripts | Text and ids only. No names stored (resolved at read from `CircleMember`, "Former member" when gone). Retained until the animator deletes it (hard delete, cascade, audited). Backups keep deleted rows until the platform backup window ends: the notice and privacy text say so (founder decision D5). A per-circle cap of 50 recordings and 50 000 events bounds growth. |
| Markdown or HTML injection through exports | Message text and names are escaped in Markdown (`\ * _ # [ ] < > ` ` | ~` and leading list markers), wrapped in bidi isolates, never rendered as HTML by the app. |
| IP exposure through direct connections | Peers see each other's public IP through ICE candidates, and the STUN operator sees it too. The pre-permission sentence and the "Watch the stage" button say so (FR-910/923). Browsers hide LAN addresses behind mDNS names. A relay (TURN) that hides IPs is the later task. Listening is opt-in. |
| Third-party STUN operator | Only STUN binding requests (no media, no circloo data). The URL list is configuration, so a self-hosted server replaces it without code. Disclosed in R5. |
| A modified client sends audio or video when muted, removed, or as a viewer | A server cannot inspect peer media. Honest receivers enforce the **server's** state: they play a remote person's audio and video only when the `Stage` view says that seat is on stage, not muted and its media is on, and they close links to anyone not seated. Viewers' links are `recvonly` from the stage side (`sendonly` transceivers), so media from a viewer is never received. Documented residual risk: a hostile modified client can still stream to a modified receiver it connected to. |
| Seat or stage flooding (repeated join and leave, many tabs) | `JoinStage` 6 per minute, `SetMedia` 20 per 10 s, hands 6 toggles per 10 s, animator actions 30 per 10 s, all through `RoomLimits` per member (across tabs). One seat per member: a new connection of the same member takes the seat over. |
| Denial of service on one replica | Seats, registry and signalling are bounded: at most 8 + 8 seats per circle, small payloads, nothing stored per signal. The watchdog is one loop over live circles, not a timer per object. |
| Secrets or media in logs | Signalling payloads, SDP, ICE, device labels and message text are never logged or put in audit detail (a hub test captures logs during a call and asserts the marker text is absent, SC-906). SignalR stays at Warning level. |
| Clickjacking or hidden camera permission | CSP unchanged. `frame-ancestors 'none'` stays. `Permissions-Policy` allows camera and microphone for `self` only on the two room routes, never on the audience screen. |
| Projector or audience screen reveals people | The audience screen is the animator's own window. It renders only the recording indicator and the number of raised hands, never names, video or chat. |
| Account enumeration, guest abuse | Guests are members through the existing guest cookie. Nothing new reveals whether an account exists. |

Audit events (ids only, never text): `discussion.on`, `discussion.off` (with reason), `stage.floor`, `stage.taken`, `stage.removed`, `stage.muted`, `recording.started`, `recording.stopped` (with reason), `recording.deleted`, `recording.exported`, `discussion.refused`.

## Project Structure

### Documentation (this feature)

```text
specs/009-live-discussion-stage/
├── spec.md
├── plan.md              # this file
├── research.md          # R1 to R17 and the founder decisions
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── hub.md           # methods, events, error codes, authorisation, limits
│   └── rest.md          # ICE servers, transcript list/read/export/delete
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/Circloo.Api/
├── Discussion/                           # new
│   ├── DiscussionOptions.cs              # Discussion:* configuration, validated at start-up (R5, R6)
│   ├── DiscussionRules.cs                # records (DiscussionState, StageView, Seat, RecordingState), validation, kids-safe video rule
│   ├── StageRegistry.cs                  # in-memory seats, listeners, mute state, animator presence (R6)
│   ├── DiscussionWatchdog.cs             # BackgroundService: TickAsync(now) runs seat grace, animator away, recording cap (R8)
│   ├── Recorder.cs                       # capture of text events, start/stop, caps, orphan recovery (R9, R10)
│   ├── TranscriptExport.cs               # txt and Markdown rendering with escaping and bidi isolates (R11)
│   └── DiscussionEndpoints.cs            # GET ice, transcript list/read/export/delete (contracts/rest.md)
├── Circles/
│   ├── CircleHub.cs                      # Enter pushes Discussion/Stage/Recording; presence feeds the registry; Say captures
│   ├── CircleHub.Discussion.cs           # new: EnableDiscussion, DisableDiscussion, JoinStage, LeaveStage, WatchStage, StopWatching,
│   │                                     #      GiveFloor (discussion branch), TakeFloor, MuteMember, AllowUnmute, RemoveFromStage, SetMedia, Signal
│   ├── CircleHub.Recording.cs            # new: StartRecording, StopRecording, AcknowledgeRecordingNotice, Reply
│   └── CircleHub.Room.cs                 # spec 008 T805/T809: RaiseHand, LowerHand, GiveFloor call into Discussion for the stage branch
├── Resources/transcript/{en,fr,ar,es}.json   # export labels (like Resources/emails)
├── Security/SecurityHeaders.cs           # Permissions-Policy relaxed on room routes only (R15)
├── Security/RateLimits.cs                # one HTTP policy for the ICE endpoint and transcript export
├── Data/Entities.cs, CirclooDbContext.cs, Migrations/*_LiveDiscussionStage.cs
└── Program.cs                            # options, singletons, hosted watchdog, endpoints

src/Circloo.AppHost/AppHost.cs            # Discussion__IceUrls__0 blank for local runs and e2e (host candidates only)

src/web/src/
├── api/discussion.ts                     # transcript queries and mutations, ICE servers query
├── features/circles/
│   ├── CircleRoom.tsx                    # discussion area, always-visible recording indicator in the room header
│   ├── room.ts                           # binds the stage store to the connection
│   └── stage/                            # new
│       ├── stage.ts (+ stage.test.ts)    # zustand store: discussion, seats, recording, my media state, bindStage(connection)
│       ├── mesh.ts (+ mesh.test.ts)      # MeshManager: links per seat, signalling adapter, bitrate budget
│       ├── link.ts (+ link.test.ts)      # PeerLink: transceivers, replaceTrack, ICE restart, weak-link detection
│       ├── media.ts (+ media.test.ts)    # getUserMedia wrapper and fallbacks, error mapping (MediaIssue)
│       ├── announce.ts (+ announce.test.ts)  # grouped polite and assertive announcements
│       ├── DiscussionSwitch.tsx          # animator on/off (and cameras allowed) in the room settings
│       ├── StagePanel.tsx, StageGrid.tsx, StageTile.tsx, StageControls.tsx
│       ├── PermissionPrimer.tsx, DeviceProblem.tsx
│       ├── RecordingIndicator.tsx, RecordingBanner.tsx, RecordButton.tsx
│       └── TranscriptList.tsx, TranscriptView.tsx
├── features/circles/present/AudienceScreen.tsx   # recording indicator and hand count only
├── styles/stage.css                      # new, logical properties
└── i18n/locales/{en,fr,ar,es}.json

tests/Circloo.Api.Tests/Discussion/       # new
├── DiscussionHost.cs                     # like LiveRoom/RoomHost.cs, plus a fake clock tick helper and log capture
├── DiscussionSwitchTests.cs, StageHubTests.cs, SignalingTests.cs, WatchdogTests.cs
├── ReplyTests.cs, RecordingTests.cs, TranscriptEndpointTests.cs, SecurityHeaderTests.cs

src/web/e2e/discussion.spec.ts            # new, fake media devices
docs/architecture/overview.md             # updated in T901 (decisions changed by this plan)
```

**Structure decision**: same web-application layout as specs 003 to 008. Server feature code lives in a `Discussion/` folder (as `Decide/` and `Presentations/` do), hub methods in two new `CircleHub` partials, client code in `features/circles/stage/` (as `present/` does for presenting).

## Impeccable runs per UI task (Impeccable is not installed, #126)

Until #126 lands the `ux-designer` agent reviews each UI PR by hand against `docs/design/anti-ai-look.md` and WCAG 2.2 AA and writes the result in the PR. The PR also lists the steps below as "skipped, to rerun" so they can be run later without guessing.

| Task | When Impeccable is available |
|---|---|
| T906 stage UI | `/impeccable shape stage` (tiles, controls, empty/full/frozen states, RTL order) → `/impeccable craft stage` (this creates the root `DESIGN.md` only if no earlier UI task did) → `audit` → `critique` → `harden` (names in three scripts, 8 tiles on a phone) |
| T907 permission UX | `shape device-permissions` (one-sentence primer, every failure state) → `craft` → `audit` → `harden` (long French/Spanish strings, RTL) |
| T909 conversation UI | `shape discussion-thread` → `craft` → `audit` → `critique` |
| T911 recording indicator and notice | `shape recording-indicator` (never hidden, phone, projector, collapsed sidebar) → `craft` → `audit` → `harden` |
| T913 transcript UI | `shape transcript` → `craft` → `audit` → `critique` |
| T914 accessibility pass | `audit` over the whole discussion surface → `harden` (reduced motion, RTL, focus order) |
| T915 journey | `critique` over the whole journey and a final `audit` |

## Complexity Tracking

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| WebRTC peer mesh in the browser (a protocol the constitution's "Real time: SignalR + Yjs" does not list) | FR-909 and the founder: no media on or through circloo servers, no media stored, zero cost. Signalling still uses SignalR. `docs/architecture/overview.md` gets a row. | An SFU or Azure Communication Services calling puts media on servers or adds a paid service the founder ruled out. |
| `Permissions-Policy` relaxed to `camera=(self), microphone=(self)` on `/c/{id}` and `/app/circles/{id}` only | `getUserMedia` is blocked by the global `camera=(), microphone=()` | Relaxing it for the whole site, or removing it, widens the surface. The audience route and every other page keep the deny-all policy. |
| Third-party public STUN (a Cloudflare STUN URL by default) | Without STUN, two people behind NAT usually cannot connect. It carries no media, only binding requests, and the founder chose STUN only at launch. | No STUN fails the feature. Self-hosting needs UDP, which Container Apps does not offer (R14). URL list is configuration, disclosed in the primer. |
| In-memory `StageRegistry` and watchdog on one replica | Seats and signalling target connection ids and must change in milliseconds. The one-replica limit is already accepted (specs 006 and 008, R12 of 008). | Persisting seats adds a write per event and still needs connection ids. A backplane is not needed at this size. |
| One `DiscussionWatchdog` tick loop instead of a timer per rule | Seat grace, animator away, recording cap and warning, orphan recovery are all "check against the clock". One loop is testable on `FakeTimeProvider` by calling `TickAsync`. | A timer per object leaks and is hard to test. A queue or job service is not needed (no new queue, per the architect rule). |
| Viewers capped (8) and opt-in, instead of a free audience | A mesh makes every sender upload once per viewer. 100 viewers is impossible. | Letting everyone connect would break the stage's own connections. A media server is the real fix (decision D1). |
| UI audit by the ux-designer agent instead of Impeccable (constitution IV) | Impeccable is not installed (#126). | Blocking every UI task on the plugin stops the feature. The manual review uses the same rules and is recorded per PR, as for specs 006 to 008. |
