---
version: 1
slug: "src-web-src-features-icebreakers"
primary_target: "src/web/src/features/icebreakers"
related_targets: []
---

# Surface brief: icebreakers (deck, ask the fridge, meeting)

**Scope**: `/app/icebreakers`, an Operate surface inside the established fridge-door world (DESIGN.md). Spec: `specs/002-ai-icebreakers`.
**Audience/task**: a member draws a fitting icebreaker in seconds, asks the AI for fresh ones, and runs a round where everyone answers in turn (on a phone or a shared screen).
**Constraints**: en/fr/ar(RTL)/es, strict CSP, WCAG 2.2 AA, keyboard (Space next, S shuffle), reduced motion, question ≥ 48px in full screen.
**Memorable moment**: the current person's name magnet pops off the ritual line while the card above shakes into place.

## Direction contract

THESIS: the icebreaker is a ritual on the door, not a list. One big card, and under it a magnetic line of everyone in the room, where whoever's turn it is pops forward. The surface refuses the feed/grid of cards.

OWN-WORLD: the inherited fridge door (pistachio enamel, tomato/cobalt/sunflower/ink magnets with own rims, white index cards, sticky notes, Baloo Bhaijaan 2 + Rubik). New parts: a chrome magnetic strip (the ritual line) holding name magnets; a kitchen-timer magnet; a yellow notepad ("Ask the fridge") pinned at the inline-end edge; a "fresh from the fridge" rubber stamp on AI cards.

STORY: the member sets audience, tone and kind with filter magnets, shakes for a card, hearts the good ones, writes names on the line, and runs the round. When the deck feels stale, they ask the fridge for 5 fresh cards and keep the ones they like.

FIRST VIEWPORT: a top row of three small filter-magnet groups plus a kids-safe toggle. Centre-start, about 62%: a large ruled index card with the question at display size, a heart and a riddle answer flap, and a sunflower "Shake" magnet below it. Inline-end, about 32%: the yellow "Ask the fridge" notepad with the theme line, the allowance and the cobalt "Ask" magnet. Full width under both: the chrome ritual line with name magnets, a "+ name" input magnet, the timer and "Next".

FORM: surface structure "Ritual line", dealt candidate 4 of 7 and locked by the founder. Seed key 81cacaf9.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
