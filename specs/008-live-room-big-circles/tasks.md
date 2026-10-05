---

description: "Tasks for the live room for big circles (spec 008)"
---

# Tasks: Live room for big circles: sidebar, chat, reactions, raised hands and 100 people

**Input**: Design documents from `specs/008-live-room-big-circles/`: plan, spec, research, data-model, contracts and quickstart.

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/hub.md, contracts/rest.md

**Tests**: required by the constitution (VI). Every task ships its API tests (xUnit + Testcontainers). UI tasks also ship their Playwright journey in `en` (desktop) and `ar` (phone) with axe.

**Organization**: one task = one GitHub task issue = one PR (repo convention). IDs use the 8xx range of this spec. Paths follow plan.md: API in `src/Circloo.Api`, tests in `tests/Circloo.Api.Tests`, web in `src/web`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel with the other [P] tasks of the same phase (different files, no dependency)
- **[Story]**: user story from spec.md (US1–US7)

---

## Phase 1: Setup (Shared Infrastructure)

No setup task. The only new project, the load test, belongs to US7 (T813).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the data, records and room plumbing that every story builds on.

- [x] T801 Live room foundation: **migration and entities.** Migration `src/Circloo.Api/Data/Migrations/*_LiveRoomBigCircles.cs` with entities in `src/Circloo.Api/Data/Entities.cs` and `CirclooDbContext.cs`, exactly as `data-model.md`: (#175)
  - `CircleMember.Ring` "int, 0–5; 0 for every existing member". The unique index `(CircleId, Character)` filtered on `LeftAt IS NULL` is replaced by a unique `(CircleId, Character, Ring)` with the same filter.
  - `Circle.ChatMode` "`open` \| `slow` \| `paused`, default `open`", `ReactionsOn` "default true" and `PirikooQuiet` "default false".
  - `CircleMessage.HiddenAt` (nullable). Likes are not stored on the message: they are counted from `MessageLike` when read.
  - New `MessageLike`: unique `(MessageId, MemberId)`, cascade from the message.
  - New `RaisedHand`: unique `(CircleId, MemberId)`, a partial unique index on `CircleId` where `HasFloor`, cascades.
  - `PresentationSession.ReactionTotals` "jsonb, default `{}`".

  **Records and options.**
  - `src/Circloo.Api/Circles/CircleOptions.cs` (`Circles:MaxPeople`, default 100, validated 2–144 at start-up; the effective capacity never exceeds the character/ring pairs in use), replacing `CircleAccess.MaxPeople = 12`.
  - Records `RoomSettings`, `HandsView` and `ReactionBurst` in `src/Circloo.Api/Circles/CircleRules.cs`. `MemberDto` gains `Ring`; `MessageDto` gains `Likes`, `Liked` and `Hidden`.
  - `src/Circloo.Api/Circles/RoomLimits.cs`: a singleton with per-member sliding windows, `TryTake(memberId, kind, max, window)`.

  **Presence.** It is coalesced through `LiveThrottle` (`presence:{circleId}`, 250 ms) in `Enter` and `OnDisconnectedAsync` (R5). `Enter` keeps returning the online list.

  **Web types.** `src/web/src/api/circles.ts` gains `ring`, `likes`, `liked`, `hidden`, `settings`, `hands` and `reactionTotals`.

  **Tests.**
  - `tests/Circloo.Api.Tests/LiveRoom/FoundationTests.cs`: the migration applies to a database with members from before this change (rings = 0); the new unique indexes hold under parallel inserts; `RoomLimits` windows work on a fake `TimeProvider`.
  - The same file checks that 30 connections entering within 100 ms produce at most a handful of `Presence` broadcasts.

**Checkpoint**: the migration applies, existing circles behave as before, and presence is coalesced.

---

## Phase 3: User Story 1 - A circle holds up to 100 people (Priority: P1) 🎯 MVP

**Goal**: 100 people per circle (configurable), with shared characters told apart by rings (spec US1).

**Independent Test**: 60 guests join one circle. Five pick the fox, each with a different ring and their name. With the cap set lower, the next join gets `circle-full`.

- [x] T802 [US1] **Join for big circles.** Everything in `src/Circloo.Api/Circles/CircleEndpoints.cs` per `contracts/rest.md`: (#176)
  - `POST /api/join/{code}` runs in one transaction under `SELECT … FOR UPDATE` on the circle row, counts active members against `Circles:MaxPeople` and returns `409 circle-full` (R2).
  - Optional `ring` (0–5). Without it, the lowest free ring of the character is assigned. On a unique violation it retries with the next free ring. `409 character-full` when all 6 rings are taken. Leaving frees the ring.
  - `GET /api/join/{code}` returns `characters: { id, used, freeRings }[]` and `full`.
  - Circle creation gives the animator ring 0.
  - Join rate limits in `src/Circloo.Api/Security/RateLimits.cs` (R4): `CircleJoinsPerIpPer10Min` 300, plus a new per-IP-and-code limit of `MaxPeople + 20` per 10 min, both configurable.
  - Tests in `tests/Circloo.Api.Tests/LiveRoom/JoinTests.cs`:
    - 110 parallel joins with a cap of 100: exactly 100 active members and 10 `circle-full`;
    - 7 people pick the fox: rings 0–5 are used and the 7th gets `character-full`;
    - a freed ring is reused;
    - an explicit ring that is already taken falls back to a free one;
    - the per-IP limit at 300 and the per-code limit.

  Depends on T801.
- [x] T803 [US1] **Shared characters in the UI.** (#177)
  - `src/web/src/components/Character.tsx` gains a `ring` prop: ring 0 draws no ring; rings 1–5 draw a 3 px outline in ring tokens (≥ 3:1 against light, dark and projector surfaces) plus an index dot, so it is not colour alone. Tokens go in `src/web/src/styles/tokens.css`.
  - `src/web/src/features/circles/JoinCircle.tsx` shows the use count per character, the assigned ring with a way to pick another free ring, and a full character as unavailable.
  - Every place that shows a member's character passes their `ring` and shows or announces their name: people, chat, answer progress, spotlight, raised hands. The room's member list and the projector's join card handle 100 entries.
  - `useJoin` in `src/web/src/api/circles.ts` sends `ring` and reads the `ring` in the answer: the server may assign another free ring, and the screen shows and announces the ring actually given. The join screen is driven by `characters[].used` and `freeRings` (not `taken`), refetches on `circle-full` too, and rewords `circles.join.errors.taken` for "every copy of this character is taken".
  - `MemberJoined` already carries `ring`: the room's member list shows it.
  - Strings `circles.join.*` in all four locales.
  - Impeccable shape plus audit/critique on the PR. While the plugin is unavailable, the ux-designer review is recorded instead (#126).
  - e2e `src/web/e2e/live-room.spec.ts` "big circle": 15 guests, 3 foxes with distinct rings and names, the cap reached with `Circles__MaxPeople=16`, en + ar with axe. Raise the join limits for local e2e in `src/Circloo.AppHost/AppHost.cs` (`RateLimits__CircleJoinsPerIpPer10Min`, `RateLimits__CircleJoinsPerIpAndCodePer10Min`), as is done for the OTP limits.

  Depends on T802.

**Checkpoint**: a circle of 100 with shared characters works on its own.

---

## Phase 4: User Story 2 - The room sidebar (Priority: P1)

**Goal**: people and chat in a collapsible inline-end sidebar on wide screens, and a bottom sheet on phones (spec US2).

**Independent Test**: a laptop presenting to 40 people keeps the slide at ≥ 2/3 width. Search finds Amina, and collapsing widens the slide. On a phone you get a bottom sheet with People and Chat.

- [x] T804 [US2] **Room layout.** (#178)
  - `src/web/src/features/circles/room/RoomSidebar.tsx`:
    - ≥ 960 px: 320–360 px on the inline end, collapsible, the choice kept in `localStorage`, with a collapsed handle showing unread messages and raised hands;
    - < 960 px: a bottom sheet with People and Chat tabs, half height by default, expandable, closable, and never covering the answer pad or the presenter controls (FR-807).
  - `src/web/src/features/circles/room/PeopleList.tsx`: online first, then away; character with ring and name; the animator marked by an icon and a label; a "n here · m away" summary; search by name; virtualised or windowed past 50 rows.
  - `src/web/src/features/circles/CircleRoom.tsx`: a single grid with the main area and the sidebar for every activity, the presenting layout included. Update the `.is-presenting` / `.is-following` grids from spec 006 in `src/web/src/styles/present.css`. Retire `PeopleRing` in the room; keep it on join and landing.
  - Reuse the existing `Chat` inside the sidebar.
  - `src/web/src/styles/room.css` with logical properties. Strings `circles.room.*` in all four locales.
  - Impeccable shape plus audit/critique (or the ux-designer review).
  - e2e "sidebar": slide width ≥ 2/3, search, collapse remembered after a reload, phone sheet tabs, the sheet never covering the answer pad, Arabic mirrored. en + ar with axe.

  Depends on T801.

---

## Phase 5: User Story 3 - Instant chat with emoji while presenting (Priority: P1)

**Goal**: chat on by default while presenting, with likes, hiding, pause and slow mode, readable with 100 people (spec US3).

**Independent Test**: five participants chat with emoji and likes during a presentation. The animator pauses the chat, then turns on slow mode (one message per 10 s). An unsafe message is refused.

- [x] T805 [P] [US3] **Chat hub.** (#179)
  - `Say` limits in `src/Circloo.Api/Circles/CircleHub.cs` per `contracts/hub.md`:
    - participants get 5 per 10 s through `RoomLimits` (`slow-down`);
    - `ChatMode = slow` allows one per 10 s, counted from the member's last stored message (`slow-mode:<secondsLeft>`);
    - `ChatMode = paused` refuses with `chat-paused`;
    - the animator is exempt.
  - New partial `src/Circloo.Api/Circles/CircleHub.Room.cs`:
    - `LikeMessage` (toggle; `own-message`, `message-hidden`; count the likes; `MessageLikes` coalesced 250 ms per message; `MyLike` to the member group);
    - `HideMessage(id, hidden)` (animator; `MessageHidden` to the circle group, which animator clients ignore, and `Message` with `hidden` to the animator group); hidden messages are also left out of the coach's AI context and the report (done in T801);
    - `SetRoomSettings` (animator; `settings-invalid`; broadcast `RoomSettings`).
  - Settings reset to the defaults (open, reactions on, not quiet) on `StartActivity`, `EndActivity`, `StartPresentation` and `EndPresentation`, with a `RoomSettings` broadcast. Slow mode also takes `RoomLimits.TryTake(member, "slow", 1, 10 s)`, so two tabs sending at once cannot both pass. `Enter` pushes `RoomSettings`.
  - Circle view: messages with `likes`, `liked` and `hidden` (hidden ones only for the animator), plus `settings`.
  - Audit `chat.paused`, `chat.slow` and `message.hidden`, with ids only.
  - Tests in `tests/Circloo.Api.Tests/LiveRoom/ChatTests.cs`:
    - the limit across two tabs of one member;
    - slow mode survives a reload (a new connection);
    - pause refuses participants, not the animator;
    - unsafe messages are refused in en, fr, ar and es (the safety filter's test set, SC-808; kids-safe stricter);
    - a connection that is not a member of the circle is refused on `Say`, `LikeMessage`, `HideMessage` and `SetRoomSettings` (FR-830);
    - parallel likes from one member leave one row and a correct count;
    - own-message refused;
    - hidden messages never reach a member through events or the view;
    - settings reset on activity change and when a presentation ends.

  Depends on T801.
- [ ] T806 [US3] **Chat UI.** (#180)
  - `src/web/src/features/circles/room/ChatPanel.tsx` wraps `Chat`:
    - groups a sender's consecutive messages under one name with character and ring;
    - like button with count and "you liked" by icon and label;
    - the animator's hide/unhide;
    - "The animator paused the chat" and the slow-mode countdown in the composer;
    - no scroll jump while reading older messages, with a "New messages" button;
    - batched polite announcements ("3 new messages") from `src/web/src/features/circles/room/grouping.ts` with `grouping.test.ts`.
  - `src/web/src/features/circles/room/RoomSettings.tsx`: animator controls for the chat (open / slow / paused) and reactions on/off, in the presenter view and the room.
  - Hub events and actions in `src/web/src/features/circles/room.ts`; the message handler becomes an upsert by id that keeps id order, so hide/unhide and like updates replace the message instead of being dropped. Strings `circles.chat.*` in all four locales.
  - Impeccable shape plus audit/critique (or the ux-designer review).
  - e2e "chat": send with emoji, like, pause, slow mode, hide, unsafe refused. en + ar with axe.

  Depends on T804, T805.

---

## Phase 6: User Story 4 - Emoji reactions over the slide (Priority: P2)

**Goal**: grouped, rate-limited reactions on every screen, the projector included. Totals go in the results (spec US4).

**Independent Test**: 40 phones tap 👏 within 2 s. Every screen shows a short burst ending in "👏 ×40" with at most 12 moving emoji. The results show "Reactions: 👏 40".

- [ ] T807 [P] [US4] **Reactions hub.** (#181)
  - `React(kind)` in `src/Circloo.Api/Circles/CircleHub.Room.cs`:
    - kinds "`clap heart laugh wow like party`" (`reaction-invalid` otherwise);
    - silently dropped when reactions are off or the member is over 5 per 10 s (`RoomLimits`).
  - `src/Circloo.Api/Circles/ReactionBuffer.cs`: per-circle counts, flushed every 400 ms through `LiveThrottle` (`reactions:{circleId}`; `LiveThrottle` gains an optional per-key window, since its 250 ms default is fixed). Each flush sends a `Reactions(burst)` to the circle group (the audience screen included) and adds the burst to the running session's `ReactionTotals` with a single SQL update.
  - `reactionTotals` of the latest session in the circle view.
  - One "Reactions: 👏 42 · ❤️ 18 …" line per presentation in `src/Circloo.Api/Integrations/CircleReport.cs`, rendered by `Senders.cs`, with no names.
  - Tests in `tests/Circloo.Api.Tests/LiveRoom/ReactionTests.cs`:
    - 100 reactions from 20 members within 1 s produce at most a few `Reactions` events whose counts sum correctly;
    - the per-member limit;
    - reactions off;
    - the totals are persisted and appear in the report;
    - no member id in any payload;
    - a connection that is not a member of the circle is refused (FR-830).

  Depends on T801.
- [ ] T808 [US4] **Reactions UI.** (#182)
  - `src/web/src/features/circles/room/ReactionBar.tsx` under the slide for participants and the animator: 6 buttons ≥ 44 px, labelled, hidden when reactions are off.
  - `src/web/src/features/circles/room/ReactionLayer.tsx` over the slide stage:
    - floats from the bottom edge, fades in about 2 s;
    - at most 12 moving at once, the rest feeding a grouped "×n" counter;
    - never over the presenter controls or the answer buttons;
    - under reduced motion, a static counter beside the slide;
    - screen-reader summary at most every few seconds ("12 applause, 3 hearts").
  - The same layer on `src/web/src/features/circles/present/AudienceScreen.tsx` with the projector palette.
  - Strings `circles.reactions.*` in all four locales.
  - Impeccable shape plus audit/critique (or the ux-designer review).
  - e2e "reactions": a burst from 5 pages, the grouped count on the presenter, a phone and the projector, a reduced-motion counter, reactions off. en + ar with axe.

  Depends on T804, T807.

---

## Phase 7: User Story 5 - Raise a hand to speak (Priority: P2)

**Goal**: a fair queue everyone sees, with the floor given by the animator. The projector shows the count only (spec US5).

**Independent Test**: three hands go up and everyone sees the queue in order. The animator gives the floor, everyone sees who is speaking and who is next, and the projector shows "2 hands up".

- [x] T809 [P] [US5] **Hands hub.** (#183)
  - `RaiseHand` (participants; `animator-cannot-raise`), `LowerHand(memberId?)` (yourself, or anyone for the animator; `animator-only`), `LowerAllHands`, `GiveFloor(memberId)` (`hand-invalid`) in `src/Circloo.Api/Circles/CircleHub.Room.cs`.
  - The `Hands(view)` event goes to the circle group, ordered by `RaisedAt` then `Id`, with `floor`.
  - Clean-up: lower on leaving the circle, and 30 s after the member's last connection closed unless they came back (grace period); clear all on `StartActivity`, `EndActivity` and `EndPresentation`. `GiveFloor` deletes the previous floor row and marks the new one in one transaction, mapping a unique violation (two animator tabs) to a retry.
  - `Enter` pushes `Hands`; `hands` in the circle view.
  - Audit `hands.cleared`.
  - Tests in `tests/Circloo.Api.Tests/LiveRoom/HandsTests.cs`:
    - parallel raises by one member leave one row;
    - the order is kept;
    - giving the floor lowers the speaker's hand and moves the floor;
    - giving the floor to someone who lowered their hand gets `hand-invalid`;
    - a disconnect lowers the hand after the grace period, and a reconnect within it keeps the place;
    - a connection that is not a member of the circle is refused on every hands method (FR-830);
    - an activity change and the end of a presentation clear the hands;
    - only the animator lowers others.

  Depends on T801.
- [ ] T810 [US5] **Hands UI.** (#184)
  - `src/web/src/features/circles/room/HandsQueue.tsx`:
    - "Raise hand" / "Lower hand" for participants, with their place shown ("You are 3rd");
    - the full queue in order with character, ring and name for everyone (clarification 2);
    - for the animator: waiting time per hand, "Give the floor", lower one, lower all;
    - "Amina is speaking · Kenji is next" for everyone.
  - A waving character in `PeopleList.tsx` for raised hands; reduced motion shows a static hand icon.
  - The projector shows "n hands up" only, in `AudienceScreen.tsx`.
  - Announcements: one per hand for the animator (grouped when several arrive together), and each participant's own place when it changes.
  - Strings `circles.hands.*` in all four locales.
  - Impeccable shape plus audit/critique (or the ux-designer review).
  - e2e "hands": raise ×3, order, give the floor, lower all, the projector count only. en + ar with axe.

  Depends on T804, T809.

---

## Phase 8: User Story 6 - Pirikoo announces hands and cheers (Priority: P3)

**Goal**: Pirikoo bubbles for raised hands, one cheer per burst, mutable, and no nudges while presenting (spec US6).

**Independent Test**: a raised hand shows Pirikoo's bubble on the animator's screen, and "Give the floor" works from it. Twenty 😂 make Pirikoo laugh once. When muted, only the bubble shows. Participants never see "Your turn!" while presenting.

- [ ] T811 [US6] **Pirikoo in the live room.** (#185)
  - `src/web/src/features/pirikoo/tips.ts` returns no participant nudges while the activity is `presentation` (FR-825).
  - `src/web/src/features/pirikoo/HandBubble.tsx`, on the animator's connections only:
    - a bubble from `Hands` events, grouped when several hands go up within 2 s ("3 people would like to speak");
    - a "Give the floor" action calling `GiveFloor`;
    - it closes by itself after a few seconds.
  - Cheers derived from `Reactions` bursts (clap / laugh / heart / wow), at most one every 10 s.
  - Pirikoo is positioned so it never covers the slide, the answer buttons or the presenter controls.
  - `PirikooQuiet` from `RoomSettings` stops the moves but keeps the bubbles. Under reduced motion Pirikoo never flies.
  - The toggle lives in `RoomSettings.tsx`.
  - Strings `pirikoo.room.*` in all four locales.
  - Impeccable shape plus audit/critique (or the ux-designer review).
  - e2e "pirikoo": the bubble and give the floor, grouped bubbles, a cheer once, quiet, no nudge for participants while presenting. en + ar with axe.

  Depends on T806, T808, T810.

---

## Phase 9: User Story 7 - 100 phones stay smooth (Priority: P1)

**Goal**: measured proof that 100 participants get every update fast enough, with production kept awake (spec US7, FR-826–828, FR-831).

**Independent Test**: the load test reports a median below 1 s and a p95 below 2 s for slide changes, chat and reaction bursts with 100 simulated participants.

- [ ] T812 [P] [US7] **Production stays awake** (azure-infra): a `webMinReplicas` parameter for the `web` container app in `infra/modules/app.bicep`, set in `infra/main.bicep` to 1 when `environmentName` is `prod` and 0 otherwise, overridable with the azd environment variable `CIRCLOO_WEB_MIN_REPLICAS` (R12). (#186)
  - `maxReplicas` stays 1.
  - `az bicep build --file infra/main.bicep` must pass in CI.
  - `docs/architecture/overview.md` notes the always-on replica, its cost and the single-replica limit.
  - The PR states the monthly cost.

  Depends on nothing.
- [ ] T813 [US7] **Load test:** a new console project `tests/Circloo.LoadTest/Circloo.LoadTest.csproj` (not referenced by `dotnet test`) using `Microsoft.AspNetCore.SignalR.Client`, per R11. (#187)
  - **Sequence:**
    1. Sign the animator in through Mailpit and create a circle.
    2. Upload `src/web/e2e/fixtures/circloo-demo.pptx`, then add a poll and a quiz.
    3. Join `--participants` guests (default 100) over HTTP and connect them over WebSockets.
    4. Start the presentation, do `--slides` moves (default 10), open and answer the poll and the quiz, send 2 chat messages each, and send reaction bursts.
  - **Measurement:**
    - the per-client receipt time of each `PresentationState`, `Message`, `Reactions`, `Hands` (on the animator, SC-807) and `AnswerCount` / revealed results (FR-826);
    - the median, p95 and max per kind;
    - the answer count reaching 100;
    - API CPU and memory sampled from the process.
  - **Output:** a Markdown summary.
  - **Docs:**
    - quickstart C;
    - `specs/008-live-room-big-circles/load-results.md` with the first run (date, machine, numbers), which must meet SC-802/803.
  - **Unit test:** a small one for the percentile maths in the same project.

  Depends on T805, T807 (it exercises chat and reactions). It can start on slide changes earlier.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T814 **Journey, docs and audit.** (#188)
  - **Playwright:** the full journey covering quickstart B in `src/web/e2e/live-room.spec.ts` (en desktop, ar phone, axe, reduced motion), including measured fan-out of a chat message and a reaction burst to 10 pages (median under 1 s).
  - **Design review:** `/impeccable audit` and `/impeccable critique` on the sidebar, sheet, chat, reactions, hands and Pirikoo, with findings fixed or justified. While the plugin is unavailable, the ux-designer review is recorded instead (#126).
  - **Docs:** update `PRODUCT.md` (circles up to 100, shared characters), `docs/product/prd.md` and `docs/architecture/overview.md` (cap, rings, single replica, load-test results).
  - **Quickstart:** run `quickstart.md` end to end and tick `checklists/requirements.md`.
  - **SC-805:** run one recorded test session with about 40 people (or validate it after release) and note the result in the PR.
  - **Ideas:** comment progress on #166 and #174.

  Depends on T803, T806, T808, T810, T811, T813.

---

## Dependencies & Execution Order

- **Foundational**: T801 blocks every task except T812.
- **US1**: T802 → T803 (MVP).
- **US2**: T804, in parallel with T802 after T801.
- **US3**: T805 (parallel after T801) → T806 (also needs T804).
- **US4**: T807 (parallel after T801) → T808 (also needs T804).
- **US5**: T809 (parallel after T801) → T810 (also needs T804).
- **US6**: T811 after T806, T808 and T810.
- **US7**: T812 any time. T813 after T805 and T807.
- **Polish**: T814 last.

```text
T801 ─┬─ T802 ── T803 ─────────────────────────────┐
      ├─ T804 ──┬───────────────┬────────┬─────────┤
      ├─ T805 ──┴─ T806 ─┐      │        │         │
      ├─ T807 ─────────── T808 ─┤        │         ├─ T814
      ├─ T809 ─────────────────── T810 ──┤         │
      │                  T806 + T808 + T810 ─ T811 ┤
      └─ T805 + T807 ── T813 ──────────────────────┘
T812 (infra, independent) ─────────────────────────┘
```

## Parallel Example: after T801

```text
T802 Join for big circles  (CircleEndpoints.cs, RateLimits.cs, JoinTests.cs)
T804 Room layout           (room/RoomSidebar.tsx, PeopleList.tsx, CircleRoom.tsx, room.css)
T805 Chat hub              (CircleHub.cs Say, CircleHub.Room.cs chat part, ChatTests.cs)
T807 Reactions hub         (ReactionBuffer.cs, CircleHub.Room.cs React, CircleReport.cs)
T809 Hands hub             (CircleHub.Room.cs hands part, HandsTests.cs)
T812 Infra                 (infra/*.bicep)
```

T805, T807 and T809 each add methods to `CircleHub.Room.cs`. Merge them one at a time and rebase. The file has one region per feature to keep conflicts trivial.

## Implementation Strategy

1. **MVP**: T801 → T802 → T803. Circles of 100 with shared characters, which is the founder's first condition.
2. **Increment 2**: T804 (sidebar) → T805 → T806 (chat while presenting).
3. **Increment 3**: T807 → T808 (reactions), T809 → T810 (hands).
4. **Increment 4**: T811 (Pirikoo).
5. **Release gate**: T812 (always-on production) and T813 (load test meeting SC-802/803), then T814 (journey, audit, docs).

## Notes

- Each task's PR contains `Closes #<task issue>`. The parent ideas are #166 and #174.
- Existing circles keep working at every step: the members they already have get ring 0, and the chat stays open by default.
- More than one replica (Azure SignalR / Web PubSub backplane) is out of scope; it is recorded in research R12.
