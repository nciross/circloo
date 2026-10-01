# Design rule: circloo must not look AI-generated

circloo is built with AI, but no screen should **look** built by AI. All UI work goes through the **Impeccable** plugin (`/impeccable …`, enabled in `.claude/settings.json`), which carries 61 deterministic detector rules for AI-generated UI. This page is the circloo-specific layer on top.

## Workflow for any UI change
1. `/impeccable shape <surface>`: plan the UX before code (empty, loading, error and RTL states included).
2. Build it. The first visual surface uses `/impeccable craft`, which creates the root `DESIGN.md` (tokens, type and colour). Don't write `DESIGN.md` by hand before then.
3. `/impeccable audit <surface>` and `/impeccable critique <surface>` before opening the PR.
4. `/impeccable harden <surface>` for i18n overflow, RTL, long names and errors.

## Banned (the AI tells)
- Purple-to-blue or violet gradients, neon on black, glassmorphism, glowing blobs.
- Inter/system font for everything with no typographic hierarchy.
- Identical three-card feature grids; a rounded-square icon tile above every heading.
- Cards inside cards, generic drop shadows on everything, 2xl radius on everything.
- Gray text on coloured backgrounds; low-contrast "subtle" UI.
- Emoji as decoration in headings and buttons. (Emoji are fine as **user content**: reactions, circle icons.)
- Stock "Boost your productivity 🚀" copy, hero metrics, fake testimonials, fake logos.
- Sparkle ✨ icons to signal "AI" or "magic".
- Lorem-ipsum-ish placeholder people ("John Doe"); use realistic multilingual names (Amina, Lucía, Théo, Youssef…).

## What circloo should feel like instead
- **Human and handmade**: a warm, specific palette and a characterful display face paired with a highly legible text face. Typefaces must cover Latin **and Arabic** well (check Arabic glyph quality before choosing).
- **Real content first**: design with actual check-ins, actual jokes in all four languages and long German-length strings, not placeholders.
- **Playful in moments, calm in structure**: delight lives in micro-interactions (a check-in landing, a vote dot dropping), never in decoration.
- **RTL is a first-class layout**: use logical CSS properties (`margin-inline-start`, not `margin-left`), mirror directional icons and keep numbers and Latin names correctly bidi-isolated.

## Review gate
A UI PR is not ready if `/impeccable audit` reports anti-pattern findings that aren't fixed or explicitly justified in the PR.
