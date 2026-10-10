# Data model: Live discussion, group calls (spec 009)

**Amended 2026-10-08.** Only chat messages are stored (spec FR-930). The 2026-10-05 migration `20261006090000_LiveDiscussionStage` is merged on `main`. A second migration, `GroupCallsLiveKit`, in `src/Circloo.Api/Data/Migrations/`, removes what the amendment no longer needs and adds the speaking mode. Entities in `src/Circloo.Api/Data/Entities.cs`, mapping in `CirclooDbContext.cs`. Spec 008's `RaisedHand`, `MessageLike`, `Circle.ChatMode` and `Circle.ReactionsOn` are used as they are.

## Circle (existing): the call setting

Configuration, not content: it says what is allowed now, never what happened.

| Field | Type | Status | Rules |
|---|---|---|---|
| DiscussionOn | bool | kept (2026-10-05), default false | **The group call is on.** Only the animator changes it (FR-901). Kept name, so the shipped switch and tests keep working |
| DiscussionVideo | bool | kept, default true | **Video allowed in the call.** False means an audio call (the kids-safe path, R13). Only meaningful while `DiscussionOn` |
| DiscussionSpeaking | string (8) | **new**, default `'hand'` | `'hand'` (Hand to speak) or `'open'` (Open mic). Check constraint on the two values. Set when the call starts and changeable during it (FR-928) |
| DiscussionChangedAt | DateTimeOffset? | **dropped** | It recorded when a call started or ended (FR-930) |
| DiscussionChangedByMemberId | Guid? | **dropped** | It recorded who started or ended a call (FR-930) |

The chat switch is spec 008's `Circle.ChatMode` (`open`, `slow`, `paused`; "off" is `paused`). The reactions switch is spec 008's `Circle.ReactionsOn`. Both reset to their defaults when the activity changes (spec 008 FR-811); the call setting does not.

## CircleMessage (existing): replies

| Field | Type | Rules |
|---|---|---|
| ReplyToId | long? | kept (2026-10-05). FK to `CircleMessage`, restrict. The parent must be in the same circle, `Kind = 'member'`, not hidden and itself not a reply (one level). Index on `ReplyToId` |

**No call system rows.** Call status changes (call started or ended, video on or off, mode changed, floor, mutes, removals) are **not** written as `CircleMessage` rows. The hub sends a `CallNotice` event and clients draw a live line that a reload does not bring back (R31). Activity lines (`start:<id>`, `end:<id>`) are unchanged.

## Recording, RecordingEvent: dropped

Created empty by `LiveDiscussionStage` (no code ever wrote them). `GroupCallsLiveKit` drops `RecordingEvents` (with `CK_RecordingEvents_TextOnlyForMessages` and `IX_RecordingEvents_RecordingId_Id`) and then `Recordings` (with `IX_Recordings_CircleId_Running` and `IX_Recordings_CircleId_StartedAt`). Its `Down` recreates them as they were, so the migration chain stays reversible.

## Not stored (memory only, or nowhere)

| What | Where | Lifetime |
|---|---|---|
| Call passes (tokens) | nowhere: minted per request, returned once, never logged | 5 minutes (`LiveKit:TokenMinutes`) |
| Animator mutes: microphone muted, camera stopped, per member | `CallModeration` (singleton, per circle) | until allowed, or the call ends. Lost on an API restart |
| Members removed from the current call | `CallModeration` | until `AllowBack` or the call ends |
| Who is in the call (roster) | `CallModeration`, fed by webhooks | until they leave or the room closes |
| Animator-away timer | `CallAway` (like `HandsGrace`, on `TimeProvider`) | cancelled when an animator connection returns |
| Who has the floor | spec 008's `RaisedHand.HasFloor` row | while the hand is "up" with the floor. Deleted when lowered, when the next person gets the floor, or when the call ends |
| Audio and video | the call server's memory while forwarding | never written. No egress, no recording |
| Reactions | spec 008's in-memory burst buffer | 400 ms. Reactions sent while a presentation runs (from the call too) add to that presentation's anonymous totals per kind (spec 008, D11) |
| Per-member limits (`call-token`, `call-admin`, `hand`, `reaction`, `refused-audit`) | `RoomLimits` | sliding windows, single replica |

## Lifecycle rules

- **Start a call** (`EnableDiscussion(videoAllowed, speaking)` while off): sets `DiscussionOn = true`, `DiscussionVideo`, `DiscussionSpeaking`; creates the LiveKit room; audit `discussion.on`; broadcasts `Discussion` and `CallNotice('call-started')`.
- **Change video** (`EnableDiscussion` again while on, with another `videoAllowed`): updates the column, recomputes everyone's permissions on the call server (cameras stop within 2 s when off), broadcasts.
- **Change speaking mode** (`SetSpeakingMode`): updates `DiscussionSpeaking`, recomputes permissions, audit `call.mode`, broadcasts.
- **End a call** (`DisableDiscussion`, animator away 5 minutes, circle closed): in one unit of work sets `DiscussionOn = false` and deletes the circle's `RaisedHand` rows; then deletes the LiveKit room (everyone disconnects), clears `CallModeration` for the circle, audits `discussion.off` with the reason, broadcasts `Discussion`, `Hands` and `CallNotice('call-ended')`.
- **A member leaves or is removed from the circle**: if they are in the call, `RemoveParticipant`.
- **Circle deleted or expired**: expiry closes the circle, which ends the call. Nothing about calls remains to delete.

## Configuration

`LiveKit` section (`LiveKitOptions`, validated at start-up):

| Key | Default | Range or form | Meaning |
|---|---|---|---|
| `LiveKit:Url` | empty | `ws://` or `wss://` URL | The call server address browsers connect to. **Empty means calls are unavailable** (FR-935) |
| `LiveKit:ApiUrl` | derived from `Url` (`ws`→`http`, `wss`→`https`) | `http://` or `https://` URL | Where the API calls RoomService. Locally the container's endpoint |
| `LiveKit:ApiKey` | empty | 3 to 64 characters | The key id (not a secret) |
| `LiveKit:ApiSecret` | empty | at least 32 characters | **Secret**: user-secrets via the AppHost parameter locally, Key Vault (`livekit-api-secret`) in Azure. Required when `Url` is set |
| `LiveKit:TokenMinutes` | 5 | 1 to 30 | Lifetime of a call pass |

`Discussion` section (`DiscussionOptions`, trimmed):

| Key | Default | Range | Meaning |
|---|---|---|---|
| `Discussion:AwayEndSeconds` | 300 | 60 to 3600 | The call ends after the animator has been away this long (R34, founder decision D6) |

**Removed keys** (shipped in T901, deleted by T918 and T924): `StageMax`, `ListenersMax`, `IceUrls`, `SeatGraceSeconds`, `InviteSeconds`, `AwayFreezeSeconds`, `RecordingNoticeSeconds`, `RecordingMaxMinutes`, `RecordingWarnMinutes`, `RecordingMaxEvents`, `RecordingsPerCircle`.

The call size is spec 008's `Circles:MaxPeople` (default 100), passed to LiveKit as the room's `max_participants`.
