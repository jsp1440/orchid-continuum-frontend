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

Render service routing is declared in `render.yaml`; `public/_redirects` is
kept as a checked-in mirror for static-host tooling and review. Order in both
route lists matters: a specific rule placed after the `/*` catch-all never
fires. `npm run validate:deployment` checks the React routes, the Render
Blueprint, the static rewrite mirror, and ordering. It does not probe a live
deployment.

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

### What each frontend origin variable must be on Render

`render.yaml` declares no `envVars`; the production values are set in the
Render dashboard and are **not verifiable from this repository**. The table
below is what the code does with each variable, with the repository evidence,
and therefore what the dashboard must hold for the code to behave as designed.

| Variable | On Render | Evidence |
| --- | --- | --- |
| `VITE_CALYX_API_URL` | `https://orchid-calyx-backend.onrender.com` (required) | `src/lib/backendConfig.ts:19-24` (`CALYX_BACKEND_BASE_URL`, default is this origin); `src/lib/parallelPlatform.ts:119`; `src/components/conservatory/ConservatoryReadiness.tsx:5` (no default: unset means Conservatory readiness has no origin); `.env.example` "Production value" |
| `VITE_CALYX_BACKEND_BASE_URL`, `VITE_MISSION_CONTROL_BACKEND_URL` | leave unset | aliases consulted only when `VITE_CALYX_API_URL` is absent, `src/lib/backendConfig.ts:21-22` |
| `VITE_API_BASE_URL` | `https://orchid-continuum-public-api.onrender.com` (required) | `src/lib/api.ts:77` (no default; fails closed at `:150`); `src/lib/relationshipExplorer.ts:10`; second choice for `BACKEND_BASE_URL` at `src/lib/backendConfig.ts:10`; `.env.example` "Production value". `NEXT_PUBLIC_API_BASE_URL` is an alias (`src/lib/api.ts:77`) |
| `VITE_BACKEND_BASE_URL` | leave unset | first choice for `BACKEND_BASE_URL` at `src/lib/backendConfig.ts:9`, ahead of `VITE_API_BASE_URL`; not in `.env.example`. Setting it to the Calyx origin would redirect public-API consumers to the wrong service (`src/lib/ocBackend.ts:6` says not to route the public API through it) |
| `VITE_ORCHID_CONTINUUM_API_BASE_URL`, `VITE_OC_API_BASE_URL` | leave unset | overrides for `OC_BACKEND_BASE` at `src/lib/ocBackend.ts:11-15`, whose default is already the public API origin; not in `.env.example` or `src/vite-env.d.ts` |
| `VITE_CRM_SUBSCRIBE_URL` | leave unset unless the CRM moves off the Calyx backend | `src/lib/missionListSignup.ts:35-40`: complete override of the subscribe endpoint; otherwise `/api/crm/<workspace>/subscribe` is composed onto the Calyx origin |

Whether the dashboard actually holds these values is a Render-side check; the
only repository-side proof is the fail-closed behaviour above and the
`renderDeploymentContract` tests.

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
