# Feature Specification: Live circles (animator, participants, activities, circloo chat)

**Feature branch**: `feat/<issue>-*` per task · **Created**: 2026-10-02 · **Status**: Ready
**Idea issues**: #3 (circles & invitations), #62 (avatars and funny characters), #63 (activity catalog for the animator)
**Owner direction (verbatim intent)**: a circle is like a meeting or a collaboration session. The animator,
once signed in, creates a circle, chooses its activities, and gets a link. Each participant uses the link to
join with a simple private name and must pick a funny character. In the circle everyone is present in real time.
The animator picks an activity category, then an activity; it opens as a conversation with circloo, the AI,
"like Claude", with a line-drawn panda animation while circloo thinks.

## User scenarios

### US1 — The animator creates a circle and shares a link (P1)
A signed-in person names a circle ("Monday retro"), picks one or more activities from a catalog grouped by
category, and creates it. They become its **animator**. They get a join link and a short code to copy or share.

1. Given I am signed in, when I create a circle with a name (1–60 chars) and at least one activity, then I see
   its room, a join link `/join/<code>` and a copy button.
2. The circle appears in "My circles" on Home, newest first, with its participant count.
3. I can close a circle; its link stops working and everyone in it sees that it ended.

### US2 — A participant joins with a name and a character (P1)
Anyone with the link opens it, sees the circle name and the animator's name, types a private name
(1–24 chars, only visible inside this circle) and **must** pick one of twelve characters. No account, no email.

1. Join is impossible without a name and a character; the form says which is missing.
2. A character already taken in the circle is shown as taken; two people can't be the same character
   (twelve characters → at most twelve participants plus the animator per circle in this version).
3. A wrong, closed or expired code shows a clear "this circle is not open" page.
4. A participant who reloads stays in (browser-session guest cookie, at most 12 h). Joining another circle replaces it.
5. A signed-in person opening a link joins as themselves (their display name is prefilled) but still picks a character.

### US3 — Everyone is in the circle, live (P1)
The room shows the circle as a ring of characters. People appear when they join and fade when they leave
(presence within 5 s). The animator is marked. Works on phones.

### US4 — The animator runs an activity with circloo (P1)
The animator opens the activity picker: categories (Icebreakers, Energizers, Retro, Decide), then an activity
from those chosen for this circle. Starting it shows it to everyone. The activity is a **conversation** with
circloo: circloo opens it (e.g., asks the first icebreaker question), participants answer in the chat, and the
animator can talk to circloo ("another question", "summarise what people said", "make it sillier").
circloo's replies stream in; while it thinks, a line-drawn panda animates. Every circloo message is labelled AI.

1. Only the animator can start, switch or end an activity and talk to circloo.
2. Participants can send short messages (1–280 chars) in the current activity.
3. circloo replies count against the animator's daily AI allowance; when it is used up, circloo says so kindly
   and the activity continues without AI.
4. Unsafe input or output is refused with a kind message (same safety policy as 002).
5. In dev, circloo runs on a free local responder (no model, no cost).

## Requirements
- FR-301 Circle: name, join code (10 chars, unambiguous alphabet, ≥ 50 bits), activities (1–8 ids from the
  catalog), status open/closed, expiry 7 days after creation, locale.
- FR-302 Membership: role animator | participant, private name, character, user id or guest id, joined/left.
- FR-303 Join is rate limited per IP; codes are compared in constant time via unique index lookup.
- FR-304 Guest identity is a separate HttpOnly `__Host-` cookie scheme; user-only endpoints require the user claim.
- FR-305 Real time over SignalR (`/hubs/circle`): presence, activity changes, messages, AI deltas. Only members
  of a circle join its group.
- FR-306 Activity catalog is data (ids, category, i18n keys, prompt hints), in four languages.
- FR-307 Chat messages persist (last 200 per circle are loaded on join); names and messages are text only.
- FR-308 Every string in en, fr, ar (RTL), es; WCAG 2.2 AA; live updates announced politely.

## Success criteria
- SC-301 An animator goes from Home to a shareable link in under 30 s.
- SC-302 A participant joins from a link in under 20 s on a phone.
- SC-303 Presence and messages reach others in under 1 s on a local network.

## Out of scope (later issues)
Scale-out across replicas (needs Azure SignalR/Web PubSub backplane), email invites, persistent circles
with recurring meetings, votes and presentations (#64), whiteboard (#61), moderation tools beyond removal.
