# Original homepage reconstruction

Recovered from `jsp1440/orchid-continuum-frontend` commit `93f2e30f68740b6bdff0ebc20bbf0dfd7a15aaeb` (June 6, 2026 in America/Los_Angeles).

Purpose: owner review of the earliest homepage in this frontend repository before choosing a restoration or redesign. This is a historical source snapshot, not a production integration branch. Do not merge this branch into main: it would revert later engineering work.

The original composition, typography, components and copy are retained. Preview changes: prominent historical-data notice; disabled data requests, submissions, embeds and payment scripts; memory routing for a downloadable preview; original hero logo stored locally as WebP; terminal.local development host allowed; historical npm lockfile repaired for current npm.

No scientific values, coverage claims, institutional statements or capabilities shown by the historical UI have been recertified. The original source contains reference-data fallbacks and live-status labels that are not reliable operational evidence. No production services are contacted by the preview's fetch wrapper. Offline API sections show their original fallback or empty states, so this is not a replay of historical live data.

## Run

`npm ci --ignore-scripts --no-audit --no-fund`

`npm run dev`

`npm run build`

## Integration assessment

The five owner uploads use React 19/TanStack Start; current frontend main uses React 18/React Router. Across 277 non-boilerplate TypeScript/TSX/CSS files, excluding shared UI primitives and generated route trees, no complete file hashes matched main. This establishes no unchanged source-file copies in that sample, not absence of adapted implementations.

Current frontend already exposes Atlas, governed Matrix identification, Conservatory and Calyx routes. Do not create parallel replacements without checking these implementations and active PR ownership. Separate repositories include orchid-continuum-core (matching Field Station context source confirmed) and orchid-conservatory (upload equivalence unconfirmed).

Next: owner chooses original design elements to preserve; implement the chosen presentation on a fresh branch based on current main, reuse working module connections, and verify desktop/iPad layouts, navigation, attribution and empty/error states. Retain Render hosting and existing scientific/privacy/provider gates.

## Verification

Production Vite build passed. Whole historical-source typecheck reports six existing errors in ExploreThreeWays, FeaturedSystems, GenusOccurrenceMap, PortalGrid, ThreePillars and ConservationHub. These do not prevent Vite from building the preview; they must not be treated as a production readiness pass.
