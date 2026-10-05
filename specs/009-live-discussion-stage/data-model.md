# Data model: Live discussion stage (spec 009)

Changes to existing entities and the new ones. One EF Core migration, `LiveDiscussionStage`, in `src/Circloo.Api/Data/Migrations/`. Entities in `src/Circloo.Api/Data/Entities.cs`, mapping in `CirclooDbContext.cs`. Spec 008's `RaisedHand`, `MessageLike`, `Circle.ChatMode` are used as they are.

## Circle (existing): the discussion setting

| Field | Type | Rules |
|---|---|---|
| DiscussionOn | bool | **new**, default false. Only the animator changes it (FR-901). Remembered until changed (US1 #5) |
| DiscussionVideo | bool | **new**, default true. "Allow cameras". When false, no video on the stage (kids-safe rule, R13) |
| DiscussionChangedAt | DateTimeOffset? | **new**, set on every change |
| DiscussionChangedByMemberId | Guid? | **new**, the animator's member id, or null when the system switched it off (animator away). No foreign key |

Not reset when an activity changes (unlike `ChatMode`): the discussion is a circle preference, not an activity.

## CircleMessage (existing): replies

| Field | Type | Rules |
|---|---|---|
| ReplyToId | long? | **new**. FK to `CircleMessage`, restrict. The parent must be in the same circle, `Kind = 'member'`, not hidden and itself not a reply (one level). Index on `ReplyToId` |

System lines for the stage and the recording are ordinary `CircleMessage` rows with `Kind = 'system'` and a short coded `Text` (`discussion:on`, `discussion:off`, `stage:joined`, `stage:left`, `stage:taken`, `stage:removed`, `floor:given`, `muted`, `recording:started`, `recording:stopped`). `MemberId` is the person the line is about; the actor is in the coded text when it matters (`muted:<actorMemberId>`). The client translates them. Hand lines are not stored (R12).

## Recording (new)

One run of text recording in a circle.

| Field | Type | Rules |
|---|---|---|
| Id | Guid | v7, primary key |
| CircleId | Guid | FK to `Circle`, cascade. Index `(CircleId, StartedAt DESC)` |
| StartedByMemberId | Guid? | the animator who started it. No foreign key |
| Title | string | 1 to 80 characters, `TextRules.Clean` and `SafetyPolicy`. Default: the circle's name |
| StartedAt | DateTimeOffset | the moment the notice goes out |
| CaptureFrom | DateTimeOffset | `StartedAt + RecordingNoticeSeconds`. Nothing is captured before |
| MaxAt | DateTimeOffset | `CaptureFrom + RecordingMaxMinutes` |
| EndedAt | DateTimeOffset? | null while running |
| EndedReason | string? | `animator`, `discussion-off`, `animator-away`, `max-length`, `max-events`, `circle-closed`, `restart` |

- A **unique partial index on `CircleId` where `EndedAt IS NULL`** allows one running recording per circle (FR-920). A losing concurrent insert is mapped to "return the running one".
- At most `Discussion:RecordingsPerCircle` (50) rows per circle.

## RecordingEvent (new)

An append-only line of the transcript. Text events only.

| Field | Type | Rules |
|---|---|---|
| Id | long | identity. Transcript order is `(At, Id)` |
| RecordingId | Guid | FK to `Recording`, cascade. Index `(RecordingId, Id)` |
| At | DateTimeOffset | server time, never client time |
| Kind | string | one of `message`, `hand.raised`, `hand.lowered`, `stage.joined`, `stage.left`, `floor.given`, `floor.taken`, `muted`, `unmute.allowed`, `recording.started`, `recording.stopped` |
| ActorMemberId | Guid? | who did it (the animator for floor, mute, removal; the person for their own message or hand). No foreign key |
| SubjectMemberId | Guid? | who it happened to, when different from the actor. No foreign key |
| MessageId | long? | the chat message, for `message`. No foreign key (the chat may be cleaned later) |
| ReplyToMessageId | long? | the parent's message id for a reply |
| Reason | string? | at most 24 characters, for `stage.left` (`self`, `taken`, `removed`, `dropped`, `ended`) and `recording.stopped` (the `EndedReason`) |
| Text | string? | the message text snapshot, 1 to 280 characters, **only** for `message` |

- **Check constraint** `CK_RecordingEvents_TextOnlyForMessages`: `"Text" IS NULL OR "Kind" = 'message'`, and `Kind = 'message'` requires `Text IS NOT NULL`.
- Per recording, at most `Discussion:RecordingMaxEvents` (50 000) rows; the cap ends the recording with `max-events`.
- **There is nothing else to store.** No audio, video, speech-derived text, device labels, SDP, ICE, IP addresses or user agents exist in any column. A test enumerates the table's columns and the allowed `Kind` values (SC-906).
- Names are not stored: the read path joins `CircleMember` (name, character). A missing member reads as "Former member". Hidden state is read from `CircleMessage.HiddenAt` through `MessageId`.

## Not stored (live only, in memory)

| What | Where | Lifetime |
|---|---|---|
| Stage seats, viewers, mute state, audio/video on flags, connection ids | `StageRegistry` | until the person leaves, the grace period ends or the room empties. A restart clears them |
| Animator presence and the away clock | `StageRegistry` | per room session |
| The active recording per circle (id, capture window, running event count) | `StageRegistry` (cache of the database row) | until it ends |
| Signalling messages (offers, answers, ICE) | nowhere | forwarded to one connection, never kept or logged |
| Per-member limits (`stage-join`, `signal-sdp`, `signal-ice`, `media`, `stage-admin`, `hand`, `rec-start`, `refused-audit`) | `RoomLimits` | sliding windows, single replica |

## Lifecycle rules

- **Switch on** (`EnableDiscussion`): sets the columns, audits `discussion.on`, adds a system line, broadcasts `Discussion`. Everyone starts muted with video off and nothing is asked of the browser.
- **Switch off** or **animator away 5 min**: in one unit of work: set `DiscussionOn = false`, stop a running recording (reason `discussion-off` or `animator-away`), clear the registry for the circle, clear the hands queue of 008 (FR-902), add system lines, audit, broadcast `Discussion`, `Stage`, `Recording(null)`.
- **Circle closed** (existing close endpoint): a running recording is stopped with `circle-closed` and the registry is cleared.
- **Recording delete**: hard delete of the `Recording` row, cascade to events, audit `recording.deleted`. Refused while the recording is running.
- **Circle deleted or expired**: expiry only closes the circle (the animator can still read transcripts of a closed circle). If the circle row itself is ever deleted, recordings cascade.

## Configuration (`Discussion` section, `DiscussionOptions`)

| Key | Default | Range | Meaning |
|---|---|---|---|
| `Discussion:StageMax` | 8 | 2 to 12 | people sending at once, animator included |
| `Discussion:ListenersMax` | 8 | 0 to 24 | receive-only viewers |
| `Discussion:IceUrls` | `["stun:stun.cloudflare.com:3478"]` | schemes `stun`, `stuns`, `turn`, `turns` | ICE servers handed to the browsers. Blank entries are dropped |
| `Discussion:SeatGraceSeconds` | 30 | 5 to 120 | a dropped connection keeps its seat this long |
| `Discussion:InviteSeconds` | 60 | 10 to 300 | a floor invitation expires if the person does not join |
| `Discussion:AwayFreezeSeconds` | 60 | 10 to 600 | animator away: stage freezes |
| `Discussion:AwayEndSeconds` | 300 | 60 to 3600 | animator away: discussion ends (must exceed the freeze) |
| `Discussion:RecordingNoticeSeconds` | 5 | 2 to 30 | notice phase before capture |
| `Discussion:RecordingMaxMinutes` | 240 | 10 to 480 | recording length cap |
| `Discussion:RecordingWarnMinutes` | 15 | 1 to 60 | animator warning before the cap |
| `Discussion:RecordingMaxEvents` | 50000 | 1000 to 200000 | events per recording |
| `Discussion:RecordingsPerCircle` | 50 | 1 to 500 | kept recordings per circle |

All are plain settings (no secrets) with code defaults, so no Bicep change is needed. They are listed in `docs/architecture/overview.md`.
