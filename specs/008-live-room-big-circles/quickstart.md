# Quickstart: validate the live room for big circles (spec 008)

## Prerequisites

- Docker or Podman, the .NET 10 SDK and Node 22.
- Local stack: `dotnet run --project src/Circloo.AppHost`, or the isolated e2e containers (Postgres, Mailpit, Azurite, Gotenberg) with the API and Vite run from the branch.
- Playwright browsers: `npx playwright install chromium` in `src/web`.

## A. Automated checks

```powershell
dotnet test tests/Circloo.Api.Tests --filter "FullyQualifiedName~LiveRoom|FullyQualifiedName~Join"
cd src/web; npx tsc -b; npm run lint; npx vitest run
$env:E2E_BASE_URL='http://localhost:5173'; $env:MAILPIT_URL='http://localhost:8025'
npx playwright test e2e/live-room.spec.ts            # en desktop + ar phone, with axe
```

Expected: every test passes. The e2e covers the steps below that a browser can drive.

## B. Manual walk-through

1. **Big circle and shared characters (US1).** Create a circle and join it with 15 guests (the load test can seed them, see C). Have 3 of them pick the fox.
   - Each fox shows a different ring, and their names show next to them.
   - Set `Circles__MaxPeople=16`, then try 2 more joins: the 17th person sees "This circle is full".
2. **Sidebar (US2).** On a laptop the slide or board keeps at least 2/3 of the width, and the sidebar lists people online first. Searching "fo" filters the list, and collapsing the sidebar widens the main area. On a phone you get a bottom sheet with People and Chat tabs, and it never covers the answer buttons.
3. **Chat (US3).**
   - During a presentation, the chat is open: send messages with emoji and like someone's message.
   - The animator turns on slow mode: a participant sees the wait time. The animator pauses the chat: participants see "The animator paused the chat".
   - An unkind message is refused.
4. **Reactions (US4).**
   - Ten phones tap 👏 quickly. Every screen, the projector included, shows a short burst that ends in "👏 ×10", and the slide stays readable.
   - A phone with reduced motion shows a counter only.
   - After ending, the circle's results show "Reactions: 👏 10".
5. **Hands (US5).**
   - Three participants raise their hands. Everyone sees the queue in order, and each of the three sees their own place.
   - The animator gives the floor to the first. Everyone sees who is speaking and who is next, and the projector shows only "2 hands up".
6. **Pirikoo (US6).**
   - The animator sees Pirikoo's bubble "Amina would like to speak". Pressing "Give the floor" in the bubble works.
   - A reaction burst makes Pirikoo cheer once.
   - With Pirikoo muted it stays still. Participants never see "Your turn! One sentence in the chat" during a presentation.
7. **Arabic.** Repeat steps 2–5 in Arabic on a phone: the sidebar or sheet is mirrored, and the queue and chat read from the right.

## C. Load test (US7, SC-802/803)

```powershell
# API and web running locally; join and OTP rate limits raised as for e2e
dotnet run --project tests/Circloo.LoadTest -- --base https://localhost:<api-port> --mailpit http://localhost:8025 --participants 100 --slides 10
```

Expected output: the median and p95 time for a slide change to reach the 100 clients (median < 1 s, p95 < 2 s), the same for chat and reaction bursts, the answer count reaching 100, and the API's CPU and memory. Paste the summary into `specs/008-live-room-big-circles/load-results.md` with the date and machine.
