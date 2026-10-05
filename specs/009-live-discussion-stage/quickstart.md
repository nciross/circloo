# Quickstart: validate the live discussion stage (spec 009)

## Prerequisites

- Docker or Podman, the .NET 10 SDK and Node 22. No cloud service and no real camera are needed for A and B.
- Local stack: `dotnet run --project src/Circloo.AppHost`, or the isolated e2e containers with the API and Vite run from the branch. The AppHost leaves `Discussion__IceUrls__0` blank, so calls use host candidates and need no internet.
- Playwright browsers: `npx playwright install chromium` in `src/web`.
- Spec 008 tasks T804, T805, T806, T809 and T810 must be merged first (see plan "Dependencies on spec 008").

## A. Automated checks

```powershell
dotnet test tests/Circloo.Api.Tests --filter "FullyQualifiedName~Discussion"
cd src/web; npx tsc -b; npm run lint; npx vitest run
$env:E2E_BASE_URL='http://localhost:5173'; $env:MAILPIT_URL='http://localhost:8025'
npx playwright test e2e/discussion.spec.ts          # en desktop + ar phone, fake devices, axe
$env:E2E_STAGE_PEERS='8'; npx playwright test e2e/discussion.spec.ts -g "stage of eight"   # before a release
```

Expected: everything passes. The e2e uses `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream`; the denial, no-device and busy stories use an init script that rejects `getUserMedia`.

## B. Manual walk-through with fake devices

Start Chromium for each person with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`, so a green test pattern and a beep stand in for camera and microphone. Use one animator and three guests (Amina, Youssef, Lucía); put one guest in Arabic.

1. **Switch (US1).** A new circle shows no discussion controls to anyone. The animator opens room settings and switches **Live discussion** on: the guests see the Discussion area within a second, everyone is muted with video off, and no browser permission prompt has appeared. A guest tries to switch it off through the browser console (`connection.invoke('DisableDiscussion')`): refused with `animator-only`, nothing changes.
2. **Hands (US2).** All three guests raise a hand. Everyone sees the queue in order with names; Youssef lowers his and the gap closes; each guest hears or reads their own place.
3. **Floor (US3).** The animator gives Amina the floor. She is told she is on stage and sees the one-sentence primer. After Continue, the browser asks for the microphone. Once on, the others hear the beep. The animator mutes her: her audio stops for everyone and she reads "The animator muted you"; she cannot unmute until the animator allows it. She leaves the stage and is back in the audience.
4. **Cap.** Set `Discussion__StageMax=2`, give the floor to a second guest and then a third: the animator reads "The stage is full".
5. **Fallbacks (US4).** Deny the microphone for one guest: they see how to allow it again, and chat and hands still work. Disable the camera device: audio only, the tile shows their character and name. Use a browser without WebRTC (or `delete window.RTCPeerConnection` in an init script): they read the plain message and everything else works.
6. **Conversation (US5).** Post a message, reply to it: the reply nests under it. The animator hides a message: it disappears for members.
7. **Recording (US6).** The animator taps **Record session**. Everyone sees the notice and the "Recording (text only)" indicator; capture starts a few seconds later. A guest who joins now sees the indicator before they can type. A guest tries `connection.invoke('StartRecording')`: refused. Chat, raise a hand, put someone on stage. Stop. The animator opens the transcript: messages, hands, stage events with times. Export Markdown and text; delete the transcript.
8. **Away (edge).** Close the animator's tab: after 60 s the room says "The animator is away"; after 5 minutes it ends the discussion and the recording is saved.
9. **Projector.** Open `/app/circles/<id>/audience`: it shows only the recording indicator and "n hands up", never names or video.
10. **Arabic.** Repeat steps 1 to 3 and 7 in Arabic on a phone: the stage, controls, notice, indicator and transcript are mirrored, and names of mixed direction stay readable.

## C. Real devices (before the feature is released)

Two laptops and one phone on different networks (home Wi-Fi and mobile data), real camera and microphone. Check that:

- audio and video flow both ways on a normal network within 3 seconds;
- a person behind a strict network gets "Can't connect to <name>. Chat and hands still work" and keeps chat and hands (this is the TURN question, decision D2);
- turning the camera off shows the character and name, not a black square;
- throttling the network (browser dev tools) makes the video stop first while the audio continues, with "Weak connection";
- Safari on iOS can listen, raise a hand and speak with the microphone.

Record the result in the PR of the journey task (T915). SC-909 (an animator who has never used it succeeds alone) is checked in one session with 5 to 8 people; no result is claimed until it is run.

## D. Checks that must hold in every run

- No audio or video bytes are stored: the `RecordingEvents` table has only the columns in `data-model.md`, and server logs of a call contain no SDP, ICE or message text.
- The recording indicator is visible on desktop, phone, with the sidebar collapsed, and on the audience screen, in English and Arabic.
- The browser console shows no CSP violation during a call.
