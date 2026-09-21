# Orchid Continuum — frontend

React + TypeScript + Vite single-page application.

## Deployment

**Render is the sole production deployment target.** There is no Vercel,
Netlify, or other hosting configuration in this repository, and none should be
added without changing this document first.

| Service | Render origin |
| --- | --- |
| Frontend (this repo) | `https://orchid-continuum-frontend-vof6.onrender.com` |
| Calyx backend | `https://orchid-calyx-backend.onrender.com` |
| Public API | `https://orchid-continuum-public-api.onrender.com` |

Routing on Render is defined entirely by `public/_redirects`. Order in that
file matters: a specific rule placed after the `/*` catch-all never fires.
`npm run validate:deployment` checks the routes, the static rewrites, and that
ordering, as a static-file check. It does not probe a live deployment.

### The SPA fallback, and why it matters to API clients

`public/_redirects` ends with `/* /index.html 200`. Any path Render does not
recognise therefore returns **the app shell with status 200**.

That makes a relative API path actively dangerous: `fetch('/api/…')` resolves
successfully, with HTML. Code that only checks for a thrown error, or only
checks `response.ok`, will treat that as a successful API call. A signup form
did exactly this and silently discarded every address it collected.

Two rules follow, and both are enforced in code:

1. **Every API client uses an absolute origin.** `src/lib/backendConfig.ts` is
   the single source of truth for backend origins.
2. **A 200 is not an answer unless it is JSON.** `apiRequest` in
   `src/lib/api.ts` rejects a non-JSON content type rather than parsing it, and
   `submitMissionListSignup` does the same.

## Environment variables

Copy `.env.example` and fill it in. Every variable is public: this is a browser
bundle, so a value here is readable by anyone who loads the site. Never put a
secret, a service-role key, or an `sk-` token in one.

Two backend origins are configured separately because they are two Render
services:

| Variable | Must be set to | Consumed by |
| --- | --- | --- |
| `VITE_CALYX_API_URL` | `https://orchid-calyx-backend.onrender.com` | Mission Control, University, reviewer traffic, Lexicon, Matrix, signup delivery |
| `VITE_API_BASE_URL` | `https://orchid-continuum-public-api.onrender.com` | `src/lib/api.ts` — species, Atlas, Zoo, OACS, genus and search surfaces |

**Both are required in production.** They are not interchangeable and neither
one substitutes for the other.

Setting only `VITE_CALYX_API_URL` produces a partial, silent outage: Mission
Control and the University work, while `/widgets`, `/zoo`, `/oacs`, the Applied
AI lab's Atlas panel and the scientific-observability review queue all render
as unavailable. Nothing errors, which makes it hard to diagnose.

`VITE_API_BASE_URL` must be an **absolute `http(s)` origin**. A relative or
malformed value is rejected at startup and treated as unconfigured, with a
console warning, because a relative base would resolve every API call to the
SPA shell described above. `NEXT_PUBLIC_API_BASE_URL` is accepted as an alias.

## Development

```
npm ci
npm run dev
```

## Checks

```
npm test                    # vitest
npm run typecheck           # tsc --noEmit
npm run lint                # eslint
npm run build               # vite build
npm run validate:deployment # Render routing contract
```
