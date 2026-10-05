# Data model: Live room for big circles (spec 008)

Changes to existing entities and the new ones. EF Core migration `LiveRoomBigCircles`.

## CircleMember (existing): shared characters

| Field | Type | Rules |
|---|---|---|
| Character | string | one of the 24 characters; **no longer unique on its own** |
| Ring | int | **new**, 0–5; 0 for every existing member (migration default) |

- The unique index `(CircleId, Character)` filtered on `LeftAt IS NULL` is **replaced** by a unique index `(CircleId, Character, Ring)` filtered on `LeftAt IS NULL` (FR-803).
- Active members per circle are capped at `Circles:MaxPeople` (default 100). The check runs in the join transaction under `SELECT … FOR UPDATE` on the circle row (FR-801/802).
- `MemberDto` gains `ring`.

## Circle (existing): room settings

| Field | Type | Rules |
|---|---|---|
| ChatMode | string | **new**, `open` \| `slow` \| `paused`, default `open` |
| ReactionsOn | bool | **new**, default true |
| PirikooQuiet | bool | **new**, default false |

They are reset to the defaults when an activity starts or ends and when a presentation starts or ends (FR-811, FR-818, FR-824). Only the animator changes them.

## CircleMessage (existing): chat

| Field | Type | Rules |
|---|---|---|
| Text | string | 1–280 characters, passes the safety filter (stricter in kids-safe circles) |
| HiddenAt | DateTimeOffset? | **new**; set by the animator; hidden messages never reach members |
| (likes) | — | not stored: counted from `MessageLike` when read, so a deleted account never leaves a stale count |

Sending rules for participants (the animator is exempt):
- at most 5 messages per 10 s per member, across all their tabs (in-memory window);
- `ChatMode = slow`: at most one message per 10 s per member, checked against their last stored `CreatedAt` in the circle;
- `ChatMode = paused`: refused (`chat-paused`).

## MessageLike (new)

| Field | Type | Rules |
|---|---|---|
| MessageId | long | FK → CircleMessage, cascade |
| MemberId | Guid | FK → CircleMember, cascade (deleting an account removes its likes); never the message's author |
| At | DateTimeOffset | |

Unique `(MessageId, MemberId)`. A toggle removes the like or adds it. Liking a hidden message is refused (`message-hidden`).

## RaisedHand (new, live only)

| Field | Type | Rules |
|---|---|---|
| Id | long | identity |
| CircleId | Guid | FK → Circle, cascade |
| MemberId | Guid | FK → CircleMember, cascade; unique `(CircleId, MemberId)` |
| RaisedAt | DateTimeOffset | queue order (ties broken by Id) |
| HasFloor | bool | at most one `true` per circle (partial unique index on `CircleId` where `HasFloor`) |

Lifecycle:
- `RaiseHand` inserts a row (if the member already has one, nothing changes).
- `LowerHand` and leaving the circle delete the row. So does the member's last connection closing, after a 30 s grace period without coming back.
- `GiveFloor(m)` clears every other `HasFloor` in the circle and marks `m`'s row. The person who had the floor has their row deleted.
- Changing activity, or ending a presentation, deletes every row of the circle.

## PresentationSession (existing, spec 006): reaction totals

| Field | Type | Rules |
|---|---|---|
| ReactionTotals | jsonb | **new**, `{ "clap": n, "heart": n, "laugh": n, "wow": n, "like": n, "party": n }`, default `{}` |

Each reaction flush adds its counts with a single SQL update. Totals are never linked to people (FR-818). They are read by the circle's results and by `CircleReport`.

## Not stored

- Individual reactions: they go into the in-memory `ReactionBuffer` per circle and are flushed every 400 ms.
- Presence: `CirclePresence` stays in memory, and broadcasts are coalesced (R5).
- Per-member rate-limit windows: kept in memory, single replica.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `Circles:MaxPeople` | 100 | active members per circle, animators included (2–144 = 24 characters × 6 rings; since #201 the cast is 48, so the bound is 2–288 = 48 × 6) |
| `RateLimits:CircleJoinsPerIpPer10Min` | 300 | was 60 (R4) |
| `RateLimits:CircleJoinsPerIpAndCodePer10Min` | MaxPeople + 20 | new (R4) |
