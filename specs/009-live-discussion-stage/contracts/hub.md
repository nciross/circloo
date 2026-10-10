# Hub contract: live discussion, group calls (spec 009)

**Amended 2026-10-08.** Audio and video go through the LiveKit call server, not the hub. The hub carries the switches, the speaking mode, moderation, hands, reactions, chat and live notices. It never carries media or signalling.

Extends the circle hub (`/hubs/circle`, `CircleHub` / `ICircleClient`), in the partial `CircleHub.Discussion.cs`. It builds on spec 008's hub: `SetRoomSettings` (chat and reactions switches), `RaiseHand`, `LowerHand`, `LowerAllHands`, `GiveFloor`, `Hands`, `React`, `Reactions`, `Say`, `HideMessage`, `LikeMessage`.

## Authorisation rules (apply to every method)

1. The caller must have entered a circle (`not-entered`). The server re-resolves membership and the circle's open state on **every call**: `not-a-member` otherwise.
2. The **animator role comes from the database row**, never from a client claim. Animator methods go through `DiscussionAnimatorAsync`, which answers `animator-only` and audits the refusal as `discussion.refused` (method name and ids, at most 5 rows per member per minute).
3. An audience-screen connection (`EnterAudience`) is read only: every method below answers `audience-read-only`.
4. Every method introduced by this spec except `EnableDiscussion` and `DisableDiscussion` answers `call-off` when `DiscussionOn` is false. Spec 008's methods (hands, reactions during a presentation, chat, `SetRoomSettings`) and `Reply` keep working with the call off. When `LiveKit:Url` is not set, `EnableDiscussion` answers `calls-unavailable`.
5. Every animator action that changes permissions on the call server waits for the call server's answer. If it fails, the method answers `try-again` and the change is not kept (the database and memory stay as before).
6. Per-member limits use `RoomLimits`, so they cover all of a member's tabs. Over a limit the call answers `slow-down` (reactions are ignored silently, spec 008).
7. No payload (message text, tokens) is ever logged or audited.

## Client to server

| Method | Who | Effect | Errors |
|---|---|---|---|
| `EnableDiscussion(bool videoAllowed, string speaking)` | animator | **Starts the call** when off: sets `DiscussionOn = true`, `DiscussionVideo`, `DiscussionSpeaking` (`'hand'` or `'open'`), creates the LiveKit room, audits `discussion.on` (with `videoAllowed` and `speaking`), broadcasts `Discussion` and `CallNotice('call-started')`. **While on**: changes video (cameras stop within 2 s when false, `CallNotice('video-off'/'video-on')`, audited as `discussion.on` with the new value, as T901 already does) and the mode if it differs (same as `SetSpeakingMode`). Same values: nothing happens | `animator-only`, `calls-unavailable`, `mode-invalid`, `try-again` |
| `DisableDiscussion()` | animator | **Ends the call**: sets `DiscussionOn = false`, deletes the circle's raised hands, deletes the LiveKit room (everyone disconnects), clears the call's moderation state, audits `discussion.off` (reason `animator`), broadcasts `Discussion`, `Hands`, `CallNotice('call-ended')`. Off already: nothing happens | `animator-only` |
| `SetSpeakingMode(string mode)` | animator | `'open'` or `'hand'`. Stores it, recomputes every participant's microphone permission on the call server within 2 s (people muted by the animator stay muted), audits `call.mode`, broadcasts `Discussion` and `CallNotice('mode-open'/'mode-hand')` | `animator-only`, `call-off`, `mode-invalid`, `try-again` |
| `RaiseHand()` / `LowerHand(Guid? memberId)` / `LowerAllHands()` (spec 008) | participant / member / animator | As in 008, plus a limit of 6 raises or lowerings of one's own hand per 10 s per member (`hand`, FR-921; it applies with or without a call; the animator lowering someone else's hand is not counted). With a call on, lowering the floor holder's hand (by themselves or the animator) also removes their microphone permission in Hand to speak and sends them `CallNotice('floor-taken')` | 008 codes, `try-again` |
| `GiveFloor(Guid memberId)` (spec 008) | animator | As in 008 (one floor; the previous holder's hand goes down). With a call on in Hand to speak: the new holder gets microphone permission, the previous one loses it, both get a `CallNotice` (`floor-given`, `floor-taken`). In Open mic it only marks the person. Never switches a device on | 008 codes, `try-again` |
| `MuteMember(Guid memberId, string source)` | animator | `source` is `'microphone'` or `'camera'`. Removes that source from the person's permissions until allowed again (the track stops for everyone within 1 s). Kept in memory and applied to every new pass. `CallNotice('mic-muted'/'camera-stopped')` to the person. `member-invalid` when the person is not a current member or is an animator (an animator may always speak). Not audited | `animator-only`, `call-off`, `member-invalid`, `source-invalid`, `try-again`, `slow-down` |
| `AllowMember(Guid memberId, string source)` | animator | Gives that source back (if the mode and video allow it). Switches nothing on. `CallNotice('mic-allowed'/'camera-allowed')` to the person | same as above |
| `MuteEveryone()` | animator | Open mic only: mutes every participant's published microphone track. Permissions are unchanged, so people may unmute again. `CallNotice('muted-everyone')` to the circle | `animator-only`, `call-off`, `mode-invalid` (in Hand to speak), `try-again`, `slow-down` |
| `RemoveFromCall(Guid memberId)` | animator | Adds the member to this call's removed set, removes them from the call server, takes them off the roster at once (`CallRoster` to the room, so other screens drop the tile without waiting for the call server, issue #275), lowers their hand. They stay in the circle. The token endpoint refuses them and the webhook removes them again if they reconnect with an earlier pass. Audits `call.removed`. `CallNotice('removed')` to the person | `animator-only`, `call-off`, `member-invalid`, `try-again`, `slow-down` |
| `AllowBack(Guid memberId)` | animator | Clears the removal for this call. `CallNotice('allowed-back')` to the person | `animator-only`, `call-off`, `member-invalid` |
| `React(string kind)` (spec 008) | member | As in 008, and also allowed while a call is on (not only during a presentation). Nothing is counted or stored outside a presentation | `reaction-invalid` |
| `SetRoomSettings(RoomSettings)` (spec 008) | animator | Unchanged. It is the **Chat** switch (`chat: 'paused'` is "chat off") and the reactions switch | 008 codes |
| `Reply(long parentId, string text)` | member | Same path as `Say` (clean, safety filter, 008 limits and modes) with `ReplyToId`. Broadcasts `Message` | `message-invalid`, `message-unsafe`, `reply-invalid`, `chat-paused`, `slow-mode:<s>`, `slow-down` |

Animator action limit (`call-admin`): 30 per 10 s per member, across `MuteMember`, `AllowMember`, `MuteEveryone`, `RemoveFromCall`, `AllowBack`, `SetSpeakingMode`.

`Enter(circleId)` pushes `Discussion` and `CallRoster` to the caller, then 008's `RoomSettings` and `Hands`. `EnterAudience` pushes `Discussion` (so the projector knows a call is on), never the roster.

**Removed on 2026-10-08** (never shipped on the server): `JoinStage`, `LeaveStage`, `WatchStage`, `StopWatching`, `TakeFloor`, `RemoveFromStage`, `AllowUnmute`, `SetMedia`, `Signal`, `StartRecording`, `StopRecording`, `AcknowledgeRecordingNotice`. Joining and leaving the call happen on the call server with a pass (`contracts/rest.md`).

## Server to client (`ICircleClient` additions)

```ts
type DiscussionState = {
  on: boolean                        // the call is on
  videoAllowed: boolean              // video call (false: audio call)
  speaking: 'hand' | 'open'
  available: boolean                 // false when the environment has no call server
  away: 'none' | 'away'              // 'away' while the animator-away timer runs
  awayEndsAt: string | null          // when the call will end if no animator returns
}
type CallNoticeKind =
  // to the whole circle (also drawn as a live line in the chat, never stored)
  | 'call-started' | 'call-ended' | 'video-on' | 'video-off' | 'mode-open' | 'mode-hand' | 'muted-everyone'
  // to one member's connections
  | 'floor-given' | 'floor-taken' | 'mic-muted' | 'mic-allowed' | 'camera-stopped' | 'camera-allowed' | 'removed' | 'allowed-back'
```

| Event | To | When |
|---|---|---|
| `Discussion(state)` | circle group (audience screen included) | a switch, the mode or the away state changed; also pushed on `Enter` and `EnterAudience` |
| `CallNotice(kind, byMemberId?, subjectMemberId?)` | circle group, or one member's group (see the kinds) | tells people what happened, in kind words (the client translates). Never stored |
| `CallRoster(memberIds)` | circle group (not the audience screen) | who is in the call, in join order (the same list for everyone; a rejoin goes last), from the call server's webhooks, coalesced through `LiveThrottle` (at most every 250 ms, latest last) |
| `Hands(view)` (008) | circle group | the queue or the floor changed. The audience screen renders only the count |
| `Reactions(burst)` (008) | circle group (audience screen included) | at most every 400 ms while reactions arrive |
| `RoomSettings(settings)` (008) | circle group | the chat or reactions switch changed |
| `Message(message)` (008) | circle group | includes replies (`replyToId`). No call system lines |

**Removed**: `Stage`, `StageNotice`, `Signal`, `Recording`, `RecordingWarning`.

## Error codes (stable strings, translated by the client)

`animator-only`, `not-a-member`, `not-entered`, `audience-read-only`, `call-off`, `calls-unavailable`, `mode-invalid`, `source-invalid`, `member-invalid`, `removed-from-call`, `try-again`, `slow-down`, `reply-invalid`, `message-invalid`, `message-unsafe`, `chat-paused`, `slow-mode:<secondsLeft>`, and spec 008's hand codes (`animator-cannot-raise`, `hand-invalid`). Errors never carry internal detail.

## Time-based rules

| Rule | After | Effect |
|---|---|---|
| Animator away | `Discussion:AwayEndSeconds` (300) with no animator connection during a call | the call ends (reason `animator-away`), `Discussion.away` goes back to `none` |
| Floor holder dropped | spec 008's hand grace (30 s) | the hand and the floor go; in Hand to speak the microphone permission goes with them |
| Empty room | 300 s with nobody in the call (LiveKit `empty_timeout`) | the call server closes its room; the next pass recreates it. The call stays on |

## Privacy rules

- The hub never carries or logs audio, video, tokens or ICE.
- Nothing in this contract writes a row except `DiscussionOn`, `DiscussionVideo`, `DiscussionSpeaking`, spec 008's hands, chat and likes, and the audit rows `discussion.on`, `discussion.off`, `call.mode`, `call.removed`, `discussion.refused`.
- The projector never receives `CallRoster` and never gets a pass.
