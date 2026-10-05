# REST contract: live discussion stage (spec 009)

Endpoints in `src/Circloo.Api/Discussion/DiscussionEndpoints.cs`, mapped under `/api/circles/{id}` next to the circle endpoints. Authentication is the existing session or guest cookie. Unsafe methods need the CSRF header like everything else. Errors never carry internal detail.

## Circle view additions (`GET /api/circles/{id}`)

- `discussion: { on, videoAllowed, stageMax, listenersMax }` (the live parts, `away` and seats, come through the hub).
- `messages[].replyToId` (number or null).
- `recording: { id, phase, startedAt, captureFrom, maxAt } | null`, so a page load shows the indicator before the hub connects.

## ICE servers

`GET /api/circles/{id}/discussion/ice`: any member of an open circle with Live discussion on.

- 200: `{ "iceServers": [{ "urls": ["stun:stun.cloudflare.com:3478"] }], "ttlSeconds": 3600 }`. A future TURN entry adds `username` and `credential` (time-limited). No secret is returned today.
- 404 if not a member. 409 `discussion-off`. 429 on the rate limit (30 per 10 min per member), with `Retry-After`.
- `Cache-Control: no-store`.

## Transcripts (animator only)

All four need the animator role of the circle (checked in the database). A member who is not the animator gets **403** and an audit row `discussion.refused`; a non-member gets 404. They work for a closed or expired circle too, so the animator can read transcripts after the event.

| Endpoint | Result |
|---|---|
| `GET /api/circles/{id}/recordings` | The circle's recordings, newest first, at most 50: `{ id, title, startedAt, endedAt, endedReason, events }[]`. A running one has `endedAt: null` |
| `GET /api/circles/{id}/recordings/{recordingId}?after={eventId}&limit={n}` | The transcript page: `{ recording, entries, next }`. `limit` 1 to 500 (default 200). Each entry: `{ id, at, kind, actor: { id, name } \| null, subject: { id, name } \| null, text?, replyTo?, hidden?, reason? }`. Names are read from the members ("Former member" when gone). `hidden` is true when the message is now hidden. 404 if the recording is not in this circle |
| `GET /api/circles/{id}/recordings/{recordingId}/export?format=txt\|md&lang=en\|fr\|ar\|es` | A download of the whole transcript. Labels in `lang` (default the circle's locale). Markdown-escaped, bidi-isolated names and text. Headers `Content-Disposition: attachment; filename="circloo-<slug>-<yyyy-MM-dd>-<id8>.<ext>"`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. Audit `recording.exported`. 429 over 10 exports per 10 min per member. 400 for an unknown format or language |
| `DELETE /api/circles/{id}/recordings/{recordingId}` | 204. Hard delete with its events. Audit `recording.deleted`. 409 `recording-running` while it runs |

Starting and stopping a recording is **not** REST: it is `StartRecording` and `StopRecording` on the hub (server-enforced, audited, one recording per circle).

## Export layout (txt and Markdown)

```text
<title>
<circle name> · <date> · <start time> to <end time> · <how it ended>
No audio or video was kept. This record holds messages, raised hands and stage events only.

[10:02] Amina: Hello everyone
[10:03] Hand raised: Youssef
[10:04] Floor given to Youssef by Théo
[10:04] Youssef joined the stage
[10:05] Théo muted Youssef
[10:07] Lucía: (reply to Amina) Welcome! [hidden by the animator]
[10:31] Recording stopped (the animator stopped it)
```

Labels come from `src/Circloo.Api/Resources/transcript/{en,fr,ar,es}.json`. In Markdown, each entry is a list item with the time in a code span. Arabic exports keep the file left to right overall and isolate each name and message so mixed text reads correctly.
