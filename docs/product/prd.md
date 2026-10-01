# circloo product requirements

Product truth (users, purpose, principles) lives in [`/PRODUCT.md`](../../PRODUCT.md). This document breaks it into **epics**. Each epic becomes a GitHub `type:idea` issue, then a Spec-Kit spec (`/speckit-specify`), plan, tasks and task issues. See [issue-driven development](../workflow/issue-driven-development.md).

## Vocabulary

| Term | Meaning |
|---|---|
| **Circle** | A private space shared by a group (a family, a friend group, a team). The core object. |
| **Organization** | Optional owner of circles for companies; holds SSO and policies. Friends/families don't need one. |
| **Member** | A person in a circle, with role `owner`, `admin` or `member`. |
| **Check-in** | A daily mood/motivation post: a mood (5-point scale, with words and an icon), an optional note and an optional "need" (e.g. "need coffee", "need a hug"). |
| **Board** | A real-time collaborative canvas inside a circle (sticky notes, columns, votes, timer). |
| **Spark** | An icebreaker question or a joke, in EN/FR/AR/ES. |

## Epics (MVP order)

### E1: Sign-up and identity
- Passwordless sign-up and sign-in by **email magic link**.
- Profile: display name, avatar, preferred language (en/fr/ar/es) and time zone.
- Language auto-detected from the browser and switchable anywhere. Arabic switches the whole layout to RTL.

### E2: Circles and invitations
- Create a circle (name, emoji/colour, kind: friends / family / team).
- Invite **by email** (an email with a join link is sent).
- Invite **without email**: a shareable link or a short code (QR too) with expiry and a max-uses limit. The invitee joins with just a display name and can attach an email later to keep access across devices.
- Owners/admins can revoke invites and remove members.

### E3: Daily check-in (mood and motivation)
- A one-tap mood plus optional note and "need", once a day per circle (editable that day).
- Circle "weather": today's check-ins at a glance. Members see a history; individual notes are visible only to the circle.
- Optional gentle reminder at a time the member chooses.
- Reactions on check-ins (a small fixed set, not free emoji soup).

### E4: Shared boards (Klaxoon-style)
- Board templates: brainstorm, retro (went well / to improve / actions), kanban, decision vote.
- Sticky notes with colours, columns, drag and drop, dot voting, a timer, presence (live cursors and avatars).
- Real-time sync via Azure Web PubSub. Works on mobile (read and add notes) and desktop (full editing).
- Export a board as an image or Markdown.

### E5: Fun: icebreakers and jokes
- "Spark of the day" on the circle home page; a "start a meeting" button that shows an icebreaker.
- Content in EN, FR, AR and ES. Each spark has a language, a category (icebreaker / joke / would-you-rather / riddle) and audience tags (`family`, `friends`, `work`, `kids-safe`).
- Members can add their own sparks to a circle and upvote favourites.
- Seed content: [`content/fun/`](../../content/fun/). All content must be kind: no jokes about religion, ethnicity, gender or politics.

### E6: Enterprise SSO and configuration
- An organization admin configures SSO **at runtime** (stored in the database, secrets in Key Vault): OIDC (Entra ID, Google Workspace, Okta, Auth0, generic) and SAML 2.0.
- Domain verification: users with `@company.com` are routed to the company IdP automatically.
- Policies per organization: allowed sign-in methods (email link on/off), allowed invite types (block link invites), data retention.
- No code change or redeploy is needed to add a new company's SSO.

### E7: Notifications and daily digest *(post-MVP)*
- Email/web-push digest: circle weather, new board activity, spark of the day.

## Non-functional
- 4 languages from day one; RTL is tested on every screen.
- WCAG 2.2 AA.
- Private by default; GDPR basics (export and delete my data).
- One Azure resource group per environment; deploy/destroy with one command.
