---
name: circloo
description: An orrery of people. Two grounds (Day and the dome at Night), ink, brass marks that measure, one beam of blue for action, violet only for AI, five skies for the moods, and a face that feels what the circle feels.
colors:
  ground: "#ffffff"
  paper: "#ffffff"
  paper-sunken: "#f2f4f7"
  paper-hover: "#e9ecf1"
  paper-pressed: "#dde1e8"
  hairline: "#e4e7ec"
  hairline-strong: "#9aa3b0"
  ink: "#0a0a0a"
  ink-soft: "#4d5560"
  ink-faint: "#737b86"
  on-ink: "#fafafa"
  brass: "#1f4fff"
  brass-faint: "#d6dfff"
  beam: "#1f4fff"
  beam-hover: "#1740d6"
  beam-pressed: "#1233ad"
  beam-subtle: "#eaf0ff"
  beam-text: "#1a44db"
  on-beam: "#ffffff"
  focus: "#3b66ff"
  ai: "#6a4fd1"
  ai-hover: "#5a40bd"
  ai-subtle: "#f2efff"
  ai-border: "#d9d0fb"
  ai-text: "#5638c2"
  on-ai: "#ffffff"
  sky-stormy: "#2f3a52"
  sky-foggy: "#aab4c3"
  sky-cloudy: "#cfd6e2"
  sky-bright: "#7fb8ff"
  sky-sunny: "#ffc53d"
  on-sky: "#0a0a0a"
  on-sky-stormy: "#ffffff"
  coral: "#ef4a32"
  live: "#1c7c52"
  live-subtle: "#dcf5e8"
  live-text: "#145c3b"
  danger: "#c9372c"
  danger-subtle: "#ffeceb"
  danger-text: "#ae2a19"
  warning-subtle: "#fff2cf"
  warning-text: "#7a4f01"
  neutral-subtle: "#f2f4f7"
  neutral-text: "#4d5560"
  body-1: "#1d4ed8"
  body-2: "#c2410c"
  body-3: "#15803d"
  body-4: "#9d174d"
  body-5: "#0e7490"
  brand-ink: "#0f2537"
  night-ground: "#0a0a0b"
  night-paper: "#111318"
  night-ink: "#fafafa"
  night-brass: "#6b8cff"
  night-beam: "#6b8cff"
  night-ai: "#9f8fef"
typography:
  family: "'Readex Pro Variable', 'Readex Pro', system-ui, sans-serif"
  display:
    fontSize: "clamp(2.25rem, 1.5rem + 3vw, 3.75rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  reading:
    fontSize: "clamp(2.5rem, 2rem + 2vw, 4.5rem)"
    fontWeight: "300–700 (var(--reading-weight), set by the mood)"
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontVariation: "'wght' var(--reading-weight)"
    fontFeature: "tabular-nums"
  section:
    fontSize: "clamp(1.75rem, 1.4rem + 1.4vw, 2.5rem)"
    fontWeight: 600
    letterSpacing: "-0.02em"
  title:
    fontSize: "1.5rem"
    fontWeight: 600
    letterSpacing: "-0.02em"
  headline:
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  panel-title:
    fontSize: "1.0625rem"
    fontWeight: 600
  body:
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  small:
    fontSize: "0.8125rem"
  caption:
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.02em"
  label:
    fontSize: "0.6875rem"
    fontWeight: 700
    letterSpacing: "0.06em"
    textTransform: uppercase
rounded:
  xs: "3px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "20px"
  ring: "999px"
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
  gutter: "clamp(1rem, 3vw, 2rem)"
layout:
  topbar-height: "3.5rem"
  sidebar-width: "15.5rem"
  content-max: "76rem"
  site-max: "74rem"
  workbar-height: "3.5rem"
  ring-lg: "15rem"
  ring-sm: "7.5rem"
  ring-workbar: "2.25rem"
components:
  button-primary: { backgroundColor: "{colors.beam}", textColor: "{colors.on-beam}", rounded: "{rounded.sm}", height: "2.25rem", padding: "0.4rem 0.9rem" }
  button-primary-hover: { backgroundColor: "{colors.beam-hover}" }
  button-default: { backgroundColor: "{colors.paper-sunken}", textColor: "{colors.ink}", rounded: "{rounded.sm}", height: "2.25rem" }
  button-subtle: { backgroundColor: "transparent", textColor: "{colors.ink}", rounded: "{rounded.sm}", height: "2.25rem" }
  button-ai: { backgroundColor: "{colors.ai}", textColor: "{colors.on-ai}", rounded: "{rounded.sm}", height: "2.25rem" }
  button-danger: { backgroundColor: "{colors.danger}", textColor: "#ffffff", rounded: "{rounded.sm}", height: "2.25rem" }
  icon-button: { backgroundColor: "transparent", textColor: "{colors.ink-soft}", rounded: "{rounded.sm}", size: "2.25rem" }
  chip: { backgroundColor: "{colors.paper}", textColor: "{colors.ink}", rounded: "{rounded.ring}", height: "2rem", padding: "0.3rem 0.75rem" }
  chip-on: { backgroundColor: "{colors.beam-subtle}", textColor: "{colors.beam-text}" }
  lozenge: { backgroundColor: "{colors.neutral-subtle}", textColor: "{colors.neutral-text}", rounded: "{rounded.xs}", typography: "{typography.label}", padding: "0 0.35rem" }
  lozenge-live: { backgroundColor: "{colors.live-subtle}", textColor: "{colors.live-text}" }
  lozenge-ai: { backgroundColor: "{colors.ai-subtle}", textColor: "{colors.ai-text}" }
  input: { backgroundColor: "{colors.paper}", textColor: "{colors.ink}", rounded: "{rounded.sm}", height: "2.75rem", padding: "0.5rem 0.85rem" }
  panel: { backgroundColor: "{colors.paper}", rounded: "{rounded.md}", padding: "1.25rem" }
  orbit-card: { backgroundColor: "{colors.paper}", textColor: "{colors.ink}", rounded: "{rounded.lg}", padding: "1rem" }
  nav-item: { backgroundColor: "transparent", textColor: "{colors.ink-soft}", rounded: "{rounded.sm}", height: "2.25rem" }
  nav-item-active: { backgroundColor: "{colors.paper}", textColor: "{colors.ink}" }
  ask-bar: { backgroundColor: "{colors.paper-sunken}", textColor: "{colors.ink-faint}", rounded: "{rounded.ring}", height: "2.25rem" }
  toast: { backgroundColor: "{colors.ink}", textColor: "{colors.on-ink}", rounded: "{rounded.md}", padding: "0.75rem 1rem" }
---

# Design System: circloo

## Overview

**Creative North Star: "The Orrery"**

circloo is an orrery of people. A circle is a ring, its members are bodies on that ring, and a round is a
transit everyone watches together. The world is built from the orrery's materials and nothing else: two
grounds (a cool off-white by Day, the dome `#0a0a0b` by Night), ink for everything that is read, brass for
every mark that measures something, one beam of blue for the one thing to do, violet only where AI wrote
something, and the five mood skies as fills. It refuses the SaaS dashboard (white cards on grey, one accent)
and the enterprise sidebar-as-identity it replaced (issue #250).

The chrome is quiet so three things can carry colour: the people (characters and avatars keep their fixed
colours in both themes), the face (the "oo" of the wordmark, coral mouth), and the content (an icebreaker set
large on a dealt card, a live canvas, a reveal). Density is medium: 15px body on a 4px grid, panels with one
hairline, lists that stagger in. Rings, arcs, ticks and hairlines are the only ornament, and each one carries
data: who is on the ring, how far the round has run, which option is picked, where the time stands.

Night is a full theme, not an inversion. Some surfaces are pinned to the dome in both themes because a room
reads best with light content on a dark ground: the public site's first and last bands, the presenter view and
the audience screen. Those surfaces redeclare the Night tokens as literals so every shared component inside
follows.

**Key Characteristics:**
- Two grounds, Day and Night, with every text pair AA or better in both.
- The ring is the signature: brass track, bodies at equal angles, the circle's sky inside, a brass arc while a round runs, mirrored in RTL.
- Brass measures, beam acts, violet means AI, coral is the mouth. Nothing else is coloured.
- One family (Readex Pro, variable) for Latin and Arabic; hierarchy by scale and weight; the instrument numeral's weight follows the mood.
- Hairline grids: cells share one hairline, cards do not float in a grid.
- One motion grammar (duration tokens, three springs, exponential ease-out), every animation with a reduced-motion path that keeps the meaning.
- Four languages, logical properties, Arabic as a first-class mirrored layout.

## Colors

The palette is the orrery's materials: grounds, paper, ink, brass, one beam, violet for AI, five skies and one coral.

### Primary
- **Beam** (`beam`, `#1f4fff`; Night `#6b8cff`): the one colour that means "do this". The primary button, the
  caret in every field, the switch when on, the picked option (`beam-subtle` fill with a `beam` border on
  character and activity pickers), the "you" outline on a ring body (3px), the hover arrow on an orbit card.
  `beam-text` is the link colour on ground and paper. Text on beam is `on-beam`, which flips to the dome at Night.

### Secondary
- **AI violet** (`ai`, `#6a4fd1`; Night `#9f8fef`): "circloo wrote or will write this" and nothing else. The
  AI button, the `ai-mark` square, Pirikoo's bubbles (`ai-subtle` fill, 1px `ai-border`, a violet caret while
  words stream), the AI panel head, the Suggested by AI lozenge, the plan step that asks the AI.

### Tertiary
- **Brass** (`brass`, `#1f4fff`; Night `#6b8cff`) and **brass faint** (`brass-faint`): the instrument. The
  idle ring track is brass faint; the running arc, the top tick, the round's time rule in the work bar, the
  filled code tile's rule, the selected segment's and nav item's tick, the chosen dropdown item's icon, the
  table head's rule, upload progress and the Pirikoo launcher's "something to say" ring are brass. Brass is
  never a button and never running text; an orbit card borders in brass on hover.
- **Coral** (`coral`, `#ef4a32`): the face's mouth. It appears nowhere else.
- **The five skies** (`sky-stormy` … `sky-sunny`): the moods, as fills. They fill the inside of a ring and
  the picked mood chip on the landing's demo, and they rank the options in a presentation's reveal (sunny for
  first, bright, cloudy, foggy, stormy for the rest). Text on `sky-stormy` is `on-sky-stormy`; on every other
  sky it is `on-sky`. A sky fill always sits beside the mood's icon and word.

### Neutral
- **Ground** (`ground`, `#ffffff`; Night the dome `#0a0a0b`): the page and the navigation rail. The two
  theme swatches in Settings are these two literals.
- **Paper** (`paper`, `#ffffff`; Night `#111318`): every panel, bar, card, input and ring body. `paper-sunken`
  is wells, tracks, panel feet, the Ask bar and the default button; `paper-hover` and `paper-pressed` are one and
  two steps down.
- **Hairline** (`hairline`, `#e4e7ec`) for every 1px border, row divider and grid gap; `hairline-strong`
  (`#9aa3b0`) for inputs, chips, dashed drop zones, the switch track and the scrollbar thumb.
- **Ink** (`ink`, `#0a0a0a`; Night bone `#fafafa`) for everything that matters; `ink-soft` for leads and
  secondary text; `ink-faint` for hints, placeholders, column heads and the idle status dot. `on-ink` is the
  text on an ink block (the toast).
- **Status**: `live` for what is happening now (the status dot, the Live lozenge, kept cards, the Connected
  lozenge), `danger` for destructive buttons and errors, `warning-text` on `warning-subtle` for reconnecting
  and energizers, `info-subtle`/`info-text` (the beam pair) for notices. `neutral-subtle`/`neutral-text` is
  the base lozenge.
- **Bodies** (`body-1` … `body-5`): the ring around a character when two people share it, and the five avatar
  fills. At least 3:1 on paper in both themes.
- **Brand ink** (`brand-ink`, `#0f2537`): the cast's outlines and the PWA icon tile, in both themes.

### Named Rules
**The Violet Rule.** If it is violet, AI made it. If AI made it, it is labelled.

**The Brass Measures Rule.** Every brass mark carries data (a track, a progress, a tick, a selection, a rule
under a running time). Brass is never a button, never running text, never decoration.

**The One Beam Rule.** One primary button per view. Beam is spent on the next action and on nothing else.

**The Coral Rule.** Coral is the mouth. No badge, no dot, no accent anywhere else.

**The Sky With a Word Rule.** A sky fill never stands alone: the mood's icon and word sit beside it, so colour is
never the only signal.

**The Two Grounds Rule.** Night is a full theme defined once in `tokens.css` under `[data-theme='dark']` and
under `prefers-color-scheme: dark` when the person chose "Match my device". A surface that must stay on the dome
in both themes (the site's first and last bands, the presenter and audience views) redeclares the Night values
as literals with the legacy aliases, so every shared component inside follows without a second stylesheet.

## Typography

**Display Font:** Readex Pro Variable (self-hosted, Latin and Arabic; falls back to system-ui)
**Body Font:** Readex Pro Variable (same family)
**Label/Mono Font:** none; numerals use `font-variant-numeric: tabular-nums` in the same family

**Character:** one warm, round, highly legible family at every size. Hierarchy comes from scale and weight,
never from a second face. The instrument numeral is the one place the variable weight axis is driven by data.

### Hierarchy
- **Display** (600, `clamp(2.25rem, 1.5rem + 3vw, 3.75rem)`, 1.05, -0.03em): the public site's headline token.
  The landing's console title runs larger still (`clamp(2.5rem, 2rem + 4vw, 5rem)`, line height 1.02) on the dome.
- **Reading** (300–700 by mood, `clamp(2.5rem, 2rem + 2vw, 4.5rem)`, 1, -0.02em, tabular): the instrument
  numeral in a ring's centre. `--reading-weight` defaults to 600 and the ring's sky modifier sets it: 300 stormy,
  400 foggy, 500 cloudy, 600 bright, 700 sunny; the change tweens over `--dur-focal`. `.reading__of` is the
  small "of n" at 0.4em, weight 500.
- **Section** (600, `clamp(1.75rem, 1.4rem + 1.4vw, 2.5rem)`, -0.02em to -0.025em): page titles in the page
  header, site section titles, the six code tiles.
- **Title** (600, 1.5rem, -0.02em): the auth card's title, the lead orbit's circle name, the bare teaser question.
- **Headline** (600, 1.25rem, 1.3, -0.01em): the work bar's circle name, the orrery's heading, the teaser question.
- **Panel title** (600, 1.0625rem): panel, card and dialog titles; an orbit card's name.
- **Body** (400, 0.9375rem, 1.55): running text, inputs, buttons (500), chat. Leads keep to about 52ch; the
  canvas hint to 80ch.
- **Small** (0.8125rem): secondary text, timestamps, chips, the work bar's status and round, the mood chips.
- **Caption** (600, 0.75rem, 0.02em): table column heads, select labels, nav group names, the kbd cap.
- **Label** (700, 0.6875rem, 0.06em, uppercase): lozenges. In Arabic: 0.75rem, no tracking, no uppercase.
- Headings everywhere: weight 600, line height 1.2, -0.01em, `text-wrap: balance`. Arabic headings drop the
  tracking and open to 1.3–1.5.
- Numerals in timers, counts, codes, "+n" and the avatar's initials are tabular.

### Named Rules
**The Weight Axis Rule.** Only the reading numeral drives Readex Pro's weight axis, and only the circle's mood
drives it. Everywhere else, weights are 400 (body), 500 (controls, chips), 600 (headings, names), 700 (wordmark
and lozenges).

**The One Family Rule.** No second typeface, no monospace. Codes and times are Readex Pro with tabular numerals.

## Layout

- **App shell:** a sticky 3.5rem top bar on paper with one hairline beneath (wordmark at inline-start, the Ask
  bar as a sunken pill of up to 30rem, Start a round, the avatar), a 15.5rem navigation rail at inline-start on
  ground (nav sticky under the bar, the selected item filled beam-subtle in ink 600, a
  "Coming soon" group that is never a dead link, settings at the foot), and the content column on ground (max
  76rem, `--gutter` = `clamp(1rem, 3vw, 2rem)` inline, 1.5rem above, room at the end for Pirikoo's corner
  button). Below 62rem the rail becomes a modal drawer (`min(18rem, 86vw)`, slides in from the inline start over
  the dome at 50%). Below 40rem the Ask bar fills the bar and "Start a round" keeps only its icon (label clipped).
- **Home (the orrery):** the greeting with the face (3.75rem, grinning, gaze on), then "your circles" as
  orbit cards on a grid of `minmax(13rem, 1fr)`: the lead orbit (the newest open circle) spans two columns and
  carries the large ring (15rem, bodies 2.5rem) with the member count as the reading numeral in its centre; the
  others carry the small ring (7.5rem, bodies 1.5rem). Each orbit card is paper on a hairline at `r-lg`, the
  name, a Live/Closed lozenge, role and count, and a round arrow that turns beam on hover. Beside the lead orbit,
  today's phase: the face, "circloo feels … too", the five moods as one-tap chips (`.moods`/`.mood`, shared with
  the landing demo) and a note that the phase stays on this device until circle-wide check-ins ship; the pick
  fills the lead ring's sky, sets the reading's weight and is kept in `localStorage` for the day. Below, a two-column
  dash (1.6fr / 1fr): today's icebreaker on the wide side, the first-circle tour (before any circle) and the three
  latest favourites on the side. Under 56rem the dash stacks; under 40rem the orbits go to one column and the
  lead orbit centres.
- **Pages** start with a page header: breadcrumbs (24px targets, "/" separators), the section-size title, a
  one-line lead in ink-soft, actions at the inline end. Narrow pages cap at 52rem.
- **Panels** are the unit of content: head (3.25rem min, title and actions, hairline under), body (1.25rem
  padding, 1rem gaps), optional sunken foot for form actions. Panels never nest.
- **Hairline grids** (integrations, the deck library): cells on paper with a 1px gap on a hairline background,
  so neighbours share one line. No card grid of floating cards.
- **The room (workspace):** a sticky 3.5rem work bar under the top bar (Home, the circle's 2.25rem ring with
  its bodies and the count, the name, the status dot and word, the running round as a paper chip with the
  starter's character, its title, its tabular time and a 2px brass rule filling along its bottom edge, then
  Send results and Close circle); from 60rem the centre and the rail fill the app height and scroll inside
  themselves with a 1rem margin and no width cap; the centre's paper is the whiteboard at `r-xl` (24rem
  minimum). The work bar is a container: under 56rem it drops "started by", under 40rem it keeps only the time
  and its rule. Phones keep the page scrolling with a bottom sheet.
- **Public site:** mobile first, one column; the dome bands (first and last) carry the whiteboard's 24px dot
  grid; the console box and the composition card are the one light box on the dome and pin the Day tokens
  inside. From 56rem the site bar shows its anchors; from 60rem the console and the composition sit side by
  side. Column 74rem; bands 2–3rem on phones, up to 4.5rem.
- **Auth:** one paper card (`min(26rem, 100%)`, `r-lg`, overlay shadow) centred on ground with the face as a 5%
  ink watermark at the bottom inline-end corner; the six-digit code sits in two groups of three tiles over brass
  rules.
- Spacing is a 4px grid (`s-1` 4px to `s-10` 96px): tight inside a group (s-1, s-2), s-3/s-4 inside panels and
  rows, s-5/s-6 between panels, s-7+ for bands. Logical properties everywhere; RTL mirrors automatically,
  including the direction a ring's bodies and progress run, the drawer's side and the switch's knob.

## Elevation & Depth

A hybrid: flat by default with hairlines doing the separating, and three soft, offset shadows tinted from the
dome for the few things that lift. Depth also comes from tonal steps on paper (sunken, hover, pressed) and from
the dome bands and dialog backdrop (`rgb(10 10 11 / 0.5)`) that sit the content a layer above the night.

### Shadow Vocabulary
- **Raised** (`0 1px 1px rgb(10 10 11 / 0.08), 0 0 1px rgb(10 10 11 / 0.2)`): panels and orbit cards on ground,
  ring bodies, the selected segment and the selected nav item, the switch knob, a plan step's icon.
- **Overlay** (`0 8px 12px rgb(10 10 11 / 0.12), 0 0 1px rgb(10 10 11 / 0.28)`): dropdown panels, toasts, the
  skip link, the auth card, the dealt icebreaker, the landing's composition card, the Send status.
- **Float** (`0 24px 48px -12px rgb(10 10 11 / 0.25), 0 0 1px rgb(10 10 11 / 0.25)`): the drawer, dialogs, the
  Pirikoo panel, the canvas's selected-note style bar, the room's bottom sheet.
- At Night the three use black offsets with a 1px bone edge (`rgb(250 250 250 / 0.18–0.25)`) so paper still
  parts from the dome.

### Named Rules
**The Hairline First Rule.** Separation is a 1px hairline before it is a shadow. A shadow means the thing floats
above the page (a menu, a card dealt from the deck, a sheet); content at rest gets raised at most.

**The No Glow Rule.** No glows, no blurred colour halos, no glass. The only "ring" around a control is a focus
ring (2px `focus`, 2px offset) or a brass selection ring.

## Shapes

- **Radii:** `r-xs` 3px for lozenges, kbd caps and focus outlines; `r-sm` 6px for buttons, inputs, selects,
  chips of the work bar, nav items and plan steps; `r-md` 8px for panels, dropdown panels, toasts, pickers,
  activity cards and mood chips; `r-lg` 12px for things that float or lead (the auth card, orbit cards, the
  dealt card, the landing's composition card, Pirikoo's panel); `r-xl` 20px for the whiteboard's sheet, the
  room's centre and the bottom sheet's top; `r-ring` 999px for rings, bodies, avatars, chips, pills, the Ask
  bar, the switch and the status dot.
- **The ring:** an SVG on a 100-unit box, the sky disc at r 38, the track at r 46 (brass faint, 1.6 wide), the
  running arc on the same radius (brass, 2.4 wide, round caps), a tick at the top; closed circles dash the
  track and sink the sky to paper-sunken. Bodies are paper discs with the raised shadow, placed by
  `rotate(angle) translateY(-46%) rotate(-angle)` from a custom property so RTL can flip the direction with
  `--dir: -1`; the SVG mirrors with `scaleY(-1)`.
- **Hairlines everywhere:** 1px borders, 2px brass rules (the round's time, code tiles, upload progress, the
  segment tick), 3px for the active nav tick and the "you" outline on a ring body.
- **Dotted paper:** the whiteboard and the dome bands use a 24px grid of 1px dots (`radial-gradient` of
  `hairline-strong`), the one place a gradient function appears, and it draws dots, not a wash.
- **Characters** are drawn on a 64 × 64 grid with the brand-ink outline and the logo's eyes; the face lives in a
  60 × 50 box (see The face). Nothing is tilted or hand-rotated except canvas notes, which carry a slight
  per-note tilt by design.

## Components

Controls feel like parts of an instrument: paper on a hairline, one beam for the action, brass for the mark
that says "this one", and a press that scales to 0.98 over 120ms.

### Buttons
- **Shape:** gently rounded (6px), 36px tall (32 small, 44 large), 0.4rem × 0.9rem padding, 500 weight, icon
  and label with an 8px gap.
- **Primary:** beam fill, `on-beam` text; hover `beam-hover`, pressed `beam-pressed` with `scale(0.98)`.
- **Default:** paper-sunken fill with an inset 1px hairline, ink text; hover paper-hover.
- **Subtle:** transparent, ink text; hover paper-hover. **Icon button:** 36px square (28 small), ink-soft, same hovers.
- **AI:** violet fill, `on-ai` text. **Danger:** danger fill, white text.
- **States:** focus is the 2px `focus` outline with 2px offset; disabled is 50% opacity with `not-allowed`; busy
  keeps focus (`aria-disabled`), shows `progress` and spins the icon (900ms linear).
- **Link button:** underlined beam-text, 500 weight, no box.

### Chips
- **Style:** paper on a 1px `hairline-strong`, full radius, 32px tall, small 500 text; hover darkens the border
  to ink-faint and the fill to paper-hover.
- **State:** `aria-pressed="true"` / `.is-on` turns the border beam, the fill beam-subtle and the text beam-text.
- **Mood chips** (landing demo): paper on hairline at `r-md`, icon over word, 44px min; the pressed one fills
  with its sky and takes `on-sky` (`on-sky-stormy` for stormy).

### Cards / Containers
- **Panel:** paper, 1px hairline, 8px radius, raised shadow; head with a hairline under, body at 1.25rem, an
  optional sunken foot with a hairline above. `panel--ai` borders in `ai-border` with an `ai-subtle` head.
- **Orbit card** (Home): paper on hairline at 12px, raised; ring at inline-start, text at inline-end; hover turns
  the border brass and the arrow beam.
- **Dealt card** (icebreakers): paper at 12px with the overlay shadow, the rest of the deck as two hairline
  offsets (6px and 12px) beneath it that tuck up while a card drops in.
- **Hairline grid cell** (integrations, decks): paper, no radius, `box-shadow: 0 0 0 1px hairline`, 1px gaps.
- **Toast:** ink block with `on-ink` text, 8px, overlay shadow, rises in; error toasts are danger.

### Inputs / Fields
- **Style:** paper on a 1px `hairline-strong`, 6px radius, 44px tall, 0.5rem × 0.85rem padding, body size;
  the field label is small 600 ink-soft above; help is small ink-faint.
- **Focus:** the 2px `focus` outline with 2px offset and the border turned `focus`; the caret is beam.
- **Error:** `aria-invalid` turns the border danger with a 1px inset; the message is small 500 `danger-text`;
  success messages are `live-text`.
- **Select:** native, same box at 36px, chevron at the inline end. **Switch:** 44px × 24px track on
  `hairline-strong`, paper knob with the raised shadow, beam when on, knob travels 1.25rem (mirrored in RTL).
- **Segmented control:** a sunken track with an inset hairline; the chosen option rises as paper with the raised
  shadow, 600 weight, and a 2px brass tick at its inline start.
- **Code field:** six tiles over 2px brass-faint rules in two groups of three; a filled tile's rule turns brass
  and its digit settles up 6px; the next tile shows the beam (beam-subtle fill, focus-coloured 3px rule).

### Navigation
- **Top bar:** paper on one hairline, 3.5rem; the Ask bar is a sunken pill with Pirikoo's bird, a prompt in
  ink-faint and a kbd cap; the account trigger is the avatar, which gains a hairline-strong ring on hover and a
  brass ring while its menu is open.
- **Rail items:** 36px rows, 6px radius, ink-soft 500; hover paper and ink; active is beam-subtle with ink 600
  (beam-subtle-hover on hover); "soon" items are ink-faint with no pointer.
- **Dropdowns** (language, account, Send results): paper panel at 8px with the overlay shadow rising 240ms from
  under the trigger; 40px items; the current item is 600 with a brass icon. Disclosure semantics
  (`aria-expanded`, arrow keys, Escape and outside press close and return focus).
- **Breadcrumbs:** small, ink-soft links with 24px targets.
- **Work bar and rail:** see Circles (live rooms).

### The ring (signature)
`Ring.tsx` + `ring.css`. Props: `size` (lg 15rem / sm 7.5rem; the work bar overrides to 2.25rem), `bodies`
(up to 12, the rest as a "+n" body in tabular small 600), `people`, `mood` (null leaves the inside on paper),
`progress` (0–1, draws the brass arc; absent when idle), `closed`, `label` (the whole ring is one `role="img"`),
`children` (the centre, usually the reading numeral) and `compose` (the focal entrance: the track draws itself
over 600ms, then bodies hop in with the snappy spring, 40ms apart, capped at 320ms; reduced motion fades them
in over 160ms). Bodies sit in arrival order from the top, clockwise in LTR and counter-clockwise in RTL. The sky
fill tweens over `--dur-focal`; the arc settles with the gentle spring. The "you" body wears a 3px beam outline.
Used on Home (count in the centre, the sky from today's phase), in the work bar (progress of the running round), on Join (the
host's circle) and in the landing's composition (mood and transit driven by the demo).

### Avatar and lozenge
- **Avatar:** initials, 600 tabular, on one of the five body colours picked from the name; 32px (24 small,
  40 large), full radius.
- **Lozenge:** label type on `neutral-subtle` at 3px, 1.45rem line; `--success` is live (Live, Connected, kept),
  `--ai` adds an inset `ai-border`, `--info` the beam pair, `--warning` and `--danger` their pairs. Honest words
  only: Live, Soon, Example, Suggested by AI, Connected, Not connected, Closed.

## Do's and Don'ts

### Do:
- **Do** keep the chrome to ground, paper, ink and brass, and let people, the face and the content carry colour.
- **Do** spend beam on exactly one primary action per view; selection is beam-subtle (nav, options) or a brass tick (segmented controls).
- **Do** keep violet for AI alone and label every AI output (lozenge, name or "Suggested by AI").
- **Do** put every sky fill beside the mood's icon and word; mood is never colour alone.
- **Do** separate with a 1px hairline first; shadows are for things that float (menus, dealt cards, sheets).
- **Do** set every count, time and code in tabular numerals; drive only the reading numeral's weight, and only by mood.
- **Do** use logical properties and `--dir` style custom properties so rings, drawers and switches mirror in RTL; drop uppercase and tracking under `:lang(ar)`.
- **Do** give every entrance a reduced-motion path that keeps the meaning (a fade, an instant position, a pop by opacity).
- **Do** use Lucide icons at 14–20px, stroke 2, with `.flip-rtl` on directional ones.

### Don't:
- **Don't** add a second typeface, a monospace, or a system display face; Readex Pro at every size.
- **Don't** paint gradients, glass (`backdrop-filter`), glows or blurred halos. The 24px dot grid of the whiteboard and the dome bands is the one `radial-gradient`, and it draws dots.
- **Don't** use coral outside the face's mouth, brass as a button or running text, or violet as decoration.
- **Don't** float cards in a grid; neighbours share a hairline (1px gap on a hairline background).
- **Don't** use emoji as icons or sparkles for AI; the bird's moods and the violet label are the AI signal.
- **Don't** hide a control's label with `display: none`; clip it (`.visually-hidden` or the `.btn__label` clip).
- **Don't** run a loop that is not a live indicator (typing dots, the thinking crest, a conversion spinner, the presence pulse); a count pops once, a status dot pulses once.
- **Don't** nest panels or put a panel head inside a hairline-grid cell.

## The face (logo)

Geometry lives in `src/web/src/components/Brand.tsx` on a 60 × 50 grid where 50 units = 1em: the eyes
(radius 11, stroke 4.6, centres at x 15.25 and 43.75, y 23.75) are one x-height tall and sit on the baseline,
so "circl" + face reads as one word; pupils (radius 3.4) sit half a unit below the centre. Moods map to mouth
paths with identical commands (1 frown … 5 grin, stroke 4.2, round caps), so browsers that animate `d` morph
between them over `--dur-enter`. Pupils follow the pointer through `--gx`/`--gy` set from script (CSP-safe,
180ms ease-out); the face blinks every 5.5s; the brand link grins (mood 5) on hover and focus. Reduced motion
stops blinking and gaze (the landing can force gaze back on with its "Play animations" opt-in). The mouth is
always coral; eyes take the current text colour (ink, or `on-ink` on the dome; the auth watermark draws the
mouth in ink too, at 5% opacity). The wordmark is 700, -0.02em, with the face at 1.3em wide. Static assets
(`favicon.svg`, `logo-mark.svg`, `icon-maskable.svg`, PNG icons rendered from them) use the same geometry on
`brand-ink`; the page's theme colours are `#ffffff` (light) and `#0a0a0b` (dark).

## The cast (characters)

Forty-eight characters (animals, heroes, plants and a few strange friends), plus "anonymous" and a build-your-own
avatar (`me:` codes for skin, hair and outfit), drawn on a 64 × 64 grid in `src/web/src/components/Character.tsx`.
Every one wears the logo's eyes (white rings with a pupil) and the brand-ink outline, so the cast reads as one
family with the face. Their colours are fixed in both themes: a character is a person's identity in a circle, not
chrome. Sizes: 13px on the work bar's ring, 24px in strips and chat, 40px on the large ring, 48px in the picker,
7rem in the builder's preview (on a brass track). Participants must pick one to join; taken characters are
dimmed and labelled; when two people share a character each gets a ring in `body-1` … `body-5` with a numbered
dot. The picker is a native radio group on paper tiles; the picked tile takes beam-subtle with a beam border and
the character hops once. Never use a character as an icon, bullet or decoration.

## circloo, the panda

circloo's avatar in group conversations is a single-weight line panda (`Panda.tsx`). While circloo thinks or
streams, the panda draws itself stroke by stroke and its pupils glance around; the streamed text ends in a violet
caret. Under reduced motion the panda is simply drawn. It also waits in the empty circles panel and in a room
between rounds.

## Pirikoo, the parakeet guide

Pirikoo is circloo's guide, and you talk to it like any assistant. The panda stays circloo's voice in the
group chat; Pirikoo is personal and private. It's a green parakeet drawn like the rest of the cast, with the
logo's eyes (`features/pirikoo/Bird.tsx`).

- **Where it lives**: a round paper button (3.75rem, 1.25rem from the bottom inline-end corner) holds the bird;
  it wears a brass ring when the bird has something to say (an unread answer or a suggestion), never a coral
  badge. It opens a compact chat above the button (full screen on phones), which grows into a centred modal
  conversation; the top bar's Ask bar and Ctrl/⌘ K open the same thread. The thread is kept for the tab only
  (session storage) and forgotten on sign-out.
- **The bird shows what the AI is doing**, the way a person would: *idle* (still), *listening* (leans in, crest
  up, blinks now and then while you type), *thinking* (looks up, the crest tilts side to side at 600ms, the one
  authored loop), *speaking* (the beak chatters while words stream in), *happy* (one hop with both wings up,
  `--dur-focal`) and *oops* (crest down, one head shake). The corner button, the chat header and the latest
  answer share the mood; older answers keep a still bird. These moods are the only "AI is working" signal: no
  sparkles, no violet glow.
- **Conversation**: your messages are sunken paper at the inline end. Pirikoo answers on `ai-subtle` with a 1px
  `ai-border`, a small bird, a violet caret while it streams and "Pirikoo is writing" with three dots before the
  first word. Enter sends, Shift+Enter adds a line, a stop button replaces send while it answers. Errors are kind
  lines with "Try again". The disclaimer under the field is always there: Pirikoo is AI and can make mistakes.
- **Plans**: an instruction becomes a numbered plan (sunken steps that pop in 30ms apart, the AI step's icon in
  violet) the person trims and runs. Nothing runs before "Run the plan". Guests only get language and theme steps.
- **Suggestions**: one tip at a time, chosen by plain rules from the page, the role and the live room, pops up
  above the button with its action; the element it is about gets a brass spotlight ring that runs twice
  (`--dur-orbit`). The Suggestions setting (Off / Suggest) turns tips off, not the chat.
- **Accessibility**: the log doesn't read streamed words aloud; a polite status line says "Pirikoo is writing"
  once, then the whole answer. Escape closes and focus goes back to what opened it. Reduced motion freezes the
  bird in its pose.

## Circles (live rooms)

- **Workspace frame (#244, orrery look #250):** the room is a workspace, not a page. A work bar sits under the
  top bar, then the centre and the rail fill the app height from 60rem, each scrolling inside itself, with a 1rem
  margin instead of the page gutter and no content width cap. On phones the page scrolls, with the bottom sheet.
- **Work bar:** one sticky 3.5rem row on paper: Home, the circle's small ring (2.25rem, your body outlined in
  beam) with the member count (opens People), the circle name (one line, ellipsis, full name in `title`), the
  status dot with its word (ink-faint idle, live green, warning amber while connecting or reconnecting; the live
  dot pulses once on going live), the running round as a paper chip with the starter's character, "started by",
  its tabular time over a 2px brass rule that fills with the round's progress (1s linear steps), then Send
  results and Close circle (inline confirmation). What was sent appears under the bar, never inside it. On phones
  the animator's actions fold into a "Circle actions" menu. A polite status line announces round and connection
  changes; "Skip to the board" appears while a round runs.
- **Centre:** whatever runs fills it: the whiteboard's dotted paper at `r-xl` takes the full height (24rem at
  least), boards, chat and presentations fill the same frame. Between rounds the animator sees the dock
  ("Open the whiteboard" as the one primary button, the other rounds below); participants wait with the panda.
- **Rail:** on the inline end, like a meeting rail, with People, Chat and Call tabs; collapsed to an icon rail
  with one 44px button per tab and its count. The choice is remembered per device. It ends above Pirikoo's corner
  button. Phones keep the bottom sheet (half, full, closed to a pill with counts).
- **People:** a list with an uppercase caption head (none in Arabic), each row the character at 32px with an
  online dot at its foot cut out of the ground; away people are faded with a hollow dot and the word.
- **Conversation:** like a chat with an assistant. circloo's messages are full-width text with the panda, name
  and the AI lozenge on `ai-subtle`; people's messages are bubbles with their character, yours on the end side in
  beam-subtle. System lines are centred pills.
- **Composer:** one rounded box with the send button inside. The animator chooses "circloo" (violet send) or
  "Everyone" (beam send) and has quick requests as chips.
- **Activities:** paper cards on a hairline with an icon tile tinted by category (icebreakers beam, energizers
  warning, retro live, decide danger); the chosen card takes a beam border.
- **Presenting:** the presenter view and the audience screen are Night in both themes. Slides sit on a
  brass-ticked rail; the reveal ranks options with sky discs (sunny first) and the brass draws a ring around the
  winner and the right answer; confetti borrows the skies.

## Live canvas

The canvas activity (#93) puts everyone's notes on one sheet of dotted paper (`r-xl`, 24px dots that scale
with zoom, pans with the content). Notes are paper squares or circles in six fixed note colours (yellow, pink,
blue, green, lilac, white; literal values by design, the same in both themes) and three sizes. Each sits at a
slight hand-placed tilt, has its author's character in the corner and an optional sticker (heart, star, thumbs
up, laugh, idea) that pops on. Double-click drops a note where you are; drag moves it, live for everyone; the
selected note gets a floating style bar. The others' cursors glide in one of six fixed cursor colours with their
character and name; a cursor's presence pulses at `--dur-orbit` while live and fades after a few seconds without
movement. Pan by dragging the background or scrolling, zoom with Ctrl + scroll or the toolbar (tabular zoom
readout); "Bring in" pins board notes and chat answers. Keyboard: notes are buttons (arrows move, E edits), N
adds a note; a list view mirrors the canvas. Reduced motion removes the glide, bob and drop.

## Typing in circles

Like any instant chat, the circle chat shows "Kenji is typing" with the person's character and three rising
dots under the last message, "Kenji and Lucía are typing" for two people, and "Several people are typing"
beyond that. It fades about 4 s after the last keystroke signal, and at once when their message lands. It's
hidden from screen readers because it changes too often to announce, and the dots stop under reduced motion.

## Motion

One grammar, one library (Motion for React in the app; CSS keyframes where no library is loaded), one set of
tokens in `tokens.css` mirrored by `src/web/src/lib/motion.ts`.

- **Durations by consequence:** `--dur-press` 120ms (press, hover, dropdown items), `--dur-state` 160ms (a
  toggle, a selection, a lozenge, the new page of a cross-fade), `--dur-move` 240ms (something moves or
  resizes in place: the switch knob, a dropdown rising, a digit settling), `--dur-enter` 300ms (an element
  enters or leaves: toasts, the drawer, the mouth morph, the hop), `--dur-focal` 600ms (the one authored
  entrance of a surface: the ring's track, the sky fill, the weight tween, Pirikoo's hop), `--dur-orbit` 1200ms
  (the long beats: the loading face's breath, the presence pulse, the suggestion spotlight, the room's ground
  change).
- **Easing:** `--ease-out` `cubic-bezier(0.16, 1, 0.3, 1)` for arrivals (default); `--ease-in-out`
  `cubic-bezier(0.65, 0, 0.35, 1)` for transits and cross-fades. No bounce, no elastic.
- **Springs** (`motion.ts`): `snappy` 520/34/1 (a body hopping onto the ring, a vote dot, a chip), `soft`
  260/28/1 (panels, sheets, the rail, cards rising), `gentle` 160/24/1.2 (a ring settling, the sky fill, the arc).
- **Focal moments:** Home composes (the lead ring draws its track over 600ms, then bodies hop in 40ms apart,
  capped at 320ms; orbit cards stagger 60ms); the landing's composition (the bird thinks, the name types, the
  ring composes with its sky and transit, the activity chips drop, Pirikoo's line streams, the bird hops once and
  the Create button rises, under three seconds and cancelled by a new line); Pirikoo's moods; someone arriving
  in a room (they hop onto the ring with hearts and screen readers hear "Mia joined the circle").
- **Continuity:** page changes are view transitions (the old page leaves in 120ms, the new arrives in 160ms,
  both ease-out); the rail and its panel swap without animating any size (fade and 8px shift); a round opens
  with a short clip-path reveal and its chip slides into the work bar from the inline end; the whiteboard's dots
  settle in as it opens.
- **Feedback:** press `scale(0.98)` (0.96 on icon buttons, 0.99 on orbit cards); hover one tonal step; lists
  rise 8px per row 30ms apart, capped at 240ms (`rise-in`, `pop-in`); a count that goes up pops once
  (1 → 1.12 → 1); the Connected lozenge pops once; the live dot pulses once; the deck's hairline offsets tuck
  while a card is dealt.
- **Reduced motion:** `prefers-reduced-motion: reduce` sets every animation and transition to 0.01ms (the
  landing with `data-motion="on"` is the one opt-in), removes view transitions, stops the blink, the breath,
  the typing dots and the drawer's slide (it fades instead); Motion variants swap movement for fades and keep
  the meaning (a count pops by opacity).

## Video

`/video` is a Remotion project that renders the 20-second tour (face, circle, chat, board, send, Pirikoo) per
language into `src/web/public/video/circloo-tour-{lang}.mp4` with a poster. It reuses the app's character and
bird SVGs. The player is a 16:9 box on ground at `r-md` with a hairline; the landing plays it muted while on
screen, pauses it off screen, never autoplays under reduced motion, and describes it in text below. Home shows
it before the first circle, waiting for play.

## Accessibility

WCAG 2.2 AA is the floor and is tested (axe in Playwright, desktop and phone, English and Arabic). Every token
pair in `tokens.css` is annotated with its ratio in both themes. Every control has a visible label or an
accessible name, mood is never colour alone (icon + word), links in running text are underlined, focus rings
are 2px `focus` with 2px offset on every surface (including the dome bands), breadcrumb and rail targets are at
least 24px and tap targets 44px on phones, a ring is one labelled image, and every string exists in English,
French, Arabic (RTL) and Spanish.

## Integrations

A hairline grid of service cells on paper (cells of at least 22rem, 1px gaps), each with the real brand marks on
white tiles whatever the theme (self-hosted, trademarks of their owners, with a notice on the public site), the
service name, a one-line purpose and a status lozenge (Connected in live, Not connected, Soon) on the title line;
Connected pops once when it arrives. Connecting opens the form inside the cell with an info box that says where
to find each token or webhook. Secret fields are password inputs and are never shown again; only a hint (host,
project, space) is displayed. In a circle room, the animator's "Send results" dropdown lists the connected
services and reports back under the work bar with a link to what was created.
