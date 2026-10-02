# Plan: Live circles

## Architecture
- **API (Circloo.Api/Circles)**: entities `Circle`, `CircleMember`, `CircleMessage`; endpoints under `/api/circles`
  (create, mine, get, close, join-info by code, join) and `/api/catalog/activities`. Guest identity is a second cookie
  scheme (`Guest`, `__Host-circloo-guest`) selected by a policy scheme: user cookie → user, else guest cookie → guest.
  The default authorization policy requires the `sub` claim, so every existing endpoint stays user-only; circle
  endpoints accept users and guests and check membership. Antiforgery keeps working because it binds to whichever
  identity the default scheme resolved.
- **Real time**: ASP.NET Core SignalR hub `/hubs/circle` (built in, no package). Group per circle id. Server
  methods: `Enter(circleId)`, `Say(text)`, `StartActivity(id)`, `EndActivity()`, `AskCircloo(text)`. Client events:
  `presence`, `activity`, `message`, `aiDelta`, `aiDone`, `closed`. Presence is tracked in memory per instance
  (single replica in this version; documented limit).
- **AI**: `CirclooCoach` builds a system prompt from the activity and the recent chat and streams through the
  existing `IChatClient` (Foundry in prod). In dev a `SeedCoachResponder` answers from seed sparks so it costs zero.
  Input and output go through `SafetyPolicy`; usage is recorded in `AiGenerations` and counts toward the allowance.
- **Web**: `@microsoft/signalr` client; routes `/app/circles/new`, `/app/circles/:id` (animator room),
  `/join/:code` (public join), `/c/:id` (participant room, guest or user). Zustand `circle` store holds the live
  state. Components: `Character` cast (12), `CircleRing`, `ActivityPicker`, `CircleChat`, `PandaThinking`.
- **Vite** proxies `/hubs` with websockets in dev; prod is same-origin.

## Data model
- Circle(Id, OwnerUserId, Name ≤60, JoinCode char(10) unique, Activities text[], CurrentActivity ≤40?, Locale,
  Status, CreatedAt, ExpiresAt, ClosedAt?)
- CircleMember(Id, CircleId, Role, UserId?, Name ≤24, Character ≤16, JoinedAt, LeftAt?) unique (CircleId, Character)
  where LeftAt is null; unique (CircleId, UserId).
- CircleMessage(Id bigint, CircleId, ActivityId, MemberId?, Kind member|ai|system, Text ≤2000, CreatedAt).

## Constitution check
Security by design (separate guest scheme, membership checks on every call and hub method, rate limits, text-only
content, safety policy on AI); zero-cost dev (seed responder, SignalR in-process); i18n and a11y in all four
languages; tests for API and hub; issue per task.

## Complexity tracking
- Presence in memory → single replica. Tracked as a follow-up (Azure SignalR) before scaling out.
