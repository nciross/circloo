---

description: "Tasks for the live discussion stage (spec 009)"
---

# Tasks: Live discussion: stage with audio and video, raised hands and a text-only session record

**Input**: Design documents from `specs/009-live-discussion-stage/`: plan, spec, research, data-model, contracts and quickstart.

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/hub.md, contracts/rest.md

**Tests**: required by the constitution (VI). Every task ships its API tests (xUnit + Testcontainers) in `tests/Circloo.Api.Tests/Discussion/`. UI tasks also ship their Playwright journey in `en` (desktop) and `ar` (phone) with axe, in one file, `src/web/e2e/discussion.spec.ts` (one `describe` per task, to keep merges trivial), using `--use-fake-device-for-media-stream`.

**Organization**: one task = one GitHub task issue = one PR (repo convention). IDs use the 9xx range of this spec. Paths follow plan.md: API in `src/Circloo.Api`, tests in `tests/Circloo.Api.Tests`, web in `src/web`.

**Spec 008 prerequisites** (state on 2026-10-05: only T801 to T803 are merged): T902 needs T809 (hands hub), T906 needs T804 (sidebar) and T810 (hands UI), T908 needs T805 (chat hub), T909 needs T806 (chat UI). Do not start a task before its 008 prerequisite is merged.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel with the other [P] tasks of the same phase (different files, no dependency)
- **[Story]**: user story from spec.md (US1 to US7)
- **[UI]**: touches the interface. It needs the **ux-designer** (Impeccable is not installed, #126: manual review against `docs/design/anti-ai-look.md` and WCAG 2.2 AA, recorded in the PR with the skipped Impeccable steps from plan.md "Impeccable runs per UI task").

---

## Phase 1: Setup (Shared Infrastructure)

No setup task: no package, container or Azure resource is added (plan "Technical Context", research R18).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: data, options and the switch that every story builds on.

- [x] T901 [US1] **Foundation and the switch (API).** Entities, migration, options and the two animator methods, exactly as `data-model.md` and `contracts/hub.md`:
  - **Migration** `src/Circloo.Api/Data/Migrations/*_LiveDiscussionStage.cs` with entities in `src/Circloo.Api/Data/Entities.cs` and `CirclooDbContext.cs`: `Circle.DiscussionOn` "default false", `DiscussionVideo` "default true", `DiscussionChangedAt`, `DiscussionChangedByMemberId`; `CircleMessage.ReplyToId` "self FK, restrict, indexed"; new `Recording` (unique partial index on `CircleId` where `EndedAt IS NULL`) and `RecordingEvent` (check constraint: text only for `message`; index `(RecordingId, Id)`).
  - **Options and rules.** `src/Circloo.Api/Discussion/DiscussionOptions.cs` (every `Discussion:*` key of data-model.md with ranges, validated at start-up; blank `IceUrls` entries dropped, schemes checked) and `src/Circloo.Api/Discussion/DiscussionRules.cs` (records `DiscussionState`, `Seat`, `StageView`, `RecordingState`; `VideoAllowed(circle)`). Registered in `src/Circloo.Api/Program.cs`.
  - **Hub.** New partial `src/Circloo.Api/Circles/CircleHub.Discussion.cs` with `EnableDiscussion(bool videoAllowed)` and `DisableDiscussion()` (animator only, idempotent, audit `discussion.on` / `discussion.off`, persisted system lines, `Discussion` broadcast, deletes the circle's `RaisedHand` rows; the `Hands` broadcast is added by T902 once spec 008 T809 has added that event). `Enter` and `EnterAudience` push `Discussion` to the caller (`ICircleClient` in `CircleHub.cs`). A shared `RefuseAnimatorOnly(method)` helper writes `discussion.refused` (ids only, at most 5 rows per member per minute) and is used by every animator method of this feature. T902 adds the stage clearing and T910 the recording stop to `DisableDiscussion`.
  - **Circle view.** `src/Circloo.Api/Circles/CircleEndpoints.cs` returns `discussion`, `messages[].replyToId` and `recording: null` (T910 fills it), per `contracts/rest.md`. Types in `src/web/src/api/circles.ts`.
  - **Permissions-Policy.** `src/Circloo.Api/Security/SecurityHeaders.cs` allows `camera=(self), microphone=(self)` only on `/c/{guid}` and `/app/circles/{guid}`, and keeps `camera=(), microphone=()` on the audience route and everywhere else (R15).
  - **Local config.** `src/Circloo.AppHost/AppHost.cs` sets `Discussion__IceUrls__0` blank (host candidates only, no internet needed).
  - **Docs.** `docs/architecture/overview.md` was updated together with this plan (the rule: a plan that changes a decision updates it in the same change); T901 only re-checks it against the code and adds anything the implementation changed. It holds: a stack row "Live discussion media" (WebRTC mesh, signalling over SignalR, no media on servers), the `Discussion__*` settings in the env list (plain settings, no secret, no Bicep change), the `Permissions-Policy` exception in "Security by design", and `Recording`, `RecordingEvent` in the domain model.
  - **Tests.**
    - `tests/Circloo.Api.Tests/Discussion/DiscussionHost.cs`: like `LiveRoom/RoomHost.cs`, with a hub helper, a fake-clock tick helper and a log-capture provider.
    - `tests/Circloo.Api.Tests/Discussion/DiscussionSwitchTests.cs`: off by default; every one of `EnableDiscussion` and `DisableDiscussion` is refused for a participant, a guest, a signed-in non-animator, a non-member and an audience connection (SC-902) with an audit row each; the animator's switch reaches a member within 1 s; the setting survives a new connection; `videoAllowed` can change while on; the migration applies on a database with circles from before (defaults); switching off clears the hands queue and the setting within 2 s (FR-902).
    - `tests/Circloo.Api.Tests/Discussion/SecurityHeaderTests.cs`: the three header values on the room route, the audience route and `/`.

  Depends on T801 (merged).

**Checkpoint**: the migration applies, existing circles behave as before (SC-901), and the animator can switch discussion on and off.

---

## Phase 3: User Story 2 and 3 - Hands, floor and the stage (Priority: P1) 🎯 MVP

**Goal**: raised hands lead to the floor, the stage holds at most 8 senders, the animator controls it (spec US2, US3).

**Independent Test**: three participants raise hands, the animator gives the floor to the first, who joins the stage. The animator mutes, takes the floor and removes people. The stage refuses a ninth. A dropped person loses the seat after 30 s.

- [ ] T902 [US2] [US3] **Stage hub: hands, floor and seats (API).**
  - `src/Circloo.Api/Discussion/StageRegistry.cs`: singleton, per circle seats (`stage` or `viewer`; `invited`, `onStage`, `reconnecting`), connection ids, `MutedByAnimator`, `AudioOn`, `VideoOn`, animator connections. Fed from `Enter` and `OnDisconnectedAsync` in `src/Circloo.Api/Circles/CircleHub.cs`.
  - `src/Circloo.Api/Circles/CircleHub.Discussion.cs`: `GiveFloor` discussion branch (extends 008's method in `CircleHub.Room.cs`: hand must be up, `stage-full` counts seats plus invitations, reserves an `invited` seat, deletes the hand), `JoinStage`, `LeaveStage`, `WatchStage`, `StopWatching`, `TakeFloor`, `RemoveFromStage`, `MuteMember`, `AllowUnmute`, `SetMedia`; per-member `RoomLimits` (`stage-join` 6 a minute, `media` 20 per 10 s, `hand` 6 per 10 s on the 008 hand methods, `stage-admin` 30 per 10 s); audits `stage.floor`, `stage.taken`, `stage.removed`, `stage.muted`; persisted system lines; `Stage` coalesced through `LiveThrottle`, `StageNotice` to the affected member. The animator seats themselves with `JoinStage`. `DisableDiscussion` (T901) now clears the registry and broadcasts `Stage` and 008's `Hands`.
  - **Tests** `tests/Circloo.Api.Tests/Discussion/StageHubTests.cs`:
    - every animator method is refused for a participant, a guest, a non-member and an audience connection;
    - the floor needs a raised hand, deletes it and invites; the ninth seat gets `stage-full` and a configured cap of 2 is honoured;
    - a second connection of the same member takes over the seat;
    - mute forces audio off and `SetMedia(audioOn: true)` is refused until `AllowUnmute`; the server never sets a device on;
    - `video-not-allowed` when cameras are off (kids-safe path);
    - remove needs a new hand and floor; leave frees the seat; viewers are capped (`listeners-full`) and never become senders;
    - rate limits across two tabs of one member;
    - events: `Stage` and `StageNotice` reach the right connections only; 20 rapid changes produce few `Stage` broadcasts, the last one correct;
    - a participant cannot read other circles' seats;
    - with discussion off, every method of this task answers `discussion-off` and sends nothing;
    - a raised hand reaches the animator's connection within 1 s and the queue order matches the raise order (SC-904).

  Depends on T901 and spec 008 T809.
- [ ] T903 [US3] **Time rules: seat grace, invitations and animator away (API).**
  - `src/Circloo.Api/Discussion/DiscussionWatchdog.cs`: a `BackgroundService` that calls `TickAsync(now)` every 5 s over the circles in the registry. Rules: a dropped seat leaves after `SeatGraceSeconds` (30, `stage.left` with reason `dropped`), an invitation expires after `InviteSeconds` (60), the animator-away freeze at `AwayFreezeSeconds` (60) and the end at `AwayEndSeconds` (300: discussion off with reason `animator-away`, stage cleared, `StageNotice('discussion-ended')`, audit). The away clock only starts if the animator had been connected in this room session (R8). `Discussion.away` and `awayEndsAt` are broadcast.
  - `src/Circloo.Api/Circles/CircleHub.Discussion.cs`: `JoinStage` and `WatchStage` answer `animator-away` for non-animators while frozen.
  - The recording cap, warning and orphan recovery are added to the same loop by T910.
  - **Tests** `tests/Circloo.Api.Tests/Discussion/WatchdogTests.cs` on `FakeTimeProvider` (`ApiFactory.Clock`), calling `TickAsync` directly: a drop inside 30 s keeps the seat and the person can return; after 30 s it is gone and the next hand is next; an animator back inside 60 s changes nothing; at 60 s the stage freezes and joins are refused but links and hands carry on; at 5 min the discussion ends and the setting is off; a circle where the animator never connected does not end.

  Depends on T902.
- [ ] T904 [US3] [US4] **Signalling hub and ICE servers (API).**
  - `Signal(toMemberId, kind, linkId, payload)` in `src/Circloo.Api/Circles/CircleHub.Discussion.cs` exactly per `contracts/hub.md`: same-circle registered seats only (stage and stage, viewer and stage in either direction, never viewer and viewer), sender id from the server, SDP at most 16 KB starting `v=0`, ICE at most 2 KB and valid JSON, limits per member per 10 s of 40 offer/answer and 300 ICE through `RoomLimits`, the single code `signal-refused`, delivery to the target seat's connection only, nothing stored or logged.
  - `GET /api/circles/{id}/discussion/ice` in `src/Circloo.Api/Discussion/DiscussionEndpoints.cs` (members only, discussion on, `ttlSeconds`, `no-store`), a rate-limit policy in `src/Circloo.Api/Security/RateLimits.cs`, mapped in `src/Circloo.Api/Program.cs`.
  - **Tests** `tests/Circloo.Api.Tests/Discussion/SignalingTests.cs`:
    - a relay between two seats arrives at the target connection only, with the server's sender id even when the payload claims another;
    - refused (all as `signal-refused`) to a member who is not seated, to another circle's member, from viewer to viewer, with an oversized or malformed payload, an unknown kind, and over the limits;
    - the audience screen never receives a `Signal`;
    - a hostile participant cannot probe whether a member exists;
    - a marker string put in a payload appears in no log line and no database row (SC-906);
    - the ICE endpoint refuses non-members and discussion off, and returns the configured list (blank entries dropped).

  Depends on T902.

**Checkpoint**: the server enforces who can sit, speak and signal. No browser media code exists yet.

---

## Phase 4: User Story 4 - Camera and microphone: permissions and fallbacks (Priority: P1)

**Goal**: a mesh manager that connects the stage and degrades kindly, then the UI around it (spec US4).

**Independent Test**: with fake devices a person accepts audio only and is heard; another denies permission and still uses chat and hands; a third has no microphone and reads a clear message.

- [x] T905 [P] [US4] **Client mesh manager (no visible UI).** In `src/web/src/features/circles/stage/`:
  - `stage.ts`: the zustand store (`discussion`, `seats`, `recording`, `myMedia`, announcements queue) and `bindStage(connection, isCurrent)` binding `Discussion`, `Stage`, `StageNotice`, `Recording`, `RecordingWarning` and `Signal`, hooked up in `src/web/src/features/circles/room.ts` the way `bindPresentation` is. Actions `joinStage`, `leaveStage`, `watchStage`, `setMedia` and the animator ones call the hub through the existing `invoke`.
  - `mesh.ts`: `MeshManager` opens one `PeerLink` per seat it must talk to (stage to stage, viewers to stage), fetches ICE servers from `GET /api/circles/{id}/discussion/ice` on first use (`src/web/src/api/discussion.ts`), closes links to anyone the `Stage` view no longer lists, and plays a remote person's audio and video only while the server's `Stage` view says on stage, not muted and media on (R4, R7). Bitrate budget per link (R2).
  - `link.ts`: `PeerLink` with up-front transceivers, the offerer rule (viewer, else smaller member id), `linkId`, `replaceTrack` for mic and camera, one ICE restart, `getStats()` every 3 s for the weak-link rule (video off first, audio stays), and `data-link-state` / `data-receiving` values for the UI.
  - `media.ts`: feature detection, per-kind `getUserMedia` (640x360 at 24 fps), and the mapping of `NotAllowedError`, `NotFoundError`, `OverconstrainedError`, `NotReadableError`, `AbortError`, `SecurityError` to `denied`, `no-device`, `busy`, `blocked` (R14). No device label is ever sent anywhere.
  - **Vitest**: `mesh.test.ts` and `link.test.ts` on a fake `RTCPeerConnection` (offerer choice, glare-free, stale `linkId` discarded, links closed when a seat disappears, remote audio gated by the server view, weak link drops video then recovers, ICE restart once), `media.test.ts` (every error mapping, audio-only fallback when the camera fails, no both-at-once request), `stage.test.ts` (store updates, rejoin after a drop).

  Depends on T901 (types). Can start before T902 to T904 against the contract and a fake hub; its end-to-end check lands in T906.
- [ ] T906 [US1] [US2] [US3] [UI] **Stage UI, shaped with the ux-designer.** `/impeccable shape stage` first (or the manual equivalent), then:
  - `src/web/src/features/circles/stage/DiscussionSwitch.tsx`: the animator's switch and "Allow cameras" in the room settings (`src/web/src/features/circles/room/RoomSettings.tsx` from spec 008 T806, or the room header if it is not there yet), with the plain explanation and the "off by default" copy (US1). Mirrors in Arabic.
  - `StagePanel.tsx`, `StageGrid.tsx`, `StageTile.tsx`, `StageControls.tsx`: the Discussion area in `src/web/src/features/circles/CircleRoom.tsx` (main area next to the sidebar from T804). Tiles show the video or, when it is off, the character with ring and the name (FR-912), and text states ("on stage", "muted", "speaking", "weak connection"). Controls: raise and lower hand (reusing `HandsQueue.tsx` from T810), join, leave, mic, camera, and for the animator: give the floor, take the floor, mute, allow unmute, remove. Full, frozen ("The animator is away") and ended ("The animator ended the discussion") states. Viewers: "Watch the stage" with the IP disclosure, "n watching", `listeners-full` message. Order and arrow keys follow right-to-left. Phone layout: stage above the sidebar sheet, never covering the answer pad or presenter controls.
  - `src/web/src/styles/stage.css` with logical properties and `prefers-reduced-motion` honoured (no waving, no pulse; a text "speaking" label always).
  - `src/web/src/features/circles/present/AudienceScreen.tsx`: the hand count only (the indicator is T911).
  - Strings `circles.discussion.*` and `circles.stage.*` in `src/web/src/i18n/locales/{en,fr,ar,es}.json`, including every error code of `contracts/hub.md`.
  - **e2e** `src/web/e2e/discussion.spec.ts` "stage" with `test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } })`: switch on and off (participant sees nothing before, refused crafted call), nothing asks for a camera or microphone before a device button is pressed (US1 #2), three hands in order, floor given, join, mic on, the others report `data-receiving="audio"`, mute and allow, leave, a full stage, take floor, remove, switching off during a live call stops media for everyone and shows "The animator ended the discussion", animator away banner, the audience screen shows only the count; no CSP violation in the console; en desktop and ar phone with axe. A stage-of-N test uses 4 pages (`E2E_STAGE_PEERS=8` for 8) and checks every pair connects within 3 s (SC-903).

  Depends on T902, T904, T905, spec 008 T804 and T810.
- [ ] T907 [US4] [UI] **Camera and microphone permission UX and fallbacks.** `/impeccable shape device-permissions` first (or manual), then in `src/web/src/features/circles/stage/`:
  - `PermissionPrimer.tsx`: before the first browser prompt, one sentence ("Your camera and microphone go straight to the people on stage. circloo does not keep them. They can see your network address.") with a Continue button and a short "more" disclosure about STUN. Nothing is requested before the person presses a device button (FR-904, FR-910).
  - `DeviceProblem.tsx`: `denied` (how to allow it again, per browser, with the retry), `no-device` (join with audio only, or listen), `busy` (clear message and Try again), `blocked`, unsupported browser ("This browser cannot join the live discussion. You can still chat and raise your hand."), a link that cannot connect ("Can't connect to Amina. Chat and hands still work", the TURN-later case), weak connection notice.
  - Camera off shows the character and name; audio only still works; a listener with no devices is on the stage as a listener (US4 #4).
  - Strings `circles.stage.device.*` in all four locales.
  - **e2e** in `src/web/e2e/discussion.spec.ts` "devices": accept audio only and be heard; deny and still use chat and raise hand; no microphone message; busy then Try again; no `RTCPeerConnection` message; reach the chat controls in under 5 s (SC-907). Failures come from an init script that rejects `getUserMedia` with the named errors. en desktop and ar phone with axe.

  Depends on T906.

**Checkpoint**: a working stage with fallbacks, end to end.

---

## Phase 5: User Story 5 - Talk in writing (Priority: P2)

**Goal**: replies in the circle chat, and status changes as system lines (spec US5).

**Independent Test**: participants post messages and replies, everyone sees them in order and the animator can hide one. Stage events appear as small lines.

- [ ] T908 [P] [US5] **Replies and system lines (API).**
  - `Reply(long parentId, string text)` in `src/Circloo.Api/Circles/CircleHub.Recording.cs` sharing one private send path with `Say` in `src/Circloo.Api/Circles/CircleHub.cs` (clean, safety filter, spec 008 limits, slow mode and pause, `ReplyToId`): `reply-invalid` unless the parent is a visible member message of the same circle and not itself a reply. `MessageDto` gains `ReplyToId` in `src/Circloo.Api/Circles/CircleRules.cs`.
  - The circle view returns the replies; hiding a parent hides its replies for members (spec 008 hiding rules).
  - The persisted system line texts of `data-model.md` are written by the hub methods of T901 and T902 through one helper, `SystemLine(kind, memberId, actorId?)`, so the text format lives in one place.
  - **Tests** `tests/Circloo.Api.Tests/Discussion/ReplyTests.cs`: a reply in order; refused for a missing, other-circle, hidden, system or already-reply parent; unsafe text refused in en, fr, ar and es; slow mode and pause apply to replies; a non-member is refused (FR-903); hidden parent hides the reply for members but not for the animator; system lines are written for on, off, joined, left, floor, mute and removal and carry no names.

  Depends on T901 and spec 008 T805.
- [ ] T909 [US5] [UI] **Conversation UI: threads and system lines.** `/impeccable shape discussion-thread` first (or manual), then:
  - `src/web/src/features/circles/room/ChatPanel.tsx` (spec 008 T806) gains a Reply action, a nested one-level thread under the parent, a "replying to Amina" composer state and a way to cancel; `Reply` in `src/web/src/features/circles/room.ts` and `replyToId` handling in the message upsert.
  - `src/web/src/features/circles/Chat.tsx` `SystemLine` renders the new coded lines (`stage:joined`, `floor:given`, `muted`, …), and the discussion shows **local** lines for hands raised and lowered, grouped (a burst reads "3 hands raised") and never stored (R12).
  - Strings `circles.discussion.lines.*` and `circles.chat.reply.*` in all four locales.
  - **e2e** "conversation": post, reply, order, hide, system lines for a stage change, grouped hand lines; en desktop and ar phone (thread and composer mirror) with axe.

  Depends on T906, T908 and spec 008 T806.

---

## Phase 6: User Story 6 - Record the session as a text transcript (Priority: P2)

**Goal**: the animator records text only, everyone knows, and the animator alone reads, exports and deletes it (spec US6).

**Independent Test**: the animator starts a recording, a late joiner sees the indicator at once, a participant's crafted start or stop is refused. After stopping, the animator opens a transcript with messages, hands and stage times, and no media.

- [ ] T910 [US6] **Recording hub and persistence (API).**
  - `src/Circloo.Api/Discussion/Recorder.cs`: `StartAsync`, `StopAsync(reason)`, `Capture(...)`, the cache of the active recording in `StageRegistry`, caps (50 000 events, 50 recordings per circle), one recording per circle through the partial unique index (a lost race returns the running one), idempotent start and stop.
  - `src/Circloo.Api/Circles/CircleHub.Recording.cs`: `StartRecording(title?)` (phase `notice`, then `capturing` at `CaptureFrom`), `StopRecording`, `AcknowledgeRecordingNotice` (connection state), `Recording` broadcast and push on `Enter` before anything else, the notice gate (`notice-required` for non-animators on `Say`, `Reply`, `RaiseHand`, `JoinStage` until acknowledged), 6 starts per hour per animator, audits `recording.started` and `recording.stopped`, persisted system lines.
  - **Capture hooks** (text events only): `Say` and `Reply` (message snapshot with id), 008's `RaiseHand` and `LowerHand`, and the stage methods of T902 (`stage.joined`, `stage.left` with reason, `floor.given`, `floor.taken`, `muted`, `unmute.allowed`). Nothing in signalling or media code can reach the recorder.
  - **Stops** in one unit of work: `DisableDiscussion` (reason `discussion-off`), circle close in `src/Circloo.Api/Circles/CircleEndpoints.cs` (`circle-closed`), animator away 5 min (`animator-away`), and, through `DiscussionWatchdog` (T903), the cap (`max-length`, `RecordingWarning` to the animator before it) and orphans after a restart (`restart`).
  - Circle view `recording` filled in.
  - **Tests** `tests/Circloo.Api.Tests/Discussion/RecordingTests.cs`:
    - start and stop are refused for a participant, a guest, a non-member and an audience connection, and each refusal is audited (FR-914);
    - a message sent before `CaptureFrom` is not in the record, one after is;
    - two parallel starts give exactly one recording;
    - a connection that joins during a recording receives `Recording` first and cannot `Say`, `Reply`, `RaiseHand` or `JoinStage` until it acknowledges (`notice-required`);
    - a message sent with no recording is in no transcript;
    - switch off, circle close, animator away, the cap and a simulated restart each end it with the right reason;
    - the event cap and the per-circle cap;
    - **SC-906**: after a full call with signalling, every stored row has an allowed kind, `Text` only on messages, no column holds anything else, and the captured logs contain no SDP, ICE or message text.

  Depends on T902, T903, T908 and spec 008 T805.
- [ ] T911 [US6] [UI] **Recording indicator and notice.** `/impeccable shape recording-indicator` first (or manual), then in `src/web/src/features/circles/stage/`:
  - `RecordingIndicator.tsx`: text "Recording (text only)" plus an icon, never colour alone, with a short explanation on focus or press. Rendered by `src/web/src/features/circles/CircleRoom.tsx` in the room header, outside the activity area, so it is visible on desktop, on phones, with the sidebar collapsed, during a presentation and on the audience screen (`src/web/src/features/circles/present/AudienceScreen.tsx`). Nothing can cover or collapse it.
  - `RecordingBanner.tsx`: the notice ("The animator is recording this session as text: messages, raised hands and who was on stage. No audio or video is kept. Only the animator can read it."), shown on start and on entry to a room with a recording, before the composer and hand button are enabled. It calls `AcknowledgeRecordingNotice` once rendered (no accept button). Assertive announcement on start.
  - `RecordButton.tsx`: the animator's Record session / Stop, a "recording stops in 15 minutes" warning from `RecordingWarning`, and the "Recording stopped" state.
  - Strings `circles.recording.*` in all four locales.
  - **e2e** "recording": start, notice and indicator for all pages, a late joiner sees it before typing, a participant's crafted `StartRecording` is refused, the indicator on desktop, phone, collapsed sidebar and the audience screen, stop; en desktop and ar phone with axe (SC-905).

  Depends on T906, T910 and spec 008 T804.
- [ ] T912 [P] [US6] **Transcript API: read, export, delete.**
  - `src/Circloo.Api/Discussion/DiscussionEndpoints.cs`: list, paged read, export and delete per `contracts/rest.md`, animator only (403 and an audit row for other members, 404 for non-members), working for closed circles, delete refused while running (`recording-running`), audits `recording.exported` and `recording.deleted`, rate limits.
  - `src/Circloo.Api/Discussion/TranscriptExport.cs` with `src/Circloo.Api/Resources/transcript/{en,fr,ar,es}.json`: text and Markdown, escaped, bidi-isolated names and text, `hidden` marks from `CircleMessage.HiddenAt`, "Former member", attachment headers.
  - `src/web/src/api/discussion.ts`: typed queries and mutations.
  - **Tests** `tests/Circloo.Api.Tests/Discussion/TranscriptEndpointTests.cs`: a participant, a guest and a non-member are refused on all four endpoints; the animator reads, pages (`after` and `limit`), exports txt and md in each of the four languages and deletes; Markdown and HTML in a message are escaped; an Arabic message keeps its isolates; hidden messages are marked; replies carry their parent; deleted members read as "Former member"; export carries no data from another circle; delete cascades the events; CSRF is required on delete.

  Depends on T910. Parallel with T911.
- [ ] T913 [US6] [UI] **Transcript view, export and delete.** `/impeccable shape transcript` first (or manual), then `src/web/src/features/circles/stage/TranscriptList.tsx` (the animator's recordings with date, length and how it ended) and `TranscriptView.tsx` (entries with times and people, replies nested, hidden messages labelled, stage events as small lines, "No audio or video was kept"), Export text and Markdown buttons (language follows the interface), Delete with a confirm. Reached from the animator's room settings and the circle page. Strings `circles.transcript.*` in all four locales. **e2e** "transcript": record, stop, open, export both formats (file text checked), delete; a participant has no link and the direct URL is refused; en desktop and ar phone with axe.

  Depends on T906, T912.

---

## Phase 7: User Story 7 - Keyboard and screen reader (Priority: P2)

**Goal**: everything works from the keyboard and is announced, grouped and translated (spec US7).

**Independent Test**: with the keyboard only, a person raises a hand, joins the stage when given the floor, mutes and leaves. A screen reader hears each change once, politely, and the recording start assertively.

- [ ] T914 [US7] [UI] **Accessibility and i18n pass.** `/impeccable audit` over the whole discussion surface and `/impeccable harden` (or the manual equivalent), then fix:
  - `src/web/src/features/circles/stage/announce.ts` (+ `announce.test.ts`): reuses the batching in `src/web/src/features/circles/room/grouping.ts` (spec 008 T806): polite grouped announcements for hands, floor, mute, removal, joins (at most one every few seconds in a burst, own queue place when it changes), assertive for the recording start and stop, all translated.
  - Keyboard: every control of T906, T907, T909, T911 and T913 reachable in logical order with visible focus, arrow keys and focus order mirrored in Arabic, no keyboard trap in the primer or banners, targets at least 24 px (WCAG 2.2 AA).
  - Reduced motion: no waving or pulse, "speaking" always as text. A person who cannot see the stage has name and state as text.
  - **i18n check**: a Vitest test that every `circles.discussion.*`, `circles.stage.*`, `circles.recording.*` and `circles.transcript.*` key exists in all four locale files and that every hub error code of `contracts/hub.md` has a message; long French and Spanish strings checked for overflow (`harden`).
  - **e2e** "keyboard and screen reader": keyboard-only journey (raise, joined, mute, leave, record, stop), live-region assertions for each announcement kind, reduced-motion emulation, the whole surface under axe in en and ar.

  Depends on T906, T907, T909, T911, T913 and spec 008 T806.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T915 **Journey, docs and audit.**
  - **Playwright**: the full journey of quickstart B in `src/web/e2e/discussion.spec.ts` (en desktop, ar phone, axe, reduced motion, fake devices), including the 8-person stage (`E2E_STAGE_PEERS=8`, SC-903) and a check that no CSP violation appears.
  - **Real devices**: run quickstart C (two laptops and a phone on different networks, Safari iOS), and record the result and the strict-network outcome (input to decision D2).
  - **Design review**: `/impeccable audit` and `/impeccable critique` on the stage, permission UX, thread, recording indicator and transcript, with findings fixed or justified. While Impeccable is unavailable, the ux-designer review is recorded instead (#126), listing the steps still to rerun.
  - **Docs**: `PRODUCT.md` (live discussion, text-only record), `docs/product/prd.md` (E4 and E2 notes), `docs/architecture/overview.md` (final settings and limits), and a privacy sentence for decision D5.
  - **Quickstart**: run `quickstart.md` end to end.
  - **Ideas**: comment progress on #212; confirm #96 is closed as superseded and note spec 008's `GiveFloor` change on #183 and #166.
  - **SC-909**: run one session with 5 to 8 people (or validate after release) and note the result in the PR. Do not claim a result before it is run.

  Depends on T906, T907, T909, T911, T913 and T914.

---

## Dependencies & Execution Order

- **Foundational**: T901 blocks everything (it needs only the merged T801).
- **Stage and signalling (API)**: T902 (needs spec 008 T809) → T903 and T904 in parallel.
- **Client**: T905 is [P], starts after T901. T906 needs T902, T904, T905 and spec 008 T804 and T810. T907 follows T906.
- **Conversation**: T908 is [P], after T901 (needs spec 008 T805). T909 needs T906, T908 and spec 008 T806.
- **Recording**: T910 needs T902, T903 and T908. T911 (UI) and T912 (API) are parallel after T910. T913 needs T906 and T912.
- **Accessibility**: T914 after every UI task. **Polish**: T915 last.

```text
T801 (008, merged) ── T901 ─┬─ T902 ─┬─ T903 ────────────────────────┐
                            │        ├─ T904 ──┐                      │
                            ├─ T905 ──────────┴─ T906 ─┬─ T907 ───────┤
   008 T809 ─── T902        │      008 T804+T810 ─ T906├─ T909 ───────┤
                            └─ T908 ───────────────────┘   │          │
   008 T805 ─── T908         T902+T903+T908 ─ T910 ─┬─ T911 ──────────┼─ T914 ─ T915
   008 T806 ─── T909                                └─ T912 ─ T913 ───┘
```

## Parallel Example

```text
After T901:      T902 Stage hub        (StageRegistry.cs, CircleHub.Discussion.cs, StageHubTests.cs)
                 T905 Mesh manager     (stage/mesh.ts, link.ts, media.ts, stage.ts, *.test.ts)
                 T908 Replies          (CircleHub.Recording.cs Reply, ReplyTests.cs)
After T902:      T903 Watchdog         (DiscussionWatchdog.cs, WatchdogTests.cs)
                 T904 Signalling       (CircleHub.Discussion.cs Signal, DiscussionEndpoints.cs ice, SignalingTests.cs)
After T910:      T911 Indicator UI     (stage/Recording*.tsx, CircleRoom.tsx, AudienceScreen.tsx)
                 T912 Transcript API   (DiscussionEndpoints.cs, TranscriptExport.cs, Resources/transcript/*.json)
```

T902, T903 and T904 all add to `CircleHub.Discussion.cs`; merge them one at a time and rebase. The file has one region per feature (switch, stage, signalling) to keep conflicts trivial. The three UI tasks T906, T907 and T909 share `discussion.spec.ts` and the locale files: one `describe` and one key group per task.

## Implementation Strategy

1. **MVP**: T901 → T902 → T904 → T905 → T906. The animator switches it on, gives the floor and the stage connects (listening and chat still work without devices).
2. **Increment 2**: T903 (animator away and grace) and T907 (permission UX and fallbacks), so real devices fail kindly.
3. **Increment 3**: T908 → T909 (threads and system lines).
4. **Increment 4**: T910 → T911 and T912 → T913 (recording and transcripts). Nothing is recorded until the notice and indicator exist: do not merge T910 into a released build without T911.
5. **Release gate**: T914 (accessibility and i18n), then T915 (journey, real devices, docs).

## Notes

- Each task's PR contains `Closes #<task issue>`. The parent idea is #212. Task issues are created by `/speckit-taskstoissues` after this plan is accepted.
- With Live discussion off (the default), every existing circle behaves exactly as before (SC-901): no task changes a default.
- A TURN relay, a media server for large audiences, co-animators and per-organisation policies are out of scope. The TURN task needs azure-infra and a founder decision (research D2).
