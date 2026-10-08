# REST contract: live discussion, group calls (spec 009)

**Amended 2026-10-08.** The ICE endpoint and the transcript endpoints are removed. Two endpoints are added: the call pass and the call server's webhook.

Endpoints in `src/Circloo.Api/Discussion/CallEndpoints.cs`, mapped next to the circle endpoints. Browser endpoints use the existing session or guest cookie, and unsafe methods need the CSRF header like everything else. Errors never carry internal detail.

## Circle view additions (`GET /api/circles/{id}`)

- `discussion: { on, videoAllowed, speaking, available }`. The live parts (`away`, the roster) come through the hub.
- `messages[].replyToId` (number or null).
- **Removed**: `recording`.

## Call pass

`POST /api/circles/{id}/call/token`: any current member of an open circle while the call is on. No body.

- Checks, in order: member of the circle (404 otherwise); circle open; call on (409 `call-off`); call server configured (503 `calls-unavailable`); not removed from this call (403 `removed-from-call`); rate limit `call-token`, 10 per minute per member (429 with `Retry-After`).
- Ensures the LiveKit room exists (`CreateRoom`, idempotent, with `max_participants` = `Circles:MaxPeople`), then mints the pass (research R20) with the permissions of research R22.
- 200:

  ```json
  {
    "url": "wss://lk-abc123.francecentral.cloudapp.azure.com",
    "token": "<jwt>",
    "identity": "<memberId>",
    "expiresAt": "2026-10-08T10:05:00Z",
    "canSpeak": true,
    "canVideo": false
  }
  ```

  `canSpeak` and `canVideo` mirror the pass so the interface can draw the right buttons before connecting. They are informative: the call server enforces the pass, and later changes arrive as permission updates on the call server.
- The audience screen (the animator's own projector window) never calls this endpoint; it cannot be told apart by cookie, so this is a client rule (FR-934), tested in e2e.
- Headers: `Cache-Control: no-store`. The token is never logged; the request is logged without its response body.
- Why POST: it issues a credential, so it is not cacheable and it carries the CSRF check.

## Call server webhook

`POST /api/livekit/webhook`: called by the call server only. Anonymous for the cookie scheme and exempt from the CSRF check, because its own signature is the authentication.

- `Content-Type: application/webhook+json`, body at most 64 KB (413 otherwise).
- `Authorization`: a JWT signed with HS256 by `LiveKit:ApiSecret`, `iss` = `LiveKit:ApiKey`, not expired, with a `sha256` claim equal to the Base64 SHA-256 of the raw body. Anything else: 401, no detail, and a warning log without the body.
- Handled events: `participant_joined` (enforce removal, membership, circle open and call on; otherwise add to the roster), `participant_left` and `room_finished` (roster). Every other event: 200 and ignored.
- Rate limit by source address: 600 per minute (the call server is the only legitimate caller).
- Answers 200 quickly; enforcement calls to the call server run in the background with their own timeout.

## Removed on 2026-10-08

- `GET /api/circles/{id}/discussion/ice` (never shipped on the server; the client helper is deleted by T924).
- `GET /api/circles/{id}/recordings`, `GET .../recordings/{recordingId}`, `GET .../export`, `DELETE .../recordings/{recordingId}` (never shipped).
