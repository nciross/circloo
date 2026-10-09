# Implementation Plan: Live discussion: group audio and video calls with chat, raised hands and emoji

**Branch**: `feat/212-live-discussion-stage` (spec on `docs/212-live-discussion-spec`, amended on `docs/212-livekit-group-calls`; task branches `feat/<task-issue>-*`) | **Date**: 2026-10-05, amended 2026-10-08 |
**Spec**: [spec.md](spec.md) | **Parent idea**: #212 (related: #96 superseded, #166, #174, #126, #244, #255)

**Input**: Feature specification from `specs/009-live-discussion-stage/spec.md`, including the Clarifications of 2026-10-05 and 2026-10-08.

## Summary

While a circle is open, the animator has three switches: **Chat**, **Audio call**, **Video call**. A call runs on a **self-hosted LiveKit call server (SFU)**, so the whole circle (up to 100 people) can join, with simulcast, adaptive quality, an active speaker and fallbacks for strict networks. The animator picks **Open mic** or **Hand to speak**; the rule is enforced on the call server through each person's permissions, set in a short-lived **call pass** minted by the API and changed live through LiveKit's RoomService API. Raised hands, the floor, chat and emoji reuse spec 008. **Only chat messages are stored.** Recording and transcripts are dropped.

- **Data**: one migration, `GroupCallsLiveKit`: drop the never-used `Recordings` and `RecordingEvents`, drop `Circle.DiscussionChangedAt/ByMemberId`, add `Circle.DiscussionSpeaking`. `DiscussionOn` and `DiscussionVideo` keep their names (call on, video allowed).
- **API**: `LiveKitTokens` (HS256 passes, no SDK), `LiveKitRooms` (typed `HttpClient` for Twirp RoomService), `CallRules` (permissions), `CallModeration` (in-memory mutes, removals, roster), `CallAway` (timer), `CallEndpoints` (`POST /api/circles/{id}/call/token`, `POST /api/livekit/webhook`). Hub methods in `CircleHub.Discussion.cs`; side effects on spec 008's floor methods.
- **Client**: `livekit-client` 2.22.3, lazy-loaded on Join. A call engine (`call.ts`) behind the existing `stage.ts` store, our own grid with pages and an active speaker, phone layout, device fallbacks. The WebRTC mesh shipped in T905 is deleted.
- **Infra**: LiveKit as a local container in the AppHost (zero cost). Production hosting (founder decision **D8**): one small Linux VM in `rg-circloo-<env>` (B2als_v2, about $45 a month), behind a `callsEnabled` Bicep switch that stays false by default. The deployed dev environment uses a cheaper profile (B2ats_v2, Standard HDD, one IP, nightly shutdown; about $5 to $10 a month when on). An `azure-infra` task (T917) adds it, its secret and its env vars. A MINOR constitution amendment (D9) is its own task (T930).

## Technical Context

**Language/Version**: C# / .NET 10 (API), TypeScript strict / React 19 (web), LiveKit server v1.13.7 (Go, container image)

**Primary Dependencies**: existing SignalR circle hub, `RoomLimits`, `LiveThrottle`, `SafetyPolicy`, `AuditLog`, `HandsGrace`, EF Core (Npgsql), Zustand, TanStack Query, i18next. **New**: `livekit-client` 2.22.3 (npm, exact pin), the `livekit/livekit-server:v1.13.7` image, and `livekit/livekit-cli` (pinned) for the load test only. No new NuGet package.

**Storage**: PostgreSQL. `Circle.DiscussionOn`, `DiscussionVideo`, new `DiscussionSpeaking`; `CircleMessage.ReplyToId`. Moderation state, roster, passes and media are **not stored**. Migration `GroupCallsLiveKit`.

**Testing**: xUnit + Testcontainers (hub and endpoint tests with a fake `ILiveKitRooms`; token and RoomService tests against a `LiveKitFixture` container), Vitest (call engine on a fake LiveKit `Room`, store, permissions mapping, grid paging), Playwright with fake media devices against the AppHost's LiveKit (`e2e/call.spec.ts`, en desktop and ar phone, axe), a load and network test (`tests/perf/`), and a manual device session.

**Target Platform**: Azure Container Apps (one `web` replica) plus one call server VM (D8). Current Chrome, Edge, Firefox, Safari (iOS 16+). Phones are first-class.

**Project Type**: web application (API + SPA in one production container) plus a separate call server

**Performance Goals**: join to first audio ≤ 2 s median, ≤ 4 s p95 (SC-903); 100 people in an audio call and 25 cameras in a video call on one node under 70% CPU (SC-910, SC-911); at most 9 tiles on a computer and 4 on a phone, never more videos decoded than shown plus one (SC-912); moderation in ≤ 1 s (SC-913); continuous audio at 10% loss (SC-914).

**Constraints**: no media at rest and no recording anywhere; only chat stored; zero-cost dev; WCAG 2.2 AA; four locales with RTL; reduced motion; one API replica; strict CSP; deployed calls wait for T917; dev cloud cost kept minimal (D8).

**Scale/Scope**: one call per circle, up to `Circles:MaxPeople` (100) participants, one call server node.

## Dependencies on spec 008 (state on 2026-10-08)

Merged: T801 to T805 and T809 (foundation, big-circle join, characters, room layout #178, chat hub #179, hands hub #183), plus the room workspace #244 with its Call tab. **Not merged**: T806 chat UI (#180), T807 reactions hub (#181), T808 reactions UI (#182), T810 hands UI (#184). This plan:

- reuses 008's chat pause as the **Chat** switch (`SetRoomSettings`), adds nothing to it;
- reuses `RaiseHand`, `LowerHand`, `LowerAllHands`, `GiveFloor` and the single floor, adding permission side effects when a call is on (T921);
- reuses `React`/`Reactions` and allows them while a call is on (T927, after T807);
- therefore T927 waits for T807, T808 and T810; T909 waits for T806. Nothing here re-implements 008.

## Constitution Check

| Principle | Status |
|---|---|
| I. No issue, no development | Pass. Parent idea #212. Existing task issues #217 to #230 are re-mapped in `tasks.md`; new task issues come from `/speckit-taskstoissues` after this plan. |
| II. Spec before code | Pass. Founder decisions of 2026-10-08 are recorded as Clarifications. Plan-level interpretations are listed there too, and the founder's answers to D6 and D8 to D11 are recorded in the Clarifications and research.md. |
| III. Four languages, RTL | Pass. Strings `circles.call.*` (the existing group) in en/fr/ar/es. Every UI task runs an ar phone e2e. |
| IV. Human-crafted design | Pass with a recorded exception: when Impeccable cannot run (#126), ux-designer reviews by hand (Complexity Tracking). Our own call UI, not a component kit's default look. |
| V. Private by default | Pass. Calls are for members only; passes are per member and per circle; nothing about a call is stored; no third party sees media or connection checks. Enterprise call policies stay out of scope and would be configuration. |
| VI. Test what matters | Pass. Hub and endpoint tests for every rule (each animator method refused for participants, guests, non-members, the audience), token tests against a real LiveKit, Playwright per story with fake media against a local LiveKit, a load and network test. |
| VII. Simple, disposable infrastructure | **Pass with exception.** The call server is a new, self-hosted resource (a VM, D8) where VII prefers managed services. It stays in `rg-circloo-<env>`, in Bicep, removed by `scripts/destroy`, created only when `callsEnabled` is true, with a nightly shutdown in dev. Complexity Tracking; constitution 2.1.0 names this VM as an accepted exception (D9, T930). |
| VIII. Secure by design | Pass. Threat model below. The LiveKit API secret is a shared key (LiveKit has no managed-identity option): Key Vault in Azure, user-secrets locally, read by the VM through its managed identity. Complexity Tracking. |
| IX. Zero-cost development | Pass. LiveKit runs as a local container in the AppHost and as a Testcontainers fixture. No paid service in dev or tests. |
| Tech constraints: "Real time: SignalR + Yjs", "Production is one container" | **Deviation** recorded in Complexity Tracking: a media server beside the app, like the deck converter (spec 006). Constitution 2.1.0 (D9, T930, its own PR) adds "Real-time media: a self-hosted LiveKit SFU" and names the VM as the exception to "one container"; this plan does not edit the constitution. |

**Gate result: PASS** with the Complexity Tracking entries. All founder decisions are answered. Deployed calls wait for T917 (infra) and, ideally, T930 (amendment) merged first. Re-checked after Phase 1 design: unchanged.

## Threat model (constitution VIII, FR-923)

| Threat | Mitigation |
|---|---|
| A participant calls animator-only methods (switches, mode, floor, mute, remove) through a crafted hub message | `DiscussionAnimatorAsync` re-reads the role from the database. Refusals answer `animator-only` and are audited (`discussion.refused`, ids only, at most 5 rows per member per minute). Hub tests assert every animator method for a participant, a guest, a non-member and an audience connection. |
| A participant gets a pass with more rights than allowed | Permissions are computed on the server (`CallRules`) from the database (role, floor, mode, video) and memory (mutes, removals). Browser passes never carry `roomAdmin`, `roomCreate`, `roomList`, data publishing or screen share. `canPublish` is false whenever no source is allowed (LiveKit treats an empty source list as "all"). Unit tests pin each row of the permission table. |
| A modified client speaks without the floor, keeps a camera on after a stop, or unmutes in Hand to speak | Enforced by the call server: the source is not in the person's permissions, so publishing is refused or the track is unpublished. Playwright checks that a revoked microphone stops reaching others. |
| A removed person rejoins with an old or refreshed pass | The token endpoint refuses them (`removed-from-call`). The `participant_joined` webhook removes them again within a second. Ending the call deletes the room. |
| Pass theft or replay | Passes live 5 minutes, name one member and one room, are returned only over HTTPS with `no-store`, never logged, and issued by a POST with the CSRF check and a rate limit (10 per minute per member). A stolen pass joins only as that member, with that member's rights. |
| Webhook forgery | Signature check with the API secret, `iss` check, `sha256` body hash, 64 KB cap, rate limit. The only action a webhook can cause is removing someone from a call. |
| API secret leak | Never in the repo or the database. Key Vault (`livekit-api-secret`) as a Container Apps secret reference; the VM reads it at boot through its system-assigned identity and writes it to a root-only file. Rotation: LiveKit accepts several keys, so a new key is added, the API switched, the old key removed. |
| The call server is exposed on the internet | Only the needed ports are open (NSG: 443/tcp on both IPs, 7881/tcp, 7882/udp, 3478/udp). No public SSH (Run Command or serial console when needed). The admin API needs a signed admin token. Image pinned, unattended OS security updates, the VM is rebuilt from cloud-init rather than repaired. TURN has LiveKit's per-participant allocation quota. Basic DDoS protection of Azure public IPs. |
| The call server could record or forward media | No Egress, Ingress or SIP service is deployed; the configuration has no such section; a test asserts the shipped configuration. Media is decrypted only in the SFU's memory to forward it (no end-to-end encryption, research R26). |
| Personal data in call server logs | `warn` level in production, `pion_level: error`, journald kept 3 days on the VM, not shipped to Application Insights. Identities are member ids, not emails. Residual risk: a crash log may contain a member id and an IP address. |
| IP exposure | Peers no longer see each other's addresses (an improvement over the mesh). Only the call server sees them. No third-party STUN. |
| Abuse: hand spam, reaction floods, moderation floods, pass farming | `RoomLimits` per member across tabs: `hand` 6 per 10 s, `reaction` 5 per 10 s (008), `call-admin` 30 per 10 s, `call-token` 10 per minute. LiveKit room `max_participants` = `Circles:MaxPeople`. |
| A member leaves the circle or the circle closes during a call | Leaving or removal from the circle calls `RemoveParticipant`; closing the circle ends the call (`DeleteRoom`); the webhook re-checks membership on every join. |
| Denial of service on the one API replica | Moderation calls to the call server have 3 s timeouts and one retry; webhooks answer fast and act in the background; nothing grows per media packet on the API. |
| Clickjacking or a hidden camera prompt | CSP keeps `frame-ancestors 'none'`. `connect-src` gains only the call server's origin. `Permissions-Policy` allows camera and microphone for `self` on the two room routes only, never on the audience screen. |
| The projector reveals people or plays audio | The audience screen never requests a pass and never receives the roster. It shows the hand count and reactions only. |

Audit events (ids only, never text): `discussion.on`, `discussion.off` (with reason `animator`, `animator-away` or `circle-closed`), `call.mode`, `call.removed`, `discussion.refused`. Animator actions only (FR-922, founder decision D10). Not audited, by design: joins, leaves, speaking, the floor, mutes, reactions.

## Project Structure

### Documentation (this feature)

```text
specs/009-live-discussion-stage/
├── spec.md
├── plan.md              # this file
├── research.md          # R1 to R18 status, R19 to R34, founder decisions
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── hub.md           # methods, events, error codes, authorisation, limits
│   └── rest.md          # call pass, webhook, circle view
└── tasks.md
```

### Source Code (repository root)

```text
src/Circloo.Api/
├── Discussion/
│   ├── DiscussionOptions.cs              # trimmed to AwayEndSeconds (T918)
│   ├── DiscussionRules.cs                # DiscussionState (on, videoAllowed, speaking, available, away); stage and recording records removed (T918)
│   ├── LiveKitOptions.cs                 # new: Url, ApiUrl, ApiKey, ApiSecret, TokenMinutes; validated (T918)
│   ├── LiveKitTokens.cs                  # new: HS256 join passes and admin tokens (T919)
│   ├── LiveKitRooms.cs                   # new: ILiveKitRooms + typed HttpClient for Twirp RoomService (T919)
│   ├── CallRules.cs                      # new: the permission table of research R22 (T919)
│   ├── CallPermissions.cs                # new: recomputes permissions and applies them on the call server (T920, T921)
│   ├── CallModeration.cs                 # new: in-memory mutes, removals, roster per circle (T921, T922)
│   ├── CallAway.cs                       # new: animator-away timer like HandsGrace (T922)
│   ├── LiveKitWebhook.cs                 # new: signature check and event handling (T922)
│   └── CallEndpoints.cs                  # new: POST call/token, POST /api/livekit/webhook (T919, T922)
├── Circles/
│   ├── CircleHub.cs                      # Enter pushes Discussion and CallRoster; disconnect feeds CallAway
│   ├── CircleHub.Discussion.cs           # EnableDiscussion(videoAllowed, speaking), DisableDiscussion, SetSpeakingMode,
│   │                                     # MuteMember, AllowMember, MuteEveryone, RemoveFromCall, AllowBack (T920, T921)
│   ├── CircleHub.Room.cs                 # spec 008: GiveFloor, LowerHand, LowerAllHands call CallPermissions (T921); hand limit; React during calls
│   └── CircleEndpoints.cs                # circle view: discussion { on, videoAllowed, speaking, available }; close ends the call
├── Security/SecurityHeaders.cs           # connect-src gains the call server origin (T919)
├── Security/RateLimits.cs                # call-token and webhook policies (T919, T922)
├── Data/Entities.cs, CirclooDbContext.cs, Migrations/*_GroupCallsLiveKit.cs (T918)
└── Program.cs                            # options, singletons, HttpClient, endpoints

src/Circloo.AppHost/AppHost.cs            # livekit container, ports 7880/7881/7882, generated secret, LiveKit__* env (T916)
src/Circloo.AppHost/livekit.dev.yaml      # local LiveKit configuration body (T916)

src/web/src/
├── api/discussion.ts                     # call pass request; mesh and ICE types removed (T923, T924)
├── features/circles/stage/
│   ├── stage.ts (+ test)                 # store: discussion, roster, my permissions, connection state, notices; rebuilt on call.ts (T923)
│   ├── call.ts (+ test)                  # new: LiveKit engine adapter, lazy import, room options, events (T923)
│   ├── grid.ts (+ test)                  # new: tile ordering and paging (T925)
│   ├── media.ts (+ test)                 # kept: error mapping and support check
│   ├── CallPanel.tsx                     # rail tab: join, roster, controls (T925)
│   ├── CallStage.tsx, CallTile.tsx, CallControls.tsx   # new: grid, tiles, controls, phone layout (T925)
│   ├── DiscussionSwitch.tsx              # becomes the animator's switches and speaking mode (T926)
│   ├── PersonMenu.tsx                    # new: animator actions on a person (T926)
│   ├── PermissionPrimer.tsx, DeviceProblem.tsx          # T907
│   ├── CallReactions.tsx                 # new: reactions over the call (T927)
│   └── mesh.ts, link.ts, fakes.ts (+ tests)             # deleted (T924)
├── styles/call.css                       # logical properties, reduced motion
└── i18n/locales/{en,fr,ar,es}.json       # circles.call.*

tests/Circloo.Api.Tests/Discussion/
├── DiscussionHost.cs                     # existing host; adds a fake ILiveKitRooms and the LiveKitFixture
├── DiscussionSwitchTests.cs              # existing; updated for the new signature and no stored lines
├── CallTokenTests.cs, LiveKitRoomsTests.cs, CallPermissionTests.cs, CallModerationTests.cs,
├── WebhookTests.cs, CallAwayTests.cs, PersistenceTests.cs, SecurityHeaderTests.cs, CallServerConfigTests.cs

tests/perf/                               # new: livekit-load.ps1/.sh (lk load-test), netem/ (lossy network browser run)
src/web/e2e/call.spec.ts                  # new, fake media against the AppHost's LiveKit
infra/modules/livekit.bicep, infra/livekit/livekit.yaml, infra/livekit/cloud-init.yaml   # new, by azure-infra after D8 (T917)
docs/architecture/overview.md             # updated with this plan
```

**Structure decision**: same layout as specs 003 to 008. Server code in `Discussion/`, hub methods in the existing partial, client code in `features/circles/stage/` (the folder name stays to avoid churn; the UI says "call").

## Client design notes (for T923 and T925)

- **Where the call lives**: the room workspace (#244) has the whiteboard in the centre and a right rail with a **Call** tab. The Call tab holds the switches (animator), Join, the roster, hands and controls. During a video call the grid takes the centre (a "Call" view beside the whiteboard, switchable), and the rail shows the people. On a phone the grid sits above the bottom sheet and never covers the composer. The final layout comes from `/impeccable shape call`.
- **Engine boundary**: `call.ts` is the only file importing `livekit-client`, via `import()`. The store calls it through an interface so Vitest uses a fake.
- **Rendering**: tiles attach `<video>` only for the current page; off-page publications are disabled for this receiver. Audio elements for all remote audio, started inside the Join tap.

## Impeccable runs per UI task

When Impeccable cannot run (#126), `ux-designer` reviews each UI PR by hand against `docs/design/anti-ai-look.md` and WCAG 2.2 AA, writes the result in the PR and lists the skipped steps.

| Task | Steps |
|---|---|
| T925 call UI | `/impeccable shape call` (grid, pages, speaker view, phone layout, empty, reconnecting, weak states, RTL order) → `craft` → `audit` → `critique` → `harden` (names in three scripts, 4 tiles on a small phone) |
| T926 animator controls | `shape call-controls` (three switches, speaking mode, person menu, mute everyone) → `craft` → `audit` → `critique` |
| T907 permission UX | `shape device-permissions` → `craft` → `audit` → `harden` (long French and Spanish strings, RTL) |
| T927 hands and reactions in the call | `shape call-reactions` → `craft` → `audit` (reduced motion) |
| T909 conversation UI | `shape discussion-thread` → `craft` → `audit` → `critique` |
| T914 accessibility pass | `audit` over the whole call surface → `harden` |
| T915 journey | `critique` over the whole journey and a final `audit` |

## Complexity Tracking

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| A self-hosted LiveKit SFU beside the app (a media server the constitution's "Real time: SignalR + Yjs" does not list, and a second production resource) | Founder decision 2026-10-08: Zoom/Teams-grade calls for the whole circle, performance first, media on our own server and never stored. | The mesh tops out at 8 and cannot enforce the speaking mode. LiveKit Cloud and Azure Communication Services put media on a third party. |
| A VM for the call server (founder decision D8) where VII prefers managed services, an accepted exception in constitution 2.1.0 (D9, T930) | LiveKit needs UDP and TURN/TLS on 443; Container Apps offers neither (HTTP and TCP only, 443 taken). | Container Apps TCP-only fails the performance goal and needs a VNet environment rebuild; Container Instances cannot put TURN on 443 and restarts on host maintenance; AKS adds a cluster for one pod. |
| A shared API key and secret for LiveKit (not managed identity) | LiveKit authenticates only with HMAC-signed tokens. | No managed-identity option exists. Mitigated: Key Vault, VM managed identity to read it, rotation through multiple keys. |
| Passes signed by our own code instead of an SDK | No official .NET server SDK; the need is one JWT and five HTTP calls. | A community package adds a single-maintainer supply-chain dependency for about 40 lines. Tested against the real server. |
| In-memory moderation state, roster and away timer on one replica | They change in milliseconds, follow the live call and must not be stored (FR-930). One replica is already accepted (specs 006 and 008). | Storing them breaks "only chat is saved". A backplane is not needed at this size. A restart loses animator mutes (documented edge case). |
| Webhook endpoint without the cookie and CSRF checks | It is called by the call server, not a browser. Its signature (HMAC with the API secret plus a body hash) is the authentication. | Without webhooks a removed person can rejoin with a refreshed pass for several minutes. |
| `livekit-client` (a large npm package) in the SPA | It is the client half of the call server's protocol. | Writing our own LiveKit protocol client is out of the question. Lazy-loaded on Join, so the room page does not pay for it. |
| UI audit by the ux-designer agent when Impeccable cannot run (constitution IV) | #126. | Blocking every UI task on the plugin stops the feature; the manual review uses the same rules and is recorded per PR, as for specs 006 to 008. |
