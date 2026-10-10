# Research: Live discussion, group calls (spec 009)

Decisions taken while planning. Each one lists what was chosen, why, and what else was considered.

**Amended 2026-10-08.** The founder replaced the browser-to-browser mesh with a self-hosted LiveKit call server (SFU) and dropped recording. R1 to R18 were written on 2026-10-05; the table below says which still stand. R19 onward are the new decisions. The full 2026-10-05 text is in git history (`9f78a49`).

## Status of the 2026-10-05 decisions

| # | Topic | Status on 2026-10-08 |
|---|---|---|
| R1 | Media path: browser mesh, signalling over SignalR | **Superseded** by R19 (LiveKit SFU) |
| R2 | Mesh topology, stage of 8, opt-in viewers | **Superseded** by R19 and R25 (the whole circle can join; tiles are paged) |
| R3 | Mesh link design (`replaceTrack`, offerer rule) | **Superseded**: LiveKit's client does it (R25) |
| R4 | Signalling authorisation (`Signal`) | **Superseded** by R20 and R22 (call passes and server-side permissions) |
| R5 | ICE servers from configuration (public STUN) | **Superseded** by R28 (LiveKit's own STUN and TURN, no third party) |
| R6 | Where state lives | **Changed**: see R31 (only chat is stored; moderation state in memory) |
| R7 | Floor, mute and stage rules | **Changed**: see R22 (speaking mode, one floor, mute by source, removal) |
| R8 | Animator away: freeze at 60 s, end at 5 min | **Changed**: see R34 (no freeze; the call ends after 5 min) |
| R9 | Recording lifecycle and notice | **Removed** (no recording) |
| R10 | What a recording captures | **Removed** |
| R11 | Transcript export | **Removed** |
| R12 | Threads: reuse the circle chat with `ReplyToId` | **Kept.** Changed only for system lines: call lines are live, not stored (R31) |
| R13 | Kids-safe: "Allow cameras" switch | **Kept** as the video switch: an audio call has no cameras |
| R14 | Browser support, device errors, fallbacks | **Kept in part**: the error mapping in `media.ts` stays; weak-link and ICE restart move to LiveKit (R25, R28) |
| R15 | CSP and Permissions-Policy | **Changed**: see R29 (`connect-src` gains the call server) |
| R16 | Tests and the "test skill" | **Changed**: see R30 and R32 (local LiveKit, load and network tests). Still no test skill |
| R17 | Projector shows the hand count only | **Kept**, minus the recording indicator. It also shows reactions (spec 008) |
| R18 | Infra: no Bicep change | **Superseded** by R23 and R30 |

## R19. Call engine: LiveKit, self-hosted, pinned (founder decision 2026-10-08)

- **Decision**: one LiveKit server node, image `livekit/livekit-server:v1.13.7`, the same pin in the AppHost, the test fixture and `infra/`. Bump it on purpose, never `latest`.
- **Why v1.13.7**: released 2026-09-14 and stable for three weeks. It adds PROXY protocol on the TURN TCP listener, which a TLS front needs. v1.13.8 (2026-10-06) broke egress and v1.13.9 (2026-10-07) reverted it. We do not use egress, but a day-old release is not a production pin. Move to 1.13.9 or later once it has a week of quiet.
- **Rationale**: an SFU uploads each camera once and forwards it to everyone. A mesh uploads it once per receiver, which is why the old plan stopped at 8. LiveKit gives the "performance first" features the founder named: simulcast, dynacast (stops unused qualities at the sender), adaptive stream (each tile receives only the size it shows), active speaker, connection quality, automatic reconnection, and its own TURN for strict networks. It is open source (Apache 2.0), runs as one Go binary, and keeps media inside a server we run.
- **Alternatives**: keep the mesh (cannot pass 8 people, cannot enforce speaking mode on the server, exposes IPs between peers); LiveKit Cloud (media on a third party, the founder chose self-hosted); Azure Communication Services calling (paid per minute, a second identity system, media on Microsoft's service, earlier ruled out); mediasoup or Janus (lower-level, more code for us to own).

## R20. Call passes: tokens minted in the API, signed by us (no .NET SDK)

- **Decision**: the API signs LiveKit access tokens itself: a JWT with HS256, the API key as `iss` and the API secret as the HMAC key. A small `LiveKitTokens` class (about 40 lines, `HMACSHA256`, `System.Text.Json`, `Base64Url`) builds two kinds:
  - **Join pass** (browser): `sub` = the member id, `name` = the member's display name, `nbf` = now − 10 s, `exp` = now + `LiveKit:TokenMinutes` (5), `jti` random, `video` = `{ room, roomJoin: true, canSubscribe: true, canPublish, canPublishSources, canPublishData: false, canUpdateOwnMetadata: false }`. No metadata.
  - **Admin token** (server to server only): `exp` = now + 60 s, `video` = `{ room, roomAdmin: true, roomCreate: true, roomList: true }`. Never sent to a browser.
- **Important rule**: when a person may publish nothing, the pass says `canPublish: false`. LiveKit reads an **empty** `canPublishSources` as "all sources allowed", so an empty list must never be sent with `canPublish: true`. A unit test pins this.
- **Rationale**: there is no official LiveKit server SDK for .NET. The most used community package (`Livekit.Server.Sdk.Dotnet`, one maintainer) would add a supply-chain dependency for a few lines of JWT and five HTTP calls. Signing ourselves keeps the code small, readable and testable. It is checked against the real server in tests: `GET /rtc/validate?access_token=…` on the LiveKit container answers 200 for a good pass and 401 for a bad one.
- **Alternatives**: the community SDK (above); `Microsoft.IdentityModel.JsonWebTokens` (a new package for one HMAC); minting in the browser (impossible: the secret would leak).

## R21. Rooms and identities

- **Room per circle**: `circle-<circleId:N>` (32 hex digits). One call per circle at a time.
- **Identity**: the member id (`CircleMember.Id`), never the user id or an email. **Name**: the member's display name, already visible to everyone in the circle. No metadata, no avatar URL.
- **Lifecycle**: the call server runs with `room.auto_create: false`, so only the API opens rooms. The token endpoint calls `CreateRoom` (idempotent: it returns the room if it exists) with `max_participants` = `Circles:MaxPeople`, `empty_timeout` = 300 s and `departure_timeout` = 20 s. Ending the call calls `DeleteRoom`, which disconnects everyone at once. Closing the circle does the same.
- **Alternatives**: `auto_create: true` (any valid pass could create a room with server defaults; we want our limits set by the API); a room per activity (people would drop at each activity change).

## R22. Enforcement on the call server: speaking mode, floor, mutes and removal

The browser's buttons are a convenience. The rule lives in each person's **permissions on the call server**, set in the pass and changed live through LiveKit's RoomService API.

- **Transport**: RoomService is Twirp over HTTP. The API's typed `HttpClient` (`LiveKitRooms`) posts JSON to `{LiveKit:ApiUrl}/twirp/livekit.RoomService/<Method>` with `Authorization: Bearer <admin token>`. Methods used: `CreateRoom`, `DeleteRoom`, `ListParticipants`, `GetParticipant`, `UpdateParticipant`, `MutePublishedTrack`, `RemoveParticipant`. Timeouts 3 s, one retry on 5xx. Failures answer the animator with `try-again` and are logged without payloads.
- **Permissions** (`CallRules.Permissions(circle, member, hasFloor, moderation)`, used by both the pass and live updates):

  | Who | Microphone | Camera |
  |---|---|---|
  | Animator | always | if video is on |
  | Participant, Open mic | unless muted by the animator | if video is on and not stopped by the animator |
  | Participant, Hand to speak, with the floor | unless muted by the animator | if video is on and not stopped by the animator |
  | Participant, Hand to speak, without the floor | **no** | if video is on and not stopped by the animator |
  | Removed from this call | no pass at all | no pass at all |

  Screen sharing and data messages are never allowed. Reactions and hands go through the SignalR hub, which already authorises and rate-limits them.
- **When permissions change**, the API calls `UpdateParticipant` with the full new permission for the people concerned: the old and new floor holder (`GiveFloor`, `LowerHand` of the floor holder, `LowerAllHands`), one person (mute, allow), or everyone in the room (`ListParticipants` then one update each) for a mode or video change. A person who is not in the call is skipped. LiveKit unpublishes tracks whose source is no longer allowed, and the client gets `ParticipantPermissionsChanged`. A Playwright test checks that a revoked microphone stops reaching the others; if a LiveKit version ever stops unpublishing on its own, `MutePublishedTrack` on that track is the fallback (noted in T921).
- **One floor at a time** in Hand to speak: spec 008's `RaisedHand.HasFloor` is the source of truth, with its unique index. No new table. Giving the floor to the next person revokes the previous one's microphone.
- **Mute everyone** (Open mic): `MutePublishedTrack(muted: true)` on each participant's microphone track. The permission is unchanged, so people can unmute again (a reset, like Zoom). `room.enable_remote_unmute` stays false, so the server can never switch a microphone on (FR-908).
- **Animator mutes** (`MuteMember(id, 'microphone'|'camera')`) remove that source from the person's permissions until `AllowMember`. They live in memory (`CallModeration`, per circle) and also go into every new pass.
- **Remove from call**: add the member to the circle's in-memory removed set, then `RemoveParticipant`. The token endpoint refuses removed members (`removed-from-call`). On self-hosted LiveKit, `RemoveParticipant` does not revoke passes, and the client holds refreshed passes for several minutes, so the webhook (R24) removes them again if they reconnect. `AllowBack` clears the entry; ending the call clears the set.
- **Rationale**: a modified client cannot speak without the floor, cannot keep a camera on after the animator stopped it, and cannot come back after removal. The server never switches a device on.
- **Alternatives**: UI-only rules (the founder asked for enforcement); data-channel commands to clients (trusts the client); several floors (a later setting, spec out of scope).

## R23. Hosting of the call server (founder decision D8: one small VM, cheap in dev)

LiveKit needs: TCP 443 for the signalling WebSocket (TLS), UDP for media (best), TCP 7881 as the ICE fallback, and TURN over TLS on **443** for networks that allow only web traffic. TURN/TLS and the signalling need **two different host names** on port 443 (LiveKit's own guidance), each with a certificate. A call server should never scale to zero during a call and runs as **one** node (rooms live on one node without Redis).

Approximate pay-as-you-go list prices, France Central, October 2026, rounded. To be confirmed in the Azure pricing calculator by `azure-infra` before the founder decides. Internet egress: the first 100 GB a month are free, then about $0.087 per GB. Rough traffic: a 1-hour audio call of 50 people is about 1 GB; a 1-hour video call of 10 people with all cameras on is about 10 to 15 GB.

| Option | How | UDP media | TURN/TLS on 443 | Monthly cost (small) | Main drawbacks |
|---|---|---|---|---|---|
| **A. Container Apps, TCP only** | A third Container App; signalling on the HTTP ingress; ICE/TCP on an extra TCP port | **No** (Container Apps ingress is HTTP and TCP only) | **No**: 443 is taken by the environment's HTTP ingress, and extra TCP ports must be unique in the environment | about $10 idle to $75 busy (1 vCPU, 2 GiB, one replica, idle billing when no call) | Media over TCP suffers on lossy networks (head-of-line blocking: freezes, delay), which fails "performance first". External TCP ingress needs a **VNet environment**: the current `cae-circloo-*` has none and cannot be changed in place, so the environment and both apps must be recreated. Strict networks that allow only 443 cannot connect |
| **B. Container Instances** | One container group: LiveKit plus a Caddy sidecar for TLS, public IP with UDP ports | Yes | Not on 443 (one IP and one DNS label per group, so TURN/TLS goes on 5349) | about $80 to $90 (2 vCPU, 4 GB, always on) | Public IP can change on restart (the DNS label stays); host maintenance restarts drop calls; no static second name for TURN on 443; secrets passed as secure environment values at deploy time |
| **C. One small Linux VM (recommended)** | VM with two static public IPs and DNS labels (`lk-<token>` for signalling, `turn-<token>` for TURN/TLS), NSG, cloud-init runs the pinned LiveKit image with host networking and Caddy for TLS (LiveKit's reference deployment). A system-assigned identity reads the LiveKit secret from Key Vault at boot | Yes, best (kernel networking, single UDP port 7882) | **Yes** (second IP and name) | **about $45** (B2als_v2: 2 vCPU burstable, 4 GiB, ~$33; two static IPs ~$7; 32 GB Standard SSD ~$3), or **about $85** with D2as_v5 (2 vCPU steady, 8 GiB, ~$72) if the load test (T929) shows the burst credits run out | A VM to keep patched (unattended upgrades, rebuilt from cloud-init, no public SSH); a self-hosted component (constitution VII prefers managed); single-VM SLA 99.5% on Standard SSD |
| **D. AKS** | One-node cluster, LiveKit Helm chart with host networking | Yes | Yes (with a second IP) | about $95+ (one D2as_v5 node ~$72, Standard load balancer ~$18, IPs) | Far more moving parts (cluster upgrades, Helm, ingress) for one pod. Not justified at this size |

- **Decision (founder, 2026-10-08)**: **C, a single VM**, starting on **B2als_v2 (~$45 a month all in, before egress)** in production, sized up to D2as_v5 (~$85) only if the load test (T929) says so. It is the only option that meets "performance first" on UDP and still reaches people on 443-only networks, and it is LiveKit's documented reference deployment. It stays disposable: defined in Bicep and cloud-init, inside `rg-circloo-<env>`, removed by `scripts/destroy`.
- **Cost control**: a Bicep parameter `callsEnabled` (default `false`) creates the VM only where it is asked for. Without it the API has no `LiveKit:Url` and shows "Group calls are not available here" (FR-935).
- **Profiles per environment** (founder: "in dev must reduce cost"). Parameters with defaults chosen from `environmentName`, as spec 008 T812 does for `webMinReplicas`, each overridable through an azd environment variable:

  | Parameter (azd variable) | `prod` default | Other environments (dev) default | Why |
  |---|---|---|---|
  | `callsEnabled` (`CALLS_ENABLED`) | false | false | The VM exists only when someone asks for it |
  | `callsVmSize` (`CALLS_VM_SIZE`) | `Standard_B2als_v2` (2 vCPU burstable, 4 GiB) | `Standard_B2ats_v2` (2 vCPU burstable, 1 GiB, the smallest current B size) | LiveKit itself needs a few hundred MB; 1 GiB holds a handful of people. T917 checks a 5-person video call on it; if it does not hold, `Standard_B1ms` (1 vCPU, 2 GiB) is the fallback |
  | `callsDiskSku` (`CALLS_DISK_SKU`) | `StandardSSD_LRS` | `Standard_LRS` (Standard HDD, 32 GiB, the image minimum) | Nothing is stored on the disk; HDD is enough when only the image and logs live there |
  | `callsTurnTls` (`CALLS_TURN_TLS`) | true (second static IP and name for TURN/TLS on 443) | false (one IP: signalling on 443, TURN over UDP 3478 and ICE/TCP 7881 only) | The second IP costs money while the VM is off; dev rarely tests 443-only networks |
  | `callsShutdownTime` (`CALLS_SHUTDOWN_TIME`) | empty (never) | `2000`, time zone `Romance Standard Time` (Paris) | A nightly auto-shutdown (`Microsoft.DevTestLab/schedules`) deallocates the VM, which stops the compute bill |

  - **Starting it again**: `scripts/deploy` starts the VM after provisioning when calls are enabled (an `az vm start` step, because a deployment does not start a deallocated VM), and a small `scripts/calls-start.ps1` / `.sh` (`-Environment dev`) starts it without a full deploy. While it is off, starting a call answers `try-again`, and the start script is the fix.
  - **What still costs money while it is off**: the Standard public IP (Basic IPs, the only kind that could be released when stopped, are retired) and the disk. That is the floor.
  - **Dev cost estimate**: about **$5 to $10 a month** when used on working days (B2ats_v2 roughly $8 a month if it ran around the clock, so a few dollars with the nightly stop; one static IP about $3.65; a 32 GiB Standard HDD about $1.50), and **zero** while `callsEnabled` is false. To be confirmed in the pricing calculator by `azure-infra`.
- **Second choice** (not taken): B (Container Instances). It loses TURN/TLS on 443 and survives restarts less well, at about twice the cost of the small VM.
- **Rejected**: A, because TCP-only media misses the performance goal and needs the environment rebuilt; D, because of the complexity.
- **Names and certificates**: with no custom domain yet, the two Azure DNS labels (`*.francecentral.cloudapp.azure.com`) get Let's Encrypt certificates through Caddy. If the founder has a product domain, two CNAMEs (`call.` and `turn.`) are nicer and avoid any shared rate limit on `cloudapp.azure.com`. The founder kept the default: Azure DNS labels for now, a product domain later if one exists.
- **Constitution**: the app is still one container, and the call server is a separate resource, like the deck converter (spec 006). The founder chose a MINOR constitution amendment (D9, task T930).

## R24. Webhooks: yes, one purpose (enforcement), plus a live roster

- **Decision**: the call server posts webhooks to `POST /api/livekit/webhook`. The API verifies them: the `Authorization` header is a JWT signed with the API secret (`iss` = the API key) whose `sha256` claim must equal the Base64 SHA-256 of the raw body; body at most 64 KB; anything else is 401 with no detail.
  - `participant_joined`: if the member is removed from this call, no longer a member, the circle is closed or the call is off, the API calls `RemoveParticipant` (closes the rejoin gap of R22). Otherwise the member is added to the in-memory roster.
  - `participant_left`, `room_finished`: roster updates.
  - The roster is pushed to the room as `CallRoster(memberIds)` (coalesced through `LiveThrottle`), so people who have not joined see "12 in the call" and the people list shows who is in it. Never stored.
  - All other events are ignored with 200.
- **Rationale**: removal must hold even against an old refreshed pass. A short pass lifetime alone cannot close the gap because LiveKit refreshes passes for connected clients.
- **Alternatives**: no webhook and a very short pass (does not close the refresh gap); polling `ListParticipants` (a loop for nothing).

## R25. Client: `livekit-client`, pinned and lazy-loaded, our own UI

- **Package**: `livekit-client` **2.22.3** (exact pin, released 2026-09-07). Loaded with `import()` only when a person taps Join call, so the room page does not pay for it. Not `@livekit/components-react`: its prebuilt look does not fit circloo's design rules, and we need only tracks, active speakers and connection quality.
- **Room options**: `adaptiveStream: true` (a video receives the size of its tile and pauses when hidden), `dynacast: true`, `disconnectOnPageLeave: true`. Publish defaults: simulcast with two lower layers (180p and 360p) under a 720p capture on computers and 540p on phones, VP8 (widest support including iOS Safari), audio Opus with DTX and RED (redundancy that hides packet loss), `audioPreset: speech`. The perf task (T929) may switch iOS senders to H.264 if battery measurements call for it.
- **Grid**: pages of at most 9 tiles on a computer and 4 on a phone; a speaker view (one large tile and a strip) on demand. Order: active speaker, animator, floor holder, cameras on, then join order. Videos on other pages are switched off for this receiver (`setEnabled(false)`), so the call server stops sending them. All audio tracks play (silent ones cost nothing thanks to DTX). `room.startAudio()` runs inside the Join tap, so autoplay rules never block audio.
- **Signals**: `ActiveSpeakersChanged` (speaking label), `ConnectionQualityChanged` (Weak connection), `Reconnecting` / `Reconnected` / `Disconnected` (US4 #9), `ParticipantPermissionsChanged` (microphone button follows the speaking mode), `MediaDevicesError` mapped through the kept `classifyMediaError` in `media.ts`.
- **Device rule**: microphone and camera are requested one kind at a time, never together (R14 kept).

## R26. What the call server can see, and end-to-end encryption

- Media is encrypted between each browser and the call server (DTLS-SRTP). The SFU decrypts packets in memory to route them. It never writes them anywhere: LiveKit records only through a separate Egress service, which we do not deploy, and the configuration has no egress, ingress or SIP section. A test asserts the shipped configuration (SC-906).
- **End-to-end encryption** (LiveKit supports it with insertable streams) would hide media from our own server. Not now: it costs CPU on phones, needs a key exchange we would have to design, removes server-side quality decisions on some browsers, and protects against a server we run ourselves. It can be a later idea for enterprise circles.
- **Logs**: LiveKit logs member ids and, at debug level, network details. Production runs at `warn` with `pion_level: error`, journald keeps 3 days on the VM, and nothing is shipped to Application Insights. Residual risk recorded in the threat model.

## R27. The shipped mesh code: delete it, no fallback

- **Decision**: delete `mesh.ts`, `link.ts`, `fakes.ts` and their tests, `fetchIce` and the ICE types in `api/discussion.ts`, the `Seat`/`StageView`/`RecordingState` contract types, `Discussion:IceUrls` and the AppHost's `Discussion__IceUrls__0`. Keep `media.ts` (`classifyMediaError`, `mediaSupported`) and the store shell in `stage.ts`, rebuilt around the call engine.
- **Rationale**: a second media path doubles testing, cannot enforce the speaking mode on the server, exposes participants' IP addresses to each other, and needs a public STUN service. LiveKit already falls back to TCP and TLS. When the call server is down, the honest fallback is chat, hands and reactions.
- **Alternatives**: keep the mesh for small calls or as a fallback (two engines to keep working, two privacy stories).

## R28. ICE, STUN and TURN: LiveKit's own

- **Decision**: no third-party STUN or TURN. LiveKit answers ICE on a **single UDP port 7882** (`rtc.udp_port`, so the firewall opens one port, not a range), falls back to **ICE/TCP on 7881**, and runs its **embedded TURN**: TURN/UDP on 3478 and TURN/TLS on 443 of the second host name (Caddy terminates TLS and forwards to LiveKit's TURN listener with `external_tls: true`). `rtc.use_external_ip: false` with the VM's static IP set as `node_ip`.
- **Local**: no TURN; `node_ip` is `127.0.0.1` (or the machine's LAN address to test with a phone).
- **Rationale**: it removes the Cloudflare STUN disclosure (old D4) and solves strict networks (old D2) without a new service.

## R29. Content Security Policy and Permissions-Policy

- **Decision**: `connect-src` adds the call server's origins, built at start-up from `LiveKit:Url`: `wss://lk-…` and `https://lk-…` (the client calls `/rtc/validate` over HTTPS to explain a failed join). Locally `ws://localhost:7880` and `http://localhost:7880`. No `'unsafe-inline'`, no wildcard, no `worker-src` change (no end-to-end encryption worker). `media-src` is unchanged: a `MediaStream` in `srcObject` is not governed by it. `Permissions-Policy` stays as shipped: camera and microphone `self` on the two room routes, deny-all elsewhere and on the audience screen.
- A header test covers the three routes and the new `connect-src`. The e2e run fails on any CSP violation in the console.

## R30. Zero-cost development (constitution IX)

- **AppHost**: a container `livekit` from `livekit/livekit-server:v1.13.7`, configured by the `LIVEKIT_CONFIG` environment variable (the YAML body of `src/Circloo.AppHost/livekit.dev.yaml`, with the webhook URL and node IP filled in, so no file is mounted) and `LIVEKIT_KEYS` (`circloo-dev: <secret>`). The secret is an Aspire parameter generated once and persisted in the AppHost user-secrets, like the OTP pepper. Configuration: `port: 7880`, `bind_addresses: [0.0.0.0]`, `rtc.tcp_port: 7881`, `rtc.udp_port: 7882`, `rtc.node_ip: 127.0.0.1`, `rtc.use_external_ip: false`, `room.auto_create: false`, `room.enable_remote_unmute: false`, `webhook.api_key: circloo-dev`, `webhook.urls: [<api endpoint>/api/livekit/webhook]`, `logging.level: info`. No TURN.
- **Ports**: 7880/tcp (WebSocket and Twirp), 7881/tcp (ICE/TCP), 7882/udp (ICE/UDP). All three are fixed host ports with `isProxied: false`, because Aspire's proxy does not carry UDP and the browser needs the address that LiveKit advertises. Works with Docker and Podman.
- **API settings** from the AppHost: `LiveKit__Url=ws://localhost:7880`, `LiveKit__ApiUrl` = the container's HTTP endpoint, `LiveKit__ApiKey=circloo-dev`, `LiveKit__ApiSecret` = the generated parameter.
- **Configuration test**: `CallServerConfigTests` reads `src/Circloo.AppHost/livekit.dev.yaml` and `infra/livekit/livekit.yaml` and fails if either has an `egress`, `ingress` or `sip` section, or if `room.auto_create` or `room.enable_remote_unmute` is not false (SC-906).
- **Tests**: a Testcontainers fixture `LiveKitFixture` runs the same image with `--dev --bind 0.0.0.0` (the public dev key `devkey`/`secret`, fine inside a throwaway test container) for token validation and RoomService tests. The API test suite without that fixture uses a fake `ILiveKitRooms`.
- **Playwright**: Chromium with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` against the AppHost's LiveKit. `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` forces TCP to test the UDP-blocked path (SC-916).

## R31. Persistence: only chat is stored

- **Migration `GroupCallsLiveKit`**: drops `RecordingEvents` and `Recordings` (they were created by `20261006090000_LiveDiscussionStage` and are empty: no code ever wrote them), drops `Circle.DiscussionChangedAt` and `Circle.DiscussionChangedByMemberId` (they recorded who started a call and when), adds `Circle.DiscussionSpeaking` (`'hand'` or `'open'`, default `'hand'`). `Circle.DiscussionOn` and `Circle.DiscussionVideo` keep their names and mean "call on" and "video allowed", so the shipped switch keeps working. `CircleMessage.ReplyToId` stays (threads, R12).
- **Call lines in chat are live only**: the shipped `EnableDiscussion`/`DisableDiscussion` write `discussion:on`/`discussion:off` system rows today. They stop doing so; the hub sends a `CallNotice` event instead and the client draws a live line (US5 #3). Activity lines (`start:`, `end:`) are not call events and stay as they are.
- **In memory only**: animator mutes, camera stops, the removed set, the roster, the animator-away timer. Lost on an API restart (one replica; accepted in Complexity Tracking).
- **Spec 008 tables used as they are**: `RaisedHand` (a row exists only while a hand is up), `MessageLike`, `Circle.ChatMode`, `Circle.ReactionsOn`.
- **Audit (founder decision D10: animator actions only)**: `discussion.on` (call on, or a switch between audio and video), `discussion.off`, `call.mode`, `call.removed`, `discussion.refused`, with ids only. Never joins, speaking, the floor or mutes.

## R32. Performance targets and how they are measured

- **Join to first audio** (SC-903): the client marks the Join tap and the first `inbound-rtp` audio packet from `getStats()`; Playwright records it in 20 joins locally; the network test repeats it against the deployed node.
- **Decoding** (SC-912): the e2e test counts `inbound-rtp` video entries with `framesDecoded` increasing over 3 s and compares with the visible tiles.
- **Capacity** (SC-910, SC-911): `lk load-test` from the LiveKit CLI (container `livekit/livekit-cli`, pinned in the script) against the node: 100 subscribers with 6 audio publishers, then 25 video publishers with 75 subscribers, 5 minutes each, CPU sampled on the node. Run locally for a sanity check and on Azure for the numbers.
- **Weak networks** (SC-914): a Linux container with `tc netem` (loss 10% and 30%, delay 150 ms) runs a headless Chromium joined to a call; the script reads `concealedSamples / totalSamplesReceived` and video freeze counts from `getStats()`.
- **Phones** (SC-915): manual, two reference phones, 30 minutes, battery and smoothness noted in the PR. Nothing is claimed before it is run.

## R33. Reactions and hands in a call

- **Reactions**: spec 008's `React(kind)` and `Reactions(burst)` (T807, #181) are reused. The only change: they are allowed while a call is on, not only during a presentation. Outside a presentation nothing is counted or stored. While a presentation runs, reactions sent from the call count toward that presentation's anonymous totals per kind, like any other reaction (founder decision D11). Nothing says who reacted.
- **Hands**: spec 008's `RaiseHand`, `LowerHand`, `LowerAllHands`, `GiveFloor` and `Hands` are reused unchanged, with the permission side effects of R22 when a call is on. Lowering the floor holder's hand ends their turn ("take the floor"), so no new method is needed.

## R34. Animator away

- **Decision**: when the circle's last animator connection closes during a call, a timer starts (`Discussion:AwayEndSeconds`, 300 s), built like spec 008's `HandsGrace` on `TimeProvider`. If an animator connection returns, it is cancelled. When it fires, the call ends as if the animator ended it (reason `animator-away` in the audit), and the room shows "The animator ended the call". No freeze phase: in Hand to speak nobody new can get the floor anyway, and in Open mic people can keep talking until the end.
- **Alternatives**: keep the 60 s freeze (a state with little value now); let calls run without an animator (no moderator for up to hours, risky with children).

## Founder decisions

Answered on 2026-10-05: D1 to D4 (see the spec's Clarifications; D1, D2 and D4 are superseded, D3 is kept as the video switch). Answered on 2026-10-08: the call engine, the three switches, the speaking modes, persistence, emoji and hands (spec Clarifications). D5 and D7 concerned transcripts and are **obsolete**.

Answered on 2026-10-08 (also in the spec's Clarifications):

- **D6. Animator away**: the call ends after the animator has been away 5 minutes (R34).
- **D8. Production hosting**: one small Linux VM (R23, option C), B2als_v2 class in production, sized up only if T929 needs it. In the deployed dev environment, cost is minimised: `Standard_B2ats_v2`, a Standard HDD, one static IP (no TURN/TLS on 443), a nightly shutdown at 20:00 Paris time, started again by `scripts/deploy` or `scripts/calls-start`. `callsEnabled` stays false by default everywhere. Azure DNS labels for now. Local development stays the free container.
- **D9. Constitution**: a MINOR amendment through `/speckit-constitution` in its own PR and issue (task T930): the call server in Technology & Infrastructure Constraints, and the VM as an accepted exception to "production is one container" and to VII's preference for managed services. Not done in this branch.
- **D10. Audit scope**: animator actions only: call on and off, speaking-mode changes, removals, refused attempts. Never joins, speaking, the floor or mutes.
- **D11. Reaction totals**: reactions sent in a call while a presentation runs count toward that presentation's anonymous per-kind totals.

Nothing is open.
