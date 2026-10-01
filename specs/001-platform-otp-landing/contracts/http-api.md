# HTTP API contract: 001

Base path `/api`. JSON uses camelCase. Errors are RFC 9457 `application/problem+json` with no internal detail. Every unsafe method (POST/PUT/PATCH/DELETE) requires the header `X-XSRF-TOKEN` to match the `XSRF-TOKEN` cookie. If it doesn't, the API returns **400 `antiforgery`**.

## Session bootstrap
### `GET /api/auth/csrf` → 204
Sets the `XSRF-TOKEN` cookie (not HttpOnly, SameSite=Strict, Secure). The SPA calls it on boot and again after every sign-in or sign-out.

### `GET /api/me`
- 200 `{ id, email, displayName: string|null, locale: "en"|"fr"|"ar"|"es", profileCompleted: boolean }`
- 401 when there is no valid session.

## One-time code
### `POST /api/auth/otp/request`
Request `{ email: string, locale: "en"|"fr"|"ar"|"es" }`
- **202** `{ status: "sent", resendAfterSeconds: 30 }`. The response is the same whether or not an account exists, and also when the per-email limit is hit (the code is silently not sent, the event is audited and the UI still shows the neutral message).
- **400** `invalid-email` when the address fails syntax validation.
- **429** with a `Retry-After` header when the per-IP limit (20/h) is hit.

### `POST /api/auth/otp/verify`
Request `{ email: string, code: string }`. The code is normalized by removing whitespace and `-`, then it must match `^\d{6}$`.
- **200** `{ me: <Me>, isNewUser: boolean }` and sets the `__Host-circloo` auth cookie (HttpOnly, Secure, SameSite=Lax, Path=/).
- **400** `{ type: "invalid-code" }` for a wrong, expired, consumed, superseded or exhausted code, or an unknown email. A single generic error covers all of these. The UI offers "send a new code".
- **429** when the per-IP verify limit (30/10 min) is hit.

### `POST /api/auth/signout` → 204
Revokes the current session and clears the cookie.

### `POST /api/auth/signout-everywhere` → 204 (auth required)
Revokes every session of the user, including the current one.

## Profile
### `PUT /api/me/profile` (auth required)
Request `{ displayName: string (1–40 after trim), locale: "en"|"fr"|"ar"|"es" }`
- 200 `<Me>`
- 400 validation problem with `errors.displayName` / `errors.locale`.

## Public content
### `GET /api/public/sparks/random?lang=en&exclude=<id>`
- 200 `{ id: string, lang, kind: "icebreaker"|"would-you-rather", text }`. Only sparks with the `kids-safe` tag and kind icebreaker or would-you-rather are returned on the public page.
- 400 when the language is unsupported.

## Ops
`GET /health` (readiness) and `GET /alive` (liveness) come from ServiceDefaults. They are mapped in every environment and return no detail.

## Security headers (every response)
`Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`
`X-Content-Type-Options: nosniff` · `Referrer-Policy: strict-origin-when-cross-origin` · `X-Frame-Options: DENY` · `Permissions-Policy: camera=(), microphone=(), geolocation=()` · `Cross-Origin-Opener-Policy: same-origin` · HSTS (`max-age=31536000; includeSubDomains`) outside Development.
