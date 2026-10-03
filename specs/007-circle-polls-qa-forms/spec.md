# Feature Specification: Live polls, Q&A and satisfaction forms in a circle

**Feature Branch**: `feat/136-circle-polls-qa-forms`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "Live polls, Q&A and satisfaction forms as standalone circle activities (idea #136). Three new activities an animator can start in a circle, next to boards and the canvas, without a presentation: (1) live poll & vote, (2) Q&A with upvotes and answers, (3) a satisfaction form builder with rating (1–5, 0–10), single/multiple choice, yes/no and free-text questions. Private circles, phones, four languages incl. Arabic RTL, safety filter, one answer per member, live counts over the circle's real-time channel, results in the existing export."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run a quick live poll (Priority: P1)

In a circle, the animator starts **Poll**, types a question and two to six answers, chooses single or multiple choice and opens the vote. Everyone votes from their own device; the bars, counts and percentages move for everyone as votes arrive. The animator closes the vote; the final result stays visible in the circle and goes into the results the animator can send.

**Why this priority**: the poll is the smallest useful decision tool; it alone makes the feature worth shipping.

**Independent Test**: an animator and three participants on phones: the animator creates a 3-option poll, the three vote, everyone sees the same live bars, one participant changes their vote, the animator closes the vote and nobody can vote any more.

**Acceptance Scenarios**:

1. **Given** I am the animator of an open circle with Poll enabled, **When** I start Poll, write a question (1–140 characters) and 2–6 answers (1–80 characters each) and open the vote, **Then** every member sees the question and the answers as buttons on their screen.
2. **Given** a single-choice poll is open, **When** I tap an answer, **Then** my vote is recorded, marked as mine, and the results move for everyone within a second.
3. **Given** a multiple-choice poll is open, **When** I pick several answers and confirm, **Then** each picked answer counts once for me.
4. **Given** I already voted, **When** I change my answer before the vote closes, **Then** my vote is replaced, never added.
5. **Given** the animator closes the vote, **When** I try to vote, **Then** I am told voting is closed, and the final result (counts, percentages adding up to 100, most chosen marked by icon and label, not by colour alone) stays on every screen.
6. **Given** nobody voted, **When** the vote closes, **Then** a kind "No votes this time" shows instead of empty bars.
7. **Given** the interface is in Arabic, **Then** the poll is mirrored, bars grow from the right and numbers stay readable.

---

### User Story 2 - Ask and upvote questions (Q&A) (Priority: P1)

The animator starts **Q&A**. Participants write questions; everyone upvotes the questions they also want answered. The list shows the most-upvoted first. The animator picks a question, answers it out loud or with a short written answer, and marks it answered.

**Why this priority**: Q&A is the most requested moment after a talk or a meeting and works without any preparation.

**Independent Test**: three participants ask four questions, upvote each other's; the list reorders live; the animator marks the top question answered with a written answer; a question with unkind words is refused before it appears.

**Acceptance Scenarios**:

1. **Given** Q&A is running, **When** I write a question (1–200 characters) and send it, **Then** it appears for everyone with my name and character, or as "Someone in the circle" when the animator allowed anonymous questions and I chose to ask anonymously.
2. **Given** a question by someone else, **When** I upvote it, **Then** its count rises by one for everyone; upvoting again removes my upvote; I cannot upvote my own question.
3. **Given** several questions, **Then** they are ordered by upvotes (most first), then newest first, and answered questions move to an "Answered" section.
4. **Given** I am the animator, **When** I mark a question answered (optionally with a written answer of up to 500 characters), **Then** everyone sees it as answered with my answer.
5. **Given** I am the animator, **When** I hide a question, **Then** it disappears for everyone except me, and its author is not named publicly.
6. **Given** a question or an answer contains unkind or unsafe text, **When** it is sent, **Then** it is refused with a kind explanation and never shown to anyone.
7. **Given** I asked anonymously, **Then** other participants never see my name, while the animator can still remove the question (the author stays known to the system for moderation only).
8. **Given** the interface is in Arabic, **Then** the list, counts and buttons are mirrored and mixed Arabic/Latin text stays readable.

---

### User Story 3 - Build and fill a satisfaction form (Priority: P1)

The animator starts **Feedback form**, builds a short form (up to 10 questions) from ready question types, and opens it. Each participant fills it in once on their device and can change their answers until the animator closes it. The animator watches responses arrive and sees a summary per question.

**Why this priority**: teams end sessions with feedback; doing it inside the private circle, in the participant's language, replaces a separate survey tool.

**Independent Test**: the animator builds a form with one 1–5 rating, one 0–10 recommend question, one single choice, one yes/no and one free-text question; three participants answer; the animator sees "3 of 3 responded", the average rating with its distribution, the recommend score with promoters/passives/detractors, choice percentages, and the free-text answers without names.

**Acceptance Scenarios**:

1. **Given** I am the animator, **When** I build a form, **Then** I can add, edit, reorder and remove up to 10 questions of these types: rating 1–5 (shown as stars or as smileys), recommend 0–10, single choice (2–6 answers), multiple choice (2–6 answers), yes/no, free text (short: up to 200 characters, or long: up to 1 000), and mark each question required or optional.
2. **Given** a form is open, **When** I fill it in and send it, **Then** my response is saved; a required question left empty is pointed out next to it and nothing is sent until it is answered.
3. **Given** I already sent my response, **When** I open the form again before it closes, **Then** I see my answers and can change them; my response is replaced, never duplicated.
4. **Given** I am the animator, **While** the form is open, **Then** I see "n of N responded" update live, and the summary per question: average and distribution for 1–5 ratings, the recommend score (percentage of 9–10 minus percentage of 0–6) with the counts of promoters, passives and detractors for 0–10, counts and percentages for choices and yes/no, and the list of free-text answers.
5. **Given** free-text answers, **Then** they are shown without names, unless the animator turned on "Show names with answers" before opening the form, in which case participants are told so on the form before they answer.
6. **Given** the animator closes the form, **When** I try to send or change a response, **Then** I am told the form is closed; the summary stays available to the animator.
7. **Given** the interface is in Arabic, **Then** the form and its controls are mirrored, the 0–10 scale reads from the right, and stars or smileys are not flipped in meaning.

---

### User Story 4 - Keep and send the results (Priority: P2)

When a poll, a Q&A or a form ends, its results stay in the circle for its lifetime, and the animator's existing "Send results" includes them.

**Why this priority**: results that disappear lose their value, but sending them is secondary to running the moments live.

**Independent Test**: after a closed poll, a Q&A with answered questions and a closed form, the animator sends the circle's results to a connected service; the exported page lists the poll result, the questions with their answers and upvotes, and the form summary.

**Acceptance Scenarios**:

1. **Given** finished polls, Q&A and forms in a circle, **When** the animator uses "Send results", **Then** the export contains each poll's question and final percentages, each Q&A question with its upvotes and answer (anonymous questions stay anonymous), and each form's per-question summary (free-text answers without names unless names were turned on).
2. **Given** a circle has closed or reached the end of its lifetime, **Then** its polls, questions, forms and responses are removed with it.

---

### Edge Cases

- A participant joins while a poll or form is open: they see it at once and can take part; while a Q&A runs they see all visible questions.
- A participant leaves and rejoins (or reloads): their earlier vote, upvotes and form answers are shown as theirs; nothing is counted twice.
- The animator starts another activity while a poll or form is open: it closes, keeping what was answered.
- Two taps at the same moment from one person (two tabs or devices): still one vote, one upvote, one form response.
- The animator edits a form question after responses arrived: not allowed while open; a closed form can be copied into a new one instead.
- Free text that is only spaces, or longer than allowed: refused with a message next to the field.
- More than 12 people cannot be in a circle, so counts never exceed the circle's size.
- A rating question nobody answered: the summary says "No answers" instead of an average.
- The recommend score with no answers: shown as "—", not 0.

## Requirements *(mandatory)*

### Functional Requirements

**Activities**
- **FR-701**: The activity catalogue MUST offer three new activities, **Poll**, **Q&A** and **Feedback form**, that an animator can enable when creating a circle and start like the existing activities; members see them only while they run.
- **FR-702**: Only the animator can create, open, close, edit or moderate polls, Q&A and forms; participants (users or guests) can only vote, ask, upvote and answer.

**Poll**
- **FR-703**: A poll MUST have a question (1–140 characters) and 2–6 answers (1–80 characters each), single or multiple choice.
- **FR-704**: Each member MUST have at most one vote per poll, replaceable until the poll closes; the animator does not vote.
- **FR-705**: Results (counts, percentages adding up to exactly 100, most chosen marked by icon and label) MUST update live for every member while the poll is open and stay visible after it closes.
- **FR-706**: Several polls MAY be run one after another in the same circle; each keeps its own result.

**Q&A**
- **FR-707**: Members MUST be able to submit questions of 1–200 characters; the animator chooses whether anonymous questions are allowed (off by default).
- **FR-708**: Each member MUST have at most one upvote per question and cannot upvote their own question; upvotes can be withdrawn.
- **FR-709**: The list MUST be ordered by upvotes, then newest; answered questions are grouped separately; hidden questions are visible to the animator only.
- **FR-710**: The animator MUST be able to mark a question answered with an optional written answer of up to 500 characters, and to hide or unhide a question.
- **FR-711**: Anonymous questions MUST never reveal their author to other members, on screen or in exports.

**Feedback form**
- **FR-712**: The animator MUST be able to build a form of 1–10 questions from the types: rating 1–5 (stars or smileys), recommend 0–10, single choice, multiple choice (2–6 answers each), yes/no, free text (short ≤ 200 / long ≤ 1 000 characters); each question has a label (1–140 characters) and is required or optional.
- **FR-713**: A form MUST be editable only before it opens; while open, members fill it in; after it closes, no response can be sent or changed.
- **FR-714**: Each member MUST have at most one response per form, replaceable until the form closes; required questions must be answered before a response is accepted.
- **FR-715**: The animator MUST see live "n of N responded" and a per-question summary: average (one decimal) and distribution for 1–5; recommend score = % of 9–10 minus % of 0–6 (rounded to a whole number, from −100 to 100) with counts of promoters (9–10), passives (7–8) and detractors (0–6); counts and percentages for choices and yes/no; the list of free-text answers.
- **FR-716**: Free-text answers MUST be shown without names unless "Show names with answers" was turned on before the form opened; participants MUST be told on the form when names are shown.
- **FR-717**: Participants MUST NOT see other people's form responses or the summary (the animator may choose to show a question's summary to everyone after closing, as a poll-style result).

**Safety, privacy, languages**
- **FR-718**: Every question, answer option, Q&A question, Q&A answer and free-text response MUST pass the existing safety filter; unsafe text is refused with a kind message and never stored or shown.
- **FR-719**: All content MUST be visible only to the members of the circle; it is removed with the circle at the end of its lifetime.
- **FR-720**: Rate limits MUST apply to asking questions and sending answers so that one member cannot flood the circle.
- **FR-721**: Every user-facing string MUST exist in English, French, Arabic and Spanish; layouts MUST work right-to-left in Arabic and on phones from 360 px wide; status MUST never be shown by colour alone; motion MUST respect reduced-motion settings.
- **FR-722**: Members joining late or reloading MUST land on the current state (open poll with their vote, Q&A list with their upvotes, open form with their saved answers).

**Results**
- **FR-723**: The existing "Send results" export MUST include finished polls, Q&A (questions, upvotes, answers, anonymity kept) and form summaries (free text without names unless names were shown).

### Key Entities

- **Poll**: belongs to a circle; question, answers, single/multiple choice, state (draft, open, closed), opened/closed times.
- **Vote**: one per member per poll; the chosen answers; when it was last changed.
- **Q&A question**: belongs to a circle; text, author (member), anonymous flag, upvote count, state (open, answered, hidden), optional written answer and when it was answered.
- **Upvote**: one per member per Q&A question.
- **Form**: belongs to a circle; title (optional), "show names with answers" flag, state (draft, open, closed), ordered questions.
- **Form question**: type (rating 1–5 with stars or smileys, recommend 0–10, single choice, multiple choice, yes/no, short or long text), label, required flag, answer options for choices.
- **Form response**: one per member per form; one answer per question; when it was last changed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-701**: An animator creates and opens a poll in under 30 seconds, and builds and opens a 5-question form in under 2 minutes.
- **SC-702**: A vote, an upvote or a new question shows on every member's screen in under 1 second on the local stack.
- **SC-703**: In every test, each member has at most one vote per poll, one upvote per question and one response per form, including when sending from two devices at once.
- **SC-704**: Poll and choice percentages always add up to exactly 100 when there is at least one answer.
- **SC-705**: No unsafe text submitted in tests is ever shown to another member.
- **SC-706**: Every screen of the three activities passes automated accessibility checks (WCAG 2.2 AA) in English and Arabic, on desktop and on a phone.
- **SC-707**: A participant can vote, ask a question or complete a 5-question form on a phone in under 1 minute without help.

## Assumptions

- Circles keep their current limits (up to 12 people, 7-day lifetime); results live as long as the circle.
- "Kids-safe" is not a circle setting today: the existing safety filter applies to all text in every circle, which covers the kids-safe requirement.
- One poll, one Q&A and one form run at a time per circle (the activity that is running); finished ones remain in the circle's history.
- The animator does not vote, upvote or answer their own form; they moderate.
- Anonymous Q&A hides the author from members and exports, not from moderation or the audit trail.
- "Send results" reuses the existing integrations export (Microsoft 365, Jira, Confluence, Notion, Salesforce as connected); no new export channel is added.
- Scales: stars and smileys are two looks of the same 1–5 rating; the recommend question uses the standard 0–10 scale and score.
- The real-time channel the circle already uses carries the live updates; no new infrastructure is needed.
