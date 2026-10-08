---
name: circloo
description: A buddy list. A white canvas, near-black ink, exactly one colour (cerise), one cerise card per view with your people as characters in rows and every count as a ten-segment meter; on the public site, a cobalt field with a yellow sun. Violet only for AI, coral only in the face's mouth, five skies for the moods.
colors:
  ground: "#ffffff"
  paper: "#ffffff"
  paper-sunken: "#f4f4f4"
  paper-hover: "#ededed"
  paper-pressed: "#e0e0e0"
  hairline: "#e6e6e6"
  hairline-strong: "#c4c4c4"
  ink: "#111111"
  ink-soft: "#5b5f66"
  ink-faint: "#6b6b6b"
  on-ink: "#ffffff"
  beam: "#d6276b"
  beam-hover: "#c01f5e"
  beam-pressed: "#a81a52"
  beam-subtle: "#fde8ef"
  beam-text: "#b81b58"
  on-beam: "#ffffff"
  focus: "#d6276b"
  card: "#9c1242"
  card-line: "#b8305f"
  card-sunken: "#850d37"
  on-card: "#ffffff"
  on-card-soft: "#ffe6ee"
  on-card-faint: "#ffd5e2"
  seg-empty: "#7a0d33"
  ok: "#ffd23f"
  mid: "#ffffff"
  low: "#ffb3c8"
  field: "#2b5cf0"
  field-deep: "#1e45c4"
  field-shade: "#6d28d9"
  on-field: "#ffffff"
  sun: "#ffd23f"
  on-sun: "#111111"
  note: "#fff3b0"
  ai: "#6a4fd1"
  ai-subtle: "#f2efff"
  ai-border: "#d9d0fb"
  ai-text: "#5638c2"
  on-ai: "#ffffff"
  sky-stormy: "#2f3a52"
  sky-foggy: "#aab4c3"
  sky-cloudy: "#d6d6d6"
  sky-bright: "#7fb8ff"
  sky-sunny: "#ffd23f"
  on-sky: "#111111"
  on-sky-stormy: "#ffffff"
  coral: "#ef4a32"
  live: "#178a66"
  live-subtle: "#dcf5ec"
  live-text: "#126b4f"
  danger: "#d93a3f"
  danger-subtle: "#ffecec"
  danger-text: "#b4262b"
  warning-subtle: "#fff4cc"
  warning-text: "#6e4a00"
  neutral-subtle: "#f4f4f4"
  neutral-text: "#5b5f66"
  body-1: "#1d4ed8"
  body-2: "#c2410c"
  body-3: "#15803d"
  body-4: "#9d174d"
  body-5: "#0e7490"
  night-ground: "#160810"
  night-paper: "#1d0b14"
  night-ink: "#fff5f8"
  night-beam: "#ff6fa3"
  night-card: "#ffe6ee"
  night-on-card: "#111111"
  night-ai: "#9f8fef"
typography:
  family: "'Rubik Variable', 'Rubik', system-ui, sans-serif"
  hand: "'Caveat Variable', 'Caveat', 'Rubik Variable', system-ui, sans-serif"
  display:
    fontSize: "clamp(2.75rem, 1.5rem + 5vw, 5.5rem)"
    fontWeight: 900
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  page-title:
    fontSize: "clamp(2.5rem, 1.6rem + 3.6vw, 4.5rem)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.035em"
  lead:
    fontSize: "1.3125rem"
    fontWeight: 700
    color: "{colors.beam-text}"
  section:
    fontSize: "clamp(1.875rem, 1.5rem + 1.5vw, 2.5rem)"
    fontWeight: 800
    letterSpacing: "-0.03em"
  card-title:
    fontSize: "1.625rem"
    fontWeight: 800
    letterSpacing: "-0.02em"
  panel-title:
    fontSize: "1.3125rem"
    fontWeight: 800
    letterSpacing: "-0.02em"
  row-name:
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.15
  body:
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  small:
    fontSize: "0.875rem"
  label:
    fontSize: "0.6875rem"
    fontWeight: 700
    letterSpacing: "0.12em"
    textTransform: uppercase
  microcopy:
    fontSize: "0.625rem–0.6875rem"
    fontWeight: 700
    letterSpacing: "0.15em"
    textTransform: uppercase
  handwritten:
    fontSize: "1.375rem–1.75rem"
    fontWeight: 500
    rotate: "-6deg to 8deg"
rounded:
  xs: "4px"
  sm: "10px"
  md: "16px"
  lg: "22px"
  xl: "28px"
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
  gutter: "clamp(1rem, 3vw, 2.5rem)"
layout:
  topbar-height: "3.75rem"
  content-max: "76rem"
  site-max: "78rem"
  drawer-breakpoint: "62rem"
  home-grid: "7fr 5fr, one column under 60rem"
  phone-sheet: "44dvh"
  character-site: "96px"
  character-row: "44px"
  character-stack: "32px"
  character-strip: "24px"
components:
  button-primary: { backgroundColor: "{colors.ink}", textColor: "{colors.on-ink}", rounded: "{rounded.pill}", height: "2.75rem", padding: "0.5rem 1.4rem", fontWeight: 700 }
  button-primary-on-card: { backgroundColor: "{colors.on-card}", textColor: "{colors.card}", rounded: "{rounded.pill}" }
  button-default: { backgroundColor: "transparent", textColor: "{colors.ink}", border: "2px {colors.ink}", rounded: "{rounded.pill}", height: "2.75rem" }
  button-subtle: { backgroundColor: "transparent", textColor: "{colors.ink}", rounded: "{rounded.pill}", height: "2.75rem" }
  button-beam: { backgroundColor: "{colors.beam}", textColor: "{colors.on-beam}", rounded: "{rounded.pill}" }
  button-sun: { backgroundColor: "{colors.sun}", textColor: "{colors.on-sun}", rounded: "{rounded.pill}" }
  button-ai: { backgroundColor: "{colors.ai}", textColor: "{colors.on-ai}", rounded: "{rounded.pill}" }
  button-danger: { backgroundColor: "{colors.danger}", textColor: "{colors.on-danger}", rounded: "{rounded.pill}" }
  panel: { backgroundColor: "{colors.paper}", border: "2px {colors.hairline}", rounded: "{rounded.lg}", shadow: "none" }
  panel-dark: { backgroundColor: "{colors.card}", textColor: "{colors.on-card}", rounded: "{rounded.xl}", shadow: "0 40px 80px -30px rgb(0 0 0 / 0.45), 0 18px 36px -24px rgb(0 0 0 / 0.4)" }
  buddy-row: { columns: "2.75rem minmax(0, 1fr) auto", padding: "0.75rem 0", divider: "1px {colors.card-line}" }
  meter: { segments: 10, segmentHeight: "12px", gap: "4px", rounded: "3px", empty: "{colors.seg-empty}", fills: "ok | mid | low | ink | beam" }
  input: { backgroundColor: "{colors.paper}", border: "2px {colors.hairline}", rounded: "{rounded.pill}", height: "2.75rem", focus: "{colors.focus}" }
  lozenge: { backgroundColor: "{colors.neutral-subtle}", textColor: "{colors.neutral-text}", rounded: "{rounded.pill}", fontSize: "0.6875rem", letterSpacing: "0.12em" }
  mood-tile: { border: "2px {colors.hairline}", rounded: "18px", pressed: "{colors.ink} fill, {colors.on-ink} text" }
  navitem: { rounded: "{rounded.pill}", current: "{colors.ink} fill, {colors.on-ink} text" }
---

# Design System: circloo

## Overview

circloo is a buddy list. Your people are characters in rows on one dark card; everything counted (who is here, who checked in today, votes, the time left in a round) is a ten-segment meter; the headline is the loudest thing on every page. The founder picked this language on 2026-10-08 from a mock built on two references he sent, after rejecting two quieter systems. It is warm consumer software, not an enterprise console: white paper, heavy rounded type, playful characters, pills everywhere, and one dark object per view that holds the live thing.

Two surfaces share the vocabulary:

- **The app** runs on a white canvas with near-black ink. One cerise for links, the lead line and picked things. One cerise card per view.
- **The public hero** is a saturated cobalt field with white type, a yellow sun for its one button, the circle composing itself as an oversized round table, and a handwritten layer of asides, arrows, a sticky note and a notepad. Below the fold the site runs on the white canvas like the app.

Night is a full theme: the canvas goes plum-black, the focal card goes pale pink, cerise lightens and its text flips to dark. Nothing is hard-coded; every colour is a token in `src/web/src/styles/tokens.css`.

## Colors

### Canvas and ink
`ground` and `paper` are both white. `paper-sunken` is the only grey well (search fields on the canvas, the sunken option in a toggle). `hairline` draws the 2px outlines of panels and inputs; `hairline-strong` the dot grid of the whiteboard and switch tracks. `ink` carries everything that matters, `ink-soft` leads and secondary text, `ink-faint` hints and placeholders (5.3:1 on paper).

### The one colour, cerise
`beam` is links, the lead line under every page title (`page-header__lead`, bold), the picked option (`beam-subtle` fill, `beam-text`), the focus ring, Pirikoo's calling ring, and at most one accent button per view (`btn--beam`). Primary buttons are **cerise pills**; black is never a fill.

### The cerise card
`card` (#9c1242) with `on-card` white text, `on-card-soft` for secondary lines (12:1), `on-card-faint` for status lines (5.4:1), `card-line` dividers, `card-sunken` wells. Inside it, and only inside it, live the three status colours: `ok` sun yellow (here, healthy, done), `mid` white (partial, a second source), `low` pale pink (away, late, empty). They appear as `buddy__value` words at 18px bold and as meter fills, never on the white canvas, never as the only signal.

### The field and the sun
`field` (#2b5cf0) fills the public hero edge to edge; type is `on-field` white, the paragraph `on-field-soft` (90%). `sun` (#ffd23f) is the one accent on the field: the Build button and the hand-drawn underline. `field-shade` purple is the table's cast shadow and never chrome. `note` is the sticky-note paper.

### AI violet
`ai`, `ai-subtle`, `ai-border`, `ai-text`, `on-ai`: Pirikoo's bubbles, the Ask panel's "Suggested by AI" lozenge, the "AI" lozenge next to Pirikoo's name. If it is violet, AI made it; if AI made it, it is labelled.

### The five skies
`sky-stormy` to `sky-sunny` are the moods, always with the icon and the word. On the canvas the mood tiles are outlined and the picked one is ink; the skies colour chips and day cells.

### Coral and status
`coral` is the face's mouth, nowhere else. `live`, `danger`, `warning` and `info` are canvas status colours for lozenges, field messages and the one destructive button.

### Named rules
- One cerise card per view. Never two side by side; never a dark card inside another card.
- `ok`/`mid`/`low` only on `card`.
- Blue is never a fill behind running text.
- Night is tokens flipping, never a second stylesheet.

## Typography

One family, **Rubik** (variable, 300–900), for Latin and Arabic. **Caveat** for the handwritten asides on the site; it has no Arabic glyphs, so Arabic asides fall back to Rubik 500 with the same rotation.

### Hierarchy
- **display**: the site's headline, 900, three stacked lines, line-height 1.05.
- **page-title**: 900, -0.035em, line-height 0.95 ("Hi Nadia.", "Icebreakers").
- **lead**: the one cerise line under a title, 700, 21px.
- **section** 800 (site sections), **card-title** 800 (the cerise card), **panel-title** 800, **row-name** 700.
- **body** 16px / 1.55; **small** 14px; **label** 11px 700 tracked 0.12em uppercase (lozenges); **microcopy** 10–11px tracked 0.15em uppercase (taglines, eyebrows).
- Numerals in counts, timers and codes are tabular.

### Named rules
- Arabic headings drop negative tracking and open line-height to 1.25–1.4; uppercase and tracking are off in Arabic.
- Headlines are short: three lines on the site, one line in the app.

## Layout

- **App shell**: a 3.75rem white top bar with the wordmark, the navigation as pills (current = cerise), Ask Pirikoo as an outlined pill, "New circle" as an ink pill and the avatar. No rail. Under 62rem the pills fold into a white drawer with big pill rows. Content up to 76rem with `gutter` sides.
- **Home**: the face and "Hi Nadia." at display size, the cerise lead, then a 7/5 grid: the live circle as the cerise card (buddy rows, a people meter, a white "Open the room" pill) and the other circles as outlined rows with character stacks; today's mood tiles, the weather line and the icebreaker teaser at the side. One column under 60rem.
- **Pages** open with breadcrumbs, the display title and the cerise lead; actions at the inline end as pills.
- **Rooms**: the display name with an ink "Live" lozenge and a character stack in the work bar; the whiteboard or board at the centre as a white sheet with a 2px ink outline; the side area as the cerise card with People (buddy rows and a meter), Chat (bubbles without tails) and Call. On phones the side is a 44dvh bottom sheet in the same dark card, so the centre of the screen stays free for the canvas tools.
- **Public site**: the hero is one viewport (min-height 100dvh minus the bar); copy at ~45%, the table at ~55%; one column on phones with the table under the copy and the annotations hidden.
- Logical properties everywhere; RTL mirrors automatically, including arrows and the direction of meters.

## Elevation & Depth

### Shadow vocabulary
- `shadow-raised`: 0 1px 2px at 6% (almost nothing; panels are outlined, not raised).
- `shadow-overlay`: menus, toasts, the Pirikoo panel.
- `shadow-card`: the one large soft shadow under the cerise card (and the site's table).
- Ground shadows: a blurred ellipse under characters on the site and in empty states.

### Named rules
- No glows, no glass, no gradients, no inner highlights.
- Depth comes from the cerise card and the characters, not from stacking panels.

## Shapes

Pills (`999px`) for every control: buttons, inputs, chips, nav items, tabs, toggles, the language menu. Panels `lg` (22px), the cerise card and the whiteboard `xl` (28px), inputs inside panels `sm` (10px), meter segments 3px, mood tiles 18px, thumbnails `sm`.

## Components

### Buttons
`btn` is a 44px pill, 700, with a 1px lift and 1.02 scale on hover and 0.97 on press. `btn--primary` cerise on white; inside `panel--dark` / `card--dark` it flips to a white pill with ink text; on the field (`on-field`) to a white pill with field text. `btn--default` outlined 2px, `btn--subtle` text only, `btn--beam` the same cerise, `btn--sun` yellow on the field, `btn--ai` violet, `btn--danger` red. Busy keeps focus and spins the icon.

### Panels and the cerise card
`panel`: white, 2px `hairline` outline, 22px corners, no shadow; head (title and actions), body, actions. `panel--dark` / `card--dark`: `card` background, 28px corners, `shadow-card`; the title at 26px 800; rows are buddies; the primary pill is white and full width.

### Buddy rows
`buddy`: a 44px character, the name (700) with a status line under it, a value at the inline end (`is-ok`, `is-mid`, `is-low` inside the card), and optionally a meter under spanning the row. Dividers are 1px `hairline` on the canvas and `card-line` on the card.

### The meter (signature)
`Meter` (`src/web/src/components/Meter.tsx`): ten segments always, 12px tall (8px for `sm`), 4px gaps. Fill count is the share rounded to tenths (anything above zero lights at least one). Tones `ok`, `mid`, `low`, `ink`, `beam`. The number is said in words beside it; the bar alone is decorative. Fills cross-fade over 600ms.

### Character stacks
`stack`: 32px characters overlapping by 8px with a paper ring (a card ring inside the cerise card).

### Inputs
Pill inputs with a 2px `hairline` outline and a `focus` outline; inside panels, 10px corners. Selects are pills with the chevron inside. Switches are pill toggles. The six-digit code is six outlined cells in Rubik 800.

### Lozenges
Tiny tracked pills: neutral, success, info, ai, ink. On the cerise card they sit on `card-sunken`.

### Navigation
Pills. The current page is a cerise pill; others are ink text with a sunken hover. "Daily check-in" is a disabled pill with a tiny "Soon" lozenge, hidden from the bar under 84rem and kept in the drawer.

### Mood tiles
Five outlined tiles (18px corners), the icon over the word; the picked one is cerise with white text. The weather line reads the circle in words.

### Avatar
Initials on one of the five body colours, 36px round in the bar; a person's character where the room knows it.

## The face (logo)

Two ring eyes and a coral mouth, drawn in code (`Brand.tsx`); the wordmark's last "oo" are the eyes. On the field the eyes go white and the mouth stays coral. The face smiles with the circle's mood and sits at 56px beside "Hi Nadia." and in the middle of the site's round table.

## The cast (characters)

Forty-eight characters plus Pirikoo and the panda, drawn in code with the navy outline. They are the illustration: 96px with ground shadows on the site and in empty states, 72px in the picker tiles, 64px seated on the site's table, 44px in buddy rows, 32px in stacks, 24px in strips and cursors. Never recoloured, never an icon.

## Pirikoo, the parakeet guide

A 64px white round launcher with a 2px ink outline; a 3px cerise ring when Pirikoo has something to say. On desktop the suggestion is a small cerise card with the name, an "AI" lozenge and white pills; on phones there is no bubble, the ring calls and the panel opens on the suggested next step. The panel is white with a 2px ink outline and 28px corners; Pirikoo's answers are violet and labelled; the plan is a list of rows with round checks and an ink "Run" pill.

## The site's hero

The field, the three-line headline with a hand-drawn `sun` underline under the last phrase, one paragraph, the Say console as a white pill with the bird and a yellow Build pill, three outlined example pills, a translucent dark disclaimer pill, a microcopy row. The circle composes itself as a round table: a flat cream disc with a thick rim that fills with sun as the phases complete, a purple cast shadow, the characters hopping onto the edge, the face in the middle, the count under it; the name on a rotated yellow sticky note; the chips as white pills; Pirikoo's line on a ruled notepad peeking from the inline-start edge. Two or three handwritten asides with curved white arrows. The table floats 6px over 4s and the arrows wiggle only when the visitor allows motion.

## Motion

One grammar (`src/web/src/lib/motion.ts`): `spring.snappy` for arrivals and presses, `spring.soft` for cards, `spring.gentle` for ambient; `listVariants`/`rowVariants` stagger rows 60ms apart. Tokens: `dur-press` 120ms, `dur-state` 160ms, `dur-move` 240ms, `dur-enter` 300ms, `dur-focal` 600ms, `dur-orbit` 1200ms; `ease-out` exponential, `ease-settle` cubic-bezier(0.32, 0.72, 0, 1) for pills and page arrival. Pages arrive block by block (`.page > *`), 60ms apart. Meters fill over 600ms. Every animation has a reduced-motion path that keeps the meaning; the landing has its own opt-in.

## Accessibility

Every text pair is AA in both themes; status colours inside the card are 3:1 at 18px bold and always paired with words. Tap targets are 44px on phones and never under 24px. Focus is a 2px cerise outline with offset. Colour is never the only signal (icon and word with every mood, "here"/"away" next to every value). Arabic is a first-class mirrored layout.

## Do's and Don'ts

### Do
- Put the live thing in the one dark card and let the rest of the page be quiet white.
- Make every count a meter and say the number beside it.
- Use the cast at scale as the illustration.
- Keep cerise for links, the lead line, pressed states and primary pills.

### Don't
- No gradients, glass, glows, dotted domes, thin hairline cards with shadows, icon tiles, cards inside cards.
- No second accent on the canvas; no `ok`/`mid`/`low` outside the card.
- No emoji in chrome, no sparkle for AI, no "John Doe".
- No rings as chrome: the ring component is retired.
