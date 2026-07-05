# BUILD-039 — Homepage Triage: Images, Layout, Public Copy

## Objective

Repair the homepage experience before adding more features. This build follows the new `docs/trackers/LIVING_HOMEPAGE_MASTER_BACKLOG.md` tracker and reports work by tracker IDs.

## Implemented

### Image resolver hardening

Updated:

- `src/lib/publicImageSource.ts`

Tracker items advanced:

- A1 — Featured Genus image pipeline
- D1 — frontend image parsing/filtering
- D2 — backend image endpoint audit
- D3 — trusted backend image URLs
- D6 — fallback behavior

The public Featured Genus resolver now tries the approved Orchid Continuum image endpoint first, then falls back to the existing `fetchGenusImagesWithSource` pipeline. That secondary resolver already supports local cache, shared server cache/proxy, the Render harvester, and a guarded Plantae-only fallback. This should reduce unnecessary `IMAGE PENDING` cards when the direct endpoint is cold, empty, or blocked by CORS.

### Featured Genus layout compression

Updated:

- `src/components/orchid/DailyGenusFeatureV5.tsx`

Tracker items advanced:

- A4 — one-viewport section integrity
- E1/E3/E5 — reduce repetition and shorten copy
- M5/M6 — reduce padding/card height and move secondary detail out of long panels

The wrapper around the working V4 Featured Genus engine has been compressed. Discovery Trails are shorter, relationship chips are tighter, and the section now behaves more like a compact doorway into the genus rather than a second manifesto.

### Public Calyx copy revision

Updated:

- `src/components/orchid/PublicCalyxGuide.tsx`

Tracker items advanced:

- A3 — remove instruction-like copy
- K1/K2 — Calyx as quiet public guide

The Calyx section was rewritten to sound less like internal documentation and more like a museum/research guide. It is shorter, less instructional, and preserves the idea that Calyx is available without interrupting visitors.

## Known limitations / deferred work

This build does not yet complete:

- A2/B1/B2 — full hero redesign with orchid image above the fold.
- A5/L2 — Mission Control access explanation in-page.
- M1–M4 — verified desktop/iPad/iPhone responsive review. Code was tightened, but post-deploy verification is still required.
- F2 — knowledge graph label overlap.
- J1/J2 — homepage Atlas simplification.

## Deployment

Frontend deployment required after merge. Backend deployment is not required for this build.

## Review instructions

After deploy, review with the tracker first:

1. Confirm whether Featured Genus images now load.
2. Confirm whether Calyx copy no longer reads like instructions.
3. Confirm whether Discovery Trails/Featured Genus section feels shorter.
4. Mark tracker items as verified, needs revision, or still blocked.
