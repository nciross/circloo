---
version: 1
slug: "src-web"
primary_target: "src/web"
related_targets: []
---

# Surface brief: circloo web (app + public site)

**Scope**: the whole web app (Operate): the shell (left sidebar and a header that searches by asking Pirikoo), Home with My circles, sign-in and welcome, create and join a circle, the live room (work bar, whiteboard, boards, chat, call stage, side card), icebreakers, presentations, Pirikoo, integrations, settings, 404; and the public landing (Persuade), which shares the language. Issue #250, founder decisions of 2026-10-08.
**Audience**: families spread across languages, friend groups, small teams. Job in the app: check in, open the circle, run a round, talk. Job on the site: understand circloo in seconds and start a circle.
**Proof/content**: real seed sparks, real character cast, example check-ins labelled as examples. No testimonials, logos or metrics.
**Constraints**: en/fr/ar (RTL)/es, strict CSP, WCAG 2.2 AA in both themes, prefers-reduced-motion respected (the landing offers Play and Pause), Rubik, the face logo and the cast. AI is always labelled in words (violet is now also the link colour).
**Memorable moment**: on the site, a live board in the hero with friends' cursors as name pills and pastel notes, the cast acting along in blobs; in the app, the light mauve focal card with your people as buddy rows and every count a ten-segment meter.
**Software 3.0**: Pirikoo and the search field turn plain words into a plan the person checks before it runs; AI output is labelled ("AI", "Suggested by AI").
**Unresolved**: no photography; every illustration is drawn in code or SVG.

## Direction contract (issue #250, 2026-10-08: the charcoal language)

THESIS: circloo is warm consumer software for circles of people: a white canvas, heavy rounded type, the cast at scale, charcoal pills, violet links, pastels for the playful parts, one light mauve focal card per view. It refuses black backgrounds, gradients, glass, glows, sparkle icons, icon tiles over headings and repeated filler metadata (docs/design/anti-ai-look.md).

OWN-WORLD: white canvas and near-black ink (`#111111`); charcoal (`#2e2e36`) for every primary pill and the current navigation item; violet (`#6d28d9`) for text links, the lead line and focus; pastels (mint, butter, peach, sky, lavender, blush) for chips, covers, notes and the kind of a round; one focal card per view in light mauve (`#ece2f6`; plum `#2b2238` at night) holding the status colours; form fields outlined with `--field-line` (3:1). Rubik (800–900 at the top); Caveat only for handwritten asides on the site. Pills for every control, big radii. Night: a near-black charcoal canvas, light pills, light violet links. AI keeps its own violet and its labels, coral stays the face's mouth, the five skies stay the moods.

THE PUBLIC HERO: a sticky white bar (larger wordmark, language, Log in); a short title over a looping live board (cursors as name pills, pastel notes, votes, an icebreaker) flanked by pastel blobs with characters that act in time with it; one small Pause (and Play under reduced motion). Log in swaps the board for the sign-in form in place. Below: rounds with category filters, how it works, the story, what a circle does, a free plan, questions, a mauve footer.

STORY: the visitor sees a circle working live, then starts one; inside, they see who is here and how the circle feels on the focal card, check in with one tap and open the room that is live.

FIRST VIEWPORT (Home, app shell): the left sidebar with the wordmark and the navigation; a header with the search field, New circle and the avatar. "Hi Nadia." at display size, the violet lead line, "Start a new circle" with quick starts, then My circles split into Circles I run and Circles I joined; today's mood and the icebreaker beside.

FORM: code-led. Playwright keeps every class name; axe runs on every spec.

FINISH: screenshots in both themes and both directions, the Impeccable detector at zero, DESIGN.md in this language, then the PR with "Closes #250".
