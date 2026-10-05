# Implementation Plan: Live room for big circles: sidebar, chat, reactions, raised hands and 100 people

**Branch**: `feat/175-live-room-foundation` (spec, plan and T801); other tasks on `feat/<task-issue>-*` | **Date**: 2026-10-05 |
**Spec**: [spec.md](spec.md) | **Parent ideas**: #166, #174

**Input**: Feature specification from `specs/008-live-room-big-circles/spec.md`

## Summary

Circles grow from 12 to 100 people, configurable (`Circles:MaxPeople`).
- **Characters**: several people can share a character, told apart by one of 6 colour rings (a new `Ring` column with a unique `(Circle, Character, Ring)` index). Joins at the cap are serialised by a row lock.
- **Room layout**: the room becomes a main area plus a collapsible sidebar on the inline end, holding the people list and the existing circle chat. On phones it is a bottom sheet.
- **Chat**: on by default while presenting. The animator can pause it or turn on slow mode (room settings on `Circle`). It gains likes, hidden messages and per-member rate limits.
- **Reactions**: sent through the circle hub, buffered per circle, broadcast in grouped bursts (400 ms) and summed per presentation (`ReactionTotals`) for the results.
- **Raised hands**: a small `RaisedHand` table and a `Hands` event; everyone sees the queue, the projector only the count.
- **Pirikoo**: announces hands and cheers bursts on the client, and its nudges stop during presentations.
- **Scale**:
  - presence broadcasts are coalesced;
  - join rate limits allow a whole room behind one IP;
  - a .NET SignalR load test proves 100 phones with a median under 1 s and a p95 under 2 s;
  - production keeps one replica awake.

## Technical Context

**Language/Version**: C# / .NET 10 (API), TypeScript strict / React 19 (web)

**Primary Dependencies**: existing ASP.NET Core minimal APIs, SignalR circle hub (`CircleHub` partials), `LiveThrottle`, `SafetyPolicy`, EF Core (Npgsql), Zustand, TanStack Query, i18next; new console project using `Microsoft.AspNetCore.SignalR.Client` for the load test

**Storage**: PostgreSQL. `CircleMember.Ring`; `Circle.ChatMode/ReactionsOn/PirikooQuiet`; `CircleMessage.HiddenAt/Likes`; new `MessageLike`, `RaisedHand`; `PresentationSession.ReactionTotals` (jsonb). Migration `LiveRoomBigCircles`.

**Testing**: xUnit + Testcontainers (hub and endpoint tests), Vitest (grouping, rate-window and layout logic), Playwright `e2e/live-room.spec.ts` (en desktop + ar phone, axe), and the load test `tests/Circloo.LoadTest` (manual or pre-release, results recorded)

**Target Platform**: Azure Container Apps (one `web` replica, kept awake in prod) + modern browsers; phones first for participants

**Project Type**: web application (API + SPA in one production container)

**Performance Goals**: with 100 connected clients, slide change, chat and reaction burst delivery median < 1 s, p95 < 2 s (SC-802/803); presence at most 4 broadcasts per second per circle; reactions at most 2.5 broadcasts per second per circle

**Constraints**: zero-cost development (the load test runs locally); single replica (in-memory presence, throttles, rate windows and reaction buffer); WCAG 2.2 AA; four locales with RTL; reduced motion; safety filter on chat (kids-safe stricter); the projector never shows chat or names

**Scale/Scope**: ≤ 100 people per circle by default (configurable 2–144, the number of character/ring pairs; tested at 100); 6 reaction kinds; 6 rings × 24 characters; the latest 200 messages in the circle view

## Constitution Check

| Principle | Status |
|---|---|
| I. No issue, no development | ✅ Ideas #166 and #174. Task issues come from `/speckit-taskstoissues` after this plan. |
| II. Spec before code | ✅ Spec with 3 clarifications. Decisions live here and in research.md. |
| III. Four languages, RTL | ✅ All new strings in en/fr/ar/es. The sidebar sits on the inline end (left in Arabic). Each UI story's e2e runs an ar phone. |
| IV. Human-crafted design | ✅ Sidebar, sheet, reactions and Pirikoo go through the ux-designer review (Impeccable shape/audit when installed, #126). No glow, no gradients, emoji only as user content. |
| V. Private by default | ✅ Every hub action re-checks membership. Hidden messages never reach members. The projector shows no chat or names. The cap is configuration, not customer code. |
| VI. Test what matters | ✅ Hub tests per action and rule (cap race, rings, slow mode, likes, hiding, hands, reactions buffer), e2e per story, and a load test for SC-802/803. |
| VII. Simple, disposable infrastructure | ✅ One Bicep change (`webMinReplicas`, prod = 1) through azure-infra. No new Azure resource. |
| VIII. Secure by design | ✅ See the threat model. |
| IX. Zero-cost development | ✅ Everything, the load test included, runs locally on containers. The always-on replica is a prod-only cost. |

**Gate result: PASS.** It was re-checked after the Phase 1 design with no change.

## Threat model (constitution VIII)

| Threat | Mitigation |
|---|---|
| Chat spam or flooding by one person or many tabs | Per-member limit of 5 per 10 s across tabs; slow mode checked against stored data; animator pause; the 280-character cap. |
| Unsafe or abusive messages | Existing `SafetyPolicy` on every message (stricter in kids-safe circles); the animator can hide; hidden messages never leave the server for members. |
| Reaction or hand flooding hurting the room | Reactions: 5 per 10 s per member, buffered and grouped, at most 12 drawn at once. Hands: one per member, a unique index, broadcasts only on change. |
| Impersonation through a shared character | The name is always shown with the character (FR-804). The ring and index dot differ. Names are already validated and safety-filtered at join. |
| Overshooting the cap through concurrent joins | The join transaction locks the circle row. The unique `(Circle, Character, Ring)` index is backed by retries. |
| Join-code guessing after the IP limit is raised | The per-IP limit stays (300 per 10 min). The per-IP-and-code limit stops one IP from filling another circle. Codes are 50 bits. |
| Privacy on a wall screen | The audience screen renders only the reaction bursts and the number of hands, never chat text or names. |
| Data minimisation | Reactions are stored only as anonymous totals per session. Likes are stored, because members see their own like. No message text appears in logs or audit records. |
| Denial of service through a big circle on one replica | Coalesced presence and likes, buffered reactions, a capped list of pending answers, and the load test before release. The cap itself bounds the fan-out. |

Audit events: `chat.paused`, `chat.slow`, `message.hidden`, `hands.cleared`. Each records only the actor and ids, never text.

## Project Structure

### Documentation (this feature)

```text
specs/008-live-room-big-circles/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R12
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── hub.md           # Say limits, likes, hide, room settings, reactions, hands
│   └── rest.md          # join (rings, cap), circle view additions, report line
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/Circloo.Api/
├── Circles/
│   ├── CircleOptions.cs            # new: Circles:MaxPeople (R1)
│   ├── CircleEndpoints.cs          # join under row lock, rings, JoinInfo.characters, circle view additions
│   ├── CircleHub.cs                # Enter pushes settings + hands; presence coalesced; Say limits
│   ├── CircleHub.Room.cs           # new: LikeMessage, HideMessage, SetRoomSettings, React, hands methods
│   ├── RoomLimits.cs               # new: per-member sliding windows (messages, reactions)
│   ├── ReactionBuffer.cs           # new: per-circle counts, flush via LiveThrottle → Reactions + totals
│   └── CircleRules.cs              # MemberDto.ring, MessageDto likes/hidden, RoomSettings/HandsView records
├── Data/Entities.cs, CirclooDbContext.cs, Migrations/*_LiveRoomBigCircles.cs
├── Integrations/CircleReport.cs    # reactions line per presentation
└── Security/RateLimits.cs          # join limits (R4)

src/web/src/
├── features/circles/
│   ├── CircleRoom.tsx              # main + sidebar grid, presenting layout keeps the sidebar
│   ├── room.ts                     # settings, hands, likes, reactions events and actions
│   ├── JoinCircle.tsx              # character use counts and ring choice
│   └── room/                       # new
│       ├── RoomSidebar.tsx         # collapsible sidebar / phone bottom sheet with tabs
│       ├── PeopleList.tsx          # online first, search, summary, rings, animator mark
│       ├── ChatPanel.tsx           # wraps Chat: grouping, likes, hide, paused/slow states, batched announcements
│       ├── ReactionBar.tsx, ReactionLayer.tsx   # under the slide / floating, capped, reduced-motion counter
│       ├── HandsQueue.tsx          # raise/lower, queue, floor; animator controls
│       ├── RoomSettings.tsx        # animator: chat open/slow/paused, reactions, Pirikoo quiet
│       └── grouping.ts (+ .test.ts)  # message grouping, reaction grouping, announcement batching
├── components/Character.tsx        # ring prop (outline + index dot)
├── features/pirikoo/tips.ts        # no participant nudges while presenting
├── features/pirikoo/HandBubble.tsx # new: animator bubble + cheers
├── features/circles/present/AudienceScreen.tsx  # reaction layer + hands count
├── styles/room.css                 # new
└── i18n/locales/{en,fr,ar,es}.json

tests/
├── Circloo.Api.Tests/LiveRoom/      # cap race, rings, chat limits, likes, hide, settings reset, reactions, hands, presence coalescing
└── Circloo.LoadTest/                # new console project (not part of dotnet test)

infra/modules/app.bicep, infra/main.bicep   # webMinReplicas (prod 1) (R12)
```

**Structure decision**: the same web-application layout as specs 003–007. Room-level hub methods go in a new `CircleHub.Room.cs` partial. Web pieces go in `features/circles/room/`.

## Complexity Tracking

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| In-memory per-member rate windows and reaction buffer | Must react within milliseconds for 100 people without a database write per tap | Database counters add a write per reaction and per message attempt. The single-replica limit is already accepted in spec 006 and documented in R12. |
| Always-on production replica (cost) | FR-831: no 20–40 s wake-up for the first person at an event | Scale to zero was rejected by the founder (clarification 1). |
| Separate load-test console project | SC-802/803 need 100 real protocol clients | 100 Playwright browsers don't fit one machine, and k6 would add a new toolchain. |
| UI audit by the ux-designer agent instead of Impeccable (constitution IV) | The Impeccable plugin is not installed in this environment (#126 tracks a real run) | Blocking every UI task on the plugin would stop the feature; the manual review uses the same rules and is recorded on each PR, as for specs 006 and 007. |
| One replica with in-memory live state instead of Azure SignalR / Web PubSub (constitution tech constraints) | 100 people per circle fit one replica (proven by T813); presence, throttles, the quiz clock and the reaction buffer are in memory | A backplane adds cost and moving parts not needed at this size; R12 records the move for when circles or traffic outgrow one replica. |
