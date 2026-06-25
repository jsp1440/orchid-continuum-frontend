# FRONTEND-R1 — Orchid Continuum Release Readiness Sprint

## Purpose

Prepare the Orchid Continuum frontend for a v0.1 Preview Release by consolidating existing work, wiring release-priority pages to live backend data, and hiding or clearly marking unfinished prototype modules.

This is a consolidation sprint, not a feature sprint.

## Source audit findings

The engineering audit identified the frontend as a substantial Vite/React/TypeScript application with broad page and component coverage, but thin backend wiring relative to the size of the interface.

Key findings from the audit:

| Metric | Value |
| --- | ---: |
| Total files | 245 |
| Source files | 226 |
| Components | 144 |
| Pages | 39 |
| Hooks | 6 |
| Contexts | 8 |
| Utilities | 28 |
| Routes | 47 |
| Visible backend calls in audit | 3 |
| Placeholder / TODO markers | 397 |
| Orphaned source files | 160 |

## Release-priority pages

Only these pages should be treated as v0.1 Preview Release priorities:

1. Homepage
2. Genus of the Day
3. Species Search
4. Species Detail
5. Atlas
6. Research Station Landing Page

All other prototype or partial modules should either be hidden from primary navigation or clearly marked as under active development.

## Current repo observations

Initial inspection confirms the non-v2 repository is the broad active surface:

- `src/App.tsx` contains the major route map including homepage, species, genus detail, atlas, admin, diagnostics, pollinators, mycorrhizae, gallery, climate, knowledge graph, relationship explorer, collection, research, OACS, education, partners, conservation, societies, university, classroom, organizations, and projects.
- `src/components/AppLayout.tsx` orchestrates the homepage sections, including hero, knowledge graph, habitat cards, Genus of the Day, gallery, atlas, Continuum Web, capability grid, stewardship, and news.
- `src/lib/api.ts` already contains a typed API client with timeout-safe requests and species API wrappers.
- `src/lib/backendConfig.ts` already defines backend host configuration for the public API, image backend, legacy backend, Ecuador embed, and atlas URLs.
- `src/lib/ocBackend.ts` already contains several live Orchid Continuum API wrappers for daily genus, atlas occurrences, species search, species detail, mycorrhizal data, stats, and Continuum graph.
- `src/lib/endpointAudit.ts` already probes several endpoints and drives backend status diagnostics.

## R1-A integration decision

Do not create a second competing low-level API client. Instead, R1-A adds `src/lib/releaseApi.ts` as a release-facing facade that reuses the existing clients and gives v0.1 pages one stable import surface.

`releaseApi.ts` currently provides wrappers for:

- daily genus
- genus count
- atlas occurrences
- atlas stats
- species search
- species detail
- species literature
- species occurrences
- mycorrhizal partners
- mycorrhizal stats
- literature stats
- runner summary
- bundled homepage release data

This lets the release pages move toward one coherent integration layer without immediately rewriting every existing module.

## Immediate engineering direction

1. Use `src/lib/releaseEndpointMap.ts` as the declarative checklist for v0.1 endpoint coverage.
2. Use `src/lib/releaseApi.ts` as the release-facing data facade.
3. Gradually migrate release-priority pages to `releaseApi.ts` where that improves clarity.
4. Keep `api.ts`, `ocBackend.ts`, `backendConfig.ts`, and `endpointAudit.ts` intact until each caller is accounted for.
5. Add loading, empty, fallback, and error states for every release-priority page.
6. Move prototype modules out of main release navigation unless they are stable enough for preview use.

## Release endpoint status categories

`src/lib/releaseEndpointMap.ts` classifies endpoints as:

- `live-wired` — already appears connected to frontend code.
- `available-needs-wiring` — backend path appears known or partially used, but needs explicit release-page wiring.
- `needs-backend-confirmation` — required by the release page, but endpoint path/payload must be verified.
- `prototype-or-fallback` — useful for demos, not release-critical.

## First release blockers

1. Confirm which backend origin is canonical for v0.1 production.
2. Confirm payload shape for `/api/atlas/stats`.
3. Confirm whether `/api/literature/stats` exists.
4. Confirm whether `/api/runner/summary` exists and is safe for public release.
5. Decide whether prototype routes such as pollinators, mycorrhizae, climate, relationship explorer, and admin should remain visible, move behind auth, or become Coming Soon.
6. Triage orphan source files before deleting anything.
7. Triage TODO/placeholders into release blockers versus future backlog.

## Non-goals

- No new modules.
- No broad redesign.
- No deletion of orphan files without a second review.
- No change to production routing without confirming the active deployment target.

## Recommended next PRs

1. **R1-A: Endpoint consolidation** — normalize backend host usage and endpoint wrappers.
2. **R1-B: Homepage live data pass** — ensure daily genus, images, atlas stats, literature stats, and research callout are live or transparently unavailable.
3. **R1-C: Route visibility pass** — mark non-release modules as Coming Soon or hide them from primary navigation.
4. **R1-D: Orphan/TODO triage** — generate CSVs and classify source files and in-progress markers.
5. **R1-E: Accessibility/loading states** — release polish on the six priority pages.
