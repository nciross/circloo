# Hub contract: live room for big circles (spec 008)

Extends the circle hub (`/hubs/circle`, `CircleHub` / `ICircleClient`). Every method re-resolves the caller's membership (`CurrentAsync`) and refuses with `HubException` codes. The audience screen (`EnterAudience`) receives the same circle-group events but cannot act.

## Client → server

| Method | Who | Effect | Errors |
|---|---|---|---|
| `Say(string text)` (existing) | member | 1–280 characters, safety filter. Participants are limited to 5 per 10 s across their tabs. In `slow` mode a participant can send one message per 10 s (counted from their last stored message). In `paused` mode participants can't send. The animator is never limited. Broadcasts `Message` | `message-invalid`, `message-unsafe`, `chat-paused`, `slow-mode:<secondsLeft>`, `slow-down` |
| `LikeMessage(long messageId)` | member | Toggles the caller's like. Refused on their own message or a hidden one. Counts the likes and coalesces `MessageLikes` (250 ms). Sends `MyLike` to the caller's connections | `message-invalid`, `own-message`, `message-hidden` |
| `HideMessage(long messageId, bool hidden)` | animator | Sets or clears `HiddenAt`. Hiding sends `MessageHidden(id)` to members and `Message` (with `hidden: true`) to the animator group. Unhiding sends `Message` to everyone | `animator-only`, `message-invalid` |
| `SetRoomSettings(RoomSettings settings)` | animator | Stores chat mode, reactions and Pirikoo quiet on the circle. Broadcasts `RoomSettings` | `animator-only`, `settings-invalid` |
| `React(string kind)` | member | `kind` ∈ `clap heart laugh wow like party`. Ignored silently when reactions are off or the caller is over 5 per 10 s. Otherwise added to the circle's reaction buffer, which is flushed every 400 ms as `Reactions` and added to the running presentation's totals | `reaction-invalid` (unknown kind only) |
| `RaiseHand()` | participant | Adds the caller to the queue, or does nothing if their hand is already up. Broadcasts `Hands` | `animator-cannot-raise` |
| `LowerHand(Guid? memberId)` | member / animator | Lowers the caller's own hand, or (animator) `memberId`'s hand. Broadcasts `Hands` | `animator-only` (lowering someone else) |
| `LowerAllHands()` | animator | Clears the queue and the floor. Broadcasts `Hands` | `animator-only` |
| `GiveFloor(Guid memberId)` | animator | The previous speaker's hand is lowered. `memberId` gets the floor and their hand is removed from the queue. Broadcasts `Hands` | `animator-only`, `hand-invalid` (the member's hand isn't up) |

`Enter(circleId)` (existing) also returns the latest state: it pushes `RoomSettings` and `Hands` to the caller. The online list stays in `Enter`'s return value; the group update is coalesced (see `Presence`).

## Server → client (`ICircleClient` additions)

```ts
type RoomSettings = { chat: 'open' | 'slow' | 'paused'; reactions: boolean; pirikooQuiet: boolean }
type HandsView = {
  queue: { memberId: string; raisedAt: string }[]   // oldest first
  floor: string | null                              // member id who has the floor
}
type ReactionBurst = Partial<Record<'clap' | 'heart' | 'laugh' | 'wow' | 'like' | 'party', number>>
```

| Event | To | When |
|---|---|---|
| `Presence(online: string[])` (existing) | circle group | at most every 250 ms per circle, latest list last (coalesced) |
| `MemberJoined(member)` (existing) | circle group | a new member joined; `member.ring` included |
| `Message(message)` (existing) | circle group (hidden messages: animator group only) | sent, unhidden; `message.likes` and `message.hidden` included |
| `MessageHidden(id)` | circle group (animator clients ignore it: they keep the message, marked hidden) | the animator hid a message |
| `MessageLikes(id, count)` | circle group | like count changed, coalesced per message (250 ms) |
| `MyLike(id, liked)` | the member's connections | after the member's own toggle |
| `RoomSettings(settings)` | circle group | settings changed or reset (activity change, presentation start) |
| `Reactions(burst)` | circle group (audience screen included) | at most every 400 ms per circle while reactions arrive |
| `Hands(view)` | circle group | the queue or the floor changed |

## Privacy rules

- **Projector:** the audience screen gets `Hands` (member ids only), but it renders only the count. It never renders the chat (FR-820).
- **Hidden messages:** they never reach non-animator connections, through either events or the circle view.
- **Reactions:** they carry no member ids. Totals are stored per presentation session only (FR-818).
