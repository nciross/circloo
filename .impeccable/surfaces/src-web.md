---
version: 1
slug: "src-web"
primary_target: "src/web"
related_targets: []
---

# Surface brief: circloo web (landing + app shell)

**Scope**: public landing `/` (Persuade); sign-in, welcome, home, settings, icebreakers and not-found (Operate, inheriting the same world). Replaces the fridge-door world (issue #60).
**Audience**: families spread across languages, friend groups, small teams. Job: understand circloo in seconds, play one icebreaker, start a circle. In the app: check in, run an icebreaker round, and ask circloo for things in plain words.
**Proof/content**: real seed sparks (content/fun); example check-ins and boards labelled as examples; integrations honestly "coming soon". No testimonials, logos or metrics.
**Constraints**: en/fr/ar(RTL)/es, strict CSP (no inline style/script, self-hosted fonts), WCAG 2.2 AA, reduced motion, light and night themes.
**Memorable moment**: the visitor taps the water and a ring of ripples spreads: the circloo mark coming alive. Dealing a new icebreaker drops it into the pool with the same ring.
**Software 3.0**: the Ask bar (Ctrl/⌘ K) on every app screen turns plain words into a plan the person checks before it runs. AI output always lands as cards to keep or dismiss, labelled "Suggested by AI", and an autonomy setting (Off / Suggest) governs inline suggestions.
**Unresolved**: no photography yet; every illustration is drawn in code or SVG.

## Direction contract (revised, issue #60)

THESIS: circloo is a serious collaboration tool with a warm face. The chrome follows the enterprise
platforms teams already trust (Jira, Linear, Notion): left sidebar, top bar with Ask circloo, panels,
tables, lozenges, in calm neutrals with one action blue. The lido and fridge worlds are retired; the
owner asked for "Jira or enterprise platform with nice design".

OWN-WORLD: the face. The last "oo" of the wordmark are eyes, with a coral mouth that follows the five
check-in moods; it blinks and watches the pointer. People (avatars, characters) and content (cards,
jokes) carry colour; violet is reserved for AI.

FIRST VIEWPORT: a big confident headline and lead at inline-start, a real product preview in its app
frame at inline-end (live icebreaker + example check-ins). Then features with an interactive mood demo,
integrations (coming soon), how it works, one pricing plan, and a navy final call.

FINISH: DESIGN.md and .impeccable/design.json describe the shipped system; axe passes on every journey
in English (desktop) and Arabic (phone).
