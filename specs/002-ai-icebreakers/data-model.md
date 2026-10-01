# Data model: 002

## Spark
| Field | Type | Rules |
|---|---|---|
| Id | text | Stable id. Seeds: `en-ib-001` from the content file. AI: `ai-<uuid v7>`. PK |
| Lang | text | en/fr/ar/es |
| Kind | text | icebreaker, would-you-rather, joke, riddle |
| Tone | text | silly, cozy, deep |
| Audiences | text[] | subset of family, friends, work |
| KidsSafe | bool | |
| Text | text | ≤ 220 characters |
| Answer | text? | riddles only, ≤ 120 characters |
| Source | text | seed or ai |
| OwnerId | uuid? | FK → User (cascade). Null for seeds. Set for kept AI sparks |
| Retired | bool | a seed removed from the content file is retired, not deleted, so favourites resolve quietly |
| CreatedAt | timestamptz | |

Indexes: `(Lang, Kind, Tone)`, `OwnerId`. A seed's text is updated in place by the importer (upsert by Id).

## SparkFavorite
`(UserId, SparkId)` is the PK, plus CreatedAt. Cascades on user and spark delete.

## AiGeneration (audit, no content)
| Field | Type |
|---|---|
| Id | bigint identity |
| UserId | uuid |
| At | timestamptz (indexed with UserId) |
| Provider, Model | text |
| InputTokens, OutputTokens | int? |
| Requested, Accepted | int |
| Outcome | text: ok, refused, failed, limited |
| LatencyMs | int |

The daily allowance counts `Outcome IN ('ok')` rows from the last 24 hours per user, and all of them globally. A failure does not consume the allowance.

## Pending AI sparks
Generated items are returned to the client with a short-lived signed token: a Data Protection protected payload holding the items, user id and expiry (15 min). "Keep" posts the token plus an index. The server unprotects it, checks the user and expiry, and inserts the Spark. Nothing unkept is stored.
