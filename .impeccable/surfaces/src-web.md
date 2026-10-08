---
version: 1
slug: "src-web"
primary_target: "src/web"
related_targets: []
---

---
version: 1
slug: "src-web"
primary_target: "src/web"
related_targets: []
---

# Surface brief: circloo web (app + public site)

**Scope**: the whole web app (Operate): shell, home with the circle list, sign-in and welcome, create and join a circle, the live room (work bar, whiteboard, boards, chat, call stage, rail), icebreakers, presentations, Pirikoo (the AI page), integrations, settings, 404; and the public landing (Persuade), which inherits the same world at a larger scale. Replaces the enterprise/Jira world (issue #250, founder decision 2026-10-07).
**Audience**: families spread across languages, friend groups, small teams. Job in the app: check in, open the circle, run a round, talk. Job on the site: understand circloo in seconds and start a circle.
**Proof/content**: real seed sparks, real character cast, example check-ins labelled as examples. No testimonials, logos or metrics.
**Constraints**: en/fr/ar (RTL)/es, strict CSP, WCAG 2.2 AA in both themes, reduced motion, Readex Pro only, the face logo, the cast and the violet-means-AI rule are pinned by the founder.
**Memorable moment**: the circle as a ring in orbit: members are bodies on the ring, a check-in is a phase, a round opening is a transit.
**Software 3.0**: Pirikoo and the Ask bar turn plain words into a plan the person checks before it runs; AI output is violet and labelled.
**Unresolved**: no photography; every illustration is drawn in code or SVG.

## Direction contract (issue #250, seed 463807f3)

THESIS: circloo is an orrery of people. A circle is a ring, its members are bodies on it, and the day's check-ins are their phases. It refuses the SaaS dashboard arrangement (white cards on grey, one accent) and the enterprise sidebar-as-identity.

OWN-WORLD (Pure Signal, picked by the founder on 2026-10-08 over the first bone/brass build): white (`#ffffff`) and off-black (`#0a0a0b`) as the two grounds (Day and Night, following the device), hard neutral hairlines, one cobalt (`#1f4fff` by day, `#6b8cff` by night) that is both the instrument stroke (ring tracks, ticks, the running rule) and the action colour, violet only for AI, coral only in the face's mouth, the five mood skies as fills. Readex Pro at every size; hierarchy by scale and weight. Rings, arcs and ticks are the only ornament, and each one carries data.

STORY: the visitor sees their circles turning, understands at a glance who is here and how the circle feels today, checks in with one tap, and opens the round that is live.

FIRST VIEWPORT (Home, app shell): a 3.5rem top bar (wordmark, Ask circloo, avatar) and a slim navigation rail at inline-start on the ground (white by day, off-black by night). The content opens with the person's circles as rings, the live one largest, each ring carrying the members' characters as bodies and the circle's mood as the ring's sky fill; today's phase (the person's check-in) sits beside it with the five moods as one tap each, the primary action. Below: the round that is live, then rounds and boards as instrument cards on a hairline grid.

FORM: The Orrery, candidate 1 of 7 on the grounded list (the pick card), chosen by the founder on the decision page over the assigned Barometer (candidate 6). Build path: code-led. Raises kept from the hand: hairline grid discipline, total ground commitment in Night, whole-cell member grids, time flows inline-start to inline-end and mirrors in RTL, honest round timings in tabular numerals, the mood driving Readex Pro's weight axis on the headline reading.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
