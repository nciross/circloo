# REST contract: live room for big circles (spec 008)

Changes to existing endpoints. JSON is camelCase, and errors are `ProblemDetails`.

## Join

| Endpoint | Change |
|---|---|
| `GET /api/join/{code}` | `JoinInfo` gains `characters: { id: string; used: number; freeRings: number[] }[]`. `taken` now lists only characters with no free ring. `full` follows `Circles:MaxPeople`. |
| `POST /api/join/{code}` | The body gains an optional `ring` (0–5). Without it, the lowest free ring of the character is assigned. If two people race for the same ring, the next free one is used. `409 circle-full` when the circle is at its maximum (checked under a row lock). `409 character-full` when all 6 rings of the character are taken. |

Rate limits:
- `circle-join` per IP: 300 per 10 min.
- per IP and join code: `MaxPeople + 20` per 10 min.
- Both are configurable (`RateLimits:*`), and the load test and e2e raise them locally.

## Circle view

`GET /api/circles/{id}` (`CircleView`) adds:

```ts
me: MemberDto & { ring: number }
members: (MemberDto & { ring: number })[]
messages: (MessageDto & { likes: number; liked: boolean; hidden?: boolean })[]
  // hidden: only in the animator's view; members never receive hidden messages
settings: { chat: 'open' | 'slow' | 'paused'; reactions: boolean; pirikooQuiet: boolean }
hands: { queue: { memberId: string; raisedAt: string }[]; floor: string | null }
reactionTotals?: Record<string, number>
  // the latest presentation session in this circle, for the results panel
```

## Results

The circle report (`CircleReport`, used by "Send results" to Teams, Jira, Confluence and Notion) gains one line per presentation that received reactions: "Reactions: 👏 42 · ❤️ 18 · 😂 9". It never includes names.
