# Product

<!-- impeccable:product-schema 1 -->

> Product truth for circloo, read by the Impeccable design skill (`/impeccable …`) and by every Claude agent.
> Written from the founder's brief (2026-10-01). Lines marked *(inferred)* weren't stated outright. Confirm them during `/impeccable init`.

## Platform

web (responsive, mobile-first; installable PWA *(inferred)*)

## Stack

Delegated: .NET Aspire (ASP.NET Core API, EF Core + PostgreSQL) + React/TypeScript SPA (Zustand, TanStack Query), AI through Microsoft Foundry, hosted on Azure Container Apps. Dev runs locally at zero cost. See `docs/architecture/overview.md`.

## Users

Small circles of people who already know each other and want a shared place:

- **Friends**: a group chat that has outgrown chat; they want to check in, laugh and plan together.
- **Families**: often spread across countries and languages (French, Arabic, Spanish, English in the same family is normal).
- **Companies / teams**: want team rituals (mood check-ins, icebreakers, retros, brainstorm boards) without a heavyweight tool. They may need their own SSO.

One person can belong to several circles (their family, their friends, their team) and switch between them.

## Product Purpose

circloo is a collaboration space for a circle of people. It has three jobs:

1. **Feel together**: share daily motivation or mood in a few seconds, and see how your circle is doing.
2. **Work together**: shared boards in the spirit of Klaxoon (sticky notes, votes, columns, live cursors) for brainstorming, planning and retros.
3. **Have fun together**: icebreakers and jokes in English, French, Arabic and Spanish to start meetings and lighten days.

Success: a circle comes back every day for the check-in and opens a board when it has something to decide.

## Positioning

The same small space works for your family dinner planning and your team retro. Fun and feelings sit next to work as first-class content, and the space speaks four languages, including right-to-left Arabic, natively.

## Operating Context

- Sign-up is a one-time email link (no password). A member invites others either by email or with a shareable invite link/code for people who have no email or prefer not to share it.
- Companies can plug in their own SSO (Entra ID, Google Workspace, Okta or any OIDC/SAML provider) per organization, configured without code changes.
- Typical rituals: a morning check-in on a phone, a weekly team meeting that starts with an icebreaker, a live board shared on a screen.

## Capabilities and Constraints

- Languages: English, French, Arabic (full RTL layout), Spanish. All UI and fun content exist in all four.
- Spaces ("circles") are private by default; only members and invitees see content.
- **Group calls** (spec 009): the animator of a circle can open an audio or video call for the whole circle, on circloo's own call server. The animator has three switches, chat, audio and video, and picks how people speak: **Open mic** (anyone may switch their microphone on) or **Hand to speak** (people raise a hand, and the floor grants the microphone to one person at a time). Joining is each person's choice, with the camera and microphone off. Deployed environments without a call server say "Group calls are not available here" and keep chat, hands and reactions.
- **Only chat is saved.** Calls are never recorded or transcribed. Who joined, who spoke, the floor, mutes, the history of raised hands, emoji reactions and the speaking highlight are never stored; a raised hand exists only while it is up. Chat messages, their replies, likes and hidden state are.
- Deployed to Azure in one resource group per environment, with one-command deploy/destroy.
- Undecided: pricing, native mobile apps, end-to-end encryption.

## Brand Commitments

- The name is **circloo**, always lowercase.
- Voice: warm, playful, a little cheeky, never corporate and never childish. Humour is welcome. Jokes stay kind and never mock a person, group, religion or culture.
- **The product must not look AI-generated.** See `docs/design/anti-ai-look.md`. No template SaaS look.

## Evidence on Hand

- No users, testimonials, metrics or logos exist yet. Do not invent any.
- Starter icebreakers and jokes: `content/fun/*.json` (en, fr, ar, es).

## Product Principles

1. **Seconds, not minutes.** Checking in or reacting takes one or two taps. Anything longer is opt-in.
2. **People before productivity.** Feelings and fun are core features, not decorations around a work tool.
3. **One circle, many cultures.** Every screen works equally in all four languages and in RTL; no language is an afterthought.
4. **Private by default, open by invitation.** Nothing is public; inviting is easy, with or without email.
5. **Simple for families, configurable for companies.** Enterprise needs (SSO, policies) are settings, never forks of the product.

## Accessibility & Inclusion

WCAG 2.2 AA. Full RTL mirroring for Arabic. The whole group call works from the keyboard and with a screen reader: changes of hands, the floor, mutes and the call are read in grouped, polite sentences, never one per event. Mood input is never colour-only (always words or icon + label). Respect `prefers-reduced-motion`. Readable by non-native speakers: short sentences, no idioms in UI strings (idioms belong in jokes).
