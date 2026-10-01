# Feature Specification: Platform foundation, OTP sign-in and landing page

**Feature Branch**: `feat/001-platform-otp-landing`

**Created**: 2026-10-01

**Status**: Implemented (PR #43)

**Input**: User description: "Platform foundation, OTP sign-in and public landing page for circloo (idea issues #2 E1, #18 E8, chore #17). circloo re-platforms on .NET Aspire with a React + TypeScript SPA using explicit state management, production-ready and secure by design, with zero-cost dev mode. Visitors land on a fun, playful public landing page in EN/FR/AR(RTL)/ES that explains circloo (collaborate, work together, share happiness) with a playable icebreaker teaser and an honest integrations teaser (Teams/Office 365, Salesforce, Jira, Confluence, Notion as coming soon). They sign up or sign in with an email one-time code (6 digits, 10-minute expiry, single use, rate-limited, no account enumeration), set a display name and preferred language, and reach an authenticated app home. They can sign out and sign out everywhere."

**Linked issues**: #2 (E1 identity), #18 (E8 landing page), #17 (platform chore)

## Clarifications

### Session 2026-10-01 (validated by the founder's delegated authority, see the goal brief)
- Q: Is the account created when the code is requested or when it is verified? → A: When it is verified, so a request never changes user state (helps prevent enumeration).
- Q: What happens when the per-email limit is hit? → A: Same neutral response, no email sent, the event is audited. Only the per-network-address limit returns a visible "slow down".
- Q: How long can a session stay idle? → A: 30 days sliding. Sign-out everywhere is effective within 1 minute.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover circloo on the landing page (Priority: P1)

Amina hears about circloo from a friend and opens the site on her phone. In a few seconds she understands what it is: a private little space where her circle (family, friends or team) checks in, works together on boards and has fun together. She taps "Shuffle" on a live icebreaker card, laughs at the question, switches the page to Arabic for her mother, and taps "Start your circle".

**Why this priority**: The landing page is the first impression and the only public surface. Without it, nobody arrives at sign-in.

**Independent Test**: Open the public URL while signed out. The page explains the three jobs, the icebreaker teaser shuffles real sparks in the current language, the language switcher changes all copy (Arabic mirrors the layout), and the call to action leads to sign-in.

**Acceptance Scenarios**:

1. **Given** a signed-out visitor, **When** they open the root URL, **Then** they see the landing page with the value proposition, the three jobs (feel together, work together, have fun together), an icebreaker teaser, an integrations teaser and a call to action to sign in.
2. **Given** the landing page in English, **When** the visitor picks "العربية", **Then** every visible string is in Arabic, the layout reads right to left, and the choice persists on reload.
3. **Given** the icebreaker teaser, **When** the visitor taps "Shuffle", **Then** a different spark in the current language appears with a playful transition (or none when reduced motion is preferred).
4. **Given** the integrations teaser, **When** the visitor reads it, **Then** Microsoft Teams/Office 365, Salesforce, Jira, Confluence and Notion are shown and clearly labelled "coming soon". No integration is presented as available.
5. **Given** a browser with French as its preferred language and no saved choice, **When** the visitor first opens the page, **Then** it renders in French.

---

### User Story 2 - Sign up or sign in with a one-time email code (Priority: P1)

Théo enters his email, receives a 6-digit code within seconds, types it (or pastes it, or lets his phone autofill it) and is signed in. If it is his first time, an account is created on the spot. Nobody needs a password.

**Why this priority**: Every product module (icebreakers, check-ins, boards) needs an identity.

**Independent Test**: Request a code for a new email, read it from the dev mailbox, enter it and land signed in. Repeat with the same email to sign in again without creating a duplicate account.

**Acceptance Scenarios**:

1. **Given** the sign-in screen, **When** a visitor submits a valid email, **Then** they see a neutral message ("If this address can receive email, a code is on its way") and a code entry screen, whether or not the account exists.
2. **Given** a code was sent, **When** the visitor enters the correct code within 10 minutes, **Then** they are signed in. A new account is created if none existed for that email.
3. **Given** a code was used once, **When** anyone submits it again, **Then** it is rejected.
4. **Given** a code, **When** it is entered wrong 5 times, **Then** the code is invalidated and the visitor must request a new one.
5. **Given** a code older than 10 minutes, **When** it is entered, **Then** it is rejected with the same generic "not valid (wrong, used or expired)" message as any other invalid code, plus a "send a new code" action. One message for every failure keeps the flow free of hints for attackers.
6. **Given** a visitor requesting codes repeatedly, **When** they exceed the limit for a network address, **Then** further requests are refused with a friendly "slow down" message and a retry time. **When** they exceed the per-email limit or the daily guess budget for an email, **Then** the response looks the same as a success, no email is sent, and the event is audited (see Clarifications).
7. **Given** a new code was requested, **When** an older code for the same email is entered, **Then** it is rejected (only the latest code is valid).

---

### User Story 3 - Complete my profile and reach my home (Priority: P2)

After his first sign-in, Youssef is asked for a display name and his preferred language (pre-filled from the page language). He confirms and lands on his circloo home, which greets him by name and shows what is coming next (icebreakers first).

**Why this priority**: The profile makes the app personal and fixes the language used everywhere, including emails.

**Independent Test**: Sign in as a new user, complete the profile and check that the home greets the user by name in the chosen language. Sign in again and check the profile step is skipped.

**Acceptance Scenarios**:

1. **Given** a first-time signed-in user, **When** they reach the app, **Then** they must set a display name (1–40 characters) and a preferred language before seeing the home.
2. **Given** a user with a completed profile, **When** they sign in, **Then** they go straight to the home.
3. **Given** a signed-in user, **When** they change their language in the app, **Then** the UI switches immediately and the preference is saved to their profile.
4. **Given** a signed-out visitor, **When** they open an app URL directly, **Then** they are sent to sign-in and returned to that URL afterwards (same-site URLs only).

---

### User Story 4 - Sign out, and sign out everywhere (Priority: P2)

Lucía signs out on a shared family tablet. Later she realises she also left a session open at work, so from her phone she chooses "Sign out everywhere".

**Why this priority**: Session control is a basic security expectation for a private space.

**Independent Test**: Sign in on two browsers, use "sign out everywhere" in one, and check that the other loses access on its next request.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they sign out, **Then** the session on that device ends and app URLs require sign-in again.
2. **Given** a user signed in on two devices, **When** they choose "Sign out everywhere", **Then** all their sessions end, including the current one, within one minute at most.

---

### User Story 5 - A developer runs the whole platform locally at zero cost (Priority: P3)

A new contributor clones the repo, runs one command and gets the API, the web app, the database and a local mailbox running, with a dashboard showing logs and traces. No cloud subscription is needed.

**Why this priority**: Required for every later feature and for the "zero cost in dev" constraint, but invisible to end users.

**Independent Test**: On a clean machine with the documented prerequisites, start the platform with the documented single command, open the web app, sign in by reading the code from the local mailbox.

**Acceptance Scenarios**:

1. **Given** the prerequisites are installed, **When** the developer runs the single start command, **Then** all services start, and a dashboard lists them with health, logs and traces.
2. **Given** dev mode, **When** a code is requested, **Then** the email is captured by a local mailbox UI and never sent to the internet.

---

### Edge Cases

- Emails with uppercase letters, surrounding spaces or plus-addressing (`amina+family@…`) map to one normalized identity, and plus-addresses are kept distinct.
- Very long names and long translations (Spanish and French run about 30% longer) do not break the landing or profile layouts. Arabic names and Latin emails mixed in one line render with correct bidi isolation.
- The email field rejects invalid addresses client- and server-side with a clear message, without revealing whether an account exists.
- A pasted code with spaces or dashes ("123 456") is accepted.
- The email service is down: the visitor sees the same neutral message, the failure is logged, and an alert-worthy event is recorded. The code is not shown anywhere.
- Two tabs are open at sign-in: the latest code wins, and the tab that signed in first keeps working.
- Expired session in the middle of using the app: the next action redirects to sign-in and returns afterwards.
- JavaScript disabled: the landing page still shows its core message (no blank page).
- Reduced motion is preferred: no shuffle animation, no auto-playing motion.

## Requirements *(mandatory)*

### Functional Requirements

**Landing page**
- **FR-001**: The system MUST serve a public landing page at the root URL to signed-out visitors, presenting the value proposition and the three jobs (feel together, work together, have fun together).
- **FR-002**: The landing page MUST include an interactive icebreaker teaser that shows real seed sparks in the current language and lets the visitor shuffle to another one.
- **FR-003**: The landing page MUST include an integrations teaser listing Microsoft Teams/Office 365, Salesforce, Jira, Confluence and Notion, each labelled "coming soon".
- **FR-004**: The landing page MUST NOT show invented testimonials, customer logos, user counts or metrics.
- **FR-005**: Signed-in users who open the root URL MUST be taken to their app home.

**Languages**
- **FR-006**: All UI strings (landing, sign-in, profile, home, emails) MUST exist in English, French, Arabic and Spanish. Arabic MUST render right to left with a mirrored layout.
- **FR-007**: The initial language MUST come from the saved choice, then the user profile, then the browser preference, then English.
- **FR-008**: The sign-in email MUST be written in the visitor's current language.

**One-time code sign-in**
- **FR-009**: Visitors MUST be able to request a 6-digit numeric one-time code by email, which both signs up new users and signs in existing ones.
- **FR-010**: A code MUST expire 10 minutes after issue, MUST be single use, and only the most recently issued code for an email MUST be valid.
- **FR-011**: A code MUST be invalidated after 5 wrong attempts.
- **FR-012**: Code requests MUST be rate-limited per email (at most 3 per 15 minutes) and per network address (at most 20 per hour). Verification attempts MUST be rate-limited per network address.
- **FR-013**: Responses to code requests and failed verifications MUST NOT reveal whether an account exists for the email (no account enumeration, including by response timing differences visible to users).
- **FR-014**: Codes MUST never be stored or logged in readable form.
- **FR-015**: Successful sign-in MUST create a session that is protected against theft by scripts in the page, valid for 30 days of inactivity at most, and renewed on use.

**Profile and home**
- **FR-016**: First-time users MUST set a display name (1–40 characters after trimming) and a preferred language before reaching the home.
- **FR-017**: Users MUST be able to change their display name and language later.
- **FR-018**: The authenticated home MUST greet the user by display name and show the upcoming modules (icebreakers first, then check-ins, boards and integrations) honestly as "coming".
- **FR-019**: App URLs opened while signed out MUST redirect to sign-in and return to the original same-site URL after success. Return URLs to other sites MUST be ignored.

**Sessions**
- **FR-020**: Users MUST be able to sign out of the current device.
- **FR-021**: Users MUST be able to sign out of all devices. Other sessions MUST lose access within 1 minute.

**Security by design (cross-cutting)**
- **FR-022**: All state-changing requests MUST be protected against cross-site request forgery.
- **FR-023**: The system MUST send strict security headers (content security policy without inline scripts, no framing, HTTPS-only transport in production, no MIME sniffing, a strict referrer policy).
- **FR-024**: Security-relevant events (code requested, sign-in success or failure, rate limit hit, sign-out everywhere) MUST be recorded in an audit trail without personal secrets. Email addresses are stored only in a privacy-preserving form in logs.
- **FR-025**: All input MUST be validated server-side. Errors returned to users MUST NOT expose internal details.

**Developer platform**
- **FR-026**: The whole platform (web app, API, database, local mailbox, observability dashboard) MUST start locally with a single documented command and without any paid cloud resource.
- **FR-027**: The platform MUST expose health checks and emit logs, traces and metrics that can be viewed locally in dev and in the cloud monitoring service in production.

### Key Entities

- **User**: a person with an account. Normalized email (unique), display name, preferred language, created and last-seen dates, a security stamp that changes on "sign out everywhere".
- **One-time code**: an issued sign-in code for an email. A protected form of the code, the email it was sent to, issue and expiry times, attempt count, consumed flag.
- **Session**: a signed-in device. Linked to a user, it ends on sign-out, on inactivity or on a security stamp change.
- **Audit event**: a security-relevant event. Type, time, user (if known), hashed email, network address, outcome.
- **Spark (read-only here)**: a seed icebreaker or joke in a language, used by the landing teaser. Owned by feature 002.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor can go from the landing page to a signed-in home in under 90 seconds (excluding email delivery delay).
- **SC-002**: In dev, 95% of code emails reach the local mailbox in under 5 seconds.
- **SC-003**: The landing page is usable and readable in all 4 languages. An Arabic run passes the same end-to-end tests as an English run.
- **SC-004**: The landing page shows meaningful content in under 2 seconds on a mid-range phone over a 4G connection.
- **SC-005**: No automated accessibility checks fail at WCAG 2.2 AA on the landing, sign-in, profile and home screens.
- **SC-006**: The automated security test suite shows: code reuse rejected, expired codes rejected, brute force stopped after 5 attempts, identical responses for known and unknown emails, and sign-out everywhere effective within 1 minute.
- **SC-007**: A new contributor gets the full platform running locally with one command in under 10 minutes after installing prerequisites, at zero cloud cost.

## Assumptions

- The stack decision (.NET Aspire, React + TypeScript SPA with explicit state management) is a founder decision recorded in #17. The constitution is amended accordingly in this feature.
- Emails in dev go to a local capture mailbox. In production they go through the existing managed email service (ACS Email).
- The magic link of the original E1 is replaced by a one-time code. Avatar and time zone (E1) are deferred to a later feature.
- Enterprise SSO (E6) is out of scope here, but the sign-in flow must leave room for a domain lookup step before code issuance.
- Seed sparks from `content/fun/*.json` are reused read-only for the teaser. Feature 002 (AI icebreakers) owns spark management and AI generation.
- The integrations teaser is marketing only. Integrations are delivered by E9 (#19).
- Production hosting stays on Azure Container Apps (scale to zero) in one resource group. The production deployment update can follow in a later chore, but the code must already be production-ready.
