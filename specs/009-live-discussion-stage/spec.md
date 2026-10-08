# Feature Specification: Live discussion: group audio and video calls with chat, raised hands and emoji

**Feature Branch**: `feat/009-live-discussion-stage` (first written on `docs/212-live-discussion-spec`; amended on `docs/212-livekit-group-calls`)

**Created**: 2026-10-05 · **Amended**: 2026-10-08 (founder direction: group calls on a self-hosted call server, performance first; recording dropped)

**Status**: Planned, amended (plan, research, data model, contracts, quickstart and tasks updated; see `plan.md`). One founder decision blocks production only: hosting of the call server (research D8).

**Parent idea**: #212 (type:idea, area:spaces) Epic: E4 (shared live activities) with E2 (circles and roles). Related: #96 (superseded), #166 and spec 008 (sidebar, chat, reactions, raised hands), #174 (big circles), #126 (Impeccable runs), spec 006 (presenting), #244 (room workspace and its Call tab), #255 (training, certification and exams: a separate idea, not part of this spec).

**Input**: User description (2026-10-05): "Add the possibility that the animator and participants discuss and exchange ideas, and request to talk by raising a hand, with video, audio and a conversation. [...] No storage of audio or video, only conversation. The feature must be enabled or disabled by animators."

**Amendment input** (founder, 2026-10-08, verbatim): "start now conversation and interaction in circle status open animators can activate or disable chat audio group call or video group call only chat message saved in db but other not save so can send emoji participants can raise hand to speak ... i want like google chat or teams or zoom performance first"

## Design and test workflow

- All UI of this feature MUST go through Impeccable: `/impeccable shape` first, then `/impeccable craft`, then `audit` and `critique` before merge (constitution IV, `docs/design/anti-ai-look.md`).
- When the Impeccable skill cannot run in a session (#126), `ux-designer` reviews by hand against `docs/design/anti-ai-look.md` and WCAG 2.2 AA, and the PR lists the skipped Impeccable steps so they can be rerun.
- Tests follow constitution VI: API tests (xUnit + Testcontainers) for every rule, Vitest for client logic, Playwright with fake media devices against a local call server for each story (one Arabic RTL run, axe), and a load and network test for the performance targets.

## Clarifications

### Session 2026-10-08

Founder decisions, binding. They supersede the earlier ones where they conflict.

- Q: Which call engine? -> A: **A self-hosted LiveKit call server (SFU)** replaces the browser-to-browser mesh. The goal is Zoom, Teams or Google Meet quality group calls, performance first: several video qualities per camera, quality that adapts to each screen and network, an active speaker, good behaviour on phones and weak networks. Audio and video pass through our own call server but are **never recorded or stored**: no recording, no export of media, in any environment. This supersedes research R1 and R2 ("no SFU") and the 8-viewer cap (D1).
- Q: What does the animator control while the circle is open? -> A: **Three switches**: Chat on or off, Audio group call on or off, Video group call on or off. Video implies audio. The server enforces them; a participant's attempt is refused. Chat on or off is the chat pause of spec 008 (participants read but cannot send). The "Allow cameras" switch of 2026-10-05 becomes the video switch.
- Q: How do people speak? -> A: The animator picks a **speaking mode** per call: **Open mic** (anyone can unmute, like Zoom; a raised hand is only a signal) or **Hand to speak** (participants stay muted until the animator gives them the floor). It is enforced on the call server through each person's permissions, not only in the interface.
- Q: What is saved? -> A: **Only chat messages are saved.** Calls, who joined, who spoke, the floor, mutes, emoji reactions, raised hands and every other call event are never saved. **User Story 6 (record the session as a text transcript) is dropped entirely**, with its requirements, entities and tasks.
- Q: Emoji? -> A: Emoji reactions stay during calls. They are live only and reuse spec 008's reactions.
- Q: Raised hands? -> A: Raise hand to speak stays.

Interpretations recorded by the plan (not new founder decisions; the founder can override them):

- "Raised hands are not saved" means no history is kept. A raised hand exists only while it is up (spec 008 keeps the live queue in a table so it survives a reload) and disappears when it is lowered, given the floor and then taken, or the call ends.
- "Calls are not saved" includes the chat history: the call no longer writes "call started" or "Amina joined" lines into the stored chat. Those lines are shown live and never stored.
- The security audit trail keeps only switch changes, removals from a call and refused attempts, with ids and no content (constitution VIII). It never records who joined, who spoke, the floor or mutes. Founder confirmation D10.
- In Hand to speak mode, one participant holds the floor at a time (spec 008's single floor), plus the animator, who can always speak. Several floors at once can be a later setting.
- The default speaking mode for a new call is Hand to speak (everyone starts muted, as the 2026-10-05 spec said). The animator changes it in one tap before or during the call.

### Session 2026-10-05 (kept for history; superseded items are marked)

- Q: Who may read a saved transcript? -> A: The animator only. **Superseded 2026-10-08: no transcript exists.**
- Q: What consent applies to recording? -> A: Notice and indicator. **Superseded 2026-10-08: no recording exists.**
- Q: What happens to #96? -> A: Closed as superseded by #212. Its fun filters and local camera recording conflict with "no media stored". **Still valid.**
- Q: Stage size and relay? -> A: Up to 8 people on camera or microphone (peer mesh), STUN only. **Superseded 2026-10-08: the call server carries the whole circle; its own relay handles strict networks.**
- Q: Watching limit (plan D1)? -> A: Opt-in, capped at 8 viewers. **Superseded 2026-10-08.**
- Q: Strict networks (plan D2)? -> A: STUN only at launch. **Superseded 2026-10-08: the call server falls back to TCP and to TLS on port 443.**
- Q: Keeping minors off camera (plan D3)? -> A: A per-circle animator switch "Allow cameras", default on. **Still valid, now the video switch: audio call means no cameras.**
- Q: STUN provider (plan D4)? -> A: Cloudflare public STUN. **Superseded 2026-10-08: no third party; the call server answers STUN itself.**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The animator switches chat, audio call and video call (Priority: P1)

Théo animates a team circle. While the circle is open, the room shows him three switches: **Chat**, **Audio call** and **Video call**. The call is off by default; the chat is on by default (spec 008). He starts a video call. Later he switches video off: cameras stop for everyone, and the call goes on with audio only. He switches the chat off for a focused moment: people can still read it but cannot write. He ends the call when the meeting is over.

**Why this priority**: every other story depends on the switches, and the founder made the animator their owner. Calls off by default protect families and classes that only want today's behaviour.

**Independent Test**: in a new circle, a participant sees no call control. The animator starts an audio call; the participant sees "Join call" within a second. The animator switches to video; the participant can now switch a camera on. The animator ends the call; everyone's audio stops within 2 seconds.

**Acceptance Scenarios**:

1. **Given** a circle that has never used calls, **Then** the call is off, chat is on, and no camera, microphone or call control is visible to participants.
2. **Given** I am the animator, **When** I start an audio call or a video call, **Then** every member in the room sees "Join call" within 1 second. Nobody is joined automatically and nobody is asked for a camera or microphone yet.
3. **Given** a video call, **When** the animator switches video off, **Then** every camera stops for everyone within 2 seconds, audio goes on, and the camera button is gone. Switching video back on lets people switch their camera on again; it never switches a camera on for them.
4. **Given** I am a participant, **When** I try to change any switch (through the interface or by sending the request myself), **Then** the server refuses it and nothing changes.
5. **Given** a call is running, **When** the animator ends it, **Then** all audio and video end for everyone within 2 seconds, raised hands are lowered, and the room shows "The animator ended the call".
6. **Given** the animator switches the chat off, **Then** participants can still read earlier messages, cannot send new ones, and read "The animator paused the chat" (spec 008). The animator can always write.
7. **Given** the call server is not available in this environment, **Then** the animator sees "Group calls are not available here" instead of the call switches, and chat and hands keep working.
8. **Given** the interface is in Arabic, **Then** the switches, their labels and explanations are right-to-left and readable.

---

### User Story 2 - Join a group call and see who is talking (Priority: P1)

Amina taps **Join call**. Within two seconds she hears Théo. In a video call she sees a grid of the people with their camera on, the person speaking highlighted, and her own small preview. With 30 people in the call, she sees one page of tiles and can move to the next; the person speaking is always on her screen. On her phone she sees fewer, larger tiles and the controls sit under her thumb. She taps **Leave** whenever she wants.

**Why this priority**: it is the call itself, and the founder asked for "performance first".

**Independent Test**: with fake devices and a local call server, five pages join a video call. Each hears the speaker within 2 seconds of joining. The speaker is highlighted on every page within a second of starting to talk. A phone-sized page shows at most 4 video tiles at once and decodes no more than that.

**Acceptance Scenarios**:

1. **Given** a call is on, **When** I tap Join call, **Then** I am in the call with my microphone and camera off, I hear the others within 2 seconds on a normal network, and the others see that I joined.
2. **Given** a video call with more people on camera than fit my screen, **Then** I see one page of tiles (at most 9 on a computer, 4 on a phone), I can move between pages, and the active speaker is always visible (pinned or brought onto my page).
3. **Given** someone speaks, **Then** their tile and their name in the people list show "speaking" within 1 second, by an outline and a text label, never colour alone.
4. **Given** a person's camera is off, **Then** I see their character and name instead of a black square (FR-912).
5. **Given** my phone, **Then** the call controls (microphone, camera, raise hand, reactions, leave) are reachable with one thumb, never cover the chat composer, and the call keeps its audio when I scroll the chat.
6. **Given** I lock my phone or switch to another app, **Then** my camera stops (the browser requires it), my audio continues where the browser allows it, and my camera stays off when I come back until I switch it on.
7. **Given** I tap Leave, **Then** my audio and video stop at once and I am back in the room with chat and hands.
8. **Given** the interface is in Arabic, **Then** the grid order, pages and controls mirror, and names of mixed direction stay readable.

---

### User Story 3 - Speaking mode, raised hands and the floor (Priority: P1)

Before or during the call, Théo picks **Open mic** or **Hand to speak**. In Open mic anyone can unmute; a raised hand only says "I would like to speak". In Hand to speak participants cannot unmute: Amina taps **Raise hand**, sees her place in the queue, and when Théo gives her the floor she can switch her microphone on. Théo can take the floor back, mute someone, stop someone's camera, mute everyone at once, or remove someone from the call.

**Why this priority**: it is how a call stays polite with 5 or 100 people, and the founder asked for both modes and for raise hand to speak.

**Independent Test**: in Hand to speak, a participant who forces an unmute through a modified client publishes nothing (the call server refuses). The animator gives her the floor and she is heard. The animator switches to Open mic and every participant can unmute. The animator removes a participant, who cannot rejoin this call with an earlier pass.

**Acceptance Scenarios**:

1. **Given** a call starts, **Then** the animator sees the speaking mode (default Hand to speak) and can change it before and during the call. Everyone sees the current mode in plain words ("Raise your hand to speak" or "Open mic").
2. **Given** Hand to speak, **When** I am not the animator and do not have the floor, **Then** my microphone button is replaced by Raise hand, and the call server refuses any audio I try to send, even from a modified client.
3. **Given** Hand to speak and hands are up, **When** the animator gives the floor to Amina, **Then** her hand goes down, she is told "You have the floor. Switch your microphone on when you are ready", and she can send audio. Nothing is switched on for her. The previous floor holder (if any) is muted and told so kindly.
4. **Given** Open mic, **Then** anyone in the call can unmute, a raised hand is shown to the animator as a signal, and the animator can still give the floor (it only highlights the person).
5. **Given** I raise my hand, **Then** I see my place ("You are 2nd"), I can lower it myself, and everyone sees the queue in arrival order (spec 008).
6. **Given** I am the animator, **When** I mute someone's microphone or stop their camera, **Then** it takes effect for everyone within 1 second, the person reads what happened in kind words, and they cannot switch that device back on until the animator allows it again.
7. **Given** Open mic, **When** the animator taps Mute everyone, **Then** every participant's microphone goes off within 1 second; participants may unmute again (a reset, not a lock).
8. **Given** I am the animator, **When** I remove someone from the call, **Then** they leave the call within 1 second, stay in the circle with chat, and cannot rejoin this call unless the animator lets them back. Ending the call clears this.
9. **Given** the animator switches from Hand to speak to Open mic or back, **Then** everyone's microphone permission follows within 2 seconds; people who were muted by the animator stay muted.
10. **Given** the interface is in Arabic, **Then** the queue, the mode and the animator's menus are right-to-left.

---

### User Story 4 - Camera and microphone: permissions and fallbacks (Priority: P1)

Before the browser asks for the camera or microphone, circloo explains in one short sentence why and that nothing is kept. If the person says no, has no device, or has no camera, the call still works for them: they can listen, chat, raise a hand and react.

**Why this priority**: real devices and networks fail often, and the feature must never leave a person stuck.

**Independent Test**: with fake devices, a person accepts audio only and is heard. Another denies permission and still listens, chats and raises a hand. A third has no microphone and reads a clear message. A fourth is on a network that blocks UDP and still joins.

**Acceptance Scenarios**:

1. **Given** I am about to switch on a device for the first time in this session, **Then** I first see a short explanation ("Your camera and microphone go to the people in this call through circloo's call server. Nothing is recorded or kept.") with a Continue button, and only then does the browser ask.
2. **Given** I deny permission, **Then** I see how to allow it again in my browser, and I can still listen, chat, raise a hand and react.
3. **Given** my device has no camera, **Then** I can take part with audio only and the others see my character and name.
4. **Given** my device has no microphone and no camera, **Then** I can still join and listen, and the interface says so plainly.
5. **Given** my camera or microphone is used by another application, **Then** I see a clear message and a Try again button.
6. **Given** my browser cannot do live audio or video, **Then** I read "This browser cannot join the call. You can still chat and raise your hand." and the rest works.
7. **Given** my network blocks the usual call traffic (strict office firewall), **Then** the call connects through the fallback on the web port (TLS on 443) within 5 seconds, possibly with lower video quality, and I am not asked to do anything.
8. **Given** my connection becomes poor, **Then** video quality drops first, then video pauses, while audio keeps going, and a "Weak connection" notice appears on my screen. It recovers by itself.
9. **Given** the call server is briefly unreachable, **Then** I see "Reconnecting…", the call resumes by itself within 15 seconds if the network comes back, and otherwise I am back in the room with a Join again button.
10. **Given** French, Arabic or Spanish, **Then** every message above exists in all four languages.

---

### User Story 5 - Talk in writing: the conversation (Priority: P2)

Everyone can also exchange ideas in writing next to the call: short messages, replies in a thread, likes. Théo can hide a message and pause the chat. Chat messages are the only thing this feature keeps.

**Why this priority**: the founder wants conversation as part of the discussion. It is P2 because spec 008 already provides most of it.

**Independent Test**: during a call, participants post messages and replies. Everyone sees them in order. After the call, the chat is still there; nothing about the call is.

**Acceptance Scenarios**:

1. **Given** a call is on or off, **Then** the circle chat of spec 008 is the conversation: same safety filter, rate limits, slow mode, pause, likes and hiding. This feature adds no second chat.
2. **Given** I want to answer a specific message, **When** I reply, **Then** my message shows under it as a one-level thread.
3. **Given** call status changes (call started or ended, floor given, someone muted or removed), **Then** the room shows them as small live lines in the conversation, and they are **not** stored: a reload or a later visit does not show them.
4. **Given** the interface is in Arabic, **Then** the conversation, threads and composer mirror.

---

### User Story 6 - Record the session as a text transcript

**Removed on 2026-10-08** by founder decision: nothing about a call is saved, so there is no recording and no transcript. FR-914 to FR-920, SC-905, the `Recording` and `RecordingEvent` entities and tasks T910 to T913 are removed with it.

---

### User Story 7 - Everyone can follow along with keyboard and screen reader (Priority: P2)

A participant using a screen reader hears when the call starts, when hands go up, when the floor changes and when they are muted. Everything in the call works from the keyboard. Under reduced motion, nothing waves, bounces or floats.

**Why this priority**: WCAG 2.2 AA is the floor. It is its own story so it is tested on its own.

**Independent Test**: with a keyboard only, a person joins a call, raises a hand, unmutes when given the floor, sends a reaction and leaves. A screen-reader run hears each change once, politely.

**Acceptance Scenarios**:

1. **Given** only a keyboard, **Then** the three switches, the speaking mode, join, leave, microphone, camera, raise and lower hand, reactions, page changes in the grid, and every animator action are reachable and usable, with visible focus and logical order.
2. **Given** a screen reader, **Then** these changes are announced politely and grouped (never one interruption per event during a burst): call started or ended, a hand raised or lowered, the floor given or taken, me muted or allowed, me removed. Active speaker changes are not announced one by one; the current speaker is available as text on demand.
3. **Given** reduced motion, **Then** speaking indicators, joins and reactions use no movement. A speaking person is shown with a text label ("speaking") as well as any outline.
4. **Given** a person who cannot see the grid, **Then** each person's name and state (in call, muted, camera on, speaking, has the floor) is available as text in the people list.
5. **Given** a participant who is deaf or hard of hearing, **Then** the conversation is the way to take part. Captions are out of scope for this feature (a later idea).
6. **Given** any of the four languages, **Then** all announcements are translated. In Arabic, focus order and arrow keys follow right-to-left.

---

### User Story 8 - Emoji reactions during a call (Priority: P2)

During a call, Lucía taps 👏. It floats briefly over the call on every screen in the room. When many people react together, the screen shows "👏 ×12" instead of a flood.

**Why this priority**: it is the lightest way to take part without speaking, and the founder asked for it. The call works without it.

**Independent Test**: twenty pages tap 👏 within two seconds during a call. Every page shows one grouped burst ending in "👏 ×20". After the call, nothing about the reactions is stored.

**Acceptance Scenarios**:

1. **Given** a call is on, **When** I tap a reaction from spec 008's set (👏 ❤️ 😂 😮 👍 🎉), **Then** it appears over the call on every screen in the room within 1 second and fades in about 2 seconds.
2. **Given** many reactions arrive close together, **Then** they are grouped with a count and never hide a speaker's face for more than about 2 seconds.
3. **Given** I tap very fast, **Then** at most 5 of my reactions count every 10 seconds (spec 008), extra taps are ignored silently.
4. **Given** the animator switches reactions off (spec 008 room setting), **Then** the reaction bar disappears from the call.
5. **Given** reduced motion, **Then** reactions show as a small counter, without movement, and a screen reader hears a summary at most every few seconds.
6. **Given** a call ends, **Then** no reaction and no count from the call is stored. (During a running presentation, spec 008's anonymous totals per kind still apply; founder confirmation D11.)

---

### Edge Cases

- **The animator disconnects**: the call goes on. If the animator does not come back within 5 minutes, the call ends for everyone ("The animator ended the call"; configurable, decision D6). A second animator tab or device keeps the animator present.
- **The person with the floor drops**: they keep the floor for 30 seconds (spec 008's hand grace). After that the floor is free and the next hand is shown as next.
- **Network loss**: the call client reconnects by itself for up to 15 seconds; chat and hands recover with the room's connection. A dropped person who comes back gets the same permissions (floor, mutes) they had.
- **Strict corporate network**: UDP blocked falls back to TCP; TCP on unusual ports blocked falls back to TLS on port 443. If even that fails, the person reads "You can't join the call from this network. Chat and hands still work."
- **A removed person tries to rejoin with an earlier pass**: the call server removes them again within a second.
- **A person leaves the circle or is removed from it during a call**: they lose the call within a second.
- **The circle closes during a call**: the call ends for everyone.
- **Two animator tabs change a switch at the same moment**: one result stands, and everyone sees it.
- **The animator switches video off while someone shares a camera**: the camera stops; the person keeps audio.
- **A kids-safe circle**: the animator starts an audio call (no cameras). There is no separate kids-safe flag yet (research R13).
- **The audience screen (projector)**: it never joins the call (no audio, no video). It shows the number of raised hands and the reactions, as in spec 008.
- **A call left on with nobody in it**: it costs nothing; the call server room closes itself after a short empty time and reopens when someone joins.
- **The call server restarts**: everyone sees "Reconnecting…", then rejoins automatically when it is back; mutes made by the animator before the restart are re-applied when people rejoin (they are kept in the app's memory, not on the call server).
- **The API restarts during a call**: the call continues on the call server. Animator mutes held in memory are lost and people keep their current state; the animator can mute again. (Accepted with one replica, plan Complexity Tracking.)

## Requirements *(mandatory)*

### Functional Requirements

Numbering is stable. Changed requirements say so. Removed ones keep their number.

**Switches and roles**
- **FR-901** *(changed 2026-10-08)*: While a circle is open, the animator MUST have three switches: Chat (on or off), Audio call (on or off) and Video call (on or off; video implies audio). Calls MUST be off by default; chat follows spec 008 (on by default). Only the animator may change them. The server MUST enforce this on every request and MUST never trust the client's claim to be an animator.
- **FR-902** *(changed)*: Ending the call MUST end all audio and video for everyone and lower hands within 2 seconds. Switching video off MUST stop every camera within 2 seconds while audio continues. Switching chat off MUST let participants read but not send (spec 008 FR-811).
- **FR-903**: Every action in this feature (call pass, raise hand, floor, mute, remove, reaction, switch) MUST re-check circle membership and role on the server.

**Call, hands and floor**
- **FR-904** *(changed)*: Joining a call MUST be a person's own choice. Everyone MUST join with microphone and camera off. Nothing MUST be requested from the browser until the person switches a device on.
- **FR-905**: Participants MUST be able to raise and lower a hand. The queue MUST be in arrival order and visible to everyone with characters and names. This feature reuses the raised-hand queue of spec 008 and does not create a second one.
- **FR-906** *(changed)*: The animator MUST be able to give and take the floor, mute a person's microphone, stop a person's camera, allow either again, mute everyone (Open mic), lower one or all hands, and remove a person from the call. Anyone MUST be able to leave the call at any time.
- **FR-907** *(changed)*: Every member of the circle (up to the circle's maximum, spec 008) MUST be able to join the same call. Each screen MUST show a limited number of video tiles at once, with pages and the active speaker always visible (numbers in SC-912).
- **FR-908**: The person given the floor MUST choose when to switch their devices on. The animator MUST be able to switch a person's camera or microphone off, but MUST NOT be able to switch them on.

**Audio, video and permissions**
- **FR-909** *(changed)*: Audio and video MUST travel through circloo's own call server (an SFU), encrypted between each browser and that server. The call server MUST NOT record, store, transcribe or forward media anywhere else, in any environment; its recording and export features MUST stay disabled. No third-party service MUST receive media or connection checks.
- **FR-910** *(changed)*: Before the browser asks for a camera or microphone, the interface MUST explain in one short sentence why, that media goes through circloo's call server, and that nothing is recorded or kept.
- **FR-911** *(changed)*: The feature MUST degrade gracefully: permission denied, no device, no camera, audio only, device busy, unsupported browser, UDP blocked (fallback over TCP, then TLS on port 443), weak connection (video quality drops before audio) and a short outage (automatic reconnection). In every case chat, hands and reactions MUST keep working.
- **FR-912**: When the camera is off, others MUST see the person's character and name, never an empty box.

**Conversation**
- **FR-913** *(changed)*: The conversation MUST reuse the circle chat of spec 008 (safety filter, rate limits, slow mode, pause, likes, hiding) with one-level replies. Call status changes MUST appear as live lines that are not stored.

**Recording**
- **FR-914** to **FR-920**: *Removed 2026-10-08* (no recording or transcript, User Story 6).

**Security, abuse and limits**
- **FR-921** *(changed)*: The server MUST rate-limit call passes, raising hands, animator actions and reactions per person, and MUST validate every input. Abuse MUST be refused without an error detail that helps an attacker.
- **FR-922** *(changed)*: The animator MUST be able to remove a person from a call and hide chat messages. Switch changes, removals from a call and refused attempts MUST be audited with ids only. Who joined, who spoke, the floor, mutes and reactions MUST NOT be audited or logged.
- **FR-923** *(changed)*: The plan MUST include a threat model covering call passes (tokens), server-side permission enforcement, a removed person rejoining, the call server's exposure on the internet, its secrets, and what the call server can technically see.

**Quality**
- **FR-924**: Every new string MUST exist in English, French, Arabic and Spanish. Layouts MUST use logical CSS properties and be verified in Arabic RTL.
- **FR-925**: Every control MUST work from the keyboard. Changes of hands, floor, mutes and call state MUST be announced to screen readers, grouped, meeting WCAG 2.2 AA. Reduced motion MUST be respected. Captions are out of scope.
- **FR-926**: All UI MUST go through Impeccable shape and craft, then audit and critique, and follow `docs/design/anti-ai-look.md`. When Impeccable cannot run (#126), a manual `ux-designer` review stands in and is recorded.
- **FR-927**: Enterprise behaviour (for example "calls allowed" per organization) MUST be configuration if it is added later, never customer-specific code (constitution V). It is not part of this feature.

**Added 2026-10-08**
- **FR-928**: The animator MUST pick a speaking mode for each call, Open mic or Hand to speak, and MUST be able to change it during the call. The default is Hand to speak.
- **FR-929**: In Hand to speak, only the animator and the person with the floor (one at a time, spec 008) MUST be able to send audio. The call server MUST enforce it through the person's permissions, so a modified client cannot send audio without the floor.
- **FR-930**: Only chat messages (with their replies, likes and hidden state, spec 008) MUST be stored. Calls, who joined or left, who spoke and for how long, the floor, mutes, removals, raised-hand history, reactions and call status lines MUST NOT be stored in the database, in files or in logs. A raised hand MAY exist only while it is up.
- **FR-931**: During a call, members MUST be able to send spec 008's emoji reactions; they MUST show over the call on every screen in the room, grouped and rate-limited, and MUST NOT be stored when no presentation is running.
- **FR-932**: The call MUST adapt to each device and network: several qualities per camera, each screen receiving only the quality and the videos it shows, audio before video when bandwidth is short, and an active-speaker highlight.
- **FR-933**: A person removed from a call MUST NOT be able to rejoin it, even with a pass issued before, until the animator lets them back or the call ends.
- **FR-934**: The audience screen (projector) MUST NOT join the call. It shows the number of raised hands and reactions only.
- **FR-935**: When the call server is not configured for an environment, the call switches MUST be replaced by "Group calls are not available here", and chat, hands and reactions MUST keep working.

### Key Entities *(include if feature involves data)*

- **Call setting** (per circle, existing columns): call on or off, video allowed or not, speaking mode. Configuration, not content: it says what is allowed now, not what happened.
- **Chat setting** (existing, spec 008): open, slow or paused.
- **Raised hand** (existing, spec 008): person, time raised, whether they hold the floor. Exists only while the hand is up.
- **Call pass** (not stored): a short-lived token that lets one member join the circle's call with the permissions the server computed.
- **Call moderation state** (in memory only): who is muted or has the camera stopped by the animator, who is removed from this call. Lost when the call ends or the app restarts.
- **Audit event** (existing): switch changes, removals from a call, refused attempts, with ids only.
- **Removed**: `Recording` and `RecordingEvent`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

No usage numbers exist yet and none are invented. These are behaviour and performance targets. Performance targets assume the recommended single call server node (research R23) on a normal network unless stated, and are checked by the load and network test (task T929) and a manual device session. No result is claimed before they are run.

- **SC-901**: With calls off (the default), 100% of existing circles show no new control and behave exactly as before, verified by the existing end-to-end tests still passing.
- **SC-902** *(changed)*: A request to change a switch or the speaking mode, give or take the floor, mute, stop a camera, remove, or obtain a pass with more permissions than allowed, made by a non-animator, is refused in 100% of API tests.
- **SC-903** *(changed)*: **Join to first audio**: from tapping Join call to hearing the current speaker takes at most 2 seconds at the median and 4 seconds at the 95th percentile on a normal network, and at most 6 seconds when only TLS on port 443 works.
- **SC-904**: A raised hand reaches the animator's screen within 1 second, and the queue order always matches the order the hands were raised.
- **SC-905**: *Removed 2026-10-08* (recording indicator).
- **SC-906** *(changed)*: After a full call with switches, floor, mutes, removals and reactions, the database holds no row about the call other than chat messages (and the audited switch changes, removals and refusals), verified by a test that compares every table before and after. Server and call-server logs contain no message text and no media. The call server's configuration has no recording or export enabled, verified by a test on the shipped configuration.
- **SC-907**: When a person denies permission, has no device, or has no camera, they reach the chat, hand and reaction controls in under 5 seconds, in every one of the four languages.
- **SC-908**: Every new screen passes an automated accessibility check (WCAG 2.2 AA) in English and Arabic, and a screen reader hears at most one grouped announcement every few seconds during a burst.
- **SC-909** *(changed)*: In a manual session with 5 to 10 people on mixed devices, an animator who has never used the feature can start a call, change the speaking mode, give the floor and end the call without help.
- **SC-910**: **Call size, audio**: one call holds the whole circle (100 people, the default maximum) with up to 6 people speaking at once, with the call server's CPU under 70% and no person's audio dropping out.
- **SC-911**: **Call size, video**: one call holds 25 people with cameras on and the rest listening, with the call server's CPU under 70%.
- **SC-912**: **Tiles and decoding**: a computer shows at most 9 video tiles per page and a phone at most 4. A device never decodes more videos than the tiles it shows plus one (the speaker), verified from the browser's statistics in the end-to-end test. Each tile receives a quality that fits its size (a phone tile never receives more than about 360p).
- **SC-913**: **Active speaker and moderation speed**: the speaking highlight follows the speaker within 1 second; a mute, a floor change, a camera stop or a removal takes effect for everyone within 1 second; a switch change within 2 seconds.
- **SC-914**: **Weak networks**: with 10% packet loss and 150 ms of added delay, audio stays continuous (less than 10% of audio concealed by the browser) and video drops to a lower quality without freezing for more than 2 seconds. With 30% loss, audio continues and the person sees "Weak connection".
- **SC-915**: **Phones**: on two reference phones (an iPhone 12 or newer with Safari, and a mid-range Android from 2023 or newer with Chrome), a 30-minute video call with 4 tiles shown stays smooth (the chat scrolls without stutter) and the battery use is recorded in the test report. The target is under 15% battery for 30 minutes; it is measured, not claimed.
- **SC-916**: **Strict networks**: a browser whose UDP traffic is blocked joins within 6 seconds through the fallback, in the network test.

## Out of scope

- Recording, storing, uploading or exporting any audio, video or transcript, by circloo, the call server or the browser.
- Speech-to-text, summaries of speech, captions and live subtitles.
- Screen sharing (a later idea; presenting slides stays in spec 006).
- Breakout rooms, virtual backgrounds, camera filters, phone dial-in.
- End-to-end encryption that hides media from circloo's own call server (research R26 explains why not now).
- Native mobile apps (the browser works on phones).
- Several people holding the floor at once in Hand to speak (a later setting).
- Co-animators, moderators and per-organization policies for calls.
- Training, certification, exams and technical tests (#255, a separate idea).

## Assumptions

- This feature builds on spec 008: chat with pause and slow mode (merged, #179), the raised-hand queue with one floor (merged, #183), the room sidebar (merged, #178), reactions (not merged yet, #181 and #182) and the hands UI (not merged yet, #184). It does not duplicate them.
- #96 was an earlier broader scope and stays closed as superseded.
- The call server is self-hosted, pinned to one version, and runs as one node. One node is enough for the call sizes above; the load test confirms it before release.
- Production hosting of the call server is a founder decision (research D8) because it adds a monthly cost. Local development and tests need no paid service (constitution IX): the call server runs as a local container.
- The animator of a circle is the only moderator. The animator's identity comes from the server, never the client.
- Browsers that cannot do live audio or video still get chat, hands and reactions.

## Open questions

All questions of 2026-10-05 are answered or obsolete (see Clarifications and research). Open founder decisions, listed in `research.md`: **D8** production hosting of the call server (cost), **D9** constitution amendment for the call server, **D10** audit scope, **D11** reaction totals during presentations, **D6** animator away ends the call after 5 minutes.
