# Feature Specification: Live room for big circles: sidebar, chat, reactions, raised hands and 100 people

**Feature Branch**: `feat/166-live-room`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Live room for big circles: sidebar chat, emoji reactions, raise hand, Pirikoo, up to 100 people (ideas #166 and #174). (1) The large 'In the circle' panel becomes a right sidebar (mirrored in Arabic) in every activity including presenting, a bottom sheet on phones, showing who is connected and the circle chat, collapsible. (2) Instant chat with emoji during a presentation, on by default, the animator can switch it off or turn on slow mode; messages and likes; rate limits; readable with 100 people; safety filter. (3) Emoji reactions that float over the slide on every screen including the projector, grouped, rate-limited, not stored. (4) Raise hand / ask to speak with a queue the animator manages. (5) Pirikoo announces raised hands and reacts to bursts of reactions, calm, mutable, never covering the slide; its generic chat nudge never appears during a presentation. (6) Up to 100 people per circle (configurable), shared characters with distinct colour rings. (7) With 100 phones on the current single server, a slide change reaches every screen with median < 1 s and p95 < 2 s, proven by a load test."

## Clarifications

### Session 2026-10-05

- Q: Should the live server stay awake all the time, or may it sleep when nobody is using circloo? → A: Always keep one server awake in production (no wake-up delay); development and test environments may still sleep.
- Q: When people raise their hands, should every participant see the whole queue with names, or only who is speaking, who is next and their own place? → A: Everyone in the room sees the full queue in order, with characters and names (the projector still shows only the number of hands up).
- Q: After a presentation, should its "Send results" report include how many of each reaction the room sent? → A: Yes. Only the total per reaction kind is kept for each presentation and shown in the circle's results and "Send results"; who reacted is never kept.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A circle holds up to 100 people (Priority: P1)

A trainer shares the circle's link with a class of 60. Everyone joins from their phone, picks a name and a character, even one already taken, and lands in the room. Two people with the same character are told apart by a colour ring and their name. The room shows who is there without the screen filling up with faces.

**Why this priority**: the founder's first condition. Today a circle stops at 12 people and characters are unique, so every other story here is useless for a real meeting or class until this works.

**Independent Test**: 60 guests join one circle through its link. Five of them pick the fox. Each fox shows a different ring colour and the person's name. Guest 101 is told the circle is full.

**Acceptance Scenarios**:

1. **Given** a circle with fewer than 100 people (animators and participants together), **When** I join with a name and any character, **Then** I am in, even if others already use that character.
2. **Given** the circle already holds 100 people, **When** someone else tries to join, **Then** they see a kind "This circle is full" and the animator's room is unaffected.
3. **Given** several people use the same character, **Then** each copy has a distinct colour ring from a fixed set, and wherever a character appears for a person (people list, chat, answer progress, spotlight, raised hands), their name appears with it.
4. **Given** the join screen, **When** I choose a character, **Then** I see how many people already use it. The ring is assigned for me, and I can change it to another free ring of that character.
5. **Given** a person leaves the circle, **Then** their character and ring become free for the next person.
6. **Given** the operator of the service sets a different maximum (for example 50 or 150) in configuration, **Then** circles follow that maximum without any code change.
7. **Given** the interface is in Arabic, **Then** the join screen, the character counts and the rings are mirrored and readable.

---

### User Story 2 - The room sidebar: who is here and the circle chat (Priority: P1)

The large "In the circle" panel is replaced by a sidebar on the inline-end side of the room. It is on the right in English and on the left in Arabic. It lists who is here (online first, then away, the animator marked), with a search box and a short summary when the list is long. Under the list is the circle chat. On phones, the sidebar becomes a bottom sheet with two tabs, People and Chat. Anyone can collapse the sidebar to give the slides or the board the whole width.

**Why this priority**: the founder found the current panel takes too much space, and with 100 people the ring of characters cannot work. The sidebar is also where the chat, reactions and raised hands of the next stories live.

**Independent Test**: on a laptop in a circle of 40 during a presentation, the slide keeps most of the width. The sidebar lists 40 people, online ones first, and searching "ami" finds Amina. Collapsing the sidebar gives the slide the full width. On a phone, the same room shows the slide and a bottom sheet with People and Chat tabs.

**Acceptance Scenarios**:

1. **Given** I am in a room on a screen at least as wide as a laptop, **Then** the people and the chat sit in a sidebar on the inline-end side in every activity, presenting included, and the main area (slides, board, canvas, poll) keeps at least two thirds of the width.
2. **Given** the people list, **Then** online people come first and away people after them, each with their character, ring and name. The animator is marked by an icon and a label, not colour alone, and the list shows "40 here · 3 away".
3. **Given** more people than fit, **When** I type in the search box, **Then** the list filters by name as I type.
4. **Given** I collapse the sidebar, **Then** the main area takes the full width and a small handle shows unread chat messages and raised hands. My choice is remembered on this device.
5. **Given** a phone, **Then** the main area takes the screen and a bottom sheet offers People and Chat tabs. It opens to half height and can expand or close, and it never covers the answer buttons of a question.
6. **Given** the interface is in Arabic, **Then** the sidebar sits on the left, the bottom sheet's tabs and the list are mirrored, and mixed Arabic/Latin names stay readable.

---

### User Story 3 - Instant chat with emoji while presenting (Priority: P1)

While the animator presents, everyone can chat in the sidebar: short messages with emoji, and a like on someone's message. The chat is on by default in a presentation. The animator can switch it off (for a quiz or a formal moment) or turn on slow mode so that 100 people stay readable. Unkind messages are refused, as everywhere in circloo.

**Why this priority**: the founder asked for it explicitly. A live conversation beside the slides is what makes a presentation feel like a shared moment rather than a broadcast.

**Independent Test**: during a presentation with 30 people, five participants send messages with emoji and two like a message. Everyone sees them in order within a second, with the like count. The animator switches the chat off and participants see "The animator paused the chat". Slow mode lets each person send one message every 10 seconds.

**Acceptance Scenarios**:

1. **Given** a presentation has started, **Then** the chat is on by default and every member can send messages of 1–300 characters, emoji included, which appear for everyone in order within a second.
2. **Given** a message from someone else, **When** I like it, **Then** its like count rises by one for everyone. Liking again removes my like, and I cannot like my own message.
3. **Given** I am the animator, **When** I switch the chat off, **Then** participants can still read earlier messages, cannot send new ones, and see "The animator paused the chat". Switching it back on lets them write again. The animator can always write.
4. **Given** the animator turns on slow mode, **Then** each participant can send at most one message every 10 seconds, sees the time left before the next one, and the animator is not limited.
5. **Given** a message contains unkind or unsafe text (stricter in kids-safe circles), **When** it is sent, **Then** it is refused with a kind explanation and never shown to anyone.
6. **Given** many messages arrive at once, **Then** the chat stays readable. A sender's quick consecutive messages are grouped under one name, the list does not jump while I am reading older messages, and a "New messages" button takes me back to the latest.
7. **Given** I am the animator, **When** I hide a message, **Then** it disappears for everyone except me.
8. **Given** a screen reader, **Then** new messages are announced politely and in batches (for example "3 new messages"), never one interruption per message.
9. **Given** the interface is in Arabic, **Then** messages, likes and the composer are mirrored and mixed-direction text stays readable.

---

### User Story 4 - Emoji reactions over the slide (Priority: P2)

During a presentation, a reaction bar under the slide lets everyone tap 👏 ❤️ 😂 😮 👍 🎉. Each tap makes the emoji float up briefly over the slide on every screen, the projector included. When many people react at once, the reactions are grouped ("👏 ×12") so the slide stays visible.

**Why this priority**: reactions are the lightest way for 100 people to take part, and they are the "funny" moment the founder asked for. Chat and the room work without them.

**Independent Test**: 40 phones tap 👏 within two seconds. Every screen, the projector included, shows a short burst ending in "👏 ×40". No reaction covers the slide's centre for more than about two seconds, and nothing is kept once the presentation ends.

**Acceptance Scenarios**:

1. **Given** a presentation is running, **When** I tap a reaction, **Then** it floats up from the bottom edge of the slide on every screen within a second and fades away in about two seconds.
2. **Given** many reactions of the same kind arrive close together, **Then** they are shown as one grouped reaction with a count, and the number of floating emoji on screen at once stays small enough that the slide stays readable.
3. **Given** I tap very fast, **Then** at most 5 of my reactions count every 10 seconds, and extra taps are ignored silently.
4. **Given** the animator switches reactions off, **Then** the bar disappears for participants and nothing floats.
5. **Given** reduced motion is set on a device, **Then** that device shows reactions as a small counter beside the slide, without movement.
6. **Given** a screen reader, **Then** reactions are announced at most every few seconds as a summary (for example "12 applause, 3 hearts"), never one by one.
7. **Given** a presentation ends, **Then** no individual reaction is kept. The total per reaction kind (for example "👏 42 · ❤️ 18 · 😂 9") appears in the circle's results and in "Send results", and nothing says who reacted.

---

### User Story 5 - Raise a hand to speak (Priority: P2)

A participant taps **Raise hand** and their character waves in the sidebar. The animator sees the hands in the order they were raised, gives the floor to one person ("Amina, go ahead") or lowers hands. Everyone sees who is next.

**Why this priority**: with 100 people, a speaker can't hear everyone, and a fair queue keeps the room polite. It builds on the sidebar.

**Independent Test**: three participants raise their hands. The animator sees them in arrival order, gives the floor to the first, and everyone sees "Amina is speaking · Kenji is next". The animator lowers all hands at the end.

**Acceptance Scenarios**:

1. **Given** I am a participant in a room, **When** I tap Raise hand, **Then** my hand is up, my character waves in the people list, and I can lower it myself.
2. **Given** hands are raised, **Then** everyone in the room sees the queue in arrival order with characters and names. The animator also sees how long each has waited, and each person with a raised hand sees their own place ("You are 3rd").
3. **Given** I am the animator, **When** I give the floor to someone, **Then** everyone sees who is speaking. Their hand goes down, and the next person in the queue is shown as next.
4. **Given** I am the animator, **When** I lower one hand or all hands, **Then** those hands go down for everyone.
5. **Given** someone leaves the room with a hand raised, **Then** their hand is lowered.
6. **Given** a screen reader, **Then** the animator hears "Amina raised her hand" (one announcement per hand, grouped if several arrive together), and participants hear their own place when it changes.
7. **Given** the interface is in Arabic, **Then** the queue and its order read from the right.

---

### User Story 6 - Pirikoo announces hands and cheers with the room (Priority: P3)

When someone raises a hand, Pirikoo (the circloo bird) hops to the sidebar with a bubble: "Amina would like to speak". The animator can give her the floor straight from the bubble. When a burst of reactions arrives, Pirikoo claps, laughs or bounces once with the emoji. Pirikoo is calm by default, never covers the slide, and the animator can mute its moves. During a presentation, Pirikoo's usual "Your turn! One sentence in the chat" nudge never appears.

**Why this priority**: delightful but optional. Everything above works without it.

**Independent Test**: a participant raises a hand, and on the animator's screen Pirikoo hops next to the sidebar with "Amina would like to speak" and a "Give the floor" button that works. Twenty 😂 reactions make Pirikoo laugh once. With moves muted, only the bubble appears. With reduced motion, Pirikoo doesn't move.

**Acceptance Scenarios**:

1. **Given** a participant raises a hand, **Then** on the animator's screens Pirikoo hops beside the sidebar with a bubble naming the person and a "Give the floor" action, and the bubble closes by itself after a few seconds or when acted on.
2. **Given** several hands go up together, **Then** Pirikoo shows one bubble ("3 people would like to speak"), not three.
3. **Given** a burst of reactions, **Then** Pirikoo reacts once with a matching animation (clap, laugh, heart, wow), at most once every 10 seconds.
4. **Given** the animator mutes Pirikoo's moves, **Then** Pirikoo stays still and only the bubbles for raised hands appear.
5. **Given** reduced motion, **Then** Pirikoo never flies or bounces, and bubbles appear in place.
6. **Given** a presentation is running, **Then** Pirikoo's generic nudges to participants (such as "Your turn! One sentence in the chat") never appear, and Pirikoo never covers the slide, the answer buttons or the presenter controls.

---

### User Story 7 - 100 phones in one presentation stay smooth (Priority: P1)

With 100 people connected from phones on the current single server, the presentation stays as fast as it is with five: slide changes, answers, counts, results, chat and reactions all arrive promptly. The team can prove it before a big event.

**Why this priority**: the founder's 100-person promise is only true if it is measured. It gates the release of this feature.

**Independent Test**: a load run simulates 100 participants who join one circle, follow 10 slide changes, answer a poll and a quiz, send chat messages and reactions. It reports how fast each slide change reached every simulated phone.

**Acceptance Scenarios**:

1. **Given** 100 participants connected to one circle, **When** the animator changes the slide 10 times, **Then** every participant receives each change with a median under 1 second and a 95th percentile under 2 seconds.
2. **Given** 100 participants join within one minute, **Then** the room's people list and counts stay correct, and nobody's screen receives one full update per arrival (updates are grouped).
3. **Given** 100 participants answer a poll within 10 seconds, **Then** each answer is counted once, the animator's "n of N answered" reaches 100, and the reveal shows the same results on every screen.
4. **Given** the load run, **Then** it is repeatable on a developer machine at no cost and its numbers are recorded with the change.

---

### Edge Cases

- The 100th and 101st person press Join at the same moment: exactly one of them gets in. The other sees "This circle is full".
- All rings of a character are taken (a character used by its maximum number of people): that character is shown as full on the join screen, and the person picks another.
- A person rejoins after leaving: they may get a different ring if theirs was taken meanwhile.
- The animator switches the chat off while a message is being sent: a message that arrives after the switch is refused with "The animator paused the chat". One that arrived before stays.
- Slow mode turned on while someone's message is in flight: the in-flight message counts as their message for the slow-mode window.
- Someone likes a message that the animator hides at the same moment: the like is dropped.
- A participant with a raised hand is given the floor while they lower it themselves: the floor goes to the next person in the queue.
- The animator has two tabs or the audience screen open: Pirikoo bubbles and the hands queue appear on the animator's tabs. The projector shows reactions and "n hands up" only, never names in the queue.
- A guest with very slow network: missed chat messages and the current hands queue arrive when they reconnect. Missed reactions are not replayed.
- 100 people react in the same second: the screen shows a few floating emoji and a grouped count. The projector never becomes a wall of emoji.
- The presentation ends: the chat stays in the circle as the circle's conversation. Hands are lowered, and only the reaction totals per kind remain.
- Kids-safe circle: the chat safety filter is stricter, as in the rest of circloo, and reactions are unaffected.
- A circle that was created before this feature with 12 people and unique characters: it keeps working. Existing members keep their characters, which get the first ring.

## Requirements *(mandatory)*

### Functional Requirements

**Big circles**
- **FR-801**: A circle MUST accept up to a configured maximum number of people (animators and participants together, default 100). The maximum MUST be set by configuration for the whole service, never by customer-specific code.
- **FR-802**: The system MUST refuse a join beyond the maximum with a kind "This circle is full", even when several people join at the same moment.
- **FR-803**: Several active members of a circle MUST be able to use the same character. Each use MUST carry a distinct colour ring from a fixed set of at least 6 rings, chosen so that each ring meets WCAG 2.2 AA non-text contrast (3:1) against the backgrounds where characters appear. Two active members of a circle MUST NOT have the same character with the same ring.
- **FR-804**: Wherever a person's character is shown, their name MUST be shown or announced with it, so two identical characters are never confused.
- **FR-805**: The join screen MUST show how many people use each character. It MUST assign a free ring automatically, let the person pick another free ring, and show a character as unavailable when all its rings are taken.

**Sidebar and people**
- **FR-806**: On wide screens the room MUST show a sidebar on the inline-end side with the people list and the chat in every activity, presenting included. The sidebar MUST be collapsible, the choice remembered per device, and the main area MUST keep at least two thirds of the width while the sidebar is open.
- **FR-807**: On phones the sidebar MUST become a bottom sheet with People and Chat tabs that never covers the current question's answer buttons or the presenter controls.
- **FR-808**: The people list MUST show online people first, then away people, with character, ring, name and an animator mark (icon and label), a "n here · m away" summary, and a search by name.

**Chat**
- **FR-809**: Members MUST be able to send chat messages of 1–300 characters (emoji included) that every member sees in order within 1 second. Every message MUST pass the safety filter, stricter in kids-safe circles, and unsafe messages MUST be refused and never shown.
- **FR-810**: Members MUST be able to like other members' messages, one like per member per message, toggled. The like count MUST be shared live.
- **FR-811**: During a presentation the chat MUST be on by default. The animator MUST be able to switch it off and on, and to turn slow mode on and off, at any time. With the chat off, participants can read but not send. In slow mode each participant can send at most one message every 10 seconds. The animator is never limited.
- **FR-812**: Each participant MUST be limited to a reasonable sending rate even without slow mode (at most 5 messages every 10 seconds), with a kind message when they exceed it.
- **FR-813**: The animator MUST be able to hide a message for everyone. Hidden messages stay visible to the animator, marked as hidden.
- **FR-814**: The chat MUST stay readable with 100 active people: grouping of a sender's consecutive messages, no jump while reading older messages, a "New messages" shortcut, and screen-reader announcements in batches.

**Reactions**
- **FR-815**: During a presentation every member MUST be able to send reactions from a fixed set (👏 ❤️ 😂 😮 👍 🎉) that appear briefly over the slide on every screen, the audience screen included, within 1 second.
- **FR-816**: Reactions MUST be grouped by kind when they arrive close together, with a visible count. The number of reactions moving on screen at once MUST be capped so the slide stays readable.
- **FR-817**: Each person MUST be limited to 5 reactions every 10 seconds. Extra reactions are ignored without an error.
- **FR-818**: Individual reactions and who sent them MUST NOT be stored. The total per reaction kind for each presentation MUST be kept and shown in the circle's results and in "Send results". The animator MUST be able to switch reactions off.

**Raised hands**
- **FR-819**: Participants MUST be able to raise and lower their hand. The animator MUST see the queue in arrival order with characters, names and waiting time, and MUST be able to give the floor to one person and lower one or all hands.
- **FR-820**: Everyone in the room MUST see who has the floor and the full queue in arrival order, with characters and names. Each participant with a raised hand MUST see their own place in the queue. The audience screen MUST show only the number of hands up, never the names.
- **FR-821**: A person who leaves the room MUST have their hand lowered, and giving the floor MUST lower the speaker's hand.

**Pirikoo**
- **FR-822**: When a hand is raised, the animator's screens MUST show Pirikoo with a bubble naming the person and a "Give the floor" action. Several hands at once MUST produce one grouped bubble.
- **FR-823**: Pirikoo MUST react once to a burst of reactions, at most once every 10 seconds, and MUST never cover the slide, answer buttons or presenter controls.
- **FR-824**: The animator MUST be able to mute Pirikoo's moves (bubbles stay). Under reduced motion, Pirikoo MUST not move.
- **FR-825**: During a presentation, Pirikoo's generic nudges to participants MUST NOT appear.

**Scale and quality**
- **FR-826**: With 100 participants connected to one circle on the service as currently hosted, each slide change, answer count, reveal, chat message and grouped reaction MUST reach every participant with a median under 1 second and a 95th percentile under 2 seconds.
- **FR-827**: Updates about who is present MUST be grouped, so that 100 people joining or leaving do not send each screen one full update per arrival.
- **FR-828**: A repeatable load test simulating 100 participants (join, follow slide changes, answer, chat, react) MUST exist, run on a developer machine at no cost, and its results MUST be recorded with the change.
- **FR-829**: Every new string MUST exist in English, French, Arabic and Spanish. Layouts MUST mirror in Arabic. Chat, reactions, raised hands and Pirikoo bubbles MUST be usable with a keyboard and a screen reader, meeting WCAG 2.2 AA.
- **FR-830**: Only members of a circle MUST be able to read its chat, see its people, react or raise a hand. Every action re-checks membership, as elsewhere in the room.
- **FR-831**: In production, at least one server for the live room MUST always be awake, so the first person opening a circle never waits for a wake-up. Development and test environments MAY sleep when idle.

### Key Entities *(include if feature involves data)*

- **Circle member** (existing): a person in a circle. Gains a **ring** (one of the fixed colour rings) next to the character, so that character plus ring is unique among active members.
- **Chat message** (existing circle message): gains **likes** and a **hidden** state. Messages sent during a presentation are ordinary circle messages, kept with the circle.
- **Like**: one member's like on one message. At most one per member and message.
- **Room settings** (per circle, while live): chat on/off, slow mode on/off, reactions on/off, Pirikoo moves muted or not. Defaults during a presentation: chat on, slow mode off, reactions on, Pirikoo moves on.
- **Raised hand**: a member, when they raised it, and whether they currently have the floor. Kept only while the room is live.
- **Reaction**: a kind and a time, sent live and never stored individually.
- **Reaction totals**: for each presentation session, the number of reactions of each kind. Shown in the circle's results and "Send results"; never linked to people.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-801**: 100 people can be in one circle at once. The 101st is refused with a clear message, and 100 simultaneous joins never leave the circle above its maximum.
- **SC-802**: With 100 connected phones, a slide change reaches every phone with a median under 1 second and a 95th percentile under 2 seconds, measured by the load test.
- **SC-803**: With 100 connected phones, a chat message or a grouped reaction appears on every screen within 1 second (median) and 2 seconds (95th percentile).
- **SC-804**: During a presentation the slide keeps at least two thirds of the screen width on laptops with the sidebar open, and the full width with it collapsed.
- **SC-805**: In a test session with 40 people, 90% of participants who want to say something manage to send a chat message or a reaction within 10 seconds of opening the room, without help.
- **SC-806**: When 40 people react within two seconds, the projector never shows more than a dozen moving emoji at once and the slide stays readable.
- **SC-807**: A raised hand reaches the animator's screen within 1 second, and the queue order always matches the order hands were raised.
- **SC-808**: No unsafe chat message is ever shown to another person in the safety filter's test set, in any of the four languages.
- **SC-809**: Every new screen passes an automated accessibility check (WCAG 2.2 AA) in English and Arabic, and a screen reader never hears more than one chat or reaction announcement every few seconds during a burst.

## Assumptions

- The current hosting (one server for the live room) stays for this feature, now kept awake in production (FR-831). Supporting more than 100 people, or more than one server, is a later decision recorded in the plan.
- The circle chat that exists today (messages per circle, with the safety filter) is the chat used here. Messages sent during a presentation stay in the circle like any other message.
- Reactions are not stored per person, to keep data minimal. Only the totals per kind for each presentation are kept, for the results (clarified 2026-10-05).
- Raised hands, room settings (chat off, slow mode, reactions off, Pirikoo muted) and the hands queue live only while the circle is live. They reset when the presentation or activity ends.
- 6 colour rings per character are enough: 24 characters × 6 rings = 144 combinations, more than the default maximum of 100.
- The animator of the circle is the only moderator. Co-animators and moderators are out of scope.
- Audio, video and recording (the rest of #96) are out of scope. "Give the floor" is a visual signal only.
- The audience screen (projector) shows reactions and the number of raised hands, never the chat or the names in the queue, to avoid putting private conversation and people on a wall screen.
- The premium visual refresh (#164) and question styles (#168) are separate features. This feature follows the current design system and the anti-AI-look rules.
