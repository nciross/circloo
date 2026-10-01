# Quickstart: 002

1. Run `dotnet run --project src/Circloo.AppHost`, then sign in (see 001).
2. **Deck** (US1): open `/app/icebreakers`, set Work + Silly and shake 10 times. No card repeats. Tap the heart on one, reload, and check it under Favourites.
3. **Ask the fridge** (US2, zero cost): leave `Ai:Provider` at its `Seed` default. Ask for Family + Cozy + kids-safe in Spanish with the theme "vacaciones de verano". You get 3–5 Spanish sparks marked AI-suggested. Keep one and check it under "My sparks". The API logs show the provider `seed-remix` and no network calls.
4. **Unsafe theme**: enter a theme that mocks a religion. You get a kind refusal and the allowance is unchanged.
5. **Optional Foundry Local** (free): install Foundry Local, run `foundry model run phi-4-mini`, then set the user-secrets `Ai:Provider=OpenAICompatible`, `Ai:Endpoint=http://localhost:5273/v1`, `Ai:Model=phi-4-mini`, `Ai:Auth=None`.
6. **Microsoft Foundry (prod)**: set `Ai__Endpoint` to the Foundry resource's `/openai/v1/` URL, `Ai__Model` to the deployment name and `Ai__Auth=ManagedIdentity`. Grant the app identity the `Cognitive Services OpenAI User` role.
7. **Meeting** (US3): open `/app/icebreakers/meeting` and add 4 names. Each person gets one turn. Space moves to the next person and S shuffles.
8. **Tests**: run `dotnet test` (deck, favourites, AI pipeline with a fake chat client, safety red-team list, allowances, no paid calls in dev) and `npx playwright test` (deck, ask, meeting in en and ar).
