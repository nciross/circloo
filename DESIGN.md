---
name: circloo
description: A white canvas with near-black ink, charcoal pills for every primary action, violet links and focus, pastels for chips, covers and notes, one light mauve focal card per view, no black backgrounds and no gradients. Cerise is a small accent. A left sidebar for the app; the public site shares the language with pastel blobs, the cast and a live board.
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
  meta: "#6b6b72"
  on-ink: "#ffffff"
  charcoal: "#2e2e36"
  charcoal-hover: "#1f1f25"
  on-charcoal: "#ffffff"
  accent: "{colors.charcoal}"
  violet-link: "#6d28d9"
  focus: "#6d28d9"
  beam-text: "#6d28d9"
  beam-subtle: "#f1ebfd"
  pink: "#e5347b"
  beam: "#d6276b"
  card: "#ece2f6"
  card-line: "#d6c6e8"
  card-sunken: "#e1d3f0"
  on-card: "#16161b"
  on-card-soft: "#3a3a43"
  on-card-faint: "#55555f"
  seg-empty: "#d3c2e6"
  ok: "#126b4f"
  mid: "#7a5800"
  low: "#a3123f"
  mauve: "#e9dcf3"
  mauve-deep: "#d6c3ea"
  mint: "#bfe8d9"
  sky-pastel: "#a9d9f5"
  peach: "#f6a46b"
  butter: "#f7d873"
  lavender: "#b39ddb"
  blush: "#ffc9db"
  on-sun: "#111111"
  note-ink: "#111111"
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
  info-subtle: "#f1ebfd"
  info-text: "#5b21b6"
  neutral-subtle: "#f4f4f4"
  neutral-text: "#5b5f66"
  body-1: "#1d4ed8"
  body-2: "#c2410c"
  body-3: "#15803d"
  body-4: "#9d174d"
  body-5: "#0e7490"
  night-ground: "#131317"
  night-paper: "#18181d"
  night-ink: "#f4f3f7"
  night-charcoal: "#f1eef5"
  night-violet-link: "#c4b5fd"
  night-card: "#2b2238"
  night-on-card: "#f6f1fb"
  night-mauve: "#2a1f35"
  night-ok: "#bfe8d9"
  night-mid: "#f7d873"
  night-low: "#ffb3c8"
typography:
  family: "'Rubik Variable', 'Rubik', system-ui, sans-serif"
  hand: "'Caveat Variable', 'Caveat', 'Rubik Variable', system-ui, sans-serif"
  site-title:
    fontSize: "clamp(2rem, 1.4rem + 2.6vw, 3.25rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  page-title:
    fontSize: "clamp(2.5rem, 1.6rem + 3.6vw, 4.5rem)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.035em"
  lead:
    fontSize: "1.3125rem"
    fontWeight: 700
    color: "{colors.violet-link}"
  section:
    fontSize: "clamp(1.625rem, 1.25rem + 1.5vw, 2.125rem)"
    fontWeight: 800
    letterSpacing: "-0.02em"
  card-title:
    fontSize: "clamp(1.625rem, 1.3rem + 1.4vw, 2.25rem)"
    fontWeight: 800
    letterSpacing: "-0.025em"
  panel-title:
    fontSize: "1.3125rem"
    fontWeight: 800
    letterSpacing: "-0.02em"
  row-name:
    fontSize: "1rem"
    fontWeight: 800
  body:
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  small:
    fontSize: "0.875rem"
  meta:
    fontSize: "0.75rem"
    color: "{colors.meta}"
  label:
    fontSize: "0.6875rem"
    fontWeight: 700
    letterSpacing: "0.12em"
    textTransform: uppercase
  handwritten:
    fontSize: "1.0625rem–1.625rem"
    fontWeight: 600
    rotate: "-4deg to 6deg"
rounded:
  xs: "4px"
  sm: "10px"
  md: "16px"
  lg: "22px"
  xl: "28px"
  site-panel: "32px"
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
  topbar-height: "4rem"
  sidebar-width: "15.5rem"
  sidebar-breakpoint: "62rem"
  content-max: "76rem"
  site-max: "78rem"
  home-grid: "by container width: one column, the side row under the circles from 44rem, 2fr 1fr from 70rem"
  phone-sheet: "44dvh"
components:
  button-primary: { backgroundColor: "{colors.charcoal}", textColor: "{colors.on-charcoal}", rounded: "{rounded.pill}", height: "2.75rem", padding: "0.5rem 1.4rem", fontWeight: 700 }
  button-primary-on-card: { backgroundColor: "{colors.on-card}", textColor: "{colors.card}", rounded: "{rounded.pill}" }
  button-default: { backgroundColor: "transparent", textColor: "{colors.ink}", border: "2px {colors.ink}", rounded: "{rounded.pill}", height: "2.75rem" }
  button-subtle: { backgroundColor: "transparent", textColor: "{colors.ink}", rounded: "{rounded.pill}", height: "2.75rem" }
  button-ai: { backgroundColor: "{colors.ai}", textColor: "{colors.on-ai}", rounded: "{rounded.pill}" }
  button-danger: { backgroundColor: "{colors.danger}", textColor: "{colors.on-danger}", rounded: "{rounded.pill}" }
  panel: { backgroundColor: "{colors.paper}", border: "2px {colors.hairline}", rounded: "{rounded.lg}", hover: "lift 2px, 0 2px 8px rgb(0 0 0 / 0.08) when it is a link" }
  focal-card: { backgroundColor: "{colors.card}", textColor: "{colors.on-card}", rounded: "{rounded.xl}", shadow: "0 1px 2px rgb(40 20 60 / 0.06), 0 12px 32px -18px rgb(40 20 60 / 0.25)" }
  sidebar: { width: "15.5rem", background: "{colors.paper}", border: "1px {colors.hairline} at the inline end", item: "icon + label pill row, 44px, current = charcoal" }
  search-ask: { backgroundColor: "{colors.paper-sunken}", border: "2px {colors.hairline}", rounded: "{rounded.pill}", content: "magnifier, Search or ask Pirikoo, the bird, Ctrl/Cmd K" }
  circle-row: { backgroundColor: "{colors.paper}", border: "2px {colors.hairline}", rounded: "{rounded.lg}", content: "name, Live or Closed lozenge, people (meta), character stack, chevron" }
  quick-chip: { backgroundColor: "a pastel", textColor: "{colors.on-sun}", rounded: "{rounded.pill}" }
  buddy-row: { columns: "2.75rem minmax(0, 1fr) auto", padding: "0.75rem 0", divider: "1px {colors.card-line}" }
  meter: { segments: 10, segmentHeight: "12px", gap: "4px", rounded: "3px", empty: "{colors.seg-empty}", fills: "ok | mid | low | ink | beam" }
  input: { backgroundColor: "{colors.paper}", border: "2px {colors.hairline}", rounded: "{rounded.pill}", height: "2.75rem", focus: "{colors.focus}" }
  lozenge: { backgroundColor: "{colors.neutral-subtle}", textColor: "{colors.neutral-text}", rounded: "{rounded.pill}", fontSize: "0.6875rem", letterSpacing: "0.12em" }
  mood-tile: { border: "2px {colors.hairline}", rounded: "18px", pressed: "{colors.charcoal} fill, {colors.on-charcoal} text" }
  navitem: { rounded: "{rounded.pill}", current: "{colors.charcoal} fill, {colors.on-charcoal} text" }
---

# Design System: circloo

## Overview

circloo is warm consumer software for circles of families, friends and teams. The founder settled the language on 2026-10-08 (#250), after a public site built on a people-platform reference: a white canvas, heavy rounded type, the cast of characters at scale, charcoal pills, violet links, pastels for the playful parts, and nothing black or gradient as a background.

Two surfaces share one vocabulary:

- **The public site** (landing, sign-in, join, 404): a sticky white bar with the wordmark at its larger size, a short display headline over a live board (friends' cursors, pastel notes, votes, an icebreaker) flanked by pastel blobs with characters that play along, grids of cards with pastel covers, a light mauve footer panel. The sign-in pages keep a light mauve bar.
- **The app**: a left sidebar with the navigation as icon pill rows (the current one charcoal), a header with a wide search field that asks Pirikoo, and pages on white. Each view leads with one light mauve focal card.

Night is a full theme: the canvas goes near-black charcoal, the pills turn light, links a light violet, the focal card a deep plum. Every colour is a token in `src/web/src/styles/tokens.css`.

## Colors

### Canvas and ink
`ground` and `paper` are white. `paper-sunken` is the grey well (the search field, sunken toggles). `hairline` draws the 2px outlines of panels, rows and inputs; `hairline-strong` the dot grid of the whiteboard and dashed threads. `ink` carries everything that matters, `ink-soft` leads and secondary text, `meta` the 12px metadata (5.3:1).

### Charcoal: the primary
`charcoal` is every primary action: buttons (`btn--primary`, `btn--charcoal`), the current navigation item, a switch that is on, a vote cast, the picked filter. It turns light at night (`#f1eef5` with near-black text). Charcoal is a pill, never a page or card background.

### Violet: links and focus
`violet-link` (also `beam-text` and `focus`) is text links, the lead line under a page title, the picked-option text on its light violet fill (`beam-subtle`), drop targets and the focus ring.

### The focal card: light mauve
`card` is the one object a view leads with (the icebreaker in play, the room's people and chat, the new-circle preview, the integration focus, Pirikoo's tips): light mauve by day with dark ink, deep plum by night. Inside it, and only inside it, the three status colours: `ok` (deep green by day, mint by night), `mid` (amber, butter), `low` (berry, pink), as values at 19px bold and as meter fills, always beside words. Buttons inside it invert from its colours (a dark pill on mauve, a light pill on plum).

### Pastels
`mint`, `butter`, `peach`, `sky-pastel`, `lavender`, `blush` are for chips, covers, notes and the blobs: whiteboard and board notes, round covers, the kind of an activity (icebreakers mint, energizers butter, retro lavender, decide sky, present peach), quick-start chips, the role icons on Home. Text on a pastel is always the theme-stable near-black (`on-sun`, `note-ink`). `mauve` is the light surface for the sign-in bar, the create card and the site footer.

### Cerise: a small accent
`pink` and `beam` are the accent and never a fill behind text: Pirikoo's crest, its calling ring, a heart, a small count badge on the focal card.

### AI violet, the skies, coral, status
`ai…` stays AI only (Pirikoo's answers, "Suggested by AI"). The five skies are the moods, always with the icon and the word. `coral` is the face's mouth. `live`, `danger`, `warning`, `info` are canvas status colours for lozenges and messages.

### Named rules
- No black backgrounds: charcoal and ink are pills, marks and text, never a surface.
- No gradients, glass or glows anywhere. Dot grids on the whiteboard are hard dots, not gradients.
- One focal card per view; never one inside another.
- `ok`/`mid`/`low` only inside the focal card.
- Night is tokens flipping, never a second stylesheet (the projector screen is the one pinned dark surface).

## Typography

One family, **Rubik** (variable, 300–900), for Latin and Arabic. **Caveat** for the handwritten asides and blob tags on the site; Arabic falls back to Rubik 500.

- **page-title** 900 for app pages ("Hi Nadia.", "Icebreakers"); **site-title** 800 for the public headline.
- **lead**: the violet line under a page title, 700, 21px.
- **section** 800 for site sections; **card-title** 800 for the create and focal cards; **panel-title** 800; **row-name** 800 at 16px.
- **body** 16px / 1.55; **small** 14px; **meta** 12px in `meta`; **label** 11px 700 tracked uppercase (lozenges, group labels).
- Arabic drops negative tracking and uppercase and opens line-height to 1.25–1.4.

## Layout

- **App shell**: a 15.5rem left sidebar (wordmark, Home, Icebreakers, Presentations, Integrations as icon pill rows, a "Coming soon" group, Settings at the foot) and, over the page, a 4rem header with the search field that asks Pirikoo (Ctrl/Cmd K), New circle and the avatar. Under 62rem the sidebar is a drawer behind a menu button and the wordmark moves into the header. Phones first.
- **Home**: two things lead. "Start a new circle" on a light mauve card (the charcoal pill, three quick-start chips that hand a line to the new-circle page, the cast) and "My circles" split by role: Circles I run and Circles I joined, as white rows with Live or Closed. Mood, today's icebreaker and favourites sit beside, secondary. Home lays itself out by container width.
- **Rooms**: the whiteboard with pastel notes and every friend's cursor as a name pill in their colour; the dock lists rounds with their kind's pastel; the side area is the focal card. On phones the side is a 44dvh bottom sheet.
- **Public site**: hero (title, live board, blobs), rounds with category filters, how it works, the story, what a circle does, the free plan, questions, the mauve footer. Log in opens the sign-in form in place of the board and hides the rest of the page.
- Logical properties everywhere; RTL mirrors, including the sidebar, cursors and arrows.

## Elevation & Depth

- `shadow-raised` almost nothing; panels are outlined.
- The hover lift: links shaped as cards rise 2px with `0 2px 8px rgb(0 0 0 / 0.08)`.
- `shadow-card`: a soft, low shadow under the focal card.
- `shadow-overlay`: menus, toasts, Pirikoo's panel.
- Ground shadows: a blurred ellipse under characters on the site and in empty states.

## Shapes

Pills for every control. Panels 22px, the focal card 28px, site panels and the create, plan and sign-in cards 32px, inputs inside panels 10px, notes 4–10px, meter segments 3px.

## Components

### Buttons
`btn` is a 44px pill, 700, lifting 1px on hover and 0.97 on press. `btn--primary` and `btn--charcoal` are charcoal; inside the focal card the primary inverts. `btn--default` outlined, `btn--subtle` text only, `btn--ai` violet, `btn--danger` red.

### Panels, rows, the focal card
`panel`: white, 2px hairline, 22px. Rows and cards that are links lift on hover. `panel--dark` / `card--dark` (historic names) are the focal card: light mauve, 28px, the soft card shadow.

### Navigation
Icon pill rows; the current one charcoal, the others sink to `paper-sunken` on hover. "Soon" items carry a tiny lozenge and never link.

### Search
One field in the header: a magnifier, "Search or ask Pirikoo…", the bird and the shortcut. It opens Pirikoo, who finds pages, circles and rounds and can run them. Phones show the magnifier alone.

### Meter, buddy rows, stacks, inputs, lozenges, mood tiles
Unchanged in form: ten segments with the number in words; buddy rows on the focal card; 32px character stacks; pill inputs with a 2px outline and the violet focus; tiny tracked lozenges; five outlined mood tiles, the picked one charcoal.

## The face (logo)

Two ring eyes and a coral mouth, drawn in code (`Brand.tsx`); the wordmark's last "oo" are the eyes. The mouth follows the moods. The wordmark sits a size up in the bars (1.5–2.1rem).

## The cast (characters)

Forty-eight characters plus Pirikoo and the panda, drawn in code. They are the illustration: in the site's blobs, on the hero board, on the create card, in buddy rows and stacks. Never recoloured, never an icon.

## Pirikoo, the parakeet guide

A flat, geometric parakeet without outlines: a calm green body, a mint belly, a butter face mask, the circloo logo's ring eyes in charcoal, a compact orange hooked beak, and a small cerise crest as the accent. Pirikoo is alive when idle (a soft breathing bob, blinks, the crest swaying, now and then a wing flick, a curious tilt and a glance) and acts out its work: leaning in while you write, the crest ticking while it thinks, the beak and a nod while it speaks, a hop with both wings when it is done, a shake when something failed. It lives in a 64px launcher with a cerise ring when it has something to say, in the header's search field, and in its panel; its answers are AI violet and labelled.

## Motion

One grammar (`src/web/src/lib/motion.ts`): springs for arrivals and presses, 60ms staggers, meters filling over 600ms. Entrances move and never fade (axe reads pages on arrival). The public site plays a scroll choreography (titles wipe up, cards rise, the hero settles away) and a looping hero board with pictures that play along; it starts for every visitor (the founder's call). In the app, reduced motion stills everything and keeps meaning.

## Accessibility

Every text pair is AA in both themes; 12px meta uses `meta`; status colours on the focal card clear 4.5:1 by day and are always paired with words. Tap targets are 44px on phones, never under 24px. Focus is a 2px violet ring with offset. Colour is never the only signal. Arabic is a first-class mirrored layout.

## Do's and Don'ts

### Do
- Lead each view with one light mauve focal card and keep the rest quiet white.
- Use charcoal for primary pills, violet for links and focus, pastels for chips, covers and notes.
- Use the cast at scale as the illustration.
- Say every count in words beside its meter.

### Don't
- No black backgrounds, no gradients, no glass, no glows, no sparkle icons, no emoji in chrome.
- No second focal card, no card inside a card, no status colours outside the focal card.
- No cerise fills behind text; cerise is a small accent.
- No "John Doe": the cast and real names only.
