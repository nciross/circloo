# Quickstart: validate live presentations (006)

How to prove the feature works end to end, locally and at zero cost. Details: [data-model](data-model.md),
[REST](contracts/rest.md), [hub](contracts/hub.md).

## Prerequisites

- Docker or Podman (`ASPIRE_CONTAINER_RUNTIME=podman`), .NET 10 SDK, Node 24.
- `dotnet run --project src/Circloo.AppHost` starts, in addition to Postgres and Mailpit: **Azurite** (`storage`)
  and **Gotenberg** (`converter`). The first start pulls `gotenberg/gotenberg:8` (~1.3 GB, once).
- Reference deck: `tests/fixtures/decks/circloo-demo.pptx` (12 slides, one hidden, speaker notes on slides 2 and 5,
  an Arabic slide, an animation and an embedded video).

## Scenario A: prepare (US1, US2)

1. Sign in, open **My presentations**, upload `circloo-demo.pptx`.
   Expect: progress up to 12/12 in under a minute, 12 thumbnails in order, slide 7 marked hidden, a one-time note
   "animations and media are shown as still pictures".
2. Upload `tests/fixtures/decks/encrypted.pptx`, `macro.pptm`, `fake.pptx` (a renamed PDF).
   Expect: three refusals with `encrypted`, `macros`, `not-pptx` messages in the current language.
3. Add a poll after slide 3 ("Where do we go for the team lunch?", 4 options, single choice) and a quiz after slide 8
   (4 options, one correct, 15 s). Reorder with the keyboard. Reload. Expect: both in place with their settings.

## Scenario B: present (US3–US6)

1. Create a circle with the **Presentation** activity; join it from two other browser profiles (phone size).
2. As the animator, start Presentation, pick the deck, then **Open audience screen** (new window).
   Expect: participants and the audience show slide 1; the audience shows the join QR; the presenter view shows notes
   on slide 2 and the next slide.
3. Arrow through to the poll; **Open**. Participant A answers, then changes; B answers.
   Expect: animator and audience see "2 of 2", never counts; A's answer counts once.
4. **Reveal**. Expect on all screens within a second: bars, counts, percentages summing to 100, the winner marked,
   spotlight "A, x.x s" (A answered first, even though A changed their answer).
5. Go to the quiz; **Open**; B answers correctly fast, A correctly slower; wait for the timer.
   Expect: answers lock at 0 s by themselves; **Reveal** shows the correct option (icon + label, not only colour),
   the first-correct spotlight on B, each phone shows right/wrong and points.
6. **Podium**. Expect: B first, A second, each phone shows its own rank.
7. Turn on reduced motion in one participant browser and repeat a reveal: final results appear at once.
8. Reload a participant mid-question: they land on the open question with their answer marked.

## Automated checks

```bash
dotnet test                                   # API: deck validation, conversion (fake + Gotenberg container), hub rules
cd src/web && npm run lint && npm test        # reveal maths, countdown, reducers
cd src/web && E2E_BASE_URL=<web> npx playwright test e2e/presentations.spec.ts   # en + ar, axe, reduced motion
```

Expected: all green; the e2e covers scenarios A1, A3, B2–B6 in English (desktop) and Arabic (phone).
