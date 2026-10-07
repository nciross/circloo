---
name: circloo
description: A calm enterprise workspace with one warm face. Neutral surfaces, one action blue, violet only for AI, and a logo that feels what you feel.
colors:
  bg: "#f5f7f9"
  surface: "#ffffff"
  surface-sunken: "#eef1f4"
  surface-hover: "#e8ecf0"
  border: "#dfe3e8"
  border-strong: "#b9c2cc"
  text: "#0f2537"
  text-subtle: "#45576a"
  text-subtlest: "#5f6f82"
  primary: "#0d5bd7"
  primary-hover: "#0a4cb6"
  primary-subtle: "#e8f0fe"
  primary-text: "#0b4fb8"
  focus: "#2a73e8"
  ai: "#6a4fd1"
  ai-subtle: "#f2efff"
  ai-border: "#d9d0fb"
  ai-text: "#5638c2"
  success: "#1c7c52"
  success-subtle: "#dcf5e8"
  danger: "#c9372c"
  danger-subtle: "#ffeceb"
  brand-ink: "#062a40"
  brand-coral: "#ef4a32"
  dark-bg: "#0c141b"
  dark-surface: "#131e27"
  dark-text: "#e3ebf2"
  dark-primary: "#5b9bff"
  dark-ai: "#9f8fef"
typography:
  family: "'Readex Pro Variable', 'Readex Pro', system-ui, sans-serif"
  display:
    fontSize: "clamp(2.25rem, 1.5rem + 3vw, 3.75rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  section:
    fontSize: "clamp(1.75rem, 1.4rem + 1.4vw, 2.5rem)"
    fontWeight: 600
    letterSpacing: "-0.025em"
  page-title:
    fontSize: "1.5rem"
    fontWeight: 600
  panel-title:
    fontSize: "1.0625rem"
    fontWeight: 600
  body:
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  small:
    fontSize: "0.8125rem"
  lozenge:
    fontSize: "0.6875rem"
    fontWeight: 700
    textTransform: uppercase
rounded:
  xs: "3px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "999px"
spacing:
  grid: "4px"
  s-1: "0.25rem"
  s-2: "0.5rem"
  s-3: "0.75rem"
  s-4: "1rem"
  s-5: "1.25rem"
  s-6: "1.5rem"
  s-7: "2rem"
  s-8: "3rem"
  s-9: "4.5rem"
  s-10: "6rem"
layout:
  topbar-height: "3.5rem"
  sidebar-width: "15.5rem"
  content-max: "76rem"
  site-max: "74rem"
  room-workbar-height: "3rem"
  room-rail-width: "3.25rem"
components:
  button-primary: { backgroundColor: "{colors.primary}", textColor: "#ffffff", rounded: "{rounded.sm}", height: "2.25rem" }
  button-default: { backgroundColor: "{colors.surface-sunken}", textColor: "{colors.text}", rounded: "{rounded.sm}" }
  button-subtle: { backgroundColor: "transparent", textColor: "{colors.text}", rounded: "{rounded.sm}" }
  button-ai: { backgroundColor: "{colors.ai}", textColor: "#ffffff", rounded: "{rounded.sm}" }
  button-danger: { backgroundColor: "{colors.danger}", textColor: "#ffffff", rounded: "{rounded.sm}" }
  panel: { backgroundColor: "{colors.surface}", border: "1px {colors.border}", rounded: "{rounded.md}" }
  lozenge: { rounded: "{rounded.xs}", typography: "{typography.lozenge}" }
  input: { border: "1px {colors.border-strong}", rounded: "{rounded.sm}", height: "2.5rem" }
---

# Design System: circloo

## Overview

**North star: "A serious tool with a warm face."**

circloo looks like the enterprise tools its teams already trust (Jira, Linear, Notion): quiet neutral
surfaces, a left sidebar, a top bar with search, panels with headers, tables, lozenges. Nothing in the
chrome competes with the work. The warmth lives in exactly three places, and nowhere else:

1. **The face.** The last "oo" of circloo are two eyes and a mouth sits under them. The logo blinks,
   its pupils follow the pointer and its mouth follows the five check-in moods. It is the brand, the
   loading state and the explanation of what a check-in is.
2. **The people.** Avatars, fun characters and names carry colour. The interface around them stays grey.
3. **The content.** Icebreakers, jokes and riddles are set large and given room.

The public site uses the same system at a larger scale (#247): the first and the last band are the brand navy
with the whiteboard's dotted paper, the console (one line, the bird, a Build button) is the one light box on it,
and the circle composes itself from that line in a white card beside it. Everything else runs on white and the
canvas grey: a single player for the six story clips, three rows that show each job by the real thing, the four
languages set large, one honest list of integrations, the free plan, a plain FAQ, and one more line to type.

## Colour

- **Canvas and surfaces.** `bg` is the app canvas; `surface` is every panel, bar and card;
  `surface-sunken` is wells, tracks, table heads and panel footers. Hover and pressed are one and two
  steps darker. Borders are 1px `border`, `border-strong` for inputs.
- **Text.** `text` (the brand navy) for everything that matters, `text-subtle` for leads and secondary
  text, `text-subtlest` for hints and placeholders. All three pass AA on white and on the canvas.
- **Action blue** (`primary`) is the only colour that means "do this". One primary button per view.
  `primary-subtle` marks the selected nav item, the selected option and the picked mood.
- **AI violet** (`ai`) means "circloo wrote or will write this", and nothing else: the Ask circloo
  spark, the AI panel header, the "Suggested by AI" lozenge, the Keep button on AI cards. Never use
  violet for decoration.
- **Status.** Success green for "Live" and kept states, danger red for destructive actions and errors.
- **Brand accents.** `brand-coral` is the face's mouth, and it appears only in the logo.
- **Dark theme.** Every token is redefined for dark under `[data-theme='dark']` and under
  `prefers-color-scheme: dark` when the person chose "Match my device". Dark is a full theme, not an
  inversion: surfaces step up in lightness, primary and AI lighten so text on them flips to dark.

**The violet rule.** If it is violet, AI made it. If AI made it, it is labelled.

## Typography

One family, **Readex Pro** (variable, self-hosted), for Latin and Arabic, at weights 400 to 700.
Hierarchy comes from size and weight, never from a second face.

- Display (landing h1): 600, fluid to 3.75rem, -0.03em.
- Section titles: 600, fluid to 2.5rem.
- Page titles: 600, 1.5rem. Panel titles: 600, 1.0625rem.
- Body: 0.9375rem (15px), 1.55 line height. Small: 0.8125rem.
- Lozenges: 11px, 700, uppercase, slight tracking (no uppercase or tracking in Arabic).
- Numerals in timers, counts and codes are tabular.
- Arabic headings drop negative tracking and open the line height to 1.3–1.4.

## Layout

- **App shell:** sticky 3.5rem top bar (brand, Ask circloo search, "Start a round", avatar menu),
  a 15.5rem left sidebar (live items, a "Coming soon" group that is never a dead link, settings at the
  foot) and the content column (max 76rem). Below 62rem the sidebar becomes a modal drawer opened from
  a menu button.
- **Pages** start with a `PageHeader`: breadcrumbs, title, one-line lead, actions at the end.
- **Panels** are the unit of content: header (title + actions), body, optional sunken footer for form
  actions. Panels never nest.
- **Home** is a dashboard: today's icebreaker (wide), suggestions and favourites at the side, then a
  workspace table.
- **Public site:** mobile first, one column; from 60rem the console and the composition sit side by side and the
  job rows alternate sides. 74rem column, 3–6rem bands. No eyebrows, section numbers, metric rows, marquees,
  carousels, comparison tables or same-size card grids (Impeccable craft floor).
- Spacing is a 4px grid. Logical properties everywhere; RTL mirrors automatically.

## Elevation

Flat by default. Three shadows only, all offset and soft, tinted from the navy:
`raised` (panels), `overlay` (menus, auth card, toasts) and `float` (dialogs, the product preview,
the pricing card). No glows, no hard offset shadows.

## Components

- **Buttons:** primary, default (sunken with hairline), subtle (transparent), AI (violet), danger.
  6px radius, 36px tall (32 small, 44 large). Busy keeps focus with `aria-disabled` and spins the icon.
- **Lozenges** label status honestly: Live, Soon, Example, Suggested by AI.
- **Dropdowns** (language, account) are disclosure popovers: button with `aria-expanded`, list of
  buttons, arrow keys, Escape and outside press close and return focus.
- **Language menu:** one globe dropdown, each language named in itself; it applies only when chosen and
  defaults to the browser language until the person picks one.
- **Selects** for filters are native, so phones get the platform picker.
- **Segmented controls** for small exclusive choices (theme, timer, suggestions), `aria-pressed`.
- **Tables** for lists of things with attributes (workspace modules), sunken header row.
- **Avatar:** initials on one of six colours derived from the name.
- **Ask circloo:** a command palette (Ctrl/⌘ K) that turns plain words into a numbered plan the
  person can trim, then runs it only on confirmation.

## The face (logo)

Geometry lives in `src/web/src/components/Brand.tsx` on a 60 × 50 grid where 50 units = 1em: the eyes
are one x-height tall and sit on the baseline, so "circl" + face reads as one word. Moods map to mouth
paths with identical commands (1 frown … 5 grin), so browsers that animate `d` morph between them.
Pupils follow the pointer through CSS custom properties set from script (CSP-safe). Blink every 5.5s.
Reduced motion stops blinking and gaze. The mouth is always coral; eyes take the current text colour.
Static assets (`favicon.svg`, `logo-mark.svg`, `icon-maskable.svg`, PNG icons rendered from them) use
the same geometry on navy.

## The cast (characters)

Twelve characters (panda, fox, frog, cat, owl, octopus, bear, bunny, robot, ghost, chick, dino) drawn on a
64 × 64 grid in `src/web/src/components/Character.tsx`. Every one wears the logo's eyes (white rings with a
pupil) and a navy outline, so the cast reads as one family with the face. Their colours are fixed in both
themes: a character is a person's identity in a circle, not chrome. Participants must pick one to join;
taken characters are disabled and labelled. The picker is a native radio group, and the picked character
hops once.

## circloo, the panda

circloo's avatar in conversations is a single-weight line panda (`Panda.tsx`). While circloo thinks or
streams, the panda draws itself stroke by stroke (head, ears, patches, eyes, mouth) and its pupils glance
around; the streamed text ends in a violet caret. Under reduced motion the panda is simply drawn.

## Circles (live rooms)

- **Workspace frame (#244):** the room is a workspace, not a page. A work bar sits under the top bar, then the
  centre and the rail fill the app height from 960 px, each scrolling inside itself, with a 1rem margin instead of
  the page gutter and no content width cap. On phones the page scrolls as before, with the bottom sheet.
- **Work bar:** one sticky 3rem row: Home (animator), the circle name (one line, ellipsis, full name in `title`),
  the status dot with its word (live, connecting, reconnecting, offline, closed; green when live, amber when
  reconnecting), the running round as a grey chip with the starter's character ("Live canvas · started by
  Nadia"), then at the end the people strip (four stacked characters and "+n", opens People), Send results and
  Close circle (inline confirmation). On phones the animator's actions fold into a "Circle actions" menu. A
  polite status line announces round and connection changes; "Skip to the board" appears while a round runs.
- **Centre:** whatever runs fills it: the whiteboard's paper takes the full height (24rem at least), boards and
  presentations fill the same frame. Between rounds the animator sees a dock: when the circle has the canvas, a
  large sheet of the same dotted paper leads with "Open the whiteboard" (the one primary button), the other
  rounds below; otherwise the rounds alone. Participants wait with the panda, centred.
- **Rail:** on the inline end, like a meeting rail. Open: tabs People, Chat (with the round's conversation) and
  Call. Collapsed: a 3.25rem icon rail, one 44px button per tab with its count, which opens the rail on that
  tab and moves focus to it; collapsing returns focus to the rail. The choice is remembered per device. It ends
  above Pirikoo's corner button. Phones keep the bottom sheet (half, full, closed to a pill with counts).
- **Call tab:** the animator's Live discussion switch (off by default, with the plain explanation) and "Allow
  cameras" (on by default). Everyone sees the stage with a Soon lozenge until audio and video land; participants
  see whether the discussion is on, never the switch.
- **People ring:** members seated on a dashed circle at equal angles (set through CSS custom properties
  from script), online people bright, away people faded and grey; the animator wears a small crown.
- **Conversation:** like a chat with an assistant. circloo's messages are full-width text with the panda,
  name and the AI lozenge; people's messages are bubbles with their character, yours on the end side in
  primary-subtle. System lines ("Nadia started Quick questions") are centred pills.
- **Composer:** one rounded box with the send button inside. The animator chooses "circloo" (violet send)
  or "Everyone" (blue send) and has quick requests as chips.
- **Activities:** cards with an icon tinted by category (icebreakers blue, energizers amber, retro green,
  decide red), filterable by category.

## Pirikoo, the parakeet guide

Pirikoo is circloo's guide, and you talk to it like any assistant. The panda stays circloo's voice in the
group chat; Pirikoo is personal and private. It's a green parakeet drawn like the rest of the cast, with the
logo's eyes (`features/pirikoo/Bird.tsx`).

- **Where it lives**: a round button in the bottom inline-end corner holds the bird. It opens a compact chat
  above the button (full screen on phones). The chat grows into a centred, modal conversation, which the top
  bar's "Ask Pirikoo" and Ctrl/⌘ K also open. It's the same thread in both places, kept for the tab only
  (session storage) and forgotten on sign-out.
- **The bird shows what the AI is doing**, the way a person would: *idle* (breathes, blinks, glances around),
  *listening* (leans in, crest up, small nods while you type), *thinking* (looks up, ponders, wings flutter),
  *speaking* (the beak opens and closes while words stream in), *happy* (a hop with both wings up when an
  answer lands or a suggestion appears) and *oops* (crest down, a small head shake on an error). The corner
  button, the chat header and the latest answer share the mood. Older answers keep a still bird. These moods
  are the only "AI is working" signal: no sparkles, no violet glow.
- **Conversation**: your messages sit in blue bubbles at the inline end. Pirikoo answers in plain text next
  to a small bird, Claude-style, with a caret while it streams and "Pirikoo is writing" with three dots
  before the first word. Enter sends, Shift+Enter adds a line, and a stop button replaces send while it
  answers. Errors are kind lines with "Try again". The disclaimer under the field is always there: Pirikoo is
  AI and can make mistakes.
- **Plans**: an instruction ("Switch to dark mode", "A silly icebreaker for the family") becomes a numbered
  plan the person trims and runs. Answers to questions that also map to a plan end with the same card.
  Nothing runs before "Run the plan". Guests only get language and theme steps.
- **Suggestions**: one tip at a time, chosen by plain rules from the page, the role and the live room, pops up
  above the button with its action. The element it is about gets a calm green ring. The Suggestions setting
  (Off / Suggest) turns tips off, not the chat.
- **Empty state**: a big bird, "Hi Nadia, I'm Pirikoo!", the suggested next step on a soft green block, and
  chips that mix questions with things it can do.
- **Accessibility**: the log doesn't read streamed words aloud. A polite status line says "Pirikoo is
  writing" once, then the whole answer. Escape closes and focus goes back to what opened it. Reduced motion
  freezes the bird in its pose.

## Live canvas

The canvas activity (#93) puts everyone's notes on one big dotted-paper surface. Notes are paper squares or
circles in six colours (the board palette plus white) and three sizes. Each sits at a slight hand-placed tilt, has its author's
character in the corner and an optional sticker (heart, star, thumbs up, laugh, idea) that pops on. Double-click drops a note
where you are; drag moves it, live for everyone; the selected note gets a floating style bar. The others' cursors glide with
their colour, character and name. The character bobs while idle, wiggles while it moves, and fades after a few seconds
without movement. Pan by dragging the background or scrolling, zoom with Ctrl + scroll or the toolbar; "Bring in" pins board
notes and chat answers. Keyboard: notes are buttons (arrows move, E edits), N adds a note; a list view mirrors the canvas.
Reduced motion removes the glide, bob and drop.

## Typing in circles

Like any instant chat, the circle chat shows "Kenji is typing" with the person's character and three rising
dots under the last message, "Kenji and Lucía are typing" for two people, and "Several people are typing"
beyond that. It fades about 4 s after the last keystroke signal, and at once when their message lands. It's
hidden from screen readers because it changes too often to announce, and the dots stop under reduced motion.

## Motion

- **Focal moments**: the landing's composition (#247: the bird thinks, the name types itself, the seats hop in
  one by one, the activity chips drop, Pirikoo's line streams, the bird hops once and the Create button rises,
  under three seconds and cancelled by a new line); Pirikoo's moods while it listens, thinks and talks; someone
  arriving in a room (they hop onto the ring with hearts, and screen readers hear "Mia joined the circle").
- **Continuity**: an activity opens with a short clip-path reveal and its chip slides into the room's work bar
  from the inline end; the rail and its panel swap without animating any size (the panel fades and shifts 8px,
  tabs cross-fade); the whiteboard's dots settle in as it opens; page changes cross-fade.
- **Feedback**: a new circle's invite card glows twice; a vote count pops once, and so does any room count that
  goes up (unread, people); the room's status dot pulses once on going live, never in a loop; notes drop in.
- **Durations** are tokens: `--dur-press` 120ms, `--dur-state` 160ms, `--dur-move` 240ms, `--dur-enter` 300ms,
  `--dur-focal` 600ms for the one authored entrance of a surface.
- Easing is exponential ease-out (no bounce or elastic; the Impeccable detector checks it).

## Video

`/video` is a Remotion project that renders the 20-second tour (face, circle, chat, board, send, Pirikoo) per
language into `src/web/public/video/circloo-tour-{lang}.mp4` with a poster. It reuses the app's character and
bird SVGs. The landing plays it muted while on screen, pauses it off screen, never autoplays under reduced
motion, and describes it in text below the player.

## Motion (details)

Short and functional: 120–200ms state changes, 300ms entrances on `ease-out`, page cross-fades through
view transitions. No generic scroll reveals: on the public site a demo plays once when its row enters the screen
(votes drop, the cursor drags, jokes land) and the story clips play only while on screen. Under
`prefers-reduced-motion` the landing is still and shows every finished state at once, with a visible "Play
animations" opt-in and a "Pause animations" control that stops everything, the auto-demo included.

## Accessibility

WCAG 2.2 AA is the floor and is tested (axe in Playwright, desktop and phone, English and Arabic).
Every control has a visible label or an accessible name, mood is never colour alone (icon + word),
links in running text are underlined, focus rings are 2px `focus` with offset, and every string exists
in English, French, Arabic (RTL) and Spanish.

## Do / Don't

- Do keep the chrome grey and let people, the face and the content carry colour.
- Do use violet only for AI, and label every AI output.
- Do put content in panels with a header; put form actions in the panel footer.
- Don't add a second typeface, gradients, glass or decorative illustrations to the app.
- Don't use emoji as icons; Lucide at 16–20px, stroke 2.
- Don't hide a label with `display: none` when it names a control; clip it instead.

## Integrations

A grid of service panels, each with the real brand marks on a white tile (self-hosted, trademarks of their
owners, with a notice on the public site), the service name, a one-line purpose and a status lozenge
(Connected / Not connected / Soon) on the title line. Connecting opens the form inline with an info box that
says where to find each token or webhook. Secret fields are password inputs and are never shown again; only
a hint (host, project, space) is displayed. In a circle room, the animator's "Send results" dropdown lists the
connected services and reports back with a link to what was created.
