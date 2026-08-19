# Orchid Continuum Frontend — Production Deployment

## Canonical source

Production deployments of the integrated Orchid Continuum application must build from:

- repository: `jsp1440/orchid-continuum-frontend`
- branch: `main`
- build command: `npm ci && npm run build`
- output directory: `dist`

A separately generated marketing site does not contain the React application routes and must not be treated as the integrated application deployment.

## Required environment

```text
VITE_CALYX_API_URL=https://<deployed-calyx-backend>
```

The value must be the externally reachable Calyx backend origin, without a trailing slash. Do not hard-code an assumed backend hostname into repository configuration.

Backend read-only University enablement:

```text
OCU_UNIVERSITY_ENABLED=true
OCU_UNIVERSITY_SESSION_WRITES_ENABLED=false
```

This exposes curated chapter and laboratory content while keeping learner session writes disabled.

## Single-page application routing

Direct navigation to routes such as `/university/lab`, `/conservatory`, and `/mission-control` must return `index.html` and allow React Router to resolve the route.

The repository contains both:

- `public/_redirects` for Netlify-compatible/static hosts;
- `vercel.json` for Vercel SPA rewrites.

Other hosts must configure the equivalent fallback:

```text
/* -> /index.html (HTTP 200 rewrite)
```

A server-generated 404 page means the host is not serving this application or the SPA fallback is missing.

## Predeployment validation

```bash
npm ci
npm run test
npm run build
npm run validate:deployment
```

The deployment validator confirms that critical React routes exist and that both supported SPA fallback contracts are present.

## Postdeployment smoke test

Verify all of the following against the deployed origin:

1. `/` returns the Orchid Continuum React application.
2. `/university` renders the University landing page.
3. `/university/lab` does not return a hosting-provider 404.
4. `/api/learning/capabilities` is reachable through the configured backend origin.
5. The University page truthfully reports enabled, disabled, or unavailable backend state.
6. Browser refresh on `/university/lab` returns the same route rather than a 404.

## Domain cutover boundary

Changing DNS, assigning `orchidcontinuum.org`, or replacing a third-party hosted site is an external deployment action. It requires access to the domain registrar or hosting provider and cannot be completed by a GitHub code merge alone.
