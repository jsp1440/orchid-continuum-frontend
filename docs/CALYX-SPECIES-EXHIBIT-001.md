# CALYX-SPECIES-EXHIBIT-001 — Evidence-grounded species stories

## Objective

Replace the repeated genus narrative/raw media gallery with a typed consumer of the backend `calyx-species-exhibit-v1` contract. The frontend remains a presentation layer: it never invents scientific captions, distinguishing facts, confidence scores, or fallback claims.

## Implemented

- Added `src/lib/speciesExhibit.ts` as the single typed public species-exhibit client.
- Requests exactly nine cards from `/api/platform/homepage/genus/{genus}/species-exhibit?limit=9`.
- Rejects malformed responses and requires the backend safety flags `publication_authority: false` and `graph_mutation: false`.
- Deduplicates by canonical taxon ID, normalized species name, representative media URL, and non-null caption.
- Rejects non-HTTP representative media URLs rather than attempting to render them.
- Caps the public display at nine distinct cards.
- Added `SpeciesExhibit.tsx` with:
  - responsive 1/2/3-column card layout;
  - one representative image per accepted card when available;
  - accessible image-failure fallback;
  - separate italic binomial and authorship display;
  - visible evidence-state and confidence cues;
  - selected-species narrative panel that changes with card selection;
  - distinguishing fact only when supplied by the server;
  - caveats, unavailable-domain cues, contradiction count, and provenance details;
  - explicit degraded state saying species evidence is unavailable.
- Added `DailyGenusFeatureV6.tsx`, preserving the V5 Featured Genus ecology, relationship, atlas, phenology, conservation, and evidence sections while replacing the old Species Gallery block with the new governed exhibit.
- Switched the stable `DailyGenusFeature.tsx` export from V5 to V6.
- Added unit tests for duplicate identity/media/caption rejection, unsafe media URL rejection, null-caption degradation, and the nine-card cap.

## Backend dependency

The frontend implementation is paired with backend issue `jsp1440/orchid-calyx-backend#288` and its current-main implementation PR. The new backend response adds the server-owned caption/fact, representative-media, confidence, provenance, contradiction, caveat, unavailable-domain, and evidence-receipt fields required for this consumer.

If the backend is unavailable, returns no canonical species, or does not satisfy the governed contract, the frontend displays an explicit unavailable state. It does **not** fall back to the old genus narrative or static species claims.

## Governance

- No browser-side scientific scoring.
- No generated or inferred species facts in the frontend.
- No genus text reused as species narrative.
- No automatic publication or graph mutation.
- No identity-verification claim for source media.
- Failed images are removed from visual use and replaced with accessible unavailable-state UI.

## Validation

Focused tests live in `src/lib/speciesExhibit.test.ts`. Repository build/lint/test CI must pass before this PR leaves draft. External analysis failures are not treated as application failures unless they include executable code-level evidence.