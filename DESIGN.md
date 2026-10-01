---
name: circloo
description: The fridge door for your people. Pistachio enamel, plastic alphabet magnets, paper notes.
colors:
  tomato: "#d63a26"
  tomato-rim: "#9e2414"
  cobalt: "#2340c4"
  cobalt-rim: "#172a86"
  sunflower: "#ffc21a"
  sunflower-rim: "#c48e00"
  ink: "#1b1f1c"
  ink-rim: "#000000"
  ink-soft: "#3a4a1c"
  ink-on-paper-soft: "#4d5650"
  enamel: "#b9d77e"
  enamel-deep: "#a2c564"
  enamel-shade: "#84a944"
  freezer: "#adcf6e"
  groove: "#6c8f33"
  seal: "#5d7a2c"
  chrome-hi: "#f4f8f9"
  chrome: "#c9d3d6"
  chrome-lo: "#8e9ca0"
  paper: "#ffffff"
  paper-rim: "#8f9f6c"
  paper-line: "#c9def2"
  paper-margin: "#f08a80"
  sticky-yellow: "#ffe066"
  sticky-pink: "#ffb7d2"
  sticky-blue: "#b4dcff"
  kraft: "#e9c79a"
typography:
  display:
    fontFamily: "'Baloo Bhaijaan 2 Variable', 'Baloo Bhaijaan 2', ui-rounded, sans-serif"
    fontSize: "clamp(3.6rem, 2.2rem + 6.4vw, 7.5rem)"
    fontWeight: 800
    lineHeight: 0.9
  headline:
    fontFamily: "'Baloo Bhaijaan 2 Variable', 'Baloo Bhaijaan 2', ui-rounded, sans-serif"
    fontSize: "clamp(2.6rem, 1.9rem + 3.4vw, 4.8rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Baloo Bhaijaan 2 Variable', 'Baloo Bhaijaan 2', ui-rounded, sans-serif"
    fontSize: "clamp(2rem, 1.6rem + 1.8vw, 3.2rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  title-sm:
    fontFamily: "'Baloo Bhaijaan 2 Variable', 'Baloo Bhaijaan 2', ui-rounded, sans-serif"
    fontSize: "clamp(1.5rem, 1.3rem + 0.9vw, 2.1rem)"
    fontWeight: 700
    lineHeight: 1.2
  magnet-label:
    fontFamily: "'Baloo Bhaijaan 2 Variable', 'Baloo Bhaijaan 2', ui-rounded, sans-serif"
    fontSize: "clamp(1rem, 0.96rem + 0.2vw, 1.1rem)"
    fontWeight: 700
    lineHeight: 1.1
  lead:
    fontFamily: "'Rubik Variable', 'Rubik', system-ui, sans-serif"
    fontSize: "clamp(1.2rem, 1.1rem + 0.45vw, 1.45rem)"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "'Rubik Variable', 'Rubik', system-ui, sans-serif"
    fontSize: "clamp(1rem, 0.96rem + 0.2vw, 1.1rem)"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "'Rubik Variable', 'Rubik', system-ui, sans-serif"
    fontSize: "clamp(0.84rem, 0.8rem + 0.15vw, 0.92rem)"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  paper: "3px"
  curl-sm: "14px"
  curl-md: "22px"
  curl-lg: "26px"
  field: "10px"
  magnet-sm: "11px"
  tile: "12px"
  magnet: "14px"
  magnet-lg: "18px"
  pill: "999px"
  pin: "50%"
spacing:
  s-1: "0.25rem"
  s-2: "0.5rem"
  s-3: "0.75rem"
  s-4: "1rem"
  s-5: "1.5rem"
  s-6: "2rem"
  s-7: "3rem"
  s-8: "4.5rem"
  s-9: "7rem"
  gutter: "clamp(1rem, 4vw, 3rem)"
  handle-space: "clamp(0rem, 3vw, 3.5rem)"
components:
  magnet-primary:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.paper}"
    typography: "{typography.magnet-label}"
    rounded: "{rounded.magnet}"
    padding: "0.7rem 1.3rem"
  magnet-primary-large:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.paper}"
    typography: "{typography.magnet-label}"
    rounded: "{rounded.magnet-lg}"
    padding: "0.95rem 1.7rem"
  magnet-cobalt:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.paper}"
    typography: "{typography.magnet-label}"
    rounded: "{rounded.magnet}"
    padding: "0.7rem 1.3rem"
  magnet-sunflower:
    backgroundColor: "{colors.sunflower}"
    textColor: "{colors.ink}"
    typography: "{typography.magnet-label}"
    rounded: "{rounded.magnet}"
    padding: "0.7rem 1.3rem"
  magnet-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.enamel}"
    typography: "{typography.magnet-label}"
    rounded: "{rounded.magnet-sm}"
    padding: "0.45rem 0.9rem"
  magnet-paper:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.magnet-label}"
    rounded: "{rounded.magnet-sm}"
    padding: "0.45rem 0.9rem"
  lang-magnet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "2.4rem"
    width: "2.6rem"
  lang-magnet-selected:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.paper}"
    rounded: "{rounded.field}"
    height: "2.4rem"
  paper-strip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    rounded: "{rounded.paper}"
    padding: "1.5rem 2rem 1rem"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.paper}"
    padding: "3rem 2rem 2rem"
    width: "min(100%, 30rem)"
  index-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.title-sm}"
    rounded: "{rounded.paper}"
    padding: "2rem 1.5rem 1.5rem"
  sticky-note:
    backgroundColor: "{colors.sticky-yellow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.paper}"
    padding: "1rem"
  checkin-strip:
    backgroundColor: "{colors.kraft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.paper}"
    padding: "1rem 1.5rem"
  field-input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.lead}"
    rounded: "{rounded.field}"
    padding: "0.75rem 0.9rem"
  code-tile-filled:
    backgroundColor: "{colors.sunflower}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.tile}"
    height: "3.6rem"
  tag:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.1rem 0.55rem"
  tag-first:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.1rem 0.55rem"
  kick-plate:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.enamel}"
    typography: "{typography.label}"
    padding: "2rem clamp(1rem, 4vw, 3rem)"
---

# Design System: circloo

## Overview

**Creative North Star: "The Fridge Door"**

Every circloo surface is the door of a shared fridge. The ground is a drenched pistachio enamel that fills the viewport edge to edge. A freezer compartment sits on top, separated by a groove, and a black kick plate closes the bottom. A rubber seal and a full-length chrome handle run down the inline-end edge. Anything the circle says or does is stuck to this door: words go on paper (white index cards, sticky notes, kraft strips, postcards, name tags), and anything you can press is a chunky plastic magnet. The landing page and the signed-in app share one world. The app's forms are sheets of paper pinned to the same door.

The density is relaxed and physical. Papers sit slightly crooked, magnets stand proud of the door and snap flat when pressed, and the alphabet magnets that spell the wordmark can be dragged. The palette has four magnet colours (tomato, cobalt, sunflower, ink) against the enamel and the paper. Type comes in two voices: a round, heavy display face that looks like moulded plastic letters, and a calm geometric text face for reading.

The world is built for four languages, including Arabic in RTL. The door mirrors: the handle and seal move to the left edge, sticky-note curls flip corners, and the display face covers Arabic natively.

**Key Characteristics:**
- Pistachio enamel ground everywhere. No white page and no neutral grey canvas.
- Three depth planes: door (flat, inset grooves only), paper (soft lift), magnet (a coloured plastic rim plus a cast shadow).
- Paper sits at a small tilt (between -4deg and +4deg). Every heading is set on paper, never straight on the enamel.
- Buttons and links that act are magnets, and pressing one snaps it into the door.
- Baloo Bhaijaan 2 for display (Latin and Arabic), Rubik for text. Both are self-hosted.
- Logical properties throughout, with explicit `[dir='rtl']` mirrors for every asymmetric detail.

## Colors

A saturated toy-box palette: four primary-coloured plastics on a pale green enamel, with white and pastel papers in between.

### Primary
- **Tomato Magnet** (tomato, rim tomato-rim): the go-forward colour. "Start your circle", "Send me a code", the pin on the hero headline, the "First up" tag, the welcome name-tag band. A view carries one tomato action. The rim is the magnet's moulded edge and its darker tone. Tomato-rim also serves as the error text and the index-card margin note on white paper.

### Secondary
- **Cobalt Magnet** (cobalt, rim cobalt-rim): selection and focus. Cobalt marks the selected language magnet, the global focus outline, the input focus border, check-in mood words, vote dots and the answer line on the icebreaker card.

### Tertiary
- **Sunflower Magnet** (sunflower, rim sunflower-rim): play. "Shake the fridge", filled code tiles, text selection, the footer wordmark on the kick plate and the language chips on joke cards.

### Neutral
- **Pistachio Enamel** (enamel): the door itself, and the page and html background. Enamel-deep and enamel-shade are the scrollbar track and thumb. Enamel also serves as text on the ink kick plate and the ink magnet.
- **Freezer Green** (freezer): the top compartment that holds the brand and the language magnets.
- **Groove and Seal** (groove, seal): the 6px freezer groove, the seal's edge and the rubber seal strip. These are structural lines only, never fills for content.
- **Chrome** (chrome-hi, chrome, chrome-lo): the handle and its mounting feet. Use them for nothing else.
- **Fridge Ink** (ink, ink-rim): all text. Ink also fills the ink magnet (whose rim is pure black), the kick plate and the board column rules.
- **Door-tinted Ink** (ink-soft): secondary text set straight on the enamel (wordmark hint, language line).
- **Paper-grey Ink** (ink-on-paper-soft): secondary text on paper (leads, help text, hints).
- **Index White** (paper): cards, sheets, strips, input fields, paper magnets and default tags.
- **Paper Rim** (paper-rim): the moulded edge of white plastic magnets (language magnets, mood magnets, empty code tiles).
- **Ruled Line and Margin** (paper-line, paper-margin): the blue rules and red margin line of index cards and the chore list.
- **Sticky Yellow, Pink, Blue** (sticky-yellow, sticky-pink, sticky-blue): sticky notes, the "coming next" checklist, the final call note, the quiet sheet, notices and alternate section notes.
- **Kraft** (kraft): the brown backing strip behind the example check-ins.

### Named Rules
**The Four Plastics Rule.** Magnets come only in tomato, cobalt, sunflower, ink and white paper, each with its own darker rim. A new magnet colour needs a design decision, not a one-off hex.

**The One Tomato Rule.** Each viewport has one tomato action, and it is the step forward. Secondary actions are paper, ink or sunflower magnets, or an underlined text link.

**The Enamel Is Not Paper Rule.** Text set straight on the enamel uses ink or ink-soft. Grey text tones made for paper (ink-on-paper-soft) never go on the door.

## Typography

**Display Font:** Baloo Bhaijaan 2 (variable, self-hosted via @fontsource-variable; falls back to ui-rounded, sans-serif)
**Body Font:** Rubik (variable, self-hosted via @fontsource-variable; falls back to system-ui, sans-serif)

**Character:** Baloo Bhaijaan 2 is the plastic alphabet magnet: round, very heavy, friendly in both Latin and Arabic. Rubik is the handwriting-neat text on the papers: geometric, soft-cornered, easy to read at length.

### Hierarchy
- **Display** (800, step-5, 0.9): only for the magnet-letter wordmark. Each letter is coloured with a magnet face, carries a stacked rim shadow and sits at its own tilt.
- **Headline** (800, step-4, 1): the landing h1 on the paper strip and the final call.
- **Title** (800, step-3, 1.05): section notes, sheet titles, the welcome name tag and the handwritten name field.
- **Title Small** (700, step-2, 1.2): the icebreaker question, the chore-step titles and the "coming to your door" title.
- **Magnet Label** (700, step-0, 1.1): every magnet button, at step--1 for small and step-1 for large magnets. Display weights of 600 to 800 also set card text (jokes, postcards, check-in strip titles).
- **Lead** (400, step-1, 1.45): hero sub and section-note paragraphs, capped at about 36ch on the hero.
- **Body** (400, step-0, 1.55): all reading text.
- **Label** (600, step--1): tags, field help, answer labels and the kick plate.

### Named Rules
**The Arabic Display Rule.** Under `:lang(ar)`, display headings drop the -0.01em tracking to 0 and open line height to 1.25 for dots and marks. Never uppercase or letter-space Arabic.

**The Magnet Word Stays LTR Rule.** The "circloo" magnet wordmark is pinned `direction: ltr` in every locale. It is a brand object, not running text.

## Layout

The door is one centred column with a maximum width of 76rem. Inline padding is `gutter`, plus `handle-space` on the inline-end side so content never runs under the handle. Panels stack down the door, separated by s-9 (s-8 below 40rem). The door has s-7 of top padding and s-9 at the bottom before the kick plate.

Inside a panel, layouts use two-column asymmetric grids. Hero is 1.15fr / 0.85fr, home is 1.2fr / 0.8fr, the "feel" panel is 0.9 / 1.1, and "work" is 0.8 / 1.2. Column gaps are s-7 to s-8. Single-purpose app screens (sign-in, code, welcome) centre one sheet on the door (`place-items: center`, min 70dvh). Settings use an auto-fit grid of sheets with a minimum width of 22rem.

Spacing uses one rhythm, s-1 to s-9 (0.25rem to 7rem). Gaps inside paper are s-3 to s-4, and paper padding is s-5 to s-7.

Responsive steps:
- **Below 64rem:** all two-column panels stack, the joke fan goes to 2 columns and the mood row aligns to start.
- **Below 48rem:** the handle and the seal are hidden. The door is still enamel edge to edge.
- **Below 40rem:** single columns everywhere (mini board, joke fan), with tighter paper padding (s-4 inline). Check-in rows wrap the "need" onto a second line.

**The Handle Lane Rule.** Nothing on the door may sit in the inline-end `handle-space`. The handle runs from 9rem down for min(62vh, 34rem) and must stay clear.

## Elevation & Depth

Depth is literal and comes in three physical planes. Each has its own shadow grammar, and they never borrow from each other.

### Shadow Vocabulary
- **Door** (no cast shadow): the enamel is flat. Its only depth is structure: the freezer's inset highlight `box-shadow: 0 2px 0 var(--enamel-deep) inset, 0 1px 0 rgb(255 255 255 / 0.35)`, the 6px groove border, and the seal strip.
- **Paper** (`--shadow-paper: 0 1px 0 rgb(48 62 18 / 0.18), 0 10px 20px -8px rgb(48 62 18 / 0.45)`): a hairline contact edge plus a soft olive-tinted lift. Every card, sheet, sticky, strip, postcard and tag-backed note uses this token. Nothing else does.
- **Magnet at rest** (`0 4px 0 var(--rim), 0 9px 14px -4px rgb(36 48 10 / 0.5)`): a solid rim the colour of the magnet's own darker plastic, plus a cast shadow.
- **Magnet hover** (`0 5px 0 var(--rim), 0 12px 16px -4px rgb(36 48 10 / 0.5)`, translateY(-1px), brightness 1.06).
- **Magnet pressed / selected / busy** (`0 1px 0 var(--rim), 0 3px 5px -2px rgb(36 48 10 / 0.45)`, translateY(2 to 3px)): snapped into the door.
- **Small magnets** (pins, language magnets, filled code tiles, joke language chips): `0 3px 0 var(--rim), 0 6 to 7px 9 to 10px -3px rgb(36 48 10 / 0.45 to 0.5)`. Dots and vote marks carry the rim alone (`0 1 to 3px 0`).
- **Magnet letters** (`text-shadow: 0 0.035em 0 rim, 0 0.06em 0 rim, 0 0.11em 0.12em rgb(36 48 10 / 0.42)`): the cast shadow deepens to 0.24em while a letter is lifted (dragged).
- **Handle** (`3px 0 0 var(--chrome-lo), 6px 10px 14px -6px rgb(36 48 10 / 0.5)`, mirrored to negative x in RTL).

### Named Rules
**The Own-Rim Rule.** A magnet's shadow is written on the magnet's own rule, because it reads that magnet's `--rim`. A `:root` shadow token would resolve `--rim` at the root and break every colour variant. Only the paper shadow lives at `:root`.

**The Three Planes Rule.** Rims belong only to magnets. Paper gets `--shadow-paper` and never a solid offset. The door gets no cast shadow at all. If an element has a rim, it must be pressable or be a magnet holding something.

**The Snap Rule.** Press feedback is physical: the magnet drops 2 to 3px and its rim collapses to 1px over 140ms on `--ease-out`. Selected states (language) and busy states use the same snapped-in pose.

## Shapes

Paper is nearly square (paper, 3px). Sticky notes and yellow notes curl one bottom corner: curl-sm 14px on stickies, curl-md 22px on the "coming next" note, curl-lg 26px on the final call. The curled corner is bottom-right in LTR and flips to bottom-left in RTL. Magnets are moulded and soft: magnet-sm 11px, magnet 14px, magnet-lg 18px, with field and language magnets at 10px, code tiles at 12px and mood magnets at 22px. Pins and dots are perfect circles with a lighter 4px face ring (`color-mix(in srgb, face 82%, #fff)`). Tags and postmarks are pills with a 2px currentcolor border. The welcome name tag is the one rounded paper object (18px, clipped), shaped as a sticker.

Tilt is part of the shape language. Papers rotate between -4deg and +4deg, and each item in a sequence gets a different angle via nth-child. Alphabet letters tilt between -8deg and +7deg. Inputs and controls inherit their paper's tilt and never get their own.

## Components

### Buttons (Magnets)
Magnets are tactile and proud: they look like moulded plastic and they move when touched.
- **Shape:** gently moulded corners (magnet 14px; 11px small, 18px large).
- **Primary:** tomato face with white label in Baloo Bhaijaan 2 at 700. Padding 0.7rem 1.3rem (md), 0.95rem 1.7rem (lg, hero and final CTAs), 0.45rem 0.9rem (sm, freezer actions).
- **Variants:** cobalt (white label), sunflower (ink label, used for "Shake the fridge"), ink (enamel label, used for "Sign out"), paper (ink label, rim #7d8d58, used for "Sign in" and "Settings").
- **Hover / Focus:** lift 1px, rim to 5px, brightness 1.06. Focus is the global 3px cobalt outline at a 3px offset.
- **Pressed / Busy / Disabled:** snapped flat (see Elevation). Busy desaturates to 0.6 with a progress cursor. Disabled adds not-allowed.
- **Icons:** optional leading Lucide SVG at stroke 2.25 to 2.5. Directional arrows carry `.flip-rtl`.
- **Text link:** the quiet alternative. Ink, 600, 2px underline at 0.25em offset; the underline turns tomato on hover.

### Language Magnets (Navigation)
Four small white magnets in the freezer (EN, FR, ع, ES), implemented as a radio group. Each face is 2.6rem wide, 2.4rem tall, 10px radius and set in display 800. The Arabic glyph is bumped to 1.25rem. Hover tilts the face -3deg. The checked magnet turns cobalt with white text and snaps in. Keyboard focus draws a 3px ink outline on the face. The freezer holds the brand wordmark (display 800, step-2) at inline-start and the language magnets plus account magnets at inline-end.

### Chips (Tags)
- **Style:** pill, 2px currentcolor border, label type, padding 0.1rem 0.55rem.
- **Variants:** "Example" (inherits ink, transparent), "Soon" (white fill, ink border), "First up" (tomato fill, white text). Tags exist to label demo and upcoming content honestly. They are not decoration.

### Cards / Containers (Paper)
- **Corner Style:** paper (3px), or a curled corner for sticky notes.
- **Background:** paper white by default. Sticky yellow, pink or blue for notes, kraft for the check-in strip and #fffdf8 for postcards.
- **Shadow Strategy:** `--shadow-paper` only.
- **Pinning:** a paper that carries a heading is held by a round pin magnet (34px, tomato, cobalt, sunflower or ink) that overlaps its top edge by 14px. The pin sits between 12% and 50% from inline-start and mirrors in RTL.
- **Internal Padding:** s-5 to s-7 block, s-4 to s-6 inline. Pinned papers add extra top padding (s-6 to s-7) to clear the pin.
- **Sheet:** the app's container. It is white, min(100%, 30rem) wide, padding 3rem 2rem 2rem and tilted -0.8deg. A quiet variant is sticky blue at +0.6deg, and a "fallen" variant at -4deg is used for not-found. Notices inside a sheet are small sticky-yellow slips.

### Inputs / Fields
- **Style:** white field, 2px ink border, 10px radius, padding 0.75rem 0.9rem, text at lead size. The label is 600 and sits above the field. Help text uses label size in ink-on-paper-soft.
- **Focus:** the border turns cobalt with a 3px `rgb(35 64 196 / 0.25)` ring. The outline is suppressed in favour of that ring.
- **Error:** tomato border and tomato-rim 600 message text. Empty error and notice nodes collapse.
- **Handwritten variant:** used for the name on the welcome name tag. Bottom border only (3px ink), display 700 at title size, centred. The placeholder falls back to Rubik 400.
- **Card answer variant:** used on the icebreaker card. Transparent, with a 2px dashed cobalt underline that turns solid on focus, and cobalt display text that reads as writing on the card.

### One-Time Code Tiles (Signature)
One real input (opacity 0, covering the row, so autofill and paste work) sits over six display tiles. Empty tiles are 3.6rem tall, 12px radius, with a pale fill and an inset rim. Filled tiles become sunflower magnets: they lift 2px and alternate a ±2deg tilt. The next tile shows the cobalt focus outline. An invalid code tints every tile pale tomato.

### Magnet Word (Signature)
The "circloo" wordmark is spelled in display letters, each with a magnet face colour, a stacked rim text-shadow and an nth-child tilt. Letters are draggable with pointer input. Position goes through CSSOM custom properties (`--dx`, `--dy`, set with `style.setProperty`), never inline style attributes, because the CSP forbids those. A lifted letter scales to 1.08 and its shadow deepens. Number magnets in the chore list reuse the same letter treatment.

### Icebreaker Index Card (Signature)
A ruled index card (paper-line rules every 1.9rem, a red margin line at 2.4rem inline-start) tilted +1.6deg and held by a cobalt pin. The card's name is written vertically up the margin line in tomato-rim. That margin note belongs to this card's ruled-paper material and is not a label pattern for other surfaces. A new question is dealt with a 520ms rotate-and-settle animation. "Shake the fridge" shakes the entire door for 0.5s.

### Kick Plate (Footer)
An ink band at the base of the fridge. The wordmark is sunflower display 800, and the remaining text is enamel at label size, centred and wrapping.

## Do's and Don'ts

### Do:
- **Do** set every heading on paper held by a pin magnet. Supporting paragraphs may sit on the enamel in ink or ink-soft.
- **Do** write magnet shadows on the magnet's own rule using its `--rim`, and keep `--shadow-paper` as the only shared shadow token.
- **Do** give each paper a small, different tilt between -4deg and +4deg. Keep controls upright relative to their paper.
- **Do** use logical properties (`inset-inline-*`, `padding-inline-*`, `border-block-*`) and add a `[dir='rtl']` mirror for every asymmetric detail: curled corners, handle shadow, pin translate, margin-note rotation, directional icons.
- **Do** pass every dynamic position or value through CSS custom properties set from script (`setProperty`). The CSP forbids inline style attributes.
- **Do** pair a mood with both an icon and a word. Mood is never colour alone.
- **Do** use Lucide SVG icons at stroke 2.25 to 2.5, decorative and `aria-hidden` beside a visible label.
- **Do** honour reduced motion: the global rule collapses animations and transitions to 0.01ms, and the shake, deal and hop animations depend on it.

### Don't:
- **Don't** give paper a solid offset shadow or give the door a cast shadow. Rims are for magnets only.
- **Don't** declare a magnet shadow token at `:root`. It resolves `--rim` at the root and breaks every colour variant.
- **Don't** introduce a fifth magnet colour or a one-off button hex. Use tomato, cobalt, sunflower, ink or paper.
- **Don't** put more than one tomato action in a viewport.
- **Don't** set display type in Rubik or a system face. Don't set body copy in Baloo Bhaijaan 2.
- **Don't** add small labels or eyebrows above headings. The heading on its pinned paper is the hierarchy.
- **Don't** use emoji or text glyphs as icons.
- **Don't** place content in the handle lane at the inline-end edge, or use physical left/right properties.
- **Don't** apply negative tracking, uppercase or letter-spacing to Arabic text.
