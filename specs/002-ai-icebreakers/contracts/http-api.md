# HTTP API: 002

Every route needs a session, except the existing `/api/public/sparks/random`. Unsafe methods need CSRF, as in 001.

## Deck
- `GET /api/sparks/draw?lang=en&audience=work&tone=silly&kind=icebreaker&kidsSafe=true&exclude=en-ib-001,en-ib-004`
  - All filters are optional except `lang`. `exclude` takes up to 200 ids.
  - Returns 200 `{ spark: SparkDto | null, poolSize: number, exhausted: boolean }`. When every match is excluded, the response sets `exhausted: true` and deals again from the full pool.
- `SparkDto = { id, lang, kind, tone, audiences[], kidsSafe, text, answer?: string, source: 'seed'|'ai', favourite: boolean }`. The answer is always included; the UI hides it until "Show answer" is tapped.

## Favourites
- `GET /api/sparks/favourites` → `SparkDto[]`, newest first
- `PUT /api/sparks/{id}/favourite` → 204. Idempotent. Returns 404 if the spark is not visible to this user.
- `DELETE /api/sparks/{id}/favourite` → 204

## My sparks (kept AI sparks)
- `GET /api/sparks/mine` → `SparkDto[]`
- `DELETE /api/sparks/mine/{id}` → 204, or 404 when the spark is not yours

## AI
- `GET /api/ai/allowance` → `{ remainingToday, limit, resetsAt }`
- `POST /api/ai/sparks`, body `{ lang, audience, tone, kind, kidsSafe, theme? }`
  - 200 `{ items: [{ index, text, kind, answer? }], keepToken, remainingToday }`
  - 400 `invalid-request` (validation), 400 `unsafe-theme` (refused locally, allowance not consumed)
  - 409 `in-flight` (another request from this user is running)
  - 429 `allowance` (`resetsAt`)
  - 503 `ai-unavailable` (provider failed or returned zero valid items, allowance not consumed)
- `POST /api/ai/sparks/keep`, body `{ keepToken, index }` → 201 `SparkDto`. Returns 400 when the token is expired or invalid, or the index is out of range.

## Configuration (no code change to switch, FR-111)
```
Ai__Provider        = Seed | OpenAICompatible            (default Seed)
Ai__Endpoint        = https://<foundry-resource>.openai.azure.com/openai/v1/   (or Foundry Local http://localhost:5273/v1)
Ai__Model           = <deployment / model name>
Ai__Auth            = ManagedIdentity | ApiKey | None
Ai__ApiKey          = (Key Vault, only when Auth=ApiKey)
Ai__DailyPerUser    = 20
Ai__DailyGlobal     = 200
Ai__TimeoutSeconds  = 15
```
