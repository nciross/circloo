# Hub contract: live discussion stage (spec 009)

Extends the circle hub (`/hubs/circle`, `CircleHub` / `ICircleClient`), in the partials `CircleHub.Discussion.cs` and `CircleHub.Recording.cs`. It builds on spec 008's hub (`RaiseHand`, `LowerHand`, `LowerAllHands`, `GiveFloor`, `Hands`, `Say`, `HideMessage`, `RoomSettings`).

## Authorisation rules (apply to every method)

1. The caller must have entered a circle (`not-entered`) and the server re-resolves membership and the circle's open state on **every call** (`CurrentAsync`): `not-a-member` otherwise.
2. The **animator role comes from the database row**, never from a client claim. "Animator" methods use `CurrentAsync(animatorOnly: true)` and answer `animator-only`. A refused attempt is audited as `discussion.refused` with the method name and ids (at most 5 rows per member per minute).
3. An audience-screen connection (`EnterAudience`) is read only: every method below answers `audience-read-only`.
4. Every method introduced by this spec except `EnableDiscussion`, `DisableDiscussion` and `Reply` answers `discussion-off` when the circle's `DiscussionOn` is false. Spec 008's methods (`RaiseHand`, `LowerHand`, `LowerAllHands`, `GiveFloor`), `Say` and `Reply` keep working as circle chat and hands when it is off.
5. Signalling is allowed only between two registered seats of the **same circle**: stage and stage, or a viewer and a stage seat in either direction (never viewer and viewer). The sender's member id is added by the server.
6. Per-member limits use `RoomLimits` and therefore cover all of a member's tabs. Over a limit the call answers `slow-down`, except `Signal`, which answers `signal-refused`.
7. No payload (SDP, ICE, message text, device labels) is ever logged, audited or stored by these methods.

## Client to server

| Method | Who | Effect | Errors |
|---|---|---|---|
| `EnableDiscussion(bool videoAllowed)` | animator | Sets `DiscussionOn = true` and `DiscussionVideo`. Records who and when. Audit `discussion.on`. Adds a system line. Broadcasts `Discussion`. Idempotent; calling it again can change `videoAllowed` | `animator-only` |
| `DisableDiscussion()` | animator | One unit of work: sets `DiscussionOn = false`, stops a running recording (reason `discussion-off`), clears the hands queue and the stage, tells everyone. Audit `discussion.off`. Broadcasts `Discussion`, `Stage`, `Recording(null)`, `Hands`, then `StageNotice('discussion-ended')` to everyone | `animator-only` |
| `RaiseHand()` / `LowerHand(Guid? memberId)` / `LowerAllHands()` (spec 008) | participant / member / animator | As in 008. With discussion on they also: count 6 toggles per 10 s per member (`slow-down`), and, while a recording captures, `RaiseHand` needs the notice acknowledged (`notice-required`). Captured as `hand.raised` / `hand.lowered` | `animator-cannot-raise`, `animator-only`, `slow-down`, `notice-required` |
| `GiveFloor(Guid memberId)` (spec 008, **extended**) | animator | Discussion **on**: the person's hand must be up (`hand-invalid`) and `StageMax` must not be reached by seats plus invitations (`stage-full`). Deletes the hand and reserves a seat in state `invited` for 60 s. Audit `stage.floor`. Captured as `floor.given`. The 008 floor marker is not used. Discussion off: unchanged 008 behaviour | `animator-only`, `hand-invalid`, `stage-full` |
| `JoinStage()` | member | Confirms a seat: an `invited` seat becomes `onStage`; the animator may join without an invitation. A second connection of the same member takes the seat over (the older one gets `StageNotice('seat-moved')`). Needs the fresh ICE list from REST first (client behaviour). Captured as `stage.joined`. Rate limit 6 per minute | `no-seat` (not invited, not the animator), `stage-full`, `animator-away`, `notice-required`, `slow-down` |
| `LeaveStage()` | member on the stage | Releases the seat at once. Captured as `stage.left` (`self`) | `not-on-stage` |
| `WatchStage()` | member (not seated) | Registers a viewer, up to `ListenersMax`. Viewers never send media. The client then offers to each stage member | `listeners-full`, `animator-away`, `already-on-stage` |
| `StopWatching()` | viewer | Releases the viewer seat | none |
| `TakeFloor(Guid memberId)` | animator | Ends someone's turn kindly: removes the seat (or an unclaimed invitation). Captured as `floor.taken` and `stage.left` (`taken`). Audit `stage.taken`. The person gets `StageNotice('floor-taken')` | `animator-only`, `member-invalid` (no seat) |
| `RemoveFromStage(Guid memberId)` | animator | Moderation: removes the seat, lowers their hand, the person must raise a hand and be given the floor again. Captured as `stage.left` (`removed`). Audit `stage.removed`. `StageNotice('removed')` to the person | `animator-only`, `member-invalid` |
| `MuteMember(Guid memberId)` | animator | `MutedByAnimator = true`, `AudioOn = false`. The person stays muted until allowed. Captured as `muted`. Audit `stage.muted`. `StageNotice('muted')` | `animator-only`, `member-invalid` |
| `AllowUnmute(Guid memberId)` | animator | Clears `MutedByAnimator`. Switches nothing on (FR-908). Captured as `unmute.allowed`. `StageNotice('unmute-allowed')` | `animator-only`, `member-invalid` |
| `SetMedia(bool audioOn, bool videoOn)` | seat on the stage | Reports the seat's devices so every client has the server's view. Refused: audio while `MutedByAnimator`, video when `DiscussionVideo` is false. Limit 20 per 10 s. The server never switches a device on | `not-on-stage`, `muted-by-animator`, `video-not-allowed`, `slow-down` |
| `Signal(Guid toMemberId, string kind, Guid linkId, string payload)` | seat | Forwards one signalling message to the target seat's own connection as `Signal(fromMemberId, ...)`. `kind` in `offer`, `answer`, `ice`. SDP at most 16 KB and starting with `v=0`, ICE at most 2 KB. Allowed only between stage and stage, or a viewer and a stage seat (either direction), in the same circle. Limits per member per 10 s: 40 offer/answer, 300 ICE. Nothing is stored or logged | `signal-refused` (every reason, including limits and unknown targets) |
| `StartRecording(string? title)` | animator | Creates the `Recording` in phase `notice`, broadcasts `Recording`, adds a system line, audits `recording.started`. Capture begins after the notice period. Idempotent: if one runs, returns it. 6 per hour | `animator-only`, `too-many-recordings`, `slow-down`, `message-unsafe` (title) |
| `StopRecording()` | animator | Ends the running recording (reason `animator`), saves it, broadcasts `Recording(null)`, system line, audit `recording.stopped`. Idempotent | `animator-only` |
| `AcknowledgeRecordingNotice(Guid recordingId)` | any member | The client says the notice and indicator are on screen. Stored in the connection only. Not a user choice | `recording-invalid` (not the running one) |
| `Reply(long parentId, string text)` | member | Same path as `Say` (clean, safety filter, 008 limits and modes, notice gate) with `ReplyToId`. Broadcasts `Message`. Captured as `message` | `message-invalid`, `message-unsafe`, `reply-invalid`, `chat-paused`, `slow-mode:<s>`, `slow-down`, `notice-required` |
| `Say(string text)` (existing) | member | Unchanged, plus: needs the notice acknowledged while a recording runs, and is captured as `message` once capture has begun | existing codes, `notice-required` |

`Enter(circleId)` also pushes `Recording` first, then `Discussion` and `Stage`, to the caller (all before 008's `RoomSettings` and `Hands`). `EnterAudience` pushes `Discussion`, `Recording` and the hands, never seats' media.

## Server to client (`ICircleClient` additions)

```ts
type DiscussionState = {
  on: boolean
  videoAllowed: boolean
  stageMax: number
  listenersMax: number
  away: 'none' | 'frozen'            // frozen after the animator was away for AwayFreezeSeconds
  awayEndsAt: string | null          // when the room will end the discussion if the animator stays away
}
type Seat = {
  memberId: string
  state: 'invited' | 'onStage' | 'reconnecting'
  audioOn: boolean                   // as reported by the seat, false while muted
  videoOn: boolean
  mutedByAnimator: boolean
}
type StageView = { seats: Seat[]; watching: number }          // viewers are counted, not listed
type RecordingState = {
  id: string
  phase: 'notice' | 'capturing'
  startedAt: string
  captureFrom: string
  maxAt: string
  byMemberId: string
} | null
type StageNoticeKind = 'muted' | 'unmute-allowed' | 'removed' | 'floor-taken' | 'seat-moved' | 'seat-lost' | 'discussion-ended'
type SignalKind = 'offer' | 'answer' | 'ice'
```

| Event | To | When |
|---|---|---|
| `Discussion(state)` | circle group | the switch, cameras allowed, the animator-away state or its end time changed; also pushed to the caller on `Enter` |
| `Stage(view)` | circle group (coalesced through `LiveThrottle` per circle, latest last) | a seat, an invitation, a mute or a media flag changed; the full list each time. The audience screen gets it too but renders nothing from it |
| `StageNotice(kind, byMemberId?)` | the affected member's connections (`discussion-ended` to the whole circle) | tells the person what happened, in kind words (client translates) |
| `Signal(fromMemberId, kind, linkId, payload)` | the target seat's own connection | a forwarded signalling message. Never to groups, never to the audience |
| `Recording(state)` | circle group (audience screen included) | started (`notice`), capture began (`capturing`), or ended (`null`); also pushed on `Enter` before anything else |
| `RecordingWarning(secondsLeft)` | animator group | `RecordingWarnMinutes` before the cap, then at 5 minutes and 1 minute |
| `Hands(view)` (008) | circle group | the queue changed. The audience screen renders only the count |
| `Message(message)` (008) | circle group | includes replies (`replyToId`) and discussion system lines |

## Error codes (stable strings, translated by the client)

`animator-only`, `not-a-member`, `not-entered`, `audience-read-only`, `discussion-off`, `animator-away`, `stage-full`, `listeners-full`, `no-seat`, `not-on-stage`, `already-on-stage`, `member-invalid`, `hand-invalid`, `muted-by-animator`, `video-not-allowed`, `signal-refused`, `slow-down`, `notice-required`, `recording-invalid`, `too-many-recordings`, `reply-invalid`, `message-invalid`, `message-unsafe`, `chat-paused`, `slow-mode:<secondsLeft>`. Errors never carry internal detail.

## Time-based rules (run by `DiscussionWatchdog.TickAsync`)

| Rule | After | Effect |
|---|---|---|
| Seat grace | `SeatGraceSeconds` (30) without a connection | seat removed, `stage.left` (`dropped`), `Stage` update |
| Invitation | `InviteSeconds` (60) unclaimed | invitation removed |
| Animator away, frozen | `AwayFreezeSeconds` (60) with no animator connection (only if the animator had been present) | `Discussion.away = 'frozen'`, `animator-away` for joins |
| Animator away, ended | `AwayEndSeconds` (300) | discussion switched off (reason `animator-away`), recording stopped, stage cleared |
| Recording cap | `MaxAt` | stopped (`max-length`); `RecordingWarning` before |
| Orphans | start-up | running recordings from a previous process closed with `restart` |

## Privacy rules

- **Projector**: the audience screen renders only the recording indicator and the hand count.
- **Recording**: only text events are captured (data-model). The recorder never touches signalling.
- **Hidden messages**: never reach non-animator connections (008) and are marked for the animator in transcripts.
- **Logs and audit**: ids only. No message text, SDP, ICE or device labels.
