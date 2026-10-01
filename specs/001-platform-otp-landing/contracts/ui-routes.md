# UI routes: 001

| Route | Access | Screen |
|---|---|---|
| `/` | public. Signed-in users are redirected to `/app` | Landing: hero, three jobs, icebreaker teaser (Shuffle), integrations teaser ("coming soon"), how-it-works, final CTA, footer with language switcher |
| `/signin?returnTo=/app/...` | public | Step 1: email. Step 2: 6-digit code (autocomplete `one-time-code`, paste-friendly, resend after 30 s) |
| `/app/welcome` | auth | Profile completion: display name and language (forced when `profileCompleted=false`) |
| `/app` | auth + profile | Home: greeting, "coming next" modules (Icebreakers first), session menu (sign out, sign out everywhere) |
| `/app/settings` | auth + profile | Name, language, sign-out everywhere |
| `*` | public | Playful 404 in all 4 languages |

## State ownership
- `useUiStore` (Zustand, persisted to localStorage): `locale`, derived `dir`.
- `useSignInStore` (Zustand, sessionStorage): `step: "email"|"code"`, `email`, `resendAvailableAt`, `returnTo`.
- TanStack Query: `["me"]` (`staleTime` 60 s, a 401 maps to `null`), `["spark", lang]`.
- Guards: `<RequireAuth>` reads `["me"]`. It sends the user to `/signin?returnTo=` when `me` is null, and to `/app/welcome` when the profile is incomplete.
