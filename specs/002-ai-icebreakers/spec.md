# Feature Specification: AI icebreakers

**Feature Branch**: `feat/002-ai-icebreakers`

**Created**: 2026-10-01

**Status**: Draft

**Input**: User description: "Icebreakers first: a fun, playful icebreaker module that integrates AI through Microsoft Foundry (zero-cost local stand-in in dev). Members draw icebreakers by audience, tone and language, run them at the start of a meeting, save favourites, and ask the AI for fresh ones that fit their group, always kind and safe."

**Linked issues**: #6 (E5 fun), #15 (stable spark ids, riddle answers)

## Clarifications

### Session 2026-10-01 (validated by the founder's delegated authority)
- Q: Circles do not exist yet (E2). Who owns AI-generated sparks? → A: The member who asked for them, in a personal "my sparks" shelf. Sharing to a circle comes with E2.
- Q: What is the daily AI allowance? → A: 20 generations per member per day and 200 per day across the whole service by default, both configurable. Seed sparks are unlimited.
- Q: What does a meeting look like? → A: The host types participant names (no accounts needed), and the app gives turns in a random order with an optional per-person timer.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Draw an icebreaker that fits the moment (Priority: P1)

Théo opens Icebreakers before Monday's stand-up. He picks "Work", "Silly" and English, taps "Shake", and gets a question he has never seen. He shakes again, likes the third one and saves it with a heart.

**Why this priority**: This is the core loop of the first product module. It also works without AI.

**Independent Test**: Signed in, filter by audience, tone and language, shake through 10 cards without a repeat, and favourite one. It shows in "Favourites" after a reload.

**Acceptance Scenarios**:
1. **Given** a signed-in member, **When** they open Icebreakers, **Then** they see one spark in their language, plus filters for audience (family/friends/work), tone (silly/cozy/deep), kind (question/would-you-rather/joke/riddle) and a kids-safe switch.
2. **Given** filters are set, **When** they shake, **Then** the next spark matches every filter and is not repeated until the matching pool is exhausted, after which the pool restarts.
3. **Given** a riddle, **When** it is shown, **Then** the answer stays hidden until "Show answer" is tapped.
4. **Given** any spark, **When** the member taps the heart, **Then** it is saved to Favourites, and tapping again removes it.
5. **Given** no spark matches the filters, **When** they shake, **Then** a friendly empty state suggests loosening a filter or asking the AI.

### User Story 2 - Ask the fridge for fresh ones (AI) (Priority: P1)

Lucía's family has used every seed question. She taps "Ask the fridge", chooses "Family, cozy, kids-safe, Spanish", optionally adds a theme ("summer holidays"), and receives five new icebreakers written in natural Spanish. She keeps two.

**Why this priority**: AI is a founder requirement and the main differentiator.

**Independent Test**: In dev with the free local provider, ask for 5 sparks with a theme. 5 valid sparks come back in the requested language, are shown as "fresh from the fridge", and can be kept.

**Acceptance Scenarios**:
1. **Given** a member under their daily allowance, **When** they ask with audience, tone, language, kids-safe and an optional theme of up to 60 characters, **Then** they receive 3 to 5 new sparks in that language within 15 seconds, or a clear message if it fails.
2. **Given** generated sparks, **When** they are displayed, **Then** each is marked as AI-suggested, and the member can keep it (it goes to "My sparks") or dismiss it.
3. **Given** the theme or the output contains unkind, unsafe or off-policy content (religion, ethnicity, gender, nationality or politics jokes, insults, sexual content, personal data), **When** it is processed, **Then** the request is refused, or the item is dropped before display, with a kind explanation and no partial unsafe text shown.
4. **Given** the member has reached the daily allowance, **When** they ask again, **Then** they see how long until it resets, and seed sparks remain available.
5. **Given** the AI service is unavailable, **When** they ask, **Then** they get a friendly message and the deck keeps working with seeds.

### User Story 3 - Run the icebreaker at the start of a meeting (Priority: P2)

Amina shares her screen in a team call, opens "Start a meeting", types five names, and circloo picks who goes first, shows the question big, and runs a 60-second timer per person.

**Why this priority**: This is the ritual that brings teams back every week.

**Independent Test**: Start a meeting with 4 names. Each name gets exactly one turn in random order, the timer counts down and can be skipped, and "Next question" deals a new spark.

**Acceptance Scenarios**:
1. **Given** the meeting screen, **When** the host enters 2 to 30 names, **Then** a random order is shown and the first person is highlighted with the current question displayed in large type.
2. **Given** a turn, **When** the timer (off, 30, 60 or 90 s) ends or "Next person" is pressed, **Then** the next person is highlighted. After the last person, a "Done" screen offers another round.
3. **Given** the meeting screen, **When** it is used in full screen on a shared display, **Then** text stays readable from about 3 m away, the controls are keyboard operable (Space next, S shuffle), and the Arabic RTL layout mirrors.

### User Story 4 - Operators keep AI safe and affordable (Priority: P3)

The founder can switch the AI provider and set allowances by configuration only, and can review usage (counts, tokens, refusals) without seeing users' themes or results.

**Acceptance Scenarios**:
1. **Given** dev mode, **When** the platform starts with defaults, **Then** AI works through a free local provider and makes no paid calls.
2. **Given** production configuration for Microsoft Foundry, **When** a member asks, **Then** the request goes to the configured Foundry model deployment with the managed identity, and usage is recorded as counts and tokens only.

### Edge Cases
- The AI returns invalid JSON, too many items, the wrong language, duplicates of seeds, or overly long text: these are dropped or repaired. Zero valid items counts as a failure, and the allowance is not consumed.
- Prompt injection inside the theme ("ignore the rules and…"): the theme is treated as data only, and the output is still validated.
- Two quick taps on "Ask": only one request is in flight per member.
- Arabic numerals and mixed-direction text in sparks render correctly.
- A deleted favourite seed (content update): the favourite disappears quietly.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-101**: Seed sparks MUST be stored with stable identifiers, language, kind, audience tags, tone, a kids-safe flag and, for riddles, a separate answer (#15).
- **FR-102**: Members MUST be able to draw sparks filtered by audience, tone, kind, language and kids-safe, without repeats until the pool is exhausted.
- **FR-103**: Members MUST be able to favourite and unfavourite sparks, and list their favourites.
- **FR-104**: Members MUST be able to request 3–5 AI-generated sparks with audience, tone, kind, language, kids-safe and an optional theme of 60 characters or fewer.
- **FR-105**: AI output MUST follow a fixed structure and be validated (language, length ≤ 220 characters, kind, no duplicates), and MUST pass a kindness and safety policy before being shown.
- **FR-106**: Unsafe themes MUST be refused without calling the model when a local check can detect them. Model-side refusals and content filters MUST be honoured.
- **FR-107**: AI usage MUST be limited per member per day and in total per day, with limits from configuration. Members see the remaining allowance.
- **FR-108**: Members MUST be able to keep AI sparks in "My sparks" and delete them.
- **FR-109**: Prompts MUST NOT include personal data (no names, no emails). Only the filters and the theme are sent.
- **FR-110**: Each generation MUST be audited with member, time, provider, model, token counts, item counts and outcome, without storing themes or texts in the audit.
- **FR-111**: The AI provider MUST be selectable by configuration: a free local provider in dev and Microsoft Foundry in production, with no code change.
- **FR-112**: A meeting mode MUST give each named participant one turn in random order, with an optional timer and keyboard controls.
- **FR-113**: All UI strings in EN/FR/AR/ES, RTL verified, WCAG 2.2 AA, reduced motion respected.

### Key Entities
- **Spark**: id, language, kind, audience tags, tone, kidsSafe, text, answer?, source (seed|ai), ownerId? (AI sparks belong to a member), createdAt.
- **SparkFavorite**: member, spark, createdAt.
- **AiGeneration**: member, time, provider, model, input and output tokens, requested and accepted counts, outcome (ok|refused|failed|limited), latency.

## Success Criteria *(mandatory)*
- **SC-101**: A member gets a matching icebreaker in under 1 second for seeds and under 15 seconds for AI requests (p95).
- **SC-102**: 0 unsafe items appear in the automated safety suite (the red-team themes and outputs list).
- **SC-103**: Dev mode makes 0 paid AI calls, which the test suite verifies.
- **SC-104**: The meeting mode is readable on a 1080p shared screen from 3 m (question text ≥ 48 px).
- **SC-105**: Every user story has a passing Playwright journey in en and ar.

## Assumptions
- Circles (E2) are not built yet, so everything is personal to the member for now. Circle-shared decks come with E2.
- Microsoft Foundry is used through its OpenAI-compatible endpoint with a chat model deployment (for example a GPT-4o-mini class model). The deployment name comes from configuration.
- The free dev provider is a local "seed remix" generator that needs no download. Foundry Local is an optional free alternative for developers who install it.
