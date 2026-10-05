# Feature Specification: Live discussion: stage with audio and video, raised hands and a text-only session record

**Feature Branch**: `feat/009-live-discussion-stage` (proposed; created by `/speckit-specify` through the git extension, not yet created)

**Created**: 2026-10-05

**Status**: Draft

**Parent idea**: #212 (type:idea, area:spaces) Epic: E4 (shared live activities) with E2 (circles and roles). Related: #96 (earlier audio/video/ask-to-speak scope, see Assumptions), #166 and spec 008 (sidebar, chat, raised hands), #174 (big circles), #126 (Impeccable runs), spec 006 (presenting).

**Input**: User description: "Add the possibility that the animator and participants discuss and exchange ideas, and request to talk by raising a hand, with video, audio and a conversation. Add the possibility to record the session. Design this part using Impeccable and the test skill. No storage of audio or video, only conversation. The feature must be enabled or disabled by animators. Recording must be run only by animators." (Founder, 2026-10-05.)

## Design and test workflow

- All UI of this feature MUST go through Impeccable: `/impeccable shape` first, then `/impeccable craft`, then `audit` and `critique` before merge (constitution IV, `docs/design/anti-ai-look.md`).
- **The Impeccable skill is currently not installed (#126).** Until it is, `ux-designer` reviews are manual against `docs/design/anti-ai-look.md` and WCAG 2.2 AA, and the plan records which Impeccable steps were skipped so they can be rerun later.
- No dedicated "test skill" exists in `.claude/skills/`. Tests follow constitution VI: hub tests (xUnit + Testcontainers) for every rule, Vitest for client logic, and Playwright with fake media devices for each story, including one Arabic RTL run and an axe check. The plan decides whether a test skill is wanted.

## Clarifications

### Session 2026-10-05

- Q: Who may read a saved transcript? -> A: The animator who ran it only; they can open, export and delete it. Participants are told this before recording starts. Sharing to the circle is not in this feature.
- Q: What consent applies to recording? -> A: A clear notice when the animator starts, an always-visible recording indicator for the whole session (late joiners see it on entry), and the freedom to leave. No explicit accept step.
- Q: What happens to #96? -> A: Closed as superseded by #212. Its fun filters and local camera recording conflict with "no media stored".
- Q: Stage size and relay? -> A: Up to 8 people on camera or microphone at once (peer mesh). STUN only at launch; a TURN relay is a later, separate task if people on strict networks cannot connect.
- Open questions 4 to 7, 8 (reuse the circle chat with replies), 10 to 12 and 14 are decided in `/speckit-plan` with the stated proposals as defaults: one animator controls the stage and recording, 60 s then 5 min animator-away rule, a muted person stays muted until the animator allows, stage size is a configuration value defaulting to 8, kids-safe circles allow audio and chat only, the projector shows only the recording indicator and the number of raised hands, a 4 h recording maximum with a warning, and Playwright with fake media devices plus hub tests stand in for a test skill.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The animator turns discussion on or off for a circle (Priority: P1)

Théo, who animates a team circle, opens the room settings and switches on **Live discussion**. Nothing else changes for the circle until he does: it is off by default. When on, participants see a Discussion area with a stage, a Raise hand button and the conversation. He can switch it off at any moment, and everything live stops for everyone.

**Why this priority**: every other story depends on the switch, and the founder made the animator the owner of it. Off by default protects families and classes that only want today's behaviour.

**Independent Test**: in a new circle, the participant sees no Discussion controls. The animator switches it on and the participant sees them within a second. The animator switches it off during a live call: media stops for everyone and the controls disappear.

**Acceptance Scenarios**:

1. **Given** a circle that has never used the feature, **Then** Live discussion is off, and no camera, microphone or stage control is visible to anyone.
2. **Given** I am the animator, **When** I switch Live discussion on, **Then** every member in the room sees the Discussion area within 1 second, everyone starts muted with video off, and nobody is asked for camera or microphone permission yet.
3. **Given** I am a participant, **When** I try to switch it on or off (through the interface or by sending the request myself), **Then** the server refuses and nothing changes.
4. **Given** Live discussion is on and people are on the stage, **When** the animator switches it off, **Then** all live audio and video end for everyone, an active recording is stopped and saved (User Story 6), and the room shows "The animator ended the discussion".
5. **Given** the switch is on, **Then** the setting is remembered for the circle until the animator changes it. Hands, stage and mute state reset when the room ends.
6. **Given** the interface is in Arabic, **Then** the switch, its label and the explanation are right-to-left and readable.

---

### User Story 2 - A participant raises a hand and asks to talk (Priority: P1)

Amina wants to speak. She taps **Raise hand**. Her character waves in the people list and she is placed in the queue. She can lower her hand whenever she wants. She sees her place in the queue ("You are 2nd").

**Why this priority**: it is the polite entry point for the whole discussion and works even for people with no camera or microphone.

**Independent Test**: three participants raise their hands. Everyone sees the queue in arrival order with characters and names. One lowers hers and the queue closes the gap.

**Acceptance Scenarios**:

1. **Given** Live discussion is on, **When** I tap Raise hand, **Then** my hand is up for everyone within 1 second, and I can lower it myself.
2. **Given** several hands are up, **Then** everyone sees the queue in arrival order with characters and names, the animator also sees the waiting time, and I see my own place.
3. **Given** I leave the room, **Then** my hand is lowered. A hand keeps its place for 30 seconds after a connection drop.
4. **Given** a screen reader, **Then** the animator hears "Amina raised her hand" (grouped when several arrive together), and I hear my place when it changes.
5. **Given** Live discussion is off, **Then** there is no Raise hand button in this feature. The raised-hand queue of spec 008 behaves as that spec defines.

---

### User Story 3 - The animator gives and takes the floor (Priority: P1)

Théo gives Amina the floor. She joins the stage: she can now switch on her microphone and camera (she chooses; nothing starts by itself). Everyone on the stage can hear and see her. Théo can mute her, lower her hand or remove her from the stage. Amina can also leave the stage herself at any time.

**Why this priority**: it is the core of the feature, and the animator's control is the safety net for a room of friends, family or colleagues.

**Independent Test**: with the animator and three participants, the animator gives the floor to the first hand. She appears on the stage, unmutes, and the other three hear her. The animator mutes her: her audio stops for all and she sees "The animator muted you". She leaves the stage and is back among the audience.

**Acceptance Scenarios**:

1. **Given** hands are up, **When** the animator gives the floor to one person, **Then** that person joins the stage, their hand goes down, and everyone sees "Amina is on stage". The person still has microphone and camera off until they switch them on.
2. **Given** I am on the stage, **When** I switch on my microphone or camera, **Then** the browser asks for permission with a short explanation shown first (User Story 4). Only then do others receive my audio or video.
3. **Given** I am the animator, **When** I mute someone, lower a hand or remove someone from the stage, **Then** it takes effect for everyone within 1 second and the person is told what happened in kind words.
4. **Given** I am on the stage, **When** I tap Leave stage, **Then** my audio and video stop at once and I return to the audience.
5. **Given** a participant is muted by the animator, **Then** they can unmute themselves only after the animator allows it again, or by leaving and being given the floor again (decision in open questions).
6. **Given** the stage holds its maximum number of people (about 8, to be confirmed in the plan), **When** the animator tries to add one more, **Then** they are told the stage is full and can remove someone first.
7. **Given** people in the audience (not on stage), **Then** they can watch and listen to the stage and use the chat and raise hand, but never send audio or video.
8. **Given** the interface is in Arabic, **Then** the stage, its controls and its order mirror, and names of mixed direction stay readable.

---

### User Story 4 - Camera and microphone: permissions and fallbacks (Priority: P1)

Before the browser asks for the camera or microphone, circloo explains in one short sentence why and that nothing is stored. If the person says no, has no device, or has no camera, the stage still works: they can listen, use the chat, raise a hand, or speak with audio only.

**Why this priority**: real devices fail often, and the feature must never leave a person stuck. It also decides whether the feature is usable on a phone.

**Independent Test**: with fake devices, a person accepts audio only and is heard. Another denies permission and still uses chat and raise hand. A third has no microphone and sees a clear message and the text options.

**Acceptance Scenarios**:

1. **Given** I am about to switch on a device, **Then** I first see a short explanation ("Your camera goes straight to the others. circloo does not keep it.") with a button to continue, and only then does the browser ask.
2. **Given** I deny permission, **Then** I see how to allow it again in my browser, and everything else keeps working (listen, chat, raise hand).
3. **Given** my device has no camera, **Then** I can join with audio only and the stage shows my character and name in place of video.
4. **Given** my device has no microphone and no camera, **Then** I can still be on the stage as a listener with chat, and the interface says so plainly.
5. **Given** my camera or microphone is taken by another application, **Then** I see a clear message and a Try again button.
6. **Given** I switch off my camera, **Then** others see my character and name instead of a black square.
7. **Given** my browser does not support live audio or video, **Then** I see "This browser cannot join the live discussion. You can still chat and raise your hand." and the rest works.
8. **Given** the connection is poor, **Then** video stops first and audio keeps going, with a visible "Weak connection" notice.
9. **Given** all messages are in French, Arabic or Spanish, **Then** every message above exists in all four languages.

---

### User Story 5 - Talk in writing: the conversation (Priority: P2)

Everyone can also exchange ideas in writing next to the stage: short messages, replies in a thread, likes. Théo can hide a message.

**Why this priority**: the founder wants "conversation" as part of the discussion, and it is the only content that is recorded. It is P2 because spec 008 already provides most of it.

**Independent Test**: during a discussion, participants post messages and replies. Everyone sees them in order. The transcript (User Story 6) later contains them.

**Acceptance Scenarios**:

1. **Given** Live discussion is on, **Then** the circle chat of spec 008 is the conversation: same safety filter, rate limits, slow mode, likes and hiding. This feature adds no second chat.
2. **Given** I want to answer a specific message, **When** I reply, **Then** my message shows under it as a thread (reuse or new decided in the plan, open question).
3. **Given** a message mentions or answers a raised hand or the stage (for example "Amina is on stage"), **Then** the room shows these status changes as small system lines in the conversation, so the transcript is complete.
4. **Given** the interface is in Arabic, **Then** the conversation, threads and composer mirror.

---

### User Story 6 - Record the session as a text transcript (Priority: P2)

Théo taps **Record session**. Before it starts, everyone sees a clear banner ("The animator is recording this session as text: messages, raised hands and who was on stage. No audio or video is kept.") and an indicator that stays visible the whole time. When he stops, circloo saves a transcript: the chat messages, the raised hands and who was on the stage and when. No audio, no video and no speech-to-text.

**Why this priority**: the founder asked for it. It is P2 because the discussion works without it, but it carries the strongest privacy rules, so it needs the most care.

**Independent Test**: the animator starts the recording; a participant who joins afterwards sees the indicator at once. A participant tries to start or stop it with a crafted request and is refused. After stopping, the animator opens a transcript containing the messages, hands and stage times, and containing no media.

**Acceptance Scenarios**:

1. **Given** I am a participant, **When** I try to start or stop a recording (interface or crafted request), **Then** the server refuses it and the attempt is audited.
2. **Given** I am the animator, **When** I tap Record session, **Then** every person in the room sees the notice and an always-visible "Recording (text only)" indicator before anything is captured. Capture starts only after the notice has been delivered.
3. **Given** a recording is running, **When** someone joins or reconnects, **Then** they see the indicator and the notice on entry, before they can type or raise a hand.
4. **Given** a recording is running, **Then** the indicator is never hidden, collapsed or covered, including when the sidebar is collapsed, on phones and on the audience screen. It is shown by text and an icon, not colour alone.
5. **Given** a recording is running, **When** the animator stops it, or switches Live discussion off, or the animator leaves (see edge cases), **Then** the recording ends, everyone is told "Recording stopped", and the transcript is saved.
6. **Given** a transcript, **Then** it contains: session title and date, start and end times, chat messages with sender name and time, hidden messages marked as hidden and excluded for non-animators, raised hands and lowering with times, stage joins, leaves, mutes and removals with times and who did them. It contains no audio, no video, no speech-to-text and no device or network information.
7. **Given** a message is sent when no recording is running, **Then** it is not part of any transcript.
8. **Given** the transcript is saved, **Then** the animator can read it, export it as text or Markdown, and delete it. Who else can read it, and how long it is kept, is an open question.
9. **Given** the interface is in Arabic, **Then** the notice, indicator and transcript are right-to-left and exports keep correct text direction.

---

### User Story 7 - Everyone can follow along with keyboard and screen reader (Priority: P2)

A participant using a screen reader hears when hands go up, when the floor changes and when the recording starts. Everything on the stage works from the keyboard. Under reduced motion, nothing waves or bounces.

**Why this priority**: WCAG 2.2 AA is the floor. It is its own story so it is tested on its own.

**Independent Test**: with a keyboard only, a person raises a hand, joins the stage when given the floor, mutes and leaves. A screen-reader run hears each change once, politely.

**Acceptance Scenarios**:

1. **Given** only a keyboard, **Then** switching the feature on or off, raising and lowering a hand, giving the floor, mute, remove, leave stage, record start and stop, and the conversation are all reachable and usable, with visible focus and logical order.
2. **Given** a screen reader, **Then** these changes are announced politely and grouped (never one interruption per event during a burst): a hand raised or lowered, the floor given, someone muted, someone removed, the recording starting and stopping. The recording start is announced assertively, because it concerns privacy.
3. **Given** reduced motion, **Then** hands, speaking indicators and joins use no movement. A speaking person is shown with a text label ("speaking") as well as any pulse.
4. **Given** a person who cannot see the stage, **Then** their name and state (on stage, muted, speaking) are available as text.
5. **Given** a participant who is deaf or hard of hearing, **Then** the conversation is the way to take part. Captions are out of scope for this feature (a later idea).
6. **Given** the interface is in any of the four languages, **Then** all announcements are translated. In Arabic, focus order and arrow keys follow right-to-left.

---

### Edge Cases

- **The animator disconnects**: if they return within 60 seconds nothing changes. Otherwise the stage freezes, new hands are queued but nobody can be given the floor, the recording keeps its state, and everyone sees "The animator is away". If the animator does not return in 5 minutes the room ends the discussion and saves the transcript. (Times are proposals, to be confirmed.)
- **The person holding the floor drops**: the stage removes them after 30 seconds, their media stops for others and the next hand is shown as next.
- **Network loss for a participant**: audio and video stop for them first, chat and hands recover on reconnect, and the place in the queue is kept for 30 seconds.
- **Browser unsupported or media blocked** (strict corporate network, no relay reachable): the person is told their audio and video cannot connect, and keeps chat and raise hand.
- **Two animators** (owner and an admin with the animator role, if allowed by spec 003 roles): any of them can use the controls. Actions are shown with who did them. Only one recording can run at a time. The plan decides if two can be on duty at once; the spec treats co-animators as out of scope except that nothing breaks if a second one exists.
- **The animator removes someone who is also recording nothing**: no effect on the transcript except the "removed" line.
- **Someone tries to join a circle that is full or has Live discussion off**: no stage controls are shown and nothing is sent.
- **A participant rejoins the stage after being removed**: allowed only when given the floor again.
- **Recording is running when a participant leaves**: their earlier messages stay in the transcript. Leaving the circle does not erase them (retention and erasure on request are open questions).
- **A very long session**: the recording has a maximum length (proposal: 4 hours), after which it stops and says so.
- **The audience screen (projector)**: it shows the stage's speaker names only if the animator chooses, never video of audience members, and always shows the recording indicator.
- **A kids-safe circle**: the animator must switch Live discussion on explicitly. Open question: whether video from children is allowed at all.
- **Two animators start or stop the recording at the same time**: exactly one recording results.
- **A circle left on with nobody present**: nothing runs and nothing is recorded.

## Requirements *(mandatory)*

### Functional Requirements

**Switch and roles**
- **FR-901**: Live discussion MUST be off by default for every circle and MUST be switched on and off only by the animator. The server MUST enforce this on every request. The client's claim to be an animator MUST never be trusted.
- **FR-902**: Switching it off MUST end all live audio and video for everyone, stop any running recording (saving the transcript), and lower hands, within 2 seconds.
- **FR-903**: Every action in this feature (join stage, raise hand, mute, remove, record) MUST re-check circle membership and role on the server, as elsewhere in the room.

**Stage, hands and floor**
- **FR-904**: When Live discussion is on, everybody MUST join with microphone off and video off. Nothing MUST be requested from the browser until the person chooses to switch a device on.
- **FR-905**: Participants MUST be able to raise and lower a hand. The queue MUST be in arrival order and visible to everyone with characters and names. This feature reuses the raised-hand queue of spec 008 and does not create a second one.
- **FR-906**: The animator MUST be able to give the floor to a person, mute them, lower one or all hands and remove someone from the stage. Anyone on the stage MUST be able to leave it at any time.
- **FR-907**: The stage MUST have a maximum number of people at once (target about 8, confirmed in the plan). Larger circles MUST be able to watch and listen, or use hands with the stage limit. The audience never sends audio or video.
- **FR-908**: The person given the floor MUST start with devices off and choose when to switch them on. The animator MUST be able to mute a person, but MUST NOT be able to switch a person's camera or microphone on.

**Audio, video and permissions**
- **FR-909**: Live audio and video MUST travel directly between browsers (WebRTC). circloo servers MUST only relay the signalling needed to connect them, over the existing live hub. Signalling MUST be authorised on every message. No audio or video MUST pass through circloo servers or be stored by circloo, in any environment, except for a connection relay that only forwards data and stores nothing (open question on cost and need).
- **FR-910**: Before the browser asks for camera or microphone, the interface MUST explain in one short sentence why and that nothing is stored.
- **FR-911**: The feature MUST degrade gracefully: permission denied, no device, no camera, audio only, device busy, unsupported browser, and weak connection (video drops before audio). In every case chat and raise hand MUST keep working.
- **FR-912**: When the camera is off, others MUST see the person's character and name, never an empty box.

**Conversation**
- **FR-913**: The conversation MUST reuse the circle chat of spec 008 (safety filter, rate limits, slow mode, likes, hiding). Threads (replies under a message) MUST be offered, reusing the chat if the plan finds that possible. Status changes (hand raised, floor given, joined or left the stage, recording started or stopped) MUST appear as system lines.

**Recording (text transcript only)**
- **FR-914**: Starting and stopping a recording MUST be possible only for the animator, enforced on the server. Refused attempts MUST be audited.
- **FR-915**: A recording MUST save text only: chat messages, raised hands and who was on the stage and when. The system MUST NOT record, store, transcribe or derive text from audio or video. No browser or server component may keep media to produce the transcript.
- **FR-916**: Before a recording captures anything, every person in the room MUST see a notice stating what is recorded and that no audio or video is kept. Capture MUST start only after the notice has been delivered to those present.
- **FR-917**: While a recording runs, an indicator MUST be visible to every person at all times, with text and an icon (never colour alone), on every layout including phones, the collapsed sidebar and the audience screen. People who join or reconnect MUST see it on entry, before they can send anything.
- **FR-918**: The transcript MUST contain: session title, date, start and end times; messages with sender name and time; raised hands and lowering with times; stage joins, leaves, mutes and removals with times and the person who did them. Hidden messages MUST be marked for the animator and MUST NOT appear for others. It MUST NOT contain audio, video, speech-to-text, device information or network addresses.
- **FR-919**: The animator MUST be able to read, export (text and Markdown) and delete a transcript. Who else may read it, how long it is kept, and what a member can ask for about their own messages MUST be decided in `/speckit-clarify` (see open questions) before the plan, and are bound by GDPR basics in the PRD.
- **FR-920**: A recording MUST stop when the animator stops it, when Live discussion is switched off, when the animator is away for longer than the grace period, or when the maximum length is reached. Only one recording MAY run in a circle at a time.

**Security, abuse and limits**
- **FR-921**: The server MUST rate-limit raising hands (one at a time, a reasonable number of toggles per minute), signalling messages, and stage joins per person, and MUST validate every input. Abuse (spamming hands, repeated stage rejoining, signalling floods) MUST be refused without an error detail that helps an attacker.
- **FR-922**: The animator MUST be able to remove a person from the stage and hide chat messages. Security-relevant events (feature on or off, floor given, removal, recording start and stop, refused attempts) MUST be audited with hashed identifiers and without media or message content in logs.
- **FR-923**: The plan MUST include a threat model for this feature (constitution VIII), covering signalling abuse, unauthorised recording, IP exposure through direct connections (peers see each other's network addresses; this MUST be disclosed in the explanation before first use or mitigated through a relay), and transcript leaks.

**Quality**
- **FR-924**: Every new string MUST exist in English, French, Arabic and Spanish. Layouts MUST use logical CSS properties and be verified in Arabic RTL.
- **FR-925**: Every control MUST work from the keyboard. Changes of hands, floor and recording MUST be announced to screen readers, grouped, meeting WCAG 2.2 AA. Reduced motion MUST be respected. Captions are out of scope.
- **FR-926**: All UI MUST go through Impeccable shape and craft, then audit and critique, and follow `docs/design/anti-ai-look.md`. While Impeccable is not installed (#126), manual `ux-designer` review stands in for it and is recorded in the plan.
- **FR-927**: Enterprise behaviour (for example "Live discussion allowed" or "recording allowed" per organization) MUST be configuration if it is added later, never customer-specific code (constitution V). It is not part of this feature.

### Key Entities *(include if feature involves data)*

- **Discussion setting** (per circle): on or off, who changed it and when. Off by default.
- **Raised hand** (existing in spec 008): person, time raised, whether they hold the floor. Live only.
- **Stage seat**: a person on the stage, since when, muted by the animator or not. Live only. Not stored beyond what the transcript records.
- **Recording**: one run of text recording in a circle: started by, started at, stopped at, how it ended (animator, switch off, grace period, maximum length).
- **Transcript**: the saved text of a recording: ordered entries (message, hand, stage event, system note) with time and person. Contains no media. Retention and readers are open questions.
- **Audit event** (existing): feature on or off, floor, removal, recording start and stop, refused attempts, with hashed identifiers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

No usage numbers exist yet and none are invented. These are measurable behaviour targets, checked by automated tests and by a manual session.

- **SC-901**: With Live discussion off (the default), 100% of existing circles show no new control and behave exactly as before, verified by the existing end-to-end tests still passing.
- **SC-902**: A request to switch the feature on or off, give the floor, mute, remove, or start or stop a recording made by a non-animator is refused in 100% of hub and API tests.
- **SC-903**: With 8 people on the stage in a test using fake devices, every person hears and sees every other within 3 seconds of them switching a device on, on a normal network.
- **SC-904**: A raised hand reaches the animator's screen within 1 second, and the queue order always matches the order the hands were raised.
- **SC-905**: After the notice is shown, 100% of people in the room, including those who join later, see the recording indicator, verified in tests on desktop, phone and audience layouts in English and Arabic.
- **SC-906**: A saved transcript contains zero audio, video or speech-derived text, verified by a test that inspects everything stored and every server-side channel for the session. Server logs of the session contain no media and no message text.
- **SC-907**: When a person denies permission, has no device, or has no camera, they reach the chat and raise-hand controls in under 5 seconds, in every one of the four languages.
- **SC-908**: Every new screen passes an automated accessibility check (WCAG 2.2 AA) in English and Arabic, and a screen reader hears at most one grouped announcement every few seconds during a burst of hands.
- **SC-909**: In a manual session with 5 to 8 people, an animator who has never used the feature can switch it on, give the floor and start a recording without help. (Measured when the session is run; no results are claimed here.)

## Out of scope

- Storing, recording, or uploading any audio or video, by circloo, a relay, or the browser for later upload.
- Speech-to-text, automatic summaries of speech, and captions or live subtitles.
- Screen sharing.
- Native mobile apps (the browser works on phones).
- Camera filters, backgrounds and local camera recording to a file (the earlier #96 scope; see Assumptions).
- Calls with more than the stage maximum sending at once, and broadcast to hundreds.
- Co-animators, moderators and per-organization policies for this feature.
- AI features on the transcript.
- Recording audience screens or the whiteboard, boards or slides content (only the text of the discussion).

## Assumptions

- This feature builds on spec 008 (sidebar, chat, likes, hiding, slow mode, raised-hand queue, 100-person circles). Spec 008 is still a draft. This spec depends on its chat and hand queue and does not duplicate them. "Give the floor" in 008 is a visual signal only; here it also opens the stage.
- #96 was an earlier, broader scope (audio/video mesh for up to 12 people, filters, local file recording of one's own camera, ask to speak). The founder's decisions of 2026-10-05 narrow media to browser-to-browser audio and video with no recording, so filters and local camera recording are out of this feature. This is an overlap the founder should settle: re-scope #96 to what remains, or close it in favour of the idea issue for this feature. #96 also carries `type:task` although it predates a plan, which is a labelling issue for Nicolas, not for this spec.
- Live audio and video are browser-to-browser. Small stages (about 8 at once) are the target. Circles up to 100 people (#174) can watch, listen, chat and raise a hand.
- circloo only relays signalling over the existing SignalR hub. A STUN/TURN relay is likely needed for strict networks. It forwards encrypted media and stores nothing. Its cost and hosting are a planning question, deferred to `/speckit-plan` and the azure-infra agent.
- Default behaviour when on: everyone joins muted with video off; people raise a hand; the animator gives the floor, mutes, lowers hands or removes from stage; anyone can leave the stage.
- The recording is text only (chat, hands, stage events). It is not a recording of audio or video.
- The animator of a circle is the only moderator. The animator's identity comes from the server, never the client.
- Browsers that cannot do live audio or video still get chat and raise hand.
- Zero-cost development (constitution IX): STUN-only locally and fake media devices in tests; no paid service is needed to run this feature in development.

## Open questions (for `/speckit-clarify`)

1. **Transcript readers**: only the animator, or all circle members, or all members who were present while it ran? Default proposal: animator only, with an option to share to the circle.
2. **Retention and deletion**: how long is a transcript kept (proposal: until the animator deletes it, with an organization maximum later under E6 data retention)? Can a member ask for their messages to be removed from a transcript? How does GDPR export and delete apply?
3. **Consent**: is notice plus an always-visible indicator enough, or must a participant explicitly accept before taking part while recording (and what happens if they decline: observe only, or leave)? Does a company or school need a different default?
4. **Co-animators**: can an admin or a second animator control the stage and the recording? If two, does one recording at a time suffice?
5. **Animator-away rule**: are 60 seconds and 5 minutes right? Should the discussion pause or end?
6. **Muted by the animator**: can the person unmute themselves afterwards, or only when the animator allows it?
7. **Stage size**: is 8 the right maximum, and is it a configuration value (like `Circles:MaxPeople`)?
8. **Threads**: reuse the existing circle chat with reply support, or add a new threaded conversation? What happens to replies in the transcript?
9. **STUN/TURN relay**: is a relay needed at launch, which provider and what cost? Is exposing peers' network addresses acceptable with disclosure, or is a relay required to hide them?
10. **Kids-safe circles**: is video from minors allowed at all, or audio and chat only?
11. **Projector**: should the audience screen show the stage (speaker names or video) or only the recording indicator and number of hands?
12. **Recording maximum length**: is 4 hours right? Should the animator be warned before it ends?
13. **#96 overlap**: close, re-scope or keep #96 for the filters? Who decides, and does this feature replace the "ask to speak" part of #96 and #166?
14. **Test skill**: the founder asked for "test skill". None is installed. Is Playwright with fake media devices plus hub tests enough, or should a skill be added through its own idea issue?
