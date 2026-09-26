# Orchid Continuum — Release 1 Acceptance

Living record of the finite Release 1 acceptance matrix. Release 1 is judged on
`oc-autonomous-integration` in both repositories. It is ready when every
required journey below is PASS (or explicitly OWNER_GATED / DEFERRED by an
owner decision) with no unresolved P0 or security/privacy blocker.

Statuses: **PASS**, **FAIL**, **OWNER_GATED** (an owner-only decision is needed
before the journey can pass), **DEFERRED** (not part of Release 1 and no
Release 1 journey depends on it).

## Evidence method and its limits

- **Harness:** the real backend (`jsp1440/orchid-calyx-backend`) runs
  locally under uvicorn with no database, no provider/model keys and no owner
  secrets. The frontend production bundle is built against it and served with
  `vite preview`, and journeys are driven in Chromium by Playwright.
  Supabase auth is a local stand-in with empty tables. Non-Calyx services
  (orchid-continuum-public-api, image library, legacy search) are pointed at a
  closed port and are therefore "unavailable".
- **What this proves:** routing, rendering, auth gating, honest empty/unavailable
  states, request paths and status codes against the real backend code.
- **What it does not prove:** production data, production deployment, or the
  external services above. Production Render hosts are not reachable from the
  build sandbox. All evidence below is labelled "local, no data" and is never
  production evidence.
- **Fixture specs:** the repository's reference-backend Playwright suite
  (fixture backend) runs in CI as a second, weaker layer of evidence.

## Tested heads

| Run | Backend integration | Frontend integration | Result |
|---|---|---|---|
| Baseline (2026-09-26) | `1d7e35d1b95637669d69e731cc35262f551d9fc3` | `8a66ef7b26eb38db53db3061dc7d80b7dadfa68f` | 10 of 14 harness specs pass |

Integration heads above include the main → integration syncs:
backend PR #1644 (merged `1d7e35d`) and frontend PR #862 (merged `8a66ef7`),
each checked independently on the exact head, with the factory gate at
`AUTO_INTEGRATE` and the landed tree identical to the checked head.

## Matrix

| # | Journey | Status | Frontend evidence | Backend evidence | PR / head / merge | Remaining blocker |
|---|---|---|---|---|---|---|
| 1 | Launch + primary navigation | FAIL (P1) | All 7 primary nav items reach the right page | — | fix in progress | Lexicon, Literature and Identification are not reachable from home navigation (`src/components/Navbar.tsx`) |
| 2 | Authentication / member | PASS (local stand-in) | Sign-up, account, sign-out, gate; bad password shows an honest error | Member reads: 4 schema-defined GETs (backend #1643) | BE #1643 → main `f6f1c04`, synced by #1644; FE #858 → main `35d6df2`, synced by #862 | Owner: set Supabase URL/anon key on Render |
| 3 | Species search + taxon pages | FAIL (P0) | Dossier and genus pages degrade honestly | Search uses orchid-continuum-public-api, not Calyx | fix in progress | A failed search request is shown as "No species matched" (`src/lib/ocBackend.ts`, `src/pages/Species.tsx`); public-api data not verifiable from the sandbox |
| 4 | Matrix identification | OWNER_GATED + FAIL (UI) | UI shows raw `Matrix API 401: …` | Registry and session routes require owner session/API key | UI fix in progress | Owner decision: is Matrix identification public, member, or owner-only in Release 1? |
| 5 | Image-based identification | DEFERRED | No visitor photo/upload identification UI | Matrix vision routes are owner-only | — | Not a Release 1 surface |
| 6 | Lexicon / Illustrated Glossary | PASS (local, no data) | Home, A–Z, search, entry, not-found; honest migration fallback | `/api/lexicon` 503 without DB | — | Phone overflow tracked under 13 |
| 7 | Literature + evidence | PASS (local, no data) | Anonymous gate; member bearer on the paper list | `GET /api/literature-extraction/papers` 200 for a member | — | Gate copy wrongly says members cannot open it (fix in progress) |
| 8 | Research Station | OWNER_GATED (projects) + FAIL (copy) | Traits read works for a member | `/api/research/traits` 200 (member); `/api/research/projects` 401 | fix in progress | Member sees "SIGN-IN REQUIRED" and a "LIVE DATA" badge with nothing loaded |
| 9 | Atlas / distribution | PASS (local, no data) | Honest zero counts, "NO DATA FOR THIS SCALE"; no coordinates rendered | Served by public-api / Supabase, not Calyx | — | Production data not verifiable from the sandbox |
| 10 | Conservation information | PASS (local, no data) | "NOT YET ASSESSED IN THE CONTINUUM RECORD"; no invented category | — | — | — |
| 11 | Calyx / Brain interactions | OWNER_GATED (Speak) | Reasoning map, homepage, capabilities render | Reasoning/capabilities 200; Speak conversations owner-only | — | Owner decision: member access to Calyx Speak |
| 12 | Contextual feedback / correction | FAIL (P0) | Lexicon/Matrix feedback shows "not accepted (not found)" | Feedback router mounted at `/evidence-feedback`, frontend calls `/api/evidence-feedback` | fix in progress | Path mismatch; then owner decision on member submission (routes are owner-only) |
| 13 | Mobile / tablet + accessibility | FAIL (phone) | Tablet 820 passes; skip link and Tab order work | — | fix in progress | 390px: lexicon header overflows by ~19px (`src/components/lexicon/SiteChrome.tsx`). axe-core not installed; accessibility checks are heuristic |
| 14 | Failure states | FAIL (P2) | Backend down, unknown route, auth failure and Supabase down show honest states; 5xx bodies never echoed | — | fix in progress | Calyx workspace shows raw `TypeError: Failed to fetch` |

## Owner decisions required

1. **Matrix identification access (journey 4).** Today every Matrix
   registry/session route is owner-only, so visitors and members cannot
   identify an orchid. Decide: public, signed-in member, or owner-only for
   Release 1.
2. **Feedback submission (journey 12).** After the path fix, feedback routes
   remain owner/API-key only. Decide whether signed-in members may submit
   corrections (this involves submitter identity handling).
3. **Research projects and Calyx Speak (journeys 8, 11).** Both stay owner-only
   unless you decide otherwise.
4. **External services (journeys 3, 9).** Species search, dossier taxonomy and
   Atlas data come from orchid-continuum-public-api and Supabase tables, which
   cannot be exercised from the build sandbox. They need a check against the
   deployed services.
5. **Deployment.** Production deploy of either repository, and the Supabase
   environment variables on the Render backend, are owner actions.

## Post-Release-1 items (recorded, not blocking)

- Primary nav items are `<button>` elements, not links.
- `/api/media/genus/{g}` and the genus-of-the-day widget return 500 instead of
  503 when the database is absent.
- A dossier for an unknown taxon renders an empty shell titled with the
  requested name instead of an "unknown taxon" state.
- Research Center query builder is a placeholder.
- Local-Postgres harness mode (for richer data paths) is not provisioned.
- Matrix fixture specs override the owner-auth check, so they cannot catch
  access regressions; the local harness does.
