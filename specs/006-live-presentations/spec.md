# Feature Specification: Live presentations with votes and quizzes

**Feature Branch**: `docs/64-live-presentations-spec` (spec); implementation branches per task issue

**Created**: 2026-10-02

**Status**: Draft

**Parent idea**: #64 (interactive presentations), first slice. Builds on live circles (spec 003) and the
animator/participant roles there.

**Input**: User description: "The animator presents a PowerPoint deck to their circle, interactively: they upload a
.pptx (converted server-side, slides shown to everyone in sync), insert question slides between deck slides
(poll/vote single or multiple choice, and quiz with a correct answer and timer), participants answer from their own
device, the animator reveals results with a fancy animated reveal, a 'fastest answer' spotlight (who answered first,
can be turned off) and for quizzes a 'first correct answer' celebration plus a small podium."

**Owner direction (verbatim intent)**: "presentation activity so animator can share present powerpoint but
interactive with participant so animator prepare question vote then show result make it fancy also can show first
participant response". Owner choices: slides come from a **.pptx file imported as is**; "first response" means both
a **fastest answer spotlight** and, for quizzes, the **first correct answer**.

## Clarifications

### Session 2026-10-02

- Q: When the circle meets in a room with a projector or TV, should circloo offer a separate audience screen
  (slides and results only, no controls or notes) opened by the animator on the big screen? → A: Yes, an audience
  screen with the current slide, question, countdown, results, spotlight, podium and the join code/QR.
- Q: While a poll is open, should results stay hidden until Reveal, or can the animator show bars moving live? →
  A: Hidden until Reveal by default; per poll the animator can turn on "Show results live". Quizzes are always
  hidden until Reveal.
- Q: How long should circloo keep an animator's uploaded presentations? → A: Until the owner deletes them; a
  presentation not opened or presented for 12 months is deleted automatically, with a notice in the library 30 days
  before.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The animator prepares a presentation from their PowerPoint (Priority: P1)

A signed-in person opens "My presentations", uploads a PowerPoint file and waits a few seconds while circloo turns
each slide into a picture. They see the slides as thumbnails in order, give the presentation a name, and can remove
slides they don't want to show. Presentations are theirs: they prepare them before the meeting and reuse them in any
circle they run.

**Why this priority**: without slides there is nothing to present; this is the entry point of the feature.

**Independent Test**: upload a 20-slide .pptx, see 20 thumbnails in order with readable text, rename the presentation,
delete one slide, reload: the presentation is still there with 19 slides.

**Acceptance Scenarios**:

1. **Given** I am signed in, **When** I upload a valid .pptx of up to 100 slides and 50 MB, **Then** I see progress,
   then every slide as a thumbnail in the original order, named after the file until I rename it.
2. **Given** a file that is not a real PowerPoint presentation, is password-protected, contains macros, or is over
   the limits, **When** I upload it, **Then** it is refused with a message that says why and how to fix it.
3. **Given** a slide uses fonts, animations, transitions, audio or video, **When** it is converted, **Then** it is shown
   as a still picture of its final state, and I am told once that animations and media are not played.
4. **Given** a deck has speaker notes, **When** it is converted, **Then** the notes are kept per slide and only I see
   them while presenting.
5. **Given** I delete a presentation, **Then** its slides and file are gone and it can no longer be started.
6. **Given** a presentation has not been opened or presented for 11 months, **Then** my library marks it "will be
   deleted in 30 days" until I open or present it; after 12 months idle it is deleted automatically.

---

### User Story 2 - The animator adds poll and quiz questions between slides (Priority: P1)

In the presentation editor, the animator inserts **question slides** anywhere between deck slides and reorders them.
A **poll** asks a question with 2 to 6 options, single or multiple choice. A **quiz** asks a question with 2 to 6
options, exactly one correct, and a timer. Each question can turn the **fastest answer spotlight** on or off.

**Why this priority**: interaction is what makes this different from screen sharing a deck; the owner asked for
"prepare question vote" explicitly.

**Independent Test**: add a poll after slide 3 and a quiz after slide 7, reorder them, reload: both are in place with
their options, correct answer, timer and spotlight setting.

**Acceptance Scenarios**:

1. **Given** the editor, **When** I add a poll with a question (1–140 chars) and 2–6 options (1–80 chars each) and
   choose single or multiple choice, **Then** it appears as its own slide where I put it.
2. **Given** a quiz, **When** I save it, **Then** it requires exactly one correct option and a timer between 10 and
   60 seconds (default 20).
3. **Given** any question, **When** I look at its settings, **Then** "Show who answered first" is on by default and I
   can turn it off; a poll also has "Show results live", off by default; for quizzes "Show the podium" is on by
   default and can be turned off for the presentation.
4. **Given** question slides, **When** I drag them or use "Move up / Move down", **Then** the order changes and is
   kept; keyboard-only reordering works.
5. **Given** a question has fewer than 2 options or a quiz has no correct option, **When** I try to save,
   **Then** the editor says what is missing.

---

### User Story 3 - The animator presents and everyone follows live (Priority: P1)

In a circle, the animator starts the **Presentation** activity and picks one of their presentations. Everyone in the
circle sees the current slide, large, on their own screen, and follows when the animator moves on. The animator has a
presenter view with the next slide, speaker notes, the slide count and how many people are following.

**Why this priority**: presenting in sync is the core of the activity; questions only make sense inside it.

**Independent Test**: animator on a laptop, two participants on phones: the animator moves through 5 slides with the
arrow keys; both phones change within a second each time; a participant who joins mid-way lands on the current slide.

**Acceptance Scenarios**:

1. **Given** I am the animator of an open circle, **When** I start Presentation and pick a presentation, **Then**
   everyone in the circle sees its first slide and I see the presenter view.
2. **Given** a presentation is running, **When** I go to the next or previous slide (buttons, arrow keys, Page
   Up/Down, space), **Then** every participant's screen shows that slide within 1 second.
3. **Given** I press B or "Blank", **Then** participants see a calm blank screen until I press it again.
4. **Given** a participant joins or reloads during the presentation, **Then** they land on the current slide (and
   the current question, if one is open).
5. **Given** I am a participant, **Then** I cannot move to another slide or see speaker notes, and I can view the
   current slide full screen.
6. **Given** I end the presentation or switch activity, **Then** everyone leaves the presentation view together.
7. **Given** I am presenting in a room with a projector or TV, **When** I choose "Open audience screen", **Then** a
   full-screen view opens (in a new window I can move to the big screen) showing only the current slide, open
   question with its countdown and answer count, results, spotlight and podium, plus the circle's join code and QR
   code while no question is open; it has no controls, notes or next slide, follows my actions within 1 second, and
   does not count as a participant.

---

### User Story 4 - Participants answer from their own device (Priority: P1)

When the animator reaches a question slide, participants see the question and big answer buttons on their own
screen. The animator's screen shows how many have answered, live, without showing the results yet.

**Why this priority**: answering is what involves the room; without it there are no results to reveal.

**Independent Test**: on a poll slide, three participants answer from phones; the animator sees "3 of 3 answered"
appear one by one; a participant who taps twice still counts once.

**Acceptance Scenarios**:

1. **Given** a poll slide is shown, **When** I tap an option (or several for multiple choice and confirm),
   **Then** my answer is recorded and I see it marked as mine.
2. **Given** a poll, **When** I change my mind before answers are locked, **Then** my answer is replaced, never added.
3. **Given** a quiz slide, **When** it opens, **Then** a countdown runs for everyone; I answer once and cannot change
   it; when the timer ends, answers lock automatically.
4. **Given** answers are locked (by the animator or the timer), **When** I try to answer, **Then** I am told answering
   is closed.
5. **Given** any question, **Then** each participant has at most one answer, whatever their number of tabs or devices,
   and the animator does not answer.
6. **Given** answering is open, **Then** the animator sees the count of answers and the people still to answer (by
   character), but no option counts until the reveal, unless the poll has "Show results live" on, in which case
   everyone sees the bars move as answers arrive and Reveal locks answers and marks the winner.

---

### User Story 5 - The animator reveals results with a spotlight on the fastest answer (Priority: P1)

When the animator presses **Reveal**, the results appear on everyone's screen with a lively animation: bars grow to
their share, counts and percentages tick up, and the winning option is marked. If "Show who answered first" is on, a
**spotlight** introduces the first person who answered, with their character, their circle name and how fast they
were.

**Why this priority**: the owner asked for results that feel "fancy"; the reveal is the moment the room reacts.

**Independent Test**: after three answers, press Reveal: every screen shows the same bars, counts and percentages,
then the spotlight on the first answerer with their time; with the spotlight turned off, no name appears.

**Acceptance Scenarios**:

1. **Given** answers are in, **When** I press Reveal, **Then** answering locks and every screen shows each option
   with its count, percentage and a bar, the most chosen option(s) marked, in under 1 second.
2. **Given** the spotlight is on and someone answered, **When** results are revealed, **Then** the first answer
   received is celebrated with the person's character, circle name and time since the question opened (e.g. "Amina,
   2.4 s").
3. **Given** the spotlight is off, **Then** no individual name is shown with the results.
4. **Given** nobody answered, **When** I reveal, **Then** a friendly "No answers this time" shows instead of empty bars.
5. **Given** reduced motion is set on a device, **Then** that device shows the final results at once, without
   growing bars, confetti or count-up.
6. **Given** a screen reader, **Then** results are available as text (option, count, percentage) and announced once.

---

### User Story 6 - Quiz reveal: first correct answer and a podium (Priority: P2)

For a quiz, the reveal first shows which option was correct, then celebrates the **first person who answered
correctly**. Correct answers earn points (faster earns more). After a quiz question, the animator can show a **podium**
of the top three so far in this presentation.

**Why this priority**: the quiz layer adds play on top of polls; polls alone are already a complete activity.

**Independent Test**: two quizzes, three participants answering at different speeds; after each reveal the correct
option and the first correct answerer are shown; the podium after the second quiz ranks people by total points.

**Acceptance Scenarios**:

1. **Given** a quiz is revealed, **Then** every screen shows the correct option distinctly (not by colour alone), the
   counts per option, and each participant sees on their own screen whether they were right.
2. **Given** at least one correct answer, **Then** the first correct answer is celebrated with character, name and
   time; **given** none, a kind "Nobody found it this time" shows.
3. **Given** a correct answer, **Then** it scores between 500 and 1000 points depending on speed (1000 at once, 500 at
   the last second); a wrong or missing answer scores 0.
4. **Given** the podium is on, **When** I press "Podium" after a quiz reveal, **Then** everyone sees the top three by
   total points with characters, names and points, ties sharing a place, and each participant sees their own rank.
5. **Given** the podium is off for the presentation, **Then** no ranking is shown or offered.

---

### Edge Cases

- The animator loses connection: the presentation pauses on the current slide for everyone, with a "waiting for the
  animator" note, and resumes where it was when they come back. Open answers stay open; a quiz timer that ran out
  while they were away still locks.
- Two animator tabs: the most recent action wins and both tabs show the same state.
- A participant answers at the exact moment answers lock: the server's lock time decides; the answer is either fully
  counted or refused with "answering is closed".
- Two participants answer within the same instant: the order the server received them decides who was first.
- A question is edited or deleted while that presentation is running in a circle: the running session keeps the
  version it started with.
- A presentation is deleted while it is being presented: the session ends kindly for everyone.
- The converted deck is still processing when the animator tries to start it: it cannot be picked until ready.
- Conversion fails part-way: the presentation is marked failed with a retry and nothing half-converted is shown.
- Very long option texts and Arabic options: wrap without cutting; RTL lays bars and labels out from the right.
- Phones in landscape and very small screens: the slide fits the width; answer buttons stay at least 44 px tall.
- The circle closes during a presentation: everyone sees the circle ended (as in spec 003).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-601**: Signed-in users MUST be able to create presentations by uploading a .pptx file; presentations belong to
  their owner and are visible only to them outside a running circle.
- **FR-602**: The system MUST accept only genuine .pptx files of at most 50 MB and 100 slides, refuse
  password-protected or macro-enabled files, and treat every upload as untrusted content that is never executed.
- **FR-603**: The system MUST turn each slide into a still picture in the original order, keep speaker notes per slide,
  and report progress, success or a clear failure with retry.
- **FR-604**: Owners MUST be able to rename a presentation, hide or delete slides, and delete the whole presentation,
  which removes its file, pictures and questions.
- **FR-604a**: Presentations MUST be kept until their owner deletes them, except that a presentation neither opened
  nor presented for 12 months MUST be deleted automatically, after being flagged in the owner's library for the last
  30 days; deleting the owner's account deletes their presentations.
- **FR-605**: Owners MUST be able to insert, edit, reorder and delete question slides of two kinds: poll (single or
  multiple choice, 2–6 options) and quiz (2–6 options, exactly one correct, timer 10–60 s, default 20).
- **FR-606**: Each question MUST have a "Show who answered first" setting (default on); each poll MUST have a "Show
  results live" setting (default off; quizzes never show results before the reveal); each presentation MUST have a
  "Show the podium" setting (default on) for its quizzes.
- **FR-607**: The activity catalog MUST include a **Presentation** activity that only the animator can start, with a
  choice among their ready presentations.
- **FR-608**: While presenting, the current slide, blank state, open question and its phase (answering, locked,
  revealed, podium) MUST be the same for everyone in the circle, reach every participant within 1 second, and be
  restored for anyone who joins or reloads.
- **FR-609**: Only the animator MUST be able to change slides, blank the screen, open, lock and reveal questions, show
  the podium and end the presentation; speaker notes and the next slide MUST be visible to the animator only.
- **FR-609a**: The animator MUST be able to open an **audience screen** for the running presentation: a full-screen,
  control-free view for a projector or TV that mirrors the shared state (slide, blank, question, countdown, answer
  count, results, spotlight, podium) and shows the circle's join code and QR code between questions. Only the
  animator can open it; it never shows speaker notes or the next slide and is not a participant.
- **FR-610**: The system MUST record at most one answer per participant per question, enforced by the server; poll
  answers can be replaced until locked; quiz answers are final; answers after the lock are refused.
- **FR-611**: Quiz timers MUST be decided by the server: answers lock when the timer ends even if the animator's device
  is offline.
- **FR-612**: Before the reveal, the system MUST show the animator only the number of answers and who is still to
  answer, never option counts, and MUST show participants nothing about other answers, except for a poll with "Show
  results live" on, where option counts and percentages update for everyone as answers arrive (still without names).
- **FR-613**: On reveal, the system MUST show every member each option's count and percentage, mark the most chosen
  option(s), and for quizzes the correct option, without relying on colour alone.
- **FR-614**: When the spotlight is on, the reveal MUST show the first answer received (poll) or the first correct
  answer (quiz) with the person's character, circle name and response time; when off, no name is shown.
- **FR-615**: Quiz scoring MUST give a correct answer 1000 points minus up to 500 in proportion to the time taken, and
  0 otherwise; the podium MUST rank participants by total points in the current presentation session, sharing places
  on ties.
- **FR-616**: Each participant MUST see their own answer marked, and after a quiz reveal whether they were right and,
  after a podium, their own rank.
- **FR-617**: Results and scores of a session MUST be kept with the circle for its lifetime so the animator can scroll
  back to earlier questions during the session; they are visible to circle members only.
- **FR-618**: Every string MUST exist in en, fr, ar and es; the layout MUST mirror in Arabic; results MUST be available
  as text; motion MUST be skipped under reduced motion; presenting MUST be fully keyboard-operable.
- **FR-619**: Uploads and answer submissions MUST be rate limited, and uploads, deletions and session starts audited.

### Key Entities *(include if feature involves data)*

- **Presentation**: owned by a signed-in user; name, source file name, status (processing, ready, failed), slide
  count, created, updated and last used times (for the 12-month idle clean-up), podium setting.
- **Slide**: belongs to a presentation; position, kind (deck slide or question), hidden flag; a deck slide has its
  picture and optional speaker notes.
- **Question**: a slide of kind poll or quiz; text, options (with the correct one for a quiz), single or multiple
  choice and live-results setting (poll), timer (quiz), spotlight setting.
- **Presentation session**: one run of a presentation inside a circle; current slide, blank state, current question
  phase and timestamps (opened, locked); a frozen copy of the slides and questions it started with.
- **Answer**: one per participant per question in a session; chosen option(s), time received, correctness and points
  for a quiz.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-601**: An animator goes from uploading a typical 30-slide deck to a presentation ready to start in under 1
  minute.
- **SC-602**: Adding a poll or a quiz question takes under 30 seconds.
- **SC-603**: Slide changes, question openings and reveals reach every participant in under 1 second on a normal
  connection, for a full circle.
- **SC-604**: A participant answers a question in at most 2 taps on a phone (single choice: 1 tap).
- **SC-605**: In usability tests, 9 out of 10 participants understand the results and who answered first without
  explanation, in each of the four languages.
- **SC-606**: No participant ever has more than one answer counted for a question, under repeated taps, several tabs
  or reconnects.
- **SC-607**: Text on converted slides is readable on a phone screen for the deck used in acceptance tests.

## Assumptions

- Presentations are a personal library of the signed-in animator, reused across circles; guests cannot create them.
- Slides are shown as still pictures: animations, transitions, embedded audio and video, and hyperlinks inside slides
  are not played or followed in this slice. Decks exported from other tools must first be saved as .pptx.
- The circle size limit from spec 003 (one participant per character) applies; no separate audience mode or guests
  beyond circle members.
- The animator presents from the circle room; for rooms with a projector or TV they open the audience screen; more
  than one audience screen may be open at once, each simply mirrors the session.
- The original upload is kept only as long as needed to convert it; the slide pictures and notes are what is stored.
- Answers record who answered (needed for one answer per person, the spotlight and the podium); anonymous voting is
  out of this slice.
- Out of scope (later slices of #64): agree/disagree scale and clusters, live Q&A, word cloud, rating and ranking,
  content slides built in circloo, AI deck drafting and summaries, CSV export, pushing results to boards or
  integrations, templates.
