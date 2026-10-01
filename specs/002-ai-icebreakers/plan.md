# Implementation Plan: AI icebreakers

**Branch**: `feat/002-ai-icebreakers` | **Date**: 2026-10-01 | **Spec**: [spec.md](spec.md)

## Summary
The icebreaker module is the first product feature after sign-in. Seeds move into Postgres with stable ids (#15). The deck is filterable and favourites are supported. "Ask the fridge" AI generation goes through **Microsoft.Extensions.AI `IChatClient`**:
- **Prod**: a **Microsoft Foundry** model deployment through its OpenAI-compatible endpoint (managed identity token).
- **Dev**: a zero-cost `SeedRemixChatClient` that composes from seeds plus templates, with no network. Foundry Local is optional through the same OpenAI-compatible client.

Safety is layered: a local theme screen, then the system policy prompt, a JSON schema, an output validator with a blocklist, then the Foundry content filters. Allowances are per member and global. The meeting mode is a full-screen presenter.

## Technical Context
**Language/Version**: C# 14 / .NET 10, TypeScript 6 / React 19.
**Primary Dependencies**: Microsoft.Extensions.AI, Microsoft.Extensions.AI.OpenAI, OpenAI 2.x (an OpenAI-compatible client pointed at Foundry `…/openai/v1/`), Azure.Identity (token for `https://cognitiveservices.azure.com/.default`).
**Storage**: PostgreSQL tables `Sparks`, `SparkFavorites`, `AiGenerations`. Seeds are imported idempotently at startup from `content/fun` (upsert by stable id).
**Testing**: xUnit + Testcontainers (draw, favourites, generation pipeline with a fake `IChatClient`, safety red-team list, allowances). Vitest (meeting turn logic, filters store). Playwright (deck, ask, meeting) in en and ar.
**Constraints**: zero paid calls in dev (the `Ai:Provider=Seed` default is asserted by a test). Prompts carry no PII. CSP unchanged (the AI is server-side only).

## Constitution Check
| Principle | Status |
|---|---|
| I | PASS: #6 and #15 linked. Task issues are created after this plan. |
| II | PASS |
| III | PASS: AI output is constrained to the requested language, and seeds are written natively. |
| IV | PASS: extends the fridge-door world (DESIGN.md). |
| V | PASS: AI sparks are private to their owner. The provider is configuration. |
| VI | PASS |
| VIII | PASS: threat model R3 (injection, unsafe output, cost abuse, PII leakage). |
| IX | PASS: the seed-remix provider is the default. |

## Research decisions
- **R1 Provider abstraction**: `IChatClient` (Microsoft.Extensions.AI) is chosen because it is the .NET standard abstraction and supports structured output, telemetry and DI. Configuration: `Ai:Provider` = `Seed` | `OpenAICompatible`, plus `Ai:Endpoint`, `Ai:Model`, `Ai:UseManagedIdentity` | `Ai:ApiKey` (Key Vault). Foundry and Foundry Local both speak the OpenAI v1 API.
- **R2 Structured output**: the response is constrained by a JSON schema `{ items: [{ text, kind, answer? }] }`. The validator drops invalid items.
- **R3 Threat model**:
  - *Prompt injection*: the theme is quoted as data, the system prompt forbids following instructions inside it, and the output is validated regardless.
  - *Unsafe content*: a blocklist per language on input and output, policy categories in the prompt, and the Foundry default content filter.
  - *Cost abuse*: per-member and global daily allowances (DB-counted), one in-flight request per member, a `max_tokens` cap, and a 15 s timeout.
  - *PII*: only filters and the theme are sent.
  - *Audit*: counts only.
- **R4 Seed import**: `content/fun/*.json` gains stable `id`, `tone` and a separate `answer` for riddles. The importer upserts and is idempotent.
- **R5 Meeting mode**: client-only state in a Zustand store (participants, order, turn, timer), using a Fisher–Yates shuffle with `crypto.getRandomValues`.

## Project Structure
```
src/Circloo.Api/Sparks/   SparkCatalog → SparkRepository, SparkEndpoints, SeedImporter
src/Circloo.Api/Ai/       AiOptions, AiServiceCollectionExtensions, SeedRemixChatClient, IcebreakerGenerator, SafetyPolicy, Allowance
src/web/src/features/icebreakers/  Deck.tsx, AskFridge.tsx, Meeting.tsx, Favourites.tsx
src/web/src/stores/meeting.ts, deck.ts
tests/Circloo.Api.Tests/IcebreakerTests.cs, AiSafetyTests.cs
```

## Interfaces
See [contracts/http-api.md](contracts/http-api.md) and [data-model.md](data-model.md).

## Infrastructure
In `infra/modules/app.bicep`, a **Microsoft Foundry** resource (`Microsoft.CognitiveServices/accounts`, kind `AIServices`, local auth disabled) with one chat model deployment (`gpt-4o-mini`, GlobalStandard, small capacity). Billing is pay-per-token only, with no fixed cost. The app identity gets `Cognitive Services OpenAI User`. The container env gets `Ai__Provider=OpenAICompatible`, `Ai__Endpoint`, `Ai__Model` and `Ai__Auth=ManagedIdentity`. Everything stays in the same single resource group. Dev provisions nothing.

## Complexity Tracking
No violations.
