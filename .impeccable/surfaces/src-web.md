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
**Constraints**: en/fr/ar (RTL)/es, strict CSP, WCAG 2.2 AA in both themes, reduced motion, Rubik (the founder released the Readex Pro pin on 2026-10-08), the face logo, the cast and the violet-means-AI rule are pinned by the founder.
**Memorable moment**: the circle as a buddy list on one dark card: your people as characters in rows, every count a ten-segment meter; on the site, the circle composing itself as a round table with the face in the middle.
**Software 3.0**: Pirikoo and the Ask bar turn plain words into a plan the person checks before it runs; AI output is violet and labelled.
**Unresolved**: no photography; every illustration is drawn in code or SVG.

## Direction contract (issue #250, revised 2026-10-08: the buddy list)

THESIS: circloo is a buddy list. Your people are characters in rows on one dark card; what is counted (who is here, who checked in, votes, a round's time) is a ten-segment meter; the headline is the loudest thing on every page. It refuses the SaaS dashboard (white cards on grey, a sidebar as identity) and the "tasteful" instrument look the founder rejected twice (rings and brass; thin hairline cards on cobalt).

OWN-WORLD (approved by the founder from a mock, https://claude.ai/artifact/EeLVmEVBeKJJvbX8JkZbgR, built from two Kage references he sent): a white canvas and near-black ink (`#111111`); exactly one blue (`#2b6bf3`) for links, the lead line under a title, the picked option and at most one blue button per view; one dark card per view (`#161616`, 28px radius, one large soft shadow) as the second read, inside which the status colours live (teal `#2fd6c3` ok, orange `#f4623a` mid, red `#e5484d` low) as values and meter fills, never on the canvas. Rubik (800–900 at the top) replaces Readex Pro for Latin and Arabic; Caveat for handwritten asides on the public site. The character cast is the illustration (96px with ground shadows on the site, 44px in rows, 32px in stacks). Pills for every control, big radii, no gradients, glass, glows, dotted domes or icon tiles. Night flips the canvas near-black and the dark card light. Violet stays AI, coral stays the face's mouth, the five skies stay the moods.

THE PUBLIC HERO (second reference): one full-viewport cobalt field (`#2b5cf0`), white Rubik 900 headline in three lines with a hand-drawn yellow underline, one paragraph, the Say console as a white pill with a yellow (`#ffd23f`) Build pill, the circle composing itself as an oversized flat round table with the characters seated and the face in the middle, a handwritten annotation layer (asides, curved arrows, a yellow sticky note, a notepad peeking from the edge), a translucent disclaimer pill. Below the fold the site runs on the white canvas like the app.

STORY: the visitor says what their circle needs in one line and watches it compose; inside, they see at a glance who is here and how the circle feels (the dark card), check in with one tap (chunky mood tiles) and open the room that is live.

FIRST VIEWPORT (Home, app shell): a white top bar with the wordmark, the navigation as pills, Ask Pirikoo, "New circle" and the avatar (a drawer under 62rem). "Hi Nadia." at display size, a blue lead line, the live circle as the dark card with buddy rows and a meter, the other circles as outlined rows with character stacks, today's mood tiles and the icebreaker teaser beside.

FORM: code-led, mock first (the founder reacts to the whole feel, not to rules). Playwright keeps every class name; axe runs on every spec.

FINISH: screenshots in both themes and both directions, the Impeccable detector at zero, DESIGN.md and the charter rewritten to this language, then the PR with "Closes #250".
