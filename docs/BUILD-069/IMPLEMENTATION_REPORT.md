# BUILD-069 Frontend Implementation Report

## Scope

BUILD-069 adds a controlled Featured Genus consumer for the BUILD-068 Knowledge
Graph. The panel is absent unless `VITE_ENABLE_KNOWLEDGE_GRAPH=true` is supplied
at build time. This branch does not enable that flag in any environment.

## Changes

- Add a typed Calyx Knowledge Graph client bound to
  `CALYX_BACKEND_BASE_URL`.
- Request the public genus traversal at depth two with bounded pagination.
- Validate the response before presenting counts and whitelist the public
  scientific domains displayed by the panel.
- Add honest loading, not-found, unavailable, invalid-response, no-evidence,
  and truncated-response states.
- Mount the evidence panel beside the existing Featured Genus experience only
  when the feature flag is explicitly enabled.
- Add unit coverage for response normalization and a localhost graph mock for
  browser verification.

The existing curated content, media path, research links, and public page remain
unchanged when the flag is off.

## Verification

- Normalization unit tests: `3 passed`.
- Scoped ESLint: passed.
- Production-mode build with the default flag off: passed.
- Production-mode build with the flag on and a localhost-only Calyx base URL:
  passed.
- Local browser sentinel, flag off: Featured Genus rendered and the graph panel
  was absent.
- Local browser sentinel, flag on: one graph panel rendered against the mock,
  including evidence counts, explicit zero-evidence domains, partial-response
  disclosure, and the scientific-completeness caveat.

No production Knowledge Graph endpoint was called: the flag-on graph request
used the localhost mock. The flag-off page used the app's default configuration,
so unrelated existing public page reads were not intercepted. No production
write, deployment, or feature enablement was performed.
