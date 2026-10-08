---

description: "Tasks for the live discussion: group calls (spec 009, amended 2026-10-08)"
---

# Tasks: Live discussion: group audio and video calls with chat, raised hands and emoji

**Input**: Design documents from `specs/009-live-discussion-stage/`: plan, spec, research, data-model, contracts and quickstart.

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/hub.md, contracts/rest.md

**Amended 2026-10-08.** The founder moved calls to a self-hosted LiveKit call server and dropped recording. Done tasks stay as history. New tasks continue at T916. The table "Existing task issues" says what happens to #216 to #230.

**Tests**: required by the constitution (VI). Every task ships its API tests (xUnit + Testcontainers) in `tests/Circloo.Api.Tests/Discussion/`. UI tasks also ship their Playwright journey in `en` (desktop) and `ar` (phone) with axe, in one file, `src/web/e2e/call.spec.ts` (one `describe` per task), with fake media devices against the AppHost's LiveKit.

**Organization**: one task = one GitHub task issue = one PR. IDs use the 9xx range of this spec.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel with the other [P] tasks of the same phase (different files, no dependency)
- **[Story]**: user story from spec.md (US1 to US8; US6 is removed)
- **[UI]**: touches the interface; needs the **ux-designer** (Impeccable, or the manual review when it cannot run, #126)
- **[infra]**: needs the **azure-infra** agent

## Existing task issues (#216 to #230)

| Task | Issue | Status | What happens |
|---|---|---|---|
| T901 Foundation and the switch (API) | #216 | **Done** (closed, PR #231) | History. Its switch is reused as the call switch; T918 removes what it added for recording |
| T902 Stage hub: hands, floor and seats | #217 | **Superseded** | Close as superseded by T919, T920 and T921 (no stage, no seats; permissions on the call server) |
| T903 Time rules: seat grace, invitations, animator away | #218 | **Superseded** | Close as superseded by T922 (only "animator away ends the call" remains; seats and invitations are gone) |
| T904 Signalling hub and ICE servers | #219 | **Superseded** | Close as superseded by T919 (call pass) and LiveKit's own ICE/TURN (research R28) |
| T905 Client mesh manager | #220 | **Done** (closed, PR #233) | History. Its mesh is deleted by T924; `media.ts` and the store shell are kept |
| T906 Stage UI | #221 | **Superseded** | Close as superseded by T925 (call UI) and T926 (animator controls) |
| T907 Camera and microphone permission UX and fallbacks | #222 | **Changed** | Keep the issue; update its body to the new T907 below (LiveKit errors, TCP/TLS fallback, reconnecting, new primer text) |
| T908 Replies and system lines (API) | #223 | **Changed** | Keep the issue; update its body to the new T908 below (replies stay; call lines are live, not stored). Branch `feat/223-replies-system-lines` exists without a PR and needs the change |
| T909 Conversation UI: threads and system lines | #224 | **Changed** | Keep the issue; update its body to the new T909 below (live call lines from `CallNotice`) |
| T910 Recording hub and persistence | #225 | **Dropped** (closed) | Nothing to do. Its tables are dropped by T918 |
| T911 Recording indicator and notice | #226 | **Dropped** (closed) | Nothing to do |
| T912 Transcript API | #227 | **Dropped** (closed) | Nothing to do |
| T913 Transcript view | #228 | **Dropped** (closed) | Nothing to do |
| T914 Accessibility and i18n pass | #229 | **Changed** | Keep the issue; update its body to the new T914 below (call surfaces, no recording) |
| T915 Journey, docs and audit | #230 | **Changed** | Keep the issue; update its body to the new T915 below (real devices on the deployed call server, perf results) |

Task issues for T916 to T929 are published from this list. T930 was added after the founder's answers of 2026-10-08 and needs its own issue. Issue edits and closures are Nicolas's or the issue-planner's job, not part of this docs change.

---

## Done (history, 2026-10-05 plan)

- [x] T901 [US1] **Foundation and the switch (API).** Migration `LiveDiscussionStage` (`Circle.DiscussionOn`, `DiscussionVideo`, `DiscussionChangedAt`, `DiscussionChangedByMemberId`, `CircleMessage.ReplyToId`, `Recordings`, `RecordingEvents`), `DiscussionOptions`, `DiscussionRules`, `EnableDiscussion(bool)` and `DisableDiscussion()` with refusal audits, `Discussion` pushed on `Enter`, `Permissions-Policy` on room routes, `Discussion__IceUrls__0` blank in the AppHost. (#216, PR #231)
- [x] T905 [US4] **Client mesh manager (no visible UI).** `stage.ts`, `mesh.ts`, `link.ts`, `media.ts`, `fakes.ts` and their Vitest tests. (#220, PR #233)

## Dropped (2026-10-08)

- ~~T910 Recording hub and persistence~~ (#225), ~~T911 Recording indicator and notice~~ (#226), ~~T912 Transcript API~~ (#227), ~~T913 Transcript view, export and delete~~ (#228). User Story 6 is removed.

## Superseded (2026-10-08)

- ~~T902~~ (#217) → T919, T920, T921. ~~T903~~ (#218) → T922. ~~T904~~ (#219) → T919. ~~T906~~ (#221) → T925, T926.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T916 [P] **LiveKit in the AppHost and the test fixture (dev, zero cost).**
  - `src/Circloo.AppHost/AppHost.cs`: a container `livekit` from `livekit/livekit-server:v1.13.7` (pin noted next to the Gotenberg one), a generated persisted secret parameter `livekit-secret` (at least 32 characters) and a parameter `livekit-node-ip` (default `127.0.0.1`). Configuration in `src/Circloo.AppHost/livekit.dev.yaml`, passed as `LIVEKIT_CONFIG` (YAML body, placeholders filled), and `LIVEKIT_KEYS`, exactly as research R30: ports 7880/7881/7882, `udp_port` mux, `node_ip`, `use_external_ip: false`, `auto_create: false`, `enable_remote_unmute: false`, webhook to the API's endpoint, no TURN, no egress. Endpoints 7880 (http), 7881 (tcp), 7882 (udp) with fixed host ports and `isProxied: false`. The API gets `LiveKit__Url=ws://localhost:7880`, `LiveKit__ApiUrl` (the container endpoint), `LiveKit__ApiKey=circloo-dev`, `LiveKit__ApiSecret` (the parameter). Remove `Discussion__IceUrls__0`.
  - `tests/Circloo.Api.Tests/Infrastructure/LiveKitFixture.cs`: Testcontainers, same image, `--dev --bind 0.0.0.0`, exposing the HTTP port, shared by the LiveKit tests.
  - **Docs**: `docs/architecture/overview.md` local topology already lists `livekit`; re-check ports and the parameter names against the code.
  - **Tests**: the fixture starts and answers `GET /` with 200 (a smoke test in `LiveKitRoomsTests.cs` comes with T919); `tests/Circloo.Api.Tests/Discussion/CallServerConfigTests.cs` asserts `livekit.dev.yaml` has no `egress`, `ingress` or `sip` section and `auto_create` and `enable_remote_unmute` are false (SC-906). T917 adds the production file to the same test.
  - **Check**: `dotnet run --project src/Circloo.AppHost` with Docker and with Podman starts LiveKit; `curl http://localhost:7880` answers OK.

  Depends on nothing (T901 merged).

- [ ] T917 [P] [infra] **Call server in Azure (azure-infra): one small VM, cheap in dev.** Founder decision D8 (research R23):
  - `infra/modules/livekit.bicep` called from `infra/modules/app.bicep` only when the new parameter `callsEnabled` is true (**default false in every environment**; `infra/main.bicep` and `infra/main.parameters.json` pass it from `CALLS_ENABLED`). Ubuntu LTS VM, system-assigned identity with Key Vault Secrets User, Standard static public IP with DNS label `lk-<token>`, NSG allowing only 443/tcp, 7881/tcp, 7882/udp, 3478/udp, no SSH from the internet, auto OS security updates.
  - **Per-environment parameters** (defaults picked from `environmentName` like spec 008 T812, each overridable by an azd variable; table in research R23):
    - `callsVmSize` (`CALLS_VM_SIZE`): `Standard_B2als_v2` in `prod`, `Standard_B2ats_v2` elsewhere. Check that a 5-person video call runs on B2ats_v2 (CPU and memory noted in the PR); if not, use `Standard_B1ms` as the dev default and say so.
    - `callsDiskSku` (`CALLS_DISK_SKU`): `StandardSSD_LRS` in `prod`, `Standard_LRS` (Standard HDD, 32 GiB) elsewhere.
    - `callsTurnTls` (`CALLS_TURN_TLS`): true in `prod` (a second static IP with DNS label `turn-<token>` and TURN/TLS on 443), false elsewhere (one IP, no extra static resource).
    - `callsShutdownTime` (`CALLS_SHUTDOWN_TIME`): empty in `prod`, `2000` elsewhere, time zone `Romance Standard Time`, as a `Microsoft.DevTestLab/schedules` daily auto-shutdown (deallocates the VM).
  - **Starting it again**: `scripts/deploy.ps1` and `.sh` run `az vm start` after provisioning when calls are enabled (a deployment does not start a deallocated VM); new `scripts/calls-start.ps1` and `.sh` (`-Environment dev`) start it without a full deploy. Document both in the scripts' help and in `docs/architecture/overview.md`.
  - `infra/livekit/livekit.yaml` (the LiveKit configuration template, added to `CallServerConfigTests`) and `infra/livekit/cloud-init.yaml`: Docker, the pinned `livekit/livekit-server:v1.13.7` with host networking, Caddy (pinned) terminating TLS for `lk-…` (WebSocket and Twirp to 7880) and, when `callsTurnTls`, for `turn-…` (to LiveKit's TURN with `external_tls: true`), Let's Encrypt certificates, a boot script that reads `livekit-api-secret` from Key Vault through the VM identity (IMDS) into a root-only key file, LiveKit config with `node_ip` = the static IP, `udp_port: 7882`, `tcp_port: 7881`, TURN/UDP on 3478, `auto_create: false`, `enable_remote_unmute: false`, webhook to `https://<web fqdn>/api/livekit/webhook`, logging `warn` with `pion_level: error`, journald retention 3 days. No egress, ingress or SIP.
  - **Secret**: `scripts/deploy.ps1` and `.sh` generate `LIVEKIT_API_SECRET` into `.azure/<env>/.env` like `AUTH_SECRET`; Bicep stores it as Key Vault secret `livekit-api-secret`; the `web` app gets `LiveKit__ApiSecret` as a secret reference and `LiveKit__Url`, `LiveKit__ApiUrl`, `LiveKit__ApiKey`, `Discussion__AwayEndSeconds` as plain values (only when `callsEnabled`).
  - **Outputs**: `liveKitUrl`. **Docs**: confirm the env list, the parameters and the "Call server" paragraph in `docs/architecture/overview.md`, with the monthly cost of both profiles from the pricing calculator.
  - **Checks**: `az bicep build --file infra/main.bicep`; with `callsEnabled` false nothing new is created; deploy a dev environment with `CALLS_ENABLED=true`, join from two networks, let the nightly shutdown run, start it with `scripts/calls-start`, then `scripts/destroy` removes it all.

  Depends on T916 for the config shape. Deployed calls are off until it lands. Merge after T930 if possible, so the constitution already allows the VM.

- [ ] T930 [P] **Constitution amendment for the call server (MINOR).** Founder decision D9. Run `/speckit-constitution` in its own branch, issue and PR (not on a feature branch): version 2.0.0 → 2.1.0; Technology & Infrastructure Constraints gains "Real-time media: a self-hosted LiveKit SFU, one node, never recording"; the "production is one container" line and principle VII name the call server VM as an accepted exception (created only on request, disposable, nightly shutdown outside production); the Sync Impact Report lists spec 009 and `docs/architecture/overview.md`. Then remove the "until the D9 amendment" wording from this plan's Complexity Tracking.

  Depends on nothing. Merge before T917 if possible.

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T918 **Persistence cleanup and options (API).** (#258)
  - Migration `src/Circloo.Api/Data/Migrations/*_GroupCallsLiveKit.cs` per `data-model.md`: drop `RecordingEvents` and `Recordings` (with their indexes and check), drop `Circle.DiscussionChangedAt` and `DiscussionChangedByMemberId`, add `Circle.DiscussionSpeaking` (`varchar(8)`, default `'hand'`, check `IN ('hand','open')`). `Down` restores the previous shape. Entities and `CirclooDbContext.cs` updated (remove `Recording`, `RecordingEvent`).
  - `src/Circloo.Api/Discussion/DiscussionOptions.cs` trimmed to `AwayEndSeconds`; new `LiveKitOptions.cs` (`Url`, `ApiUrl`, `ApiKey`, `ApiSecret`, `TokenMinutes`), validated at start-up only when `Url` is set (secret at least 32 characters, schemes checked).
  - `src/Circloo.Api/Discussion/DiscussionRules.cs`: `DiscussionState(On, VideoAllowed, Speaking, Available, Away, AwayEndsAt)`; remove `Seat`, `StageView`, `RecordingState`.
  - `src/Circloo.Api/Circles/CircleEndpoints.cs` and `src/web/src/api/circles.ts`: circle view `discussion` per `contracts/rest.md`; `recording` removed.
  - `CircleHub.Discussion.cs`: `EnableDiscussion`/`DisableDiscussion` stop writing `discussion:on`/`off` rows and the `DiscussionChanged*` columns (the hub broadcast stays; `CallNotice` arrives in T920).
  - **Tests** `tests/Circloo.Api.Tests/Discussion/PersistenceTests.cs`: the migration applies on a database with circles from before (defaults: off, video true, hand); the recording tables are gone; switching on and off writes no `CircleMessages` row; `DiscussionSwitchTests.cs` updated.

  Depends on T901. Coordinate with the open branch of T908 (#223), which also touches `CircleHub.Discussion.cs`: merge one, rebase the other.

- [x] T919 **Call passes: token endpoint, permissions, LiveKit room client, CSP (API).**
  - `LiveKitTokens.cs` (research R20): join pass and admin token, HS256, `canPublish: false` when no source is allowed.
  - `CallRules.cs`: the permission table of research R22 as one pure function.
  - `LiveKitRooms.cs`: `ILiveKitRooms` and a typed `HttpClient` for Twirp JSON (`CreateRoom`, `DeleteRoom`, `ListParticipants`, `GetParticipant`, `UpdateParticipant`, `MutePublishedTrack`, `RemoveParticipant`), 3 s timeout, one retry on 5xx, no payload logging.
  - `CallEndpoints.cs`: `POST /api/circles/{id}/call/token` exactly per `contracts/rest.md` (checks in order, `CreateRoom`, pass, `no-store`, rate limit `call-token` in `Security/RateLimits.cs`). Mapped in `Program.cs`.
  - `Security/SecurityHeaders.cs`: `connect-src` gains the call server's `ws(s)` and `http(s)` origins from `LiveKit:Url` (research R29).
  - **Tests**:
    - `CallPermissionTests.cs`: every row of the permission table, and the empty-sources rule;
    - `CallTokenTests.cs`: refused for a non-member, a closed circle, call off, calls unavailable, a removed member, over the limit, without CSRF; the pass carries the right identity, room, expiry and permissions; never appears in logs;
    - `LiveKitRoomsTests.cs` (with `LiveKitFixture`): a pass validates on `/rtc/validate` and a tampered one does not; `CreateRoom` is idempotent; `DeleteRoom` and `ListParticipants` work;
    - `SecurityHeaderTests.cs`: the new `connect-src`, unchanged `Permissions-Policy` on the three routes.

  Depends on T916 and T918.

---

## Phase 3: User Story 1 and 3 - Switches, speaking mode, floor and moderation (API, P1) 🎯 MVP

**Goal**: the server owns every rule of the call (spec US1, US3).

**Independent Test**: the animator starts a video call in Hand to speak; a participant's pass has no microphone; giving the floor grants it; switching video off removes cameras; removing a member keeps them out.

- [x] T920 [US1] [US3] **Switches and speaking mode (API).**
  - `CallPermissions.cs`: recompute a member's or everyone's permissions with `CallRules` and apply them through `UpdateParticipant` (skip people not in the call).
  - `CircleHub.Discussion.cs`: `EnableDiscussion(bool videoAllowed, string speaking)` (start: room created; while on: video and mode changes applied to everyone), `DisableDiscussion()` (hands cleared, `DeleteRoom`, moderation cleared), `SetSpeakingMode(string)`, `calls-unavailable` when not configured, `try-again` when the call server fails (nothing kept). Audits `discussion.on`, `discussion.off`, `call.mode`. `CallNotice` events per `contracts/hub.md`.
  - Closing a circle (`CircleEndpoints.cs` close) ends its call (`DeleteRoom`, audit reason `circle-closed`).
  - The Chat switch is spec 008's `SetRoomSettings`: no server change; the client wires it in T926.
  - **Tests** (`DiscussionSwitchTests.cs` extended, with a fake `ILiveKitRooms` recording calls): each method refused for a participant, a guest, a non-member and the audience (SC-902); start creates the room; video off updates every participant without camera; mode change updates microphones and keeps animator mutes; end deletes the room and clears hands within 2 s (FR-902); a call server failure leaves the database unchanged; no `CircleMessages` row is written.

  Depends on T919.

- [x] T921 [US3] **Floor, mutes and removal (API).** (#261)
  - `CallModeration.cs` (singleton): per circle, muted microphone, stopped camera, removed set; cleared when the call ends.
  - `CircleHub.Room.cs` (spec 008): `GiveFloor`, `LowerHand` (of the floor holder), `LowerAllHands` and the hand grace call `CallPermissions` when a call is on (Hand to speak: grant or revoke the microphone; send `floor-given`/`floor-taken`). Hand limit `hand` 6 per 10 s.
  - `CircleHub.Discussion.cs`: `MuteMember`, `AllowMember`, `MuteEveryone` (Open mic only, `MutePublishedTrack` on microphone tracks), `RemoveFromCall` (removed set, `RemoveParticipant`, hand lowered, audit `call.removed`), `AllowBack`. Limit `call-admin` 30 per 10 s.
  - A member who leaves or is removed from the circle is removed from the call.
  - If a revoked source does not unpublish on the pinned LiveKit version, fall back to `MutePublishedTrack` on that track (research R22) and note it in the PR.
  - **Tests** `CallModerationTests.cs`: every method refused for non-animators; floor handover updates two people; a mute survives a new pass; allow switches nothing on; mute everyone refused in Hand to speak; removal refuses new passes and lowers the hand; allow back works; ending the call clears everything; nothing is stored or audited except `call.removed`.

  Depends on T920.

- [x] T922 [US3] **Webhook enforcement, roster and animator away (API).** (#262)
  - `LiveKitWebhook.cs` and `POST /api/livekit/webhook` in `CallEndpoints.cs` per `contracts/rest.md`: signature, `iss`, `sha256`, 64 KB cap, rate limit; `participant_joined` enforcement in the background; roster updates; `CallRoster` coalesced through `LiveThrottle`; `Enter` pushes it.
  - `CallAway.cs`: like `HandsGrace`, on `TimeProvider`. Started in `OnDisconnectedAsync` when the circle's last animator connection closes during a call, cancelled on `Enter` by an animator, fires `DisableDiscussion` logic with reason `animator-away`. `Discussion.away` and `awayEndsAt` broadcast.
  - **Tests** `WebhookTests.cs`: a valid event is accepted; bad signature, wrong `iss`, wrong body hash, expired token and oversized body are refused without detail; a removed member, a former member and a call that is off are removed again; the roster follows joins and leaves and never reaches the audience screen. `CallAwayTests.cs` on `FakeTimeProvider`: an animator back within 5 minutes changes nothing; after 5 minutes the call ends; a second animator tab keeps the call.

  Depends on T921.

**Checkpoint**: the server enforces who may speak, show a camera and stay in the call. No call UI yet.

---

## Phase 4: User Story 2 and 4 - The call on every screen (P1)

**Goal**: a fast, adaptive call with our own UI and kind fallbacks (spec US2, US4).

- [ ] T923 [P] [US2] [US4] **Client call engine (no visible UI).**
  - `src/web/package.json`: `livekit-client` at exactly `2.22.3`.
  - `src/web/src/features/circles/stage/call.ts`: the only file that imports `livekit-client`, through `import()`. Connects with the pass from `POST /api/circles/{id}/call/token` (`src/web/src/api/discussion.ts`), room options of research R25 (adaptive stream, dynacast, simulcast layers, VP8, DTX and RED, speech preset), `startAudio()` inside the Join tap, events mapped to the store (active speakers, connection quality, reconnecting, permissions changed, device errors through `classifyMediaError`). Microphone and camera requested one at a time. When the page is hidden and the browser ends the camera track, the camera state becomes off and stays off on return until the person switches it on (US2 #6).
  - `stage.ts`: rebuilt around the engine: `discussion`, `roster`, `myPermissions`, `connection` (`idle`, `joining`, `connected`, `reconnecting`, `failed`), `participants` (tracks, speaking, quality), `notices`; actions `join`, `leave`, `setMic`, `setCamera`, and the animator actions through the hub. No more `MeshManager` import.
  - **Vitest** `call.test.ts` and `stage.test.ts` on a fake `Room`: lazy import only on join; pass fetched once per join; permissions changed disables the microphone button; reconnecting and failed states; device errors mapped; leave stops tracks.

  Depends on T919 (contract) and T920 (hub events). Can start against the contract with fakes.

- [ ] T924 **Remove the mesh.** Delete `mesh.ts`, `link.ts`, `fakes.ts` and their tests; `fetchIce`, `IceConfig`, `Seat`, `StageView`, `SignalKind`, `StageNoticeKind` and recording types in `src/web/src/api/*.ts`; any leftover `Discussion:IceUrls` use; the CSP or docs lines about public STUN. `npx tsc -b`, lint and Vitest stay green. Research R27.

  Depends on T923.

- [ ] T925 [US2] [UI] **Call UI: grid, active speaker, pages, phone layout.** `/impeccable shape call` first (or the manual review), then:
  - `grid.ts` (+ test): tile order (active speaker, animator, floor holder, cameras on, join order), pages of 9 on a computer and 4 on a phone, the speaker kept on screen, off-page publications disabled.
  - `CallPanel.tsx` (rail Call tab): call state, Join call with the roster count ("12 in the call"), the people in the call, the "Soon" placeholder removed. `CallStage.tsx`, `CallTile.tsx`, `CallControls.tsx`: the grid in the centre during a video call (switchable with the whiteboard), speaker view, tiles with video or character and name (FR-912), "speaking" as outline and text, "Weak connection", Reconnecting and Failed states with Join again, Leave. Phone layout: grid above the bottom sheet, thumb-reachable controls, never over the composer.
  - `src/web/src/styles/call.css` with logical properties and reduced motion.
  - Strings `circles.call.*` in all four locales.
  - **e2e** `src/web/e2e/call.spec.ts` "call": start (by API helper or the existing switch), three pages join and report receiving audio within 2 s; speaking highlight; camera off shows the character; 12 pages show 9 tiles and a page control on desktop, 4 on a phone, with the decoding check (SC-912); leave; the audience screen requests no pass, plays no sound and shows no names (FR-934); no CSP violation; en desktop and ar phone with axe.

  Depends on T923, T920 and spec 008 T804 (merged).

- [ ] T926 [US1] [US3] [UI] **Animator controls: three switches, speaking mode, person menu.** `/impeccable shape call-controls` first (or manual), then:
  - `DiscussionSwitch.tsx` becomes the three switches: Chat (spec 008 `SetRoomSettings`, paused means off), Audio call, Video call (start, switch video, end), and the speaking mode (Hand to speak or Open mic) before and during the call; "Group calls are not available here" when `available` is false.
  - `PersonMenu.tsx` on a tile and in the people list: give the floor, take it (lower hand), mute microphone, stop camera, allow, remove from call, allow back. Mute everyone (Open mic). Errors translated, including `try-again`.
  - Participant side: the current mode in plain words; in Hand to speak the microphone button is replaced by Raise hand; kind notices for every `CallNotice` to the person.
  - **e2e** "controls": every switch and action from the animator; a participant sees none of them and crafted hub calls are refused; Hand to speak is enforced (a script that connects with the participant's real pass and tries to publish audio is refused, research R22); video off stops cameras within 2 s; removal and the rejoin attempt; en desktop and ar phone with axe.

  Depends on T925, T921, T922.

- [ ] T907 [US4] [UI] **Camera and microphone permission UX and fallbacks** *(changed 2026-10-08, #222)*. `/impeccable shape device-permissions` first (or manual), then in `src/web/src/features/circles/stage/`:
  - `PermissionPrimer.tsx`: before the first browser prompt in the session, one sentence: "Your camera and microphone go to the people in this call through circloo's call server. Nothing is recorded or kept." with Continue. Nothing is requested before a device button is pressed (FR-904, FR-910).
  - `DeviceProblem.tsx`: `denied` (how to allow it again, per browser, with retry), `no-device` (audio only or listen), `busy` (Try again), `blocked`, unsupported browser, "You can't join the call from this network. Chat and hands still work." after the TCP and TLS fallbacks fail.
  - Strings `circles.call.device.*` in all four locales.
  - **e2e** "devices": audio only and heard; denied and still listening, chatting and reacting; no microphone; busy then Try again; no WebRTC support; UDP blocked joins over TCP (SC-916); reach chat and hand controls in under 5 s (SC-907); en desktop and ar phone with axe.

  Depends on T925.

**Checkpoint**: a complete group call with enforced speaking modes, on computers and phones, with fallbacks.

---

## Phase 5: User Story 3 and 8 - Raised hands and emoji in the call (P2)

- [ ] T927 [US3] [US8] [UI] **Raise hand and reactions in the call.** `/impeccable shape call-reactions` first (or manual), then:
  - Raise and lower hand in `CallControls.tsx`, reusing spec 008's `HandsQueue` (T810) with "You are 2nd"; the queue in the Call tab.
  - Reactions: `React` allowed while a call is on (`CircleHub.Room.cs` rule from spec 008 T807, extended here, with a hub test); `CallReactions.tsx` floats grouped bursts over the call grid on every screen, a counter under reduced motion, a summary for screen readers; hidden when reactions are off.
  - **Tests**: hub test that reactions work with a call on and no presentation and store nothing, and that during a running presentation they add to its anonymous totals (D11); e2e "hands and reactions": raise, place, floor given from the queue; 20 pages send 👏 and every page shows one grouped burst; en desktop and ar phone with axe.

  Depends on T925, T926 and spec 008 T807 (#181), T808 (#182), T810 (#184).

---

## Phase 6: User Story 5 - Talk in writing (P2)

- [ ] T908 [P] [US5] **Replies; call lines are not stored (API)** *(changed 2026-10-08, #223)*.
  - `Reply(long parentId, string text)` sharing one send path with `Say` (clean, safety filter, spec 008 limits, slow mode and pause, `ReplyToId`); `reply-invalid` unless the parent is a visible member message of the same circle and not itself a reply. `MessageDto` gains `ReplyToId`. The circle view returns replies; hiding a parent hides its replies for members.
  - **Changed**: no persisted call system lines. Drop the stage and recording line kinds from the branch's `SystemLines.cs` (or the helper altogether if nothing else uses it).
  - **Tests** `ReplyTests.cs`: as on the branch, minus the system-line rows, plus "a call start and end write no `CircleMessages` row".

  Depends on T918 and spec 008 T805 (merged). The branch `feat/223-replies-system-lines` is the starting point.

- [ ] T909 [US5] [UI] **Conversation UI: threads and live call lines** *(changed 2026-10-08, #224)*. `/impeccable shape discussion-thread` first (or manual), then:
  - `ChatPanel.tsx` (spec 008 T806): Reply action, one-level thread, "replying to Amina" composer state and cancel; `Reply` in `room.ts` and `replyToId` handling.
  - Live lines in the chat from `CallNotice` (call started or ended, video on or off, mode, floor) and from `Hands` events (grouped: "3 hands raised"), never stored, gone after a reload (US5 #3).
  - Strings `circles.call.lines.*` and `circles.chat.reply.*` in all four locales.
  - **e2e** "conversation": post, reply, order, hide, live lines appear and are gone after a reload; en desktop and ar phone with axe.

  Depends on T908, T925 and spec 008 T806 (#180).

---

## Phase 7: Measurements, accessibility and the journey

- [ ] T928 [US2] [US3] [US4] **Call e2e measurements against the local LiveKit.**
  - `src/web/e2e/call-helpers.ts`: a multi-page fixture (`E2E_CALL_PEERS`, default 4), fake media flags, `getStats()` helpers (receiving audio, decoded video count, concealed audio ratio, time from Join to the first audio packet).
  - "measurements" describe in `call.spec.ts`: join to first audio over 20 joins, median ≤ 2 s and p95 ≤ 4 s locally (SC-903); decoded videos ≤ visible tiles + 1 on desktop and phone (SC-912); speaking highlight ≤ 1 s and mute, floor, camera stop and removal ≤ 1 s for every page (SC-913); UDP-blocked join ≤ 6 s (SC-916); after the whole run, the database comparison of SC-906 through an API test helper.
  - Results printed as a short table the PR quotes.

  Depends on T925, T926, T907, T922.

- [ ] T929 **Load and network performance test.**
  - `tests/perf/livekit-load.ps1` and `.sh`: `lk load-test` from a pinned `livekit/livekit-cli` container: 100 subscribers with 6 audio publishers, then 25 video publishers with 75 subscribers, 5 minutes each; node CPU sampled (locally `docker stats`, on Azure the VM metrics). Targets SC-910 and SC-911 (CPU under 70%).
  - `tests/perf/netem/`: a Linux container with `tc netem` (10% and 30% loss, 150 ms delay) running headless Chromium in a call; reads concealment and freeze counts (SC-914).
  - Phone session for SC-915 recorded by hand (quickstart C).
  - A short `tests/perf/README.md` saying how to run each part and that results go in the PR, never invented.
  - If the production size (B2als_v2) misses the targets, say which size does; the founder allowed sizing up only on this evidence (D8).

  Depends on T928 for the local run and T917 for the Azure numbers.

- [ ] T914 [US7] [UI] **Accessibility and i18n pass** *(changed 2026-10-08, #229)*. `/impeccable audit` over the whole call surface and `/impeccable harden` (or manual), then fix:
  - `stage/announce.ts` (+ test), reusing spec 008's batching: polite grouped announcements for call start and end, hands, floor, mutes and removal of me; no announcement per active speaker change, the current speaker available as text.
  - Keyboard: every control of T925, T926, T907, T927 and T909 reachable in logical order with visible focus, page changes in the grid by keyboard, arrow keys and focus order mirrored in Arabic, no trap in the primer or menus, targets at least 24 px.
  - Reduced motion: no floating reactions, no pulsing; "speaking" always as text.
  - **i18n check**: a Vitest test that every `circles.call.*` and `circles.chat.reply.*` key exists in all four locale files and every error code of `contracts/hub.md` has a message.
  - **e2e** "keyboard and screen reader": keyboard-only journey (join, raise hand, unmute with the floor, react, leave), live-region assertions, reduced-motion emulation, axe in en and ar.

  Depends on T925, T926, T907, T927, T909.

- [ ] T915 **Journey, docs and audit** *(changed 2026-10-08, #230)*.
  - **Playwright**: the full journey of quickstart B in `call.spec.ts` (en desktop, ar phone, axe, reduced motion, fake devices).
  - **Real devices**: quickstart C against the deployed call server (needs T917), including a 443-only network and the two reference phones; results in the PR.
  - **Design review**: `/impeccable audit` and `critique` over the call, controls, permissions, reactions and thread, findings fixed or justified.
  - **Docs**: `PRODUCT.md` (group calls, only chat saved), `docs/product/prd.md` (E4 and E2 notes), `docs/architecture/overview.md` (final settings, limits and measured numbers).
  - **Ideas**: comment progress on #212; note on #183 and #166 that the floor now also grants the microphone in Hand to speak.
  - **SC-909**: one session with 5 to 10 people; no result claimed before it is run.

  Depends on every task above.

---

## Dependencies & Execution Order

- **Setup**: T916 [P] first (needs only merged T901). T917 [P] [infra] follows T916; it blocks deployed calls and the Azure half of T929 and T915, nothing else. T930 [P] (constitution) can start at once and should merge before T917.
- **Foundational**: T918 → T919.
- **API**: T919 → T920 → T921 → T922.
- **Client**: T923 [P] after T919 (contract) → T924. T925 after T923 and T920. T926 after T925, T921, T922. T907 after T925.
- **Hands and reactions**: T927 after T925, T926 and spec 008 T807, T808, T810.
- **Conversation**: T908 [P] after T918; T909 after T908, T925 and spec 008 T806.
- **Measurements**: T928 after T925, T926, T907, T922. T929 after T928 (local) and T917 (Azure).
- **Release gate**: T914 after every UI task, then T915.

```text
T901 (done) ─ T916 ─┐
              T918 ─┴─ T919 ─┬─ T920 ─ T921 ─ T922 ───────────────┐
                             └─ T923 ─ T924                        │
                                  └─── T925 ─┬─ T926 ──────────────┼─ T928 ─ T929
                                             ├─ T907 ──────────────┤          │
     008 T807+T808+T810 ─────────────────────┼─ T927               │          │
              T918 ─ T908 ───────────────────┴─ T909 (008 T806)    │          │
                                                    T914 ──────────┴──────── T915
     T930 ─ T917 ────────────────────────────────────────────────── (T929 Azure, T915 devices)
```

## Parallel Example

```text
Right away:      T916 AppHost LiveKit      (AppHost.cs, LiveKitFixture.cs)
                 T918 Cleanup migration    (Migrations, Entities.cs, DiscussionOptions.cs, LiveKitOptions.cs)
After T918:      T908 Replies              (CircleHub.Replies.cs, ReplyTests.cs)
After T919:      T920 Switches (API)       (CircleHub.Discussion.cs, CallPermissions.cs)
                 T923 Call engine          (stage/call.ts, stage/stage.ts, package.json)
After T925:      T907 Devices UI           (PermissionPrimer.tsx, DeviceProblem.tsx)
                 T926 Animator controls    (DiscussionSwitch.tsx, PersonMenu.tsx)
```

T920, T921 and T922 all add to `CircleHub.Discussion.cs`; merge them one at a time. The UI tasks share `call.spec.ts` and the locale files: one `describe` and one key group per task.

## Implementation Strategy

1. **MVP**: T916 → T918 → T919 → T920 → T921 → T923 → T924 → T925. The animator starts an audio or video call, Hand to speak is enforced, the floor grants the microphone, everyone sees a fast grid. Locally, at zero cost.
2. **Increment 2**: T922 (removal holds, roster, animator away), T926 (all animator controls), T907 (devices and networks).
3. **Increment 3**: T927 (hands and reactions in the call), T908 → T909 (threads and live lines).
4. **Deployed**: T930 → T917, then T929 and the device part of T915 on Azure.
5. **Release gate**: T928, T914, T915.

## Notes

- Each task's PR contains `Closes #<task issue>`. The parent idea is #212.
- With calls off (the default), every existing circle behaves exactly as before (SC-901): no task changes a default for circles that never start a call.
- Out of scope: recording of any kind, screen sharing, captions, breakout rooms, end-to-end encryption, several floors at once, co-animators, per-organisation policies, and #255 (training, certification and exams).
