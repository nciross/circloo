# Research: Live room for big circles (spec 008)

Decisions taken while planning. Each one lists what was chosen, why, and what else was considered.

## R1. Circle size cap as configuration

- **Decision**: replace `CircleAccess.MaxPeople = 12` with `Circles:MaxPeople` (options class `CircleOptions`, default 100, bounded to 2–500 at start-up). The join endpoint and the circle view's `full` flag read it.
- **Rationale**: FR-801 requires the cap to be configuration, and enterprise behaviour must never be customer code (constitution V). An app-wide option is enough, since no per-circle cap was asked for.
- **Alternatives**: a per-circle cap column (no use case yet); keeping a constant (fails FR-801).

## R2. Join race at the cap

- **Decision**: the join endpoint runs inside one transaction. It locks the circle row with `SELECT … FOR UPDATE`, counts the active members, then inserts. A 101st concurrent join waits for the lock and sees the circle as full.
- **Rationale**: SC-801 says 100 simultaneous joins never exceed the cap. A count followed by an insert without a lock can overshoot. The circle row is the natural lock, it is held for milliseconds, and joins are rare compared to hub traffic.
- **Alternatives**: a counter column with a check constraint (another place to keep in sync); a Postgres advisory lock (same effect, less obvious); a serializable transaction with retry (heavier for the same result).

## R3. Shared characters and rings

- **Decision**: `CircleMember` gains `Ring` (0–5). The unique index on active members moves from `(CircleId, Character)` to `(CircleId, Character, Ring)`, still filtered on `LeftAt IS NULL`. Joining assigns the lowest free ring of the chosen character unless the person picks a free one. A unique violation, meaning two people took the same ring at once, is retried with the next free ring. The migration gives existing members `Ring = 0`, which keeps the old uniqueness.
- **Ring colours**: 6 fixed colours, defined as tokens and checked at ≥ 3:1 non-text contrast against the light and dark `--surface` and the projector card. Ring 0 is drawn as no visible ring, so a circle of 12 looks exactly as it does today. Rings 1–5 are a 3 px outline plus a small index dot, so identical characters differ by more than colour (WCAG 1.4.1).
- **Rationale**: this was the founder's choice ("share with a colour"). 24 × 6 = 144 combinations, more than 100. The data change is small and the old circles keep working.
- **Alternatives**: grow the cast (slow, and still a ceiling); initials above 24 people (rejected by the founder).

## R4. Join rate limit at events

- **Decision**: `CircleJoinsPerIpPer10Min` goes from 60 to 300. A second limit is added, keyed by IP and join code, at `Circles:MaxPeople + 20` per 10 minutes. It still stops code guessing, because the per-IP limit caps the number of codes tried.
- **Rationale**: a class or company joins from one public IP (NAT). With 60 per IP per 10 minutes, the 61st phone of a 100-person room would be refused.
- **Alternatives**: no IP limit (reopens code guessing); a CAPTCHA (friction on phones, and it fails the "seconds-simple" product rule).

## R5. Presence at 100 people

- **Decision**: `Enter` and `OnDisconnectedAsync` no longer broadcast the full online list straight away. They request `LiveThrottle` (`presence:{circleId}`, 250 ms window, latest state last), which sends one `Presence(online[])` per window. The new member's own `Enter` still returns the online list at once.
- **Rationale**: 100 joins in a minute would otherwise send about 100 × 100 = 10,000 full lists. Coalescing caps this at 4 lists per second per circle (FR-827). A 100-id list is about 4 KB, which is fine.
- **Alternatives**: deltas (`Joined`/`Left` events: less data, but more client logic and resync risk on reconnect); no change (fails FR-827 at scale).

## R6. Chat at scale

- **Decision**: keep the existing circle messages (`Say`, `CircleMessage`, `MessageMax = 280`; the spec is aligned to 280). Add:
  - **Room settings** on `Circle`: `ChatMode` (`open` / `slow` / `paused`), `ReactionsOn` and `PirikooQuiet`. They are reset to the defaults (open, on, not quiet) whenever the activity changes or a presentation starts.
  - **Rate limits**: every participant may send 5 messages per 10 s through an in-memory sliding window keyed by member, so it covers all their tabs. In slow mode the check is the member's last stored message time, read from the database, so it holds across tabs and reloads. The animator is exempt from both.
  - **Likes**: a `MessageLike` table, unique on `(MessageId, MemberId)`. Each toggle recounts the likes, and `LiveThrottle` coalesces the `MessageLikes` broadcast per message.
  - **Hiding**: `CircleMessage.HiddenAt`. Members never receive hidden messages: the circle view filters them out and a `MessageHidden(id)` event removes them live. The animator gets them marked as hidden.
  - **History**: the circle view keeps the latest 200 messages, as today. Older ones are out of scope.
- **Rationale**: this reuses the chat, safety filter and storage that already exist. Settings live in the database, so the animator's two tabs and a reload agree. Slow mode is checked against stored data, so it can't be dodged by opening a new tab.
- **Alternatives**: settings in memory (lost on restart and on a second tab); per-connection limits (one person with 3 tabs gets 3 times the rate).

## R7. Reactions

- **Decision**: a hub method `React(kind)` with `kind` from a fixed set (`clap`, `heart`, `laugh`, `wow`, `like`, `party`).
  - **Limit**: 5 per 10 s per member, in memory; extra reactions are silently dropped.
  - **Buffer**: counts go into a per-circle in-memory `ReactionBuffer`, flushed through `LiveThrottle` (`reactions:{circleId}`, 400 ms). Each flush sends one `Reactions({kind: count})` burst to the circle group (the audience screen included) and adds the counts to `PresentationSession.ReactionTotals` (jsonb) with a single SQL update.
  - **Display**: the client draws at most 12 floating emoji at once. Anything beyond that only raises the grouped "×n" counter.
  - **Results**: the totals appear in `CircleReport` and in the circle view's presentation results.
- **Rationale**: reactions are never stored individually (FR-818), and the totals are the founder's choice. Flushing in batches keeps 100 people tapping at once down to a few broadcasts per second.
- **Alternatives**: one broadcast per tap (up to 100 × 5 / 10 s × 100 receivers, too chatty); storing each reaction (against data minimisation).

## R8. Raised hands

- **Decision**: a `RaisedHand` table: `CircleId`, `MemberId` unique, `RaisedAt`, `HasFloor`.
  - **Hub methods**: `RaiseHand`, `LowerHand(memberId?)` (yourself, or anyone for the animator), `LowerAllHands`, `GiveFloor(memberId)`.
  - **Broadcast**: `Hands(HandsView)` goes to the circle group. It holds the queue ordered by `RaisedAt` (member ids only; names come from the member list) and who has the floor.
  - **Clean-up**: a hand is lowered when its member leaves the circle or when the last connection of that member disconnects (presence). All hands clear on activity change.
- **Rationale**: the queue must survive reloads and a second animator tab, so it lives in the database. Sending member ids only keeps the payload small. Names come from the member list every client already has, and the projector shows only the count (FR-820).
- **Alternatives**: an in-memory queue (lost on restart); using circle messages (wrong shape).

## R9. Pirikoo during presentations

- **Decision**: the client-side tips engine (`features/pirikoo/tips.ts`) returns no participant nudges while the activity is `presentation`.
  - **Bubbles**: hand bubbles for the animator come from `Hands` events on the animator's connections. They are grouped when several hands arrive within 2 s, and offer a "Give the floor" action that calls `GiveFloor`.
  - **Cheers**: Pirikoo cheers are derived from `Reactions` bursts, at most one every 10 s.
  - **Quiet and reduced motion**: `PirikooQuiet` stops Pirikoo's moves but keeps the bubbles. Under reduced motion it never flies.
- **Rationale**: this needs no server work beyond the events above, and the bird already lives in the web app.

## R10. Room layout

- **Decision**: `CircleRoom` uses one grid with a main area and a sidebar on the inline end. The sidebar holds `PeopleList` (search, online first, summary) and the `Chat`.
  - **Width**: on screens ≥ 960 px it is 320–360 px and collapsible, with the choice kept in `localStorage`.
  - **Phones**: below 960 px it becomes a bottom sheet with People/Chat tabs, opening to half height. The sheet reserves space so it never covers the answer pad or the presenter controls (FR-807).
  - **Replaced**: `PeopleRing` is retired in the room; it stays on the join and landing pages.
  - **Presenting**: the sidebar stays in the presenting layout (the `.is-presenting` grid change from spec 006 is updated). The reaction bar sits under the slide, and a reaction layer is absolutely positioned over the slide stage.
- **Rationale**: this matches the spec (FR-806/807), reuses the existing chat component, and keeps the slide at ≥ 2/3 of the width (SC-804).

## R11. Load test

- **Decision**: a new console project, `tests/Circloo.LoadTest`. It uses the .NET SignalR client and does not run in `dotnet test`.
  - **Sequence**: the animator signs in through Mailpit, creates a circle and uploads a fixture deck. Then 100 guests join over HTTP and connect over WebSockets. The animator makes 10 slide moves, and the guests answer a poll and a quiz, send chat messages and react.
  - **Measurement**: for every slide change it records the time from `GoToSlide` returning to each client receiving the new `PresentationState`. It prints the median, p95 and max, plus process CPU and memory sampled from the API.
  - **Target**: it runs against the local Aspire stack or the isolated e2e containers, at zero cost (constitution IX). Results go into `specs/008-live-room-big-circles/load-results.md` with each change that affects the room.
  - **Rate limits**: they are raised for the run through the same environment overrides the e2e suite uses.
- **Rationale**: FR-828 and SC-802/803. The SignalR client is the real protocol, and the project needs no new tooling.
- **Alternatives**: k6 with a SignalR extension (new tool and language for the team); Playwright with 100 browsers (too heavy for one machine).

## R12. Hosting awake in production

- **Decision**: `infra/modules/app.bicep` takes a `webMinReplicas` parameter for the `web` container app. `main.bicep` sets it to 1 when `environmentName` is `prod`, and 0 otherwise. An azd environment variable `CIRCLOO_WEB_MIN_REPLICAS` can override it.
  - **Cost**: an always-on replica of 0.5 vCPU / 1 GiB on Container Apps consumption is billed for idle time (a few tens of euros per month). This is the cost of FR-831 and must be stated in the PR.
  - **Single server**: `maxReplicas` stays 1. In-memory presence, throttles, the quiz clock, rate limits and the reaction buffer all need a single replica (spec 006 plan). Moving to Azure SignalR / Web PubSub for more than one replica remains a later decision.
  - **Process**: the change goes through the azure-infra agent and must compile in CI.
- **Rationale**: this applies the founder's clarification (production awake, dev and test may sleep) without touching the dev deployments people use day to day.
