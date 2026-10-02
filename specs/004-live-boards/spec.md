# Feature Specification: Live boards in circles

**Issues**: #76 (API), #77 (UI) · **Parent idea**: #5 (Klaxoon-style boards), relates to #61 · **Status**: Ready

## Intent
Retro and brainstorm activities in a circle get a live board: everyone posts sticky notes into columns,
moves them, and votes with dots. circloo can sum the board up. It builds on live circles (spec 003).

## User stories
- **US1 (P1)** In a board activity, anyone in the circle adds a note (1–140 chars, one of five colours) to a column;
  everyone sees it within a second, with the author's character.
- **US2 (P1)** The author edits or deletes their note; the animator can delete any note. Anyone moves a note between
  columns by drag or with the keyboard (a "Move to" menu).
- **US3 (P1)** Everyone has 3 dot votes per board activity; a vote toggles; counts update live and notes can be
  sorted by votes.
- **US4 (P2)** Asking circloo to summarise a board activity lists the columns with the most-voted notes first.

## Board activities and columns
- start-stop-continue: start, stop, continue
- went-well: well, improve
- kudos: kudos
- brainstorm (new, category "decide"): ideas, maybe, next

## Requirements
- FR-401 Notes and votes persist per circle and activity; at most 200 notes per activity, 3 votes per member.
- FR-402 Every hub call re-checks membership; edit by the author only, delete by the author or the animator.
- FR-403 Note text goes through the same message safety policy as chat.
- FR-404 Every string in en, fr, ar, es; keyboard-operable moves; live changes announced politely.
