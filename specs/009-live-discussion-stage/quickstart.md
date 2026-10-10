# Quickstart: validate group calls (spec 009, amended 2026-10-08)

## Prerequisites

- Docker or Podman, the .NET 10 SDK and Node 22. No cloud service and no real camera are needed for A and B.
- Local stack: `dotnet run --project src/Circloo.AppHost`. It starts a `livekit` container (`livekit/livekit-server:v1.13.7`) on fixed ports **7880/tcp** (WebSocket and API), **7881/tcp** (ICE over TCP) and **7882/udp** (media). Free them first. The LiveKit secret is generated once into the AppHost user-secrets.
- To test with a phone on the same Wi-Fi, set the AppHost parameter `livekit-node-ip` to the computer's LAN address (default `127.0.0.1`).
- Playwright browsers: `npx playwright install chromium` in `src/web`.
- Spec 008 T807, T808 and T810 must be merged before the reactions and hands parts (US8, US3 in the call), and T806 before the threads (US5).

## A. Automated checks

```powershell
dotnet test tests/Circloo.Api.Tests --filter "FullyQualifiedName~Discussion"   # includes the LiveKit Testcontainers fixture
cd src/web; npx tsc -b; npm run lint; npx vitest run
$env:E2E_BASE_URL='http://localhost:5173'; $env:MAILPIT_URL='http://localhost:8025'
npx playwright test e2e/call.spec.ts              # en desktop + ar phone, fake devices, axe, local LiveKit
$env:E2E_CALL_PEERS='12'; npx playwright test e2e/call.spec.ts -g "measurements"   # before a release
```

Expected: everything passes. The e2e uses `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream`. The UDP-blocked case adds `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`. Device failures come from an init script that rejects `getUserMedia`.

## B. Manual walk-through with fake devices

Start Chromium for each person with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`, so a test pattern and a beep stand in for camera and microphone. One animator and three guests (Amina, Youssef, Lucía); put one guest in Arabic.

1. **Switches (US1).** A new circle shows no call control to guests. The animator sees Chat, Audio call and Video call. Start a **video call** in **Hand to speak**: guests see Join call within a second, and no permission prompt has appeared. A guest runs `connection.invoke('DisableDiscussion')` in the console: refused with `animator-only`.
2. **Join (US2).** All three guests join. Each hears the animator's beep within 2 seconds. The animator speaks: their tile and name show "speaking".
3. **Hand to speak (US3).** Amina's microphone button is replaced by Raise hand. (A forced publish with her real pass is refused by the call server; the e2e test "hand to speak is enforced" proves it with a script that connects with the pass directly. No debug handle exists in the app.) She raises a hand; the animator gives her the floor; she switches her microphone on and is heard. The animator gives the floor to Youssef: Amina is muted and told so kindly.
4. **Open mic (US3).** The animator switches to Open mic: everyone can unmute. Mute everyone: all microphones go off, and people can unmute again.
5. **Moderation (US3).** The animator stops Lucía's camera: it stops for everyone within a second and she cannot switch it back on until allowed. The animator removes Youssef: he leaves the call, keeps the chat, and Join call answers "You can't rejoin this call". Reconnect his old tab: he is removed again. Allow him back: he can join.
6. **Video off (US1).** The animator switches video off: every camera stops within 2 seconds, audio continues.
7. **Fallbacks (US4).** Deny the microphone for one guest: they see how to allow it again and still listen, chat and react. Disable the camera device: audio only, the tile shows the character and name. Restart a guest's browser with `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`: they still join (over TCP). Stop the `livekit` container for 10 seconds and start it again: everyone sees "Reconnecting…" and comes back.
8. **Chat (US1, US5).** The animator pauses the chat: guests read "The animator paused the chat". Post and reply: the reply nests. The live lines "Call started", "Amina has the floor" appear; reload the page: they are gone, the messages stay.
9. **Reactions (US8).** Tap 👏 from three guests: one grouped burst on every screen.
10. **Pages (US2).** With `E2E_CALL_PEERS=12` (or 12 tabs), the computer shows 9 tiles and a page control; a phone-sized window shows 4. The active speaker is always on screen.
11. **Away (edge).** Close the animator's tabs: after 5 minutes the call ends for everyone.
12. **Projector.** Open `/app/circles/<id>/audience`: it shows the hand count and reactions, no names, no video, no sound.
13. **Nothing stored.** After the call, check the database: no row about the call except chat messages and the audit rows `discussion.on`, `discussion.off`, `call.mode`, `call.removed` and refusals. No `Recordings` table exists.
14. **Arabic.** Repeat 1 to 3 in Arabic on a phone-sized window: grid, controls, queue and menus mirror, and mixed-direction names stay readable.

## C. Real devices and the deployed call server (before release, needs T917)

Two laptops and two phones (an iPhone with Safari and a mid-range Android with Chrome) on different networks (home Wi-Fi, mobile data, and one office network that allows only web traffic), against the deployed environment. Check:

- join to first audio under 2 seconds on normal networks;
- the office network connects through TLS on 443;
- a 30-minute video call with 4 tiles on each phone: smooth chat scrolling; battery use recorded;
- network throttling in the browser's dev tools lowers video quality first while audio continues, with "Weak connection".

Then run the load and network test (`tests/perf/`, T929) against the node and record CPU, join times and audio concealment in the PR. SC-909 (an animator who never used it succeeds alone) is checked in one session with 5 to 10 people. No result is claimed until it is run.

## D. Checks that must hold in every run

- No audio, video or call event is stored; only chat (SC-906).
- The call server's configuration has no egress, ingress or SIP section and `room.enable_remote_unmute` is false.
- The browser console shows no CSP violation during a call.
- Server logs contain no tokens, no message text and no media.
