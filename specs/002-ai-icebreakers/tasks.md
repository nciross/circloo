---
description: "Tasks for 002 AI icebreakers"
---

# Tasks: AI icebreakers

**Input**: `specs/002-ai-icebreakers/` · **Tests**: required (constitution VI)

## Phase 1: Foundational

- [ ] T001 Seed content v2 in `content/fun/{en,fr,ar,es}.json`: stable ids, tone, audiences, kidsSafe, separate riddle answers, about 40 sparks per language written natively (#45)
- [ ] T002 `Spark`, `SparkFavorite`, `AiGeneration` entities, migration and idempotent `SeedImporter` (upsert, retire missing) in `src/Circloo.Api/Sparks/` (#46)
- [ ] T003 [P] AI plumbing in `src/Circloo.Api/Ai/`: `AiOptions`, `IChatClient` registration (Seed | OpenAICompatible with ManagedIdentity, ApiKey or None), zero-cost `SeedRemixChatClient` (#47)

## Phase 2: User Story 1 - Deck (P1) 🎯

- [ ] T004 [US1] Draw, favourites and my-sparks endpoints with tests in `src/Circloo.Api/Sparks/SparkEndpoints.cs` and `tests/Circloo.Api.Tests/IcebreakerTests.cs`; the landing teaser moves to the DB catalog (#48)
- [ ] T005 [US1] Icebreaker deck UI: filters, shake, hidden riddle answer, favourite, empty state, in `src/web/src/features/icebreakers/` and a `deck` Zustand store, in 4 languages (#49)

## Phase 3: User Story 2 - Ask the fridge (P1)

- [ ] T006 [US2] `IcebreakerGenerator`: policy prompt, structured output, validator, keep token, allowance, single request in flight, audit, in `src/Circloo.Api/Ai/` (#50)
- [ ] T007 [US2] `SafetyPolicy` (theme screen, per-language blocklist, output checks) and the red-team test list in `tests/Circloo.Api.Tests/AiSafetyTests.cs` (#51)
- [ ] T008 [US2] "Ask the fridge" UI: form, AI-suggested cards, keep/dismiss, allowance and error states, My sparks (#52)

## Phase 4: User Story 3 - Meeting mode (P2)

- [ ] T009 [US3] Meeting mode: participants, random order, timer, keyboard, full screen, a `meeting` store with Vitest tests (#53)

## Phase 5: User Story 4 - Operate (P3) and polish

- [ ] T010 [US4] Bicep: Microsoft Foundry account and model deployment, role assignment, `Ai__*` env vars; AppHost passes `Ai__Provider=Seed` (#54)
- [ ] T011 Playwright: deck, ask and meeting journeys in en and ar with axe (#55)
- [ ] T012 Impeccable shape/craft/audit for the icebreaker screens, update DESIGN.md if the system grows (#56)

## Dependencies
T001 → T002 → T004 → T005. T003 → T006 → T007 → T008. T009 depends on T004. T010 is independent. T011 and T012 come last.
