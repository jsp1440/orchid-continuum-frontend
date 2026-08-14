# HOMEPAGE-RECOVERY-003 — Featured Genus shared context

Parent: #163
Issue: #166
Base implementation: #172
Validation gate: frontend tests, production build, and lint must pass on the final head before this lane is considered ready for integrated review.

## Convergence classification

- `dailyGenusContext` — CONTINUE. It remains the authority for the stable genus cadence.
- `genusMediaResolver` — CONVERGE. It remains the sole Featured Genus media request path and now shares concurrent requests/results across homepage consumers.
- `HomeHero` — CONVERGE onto the shared Featured Genus context instead of fetching media independently.
- `DailyGenusFeatureV5` — CONTINUE temporarily. Its existing call to `genusMediaResolver` now collapses onto the same cached request instead of causing a second network fetch.
- PR #86 / `DailyGenusFeatureV6` / Species Exhibit — CONTINUE + CONVERGE, not abandon. Its evidence-grounded species packet validation remains the preferred species-card lineage. This Wave 2 slice does not duplicate its 1,000+ lines of already-validated exhibit code.
- `heroSpeciesContext` — CONTINUE for compatibility only; `homepageFeaturedContext` is the new homepage-wide shared genus/species/media interface for #166/#167/#169/#170.

## `/api/homepage/genus/{genus}` decision

PR #161 established that a working cacheable composite endpoint exists, but the exact current response schema could not be verified from the accessible frontend/backend source in this implementation pass. The frontend therefore does **not** promote or consume fields from that endpoint by assumption.

Decision: **INTENTIONALLY_DEFERRED as the canonical Featured Genus composite until its exact response contract is verified.**

Current safe data paths remain:

- stable genus identity: `dailyGenusContext`;
- approved Featured Genus media: Calyx `/api/media/genus/{genus}` via `genusMediaResolver`;
- existing curated genus ecology/range profile: `lookupGenus()` / `featuredGenusEntry()`;
- Atlas occurrence geography: canonical public API path owned by #167 / PR #161.

Once the composite endpoint schema is verified, #166 may replace these fragmented reads only for fields the contract demonstrably supplies. Missing fields must remain missing; the frontend must not infer them.

## Shared context surface

`homepageFeaturedContext` exposes:

- genus;
- active species;
- taxon id where supplied by approved media;
- active approved media record;
- media list;
- attribution/license/source;
- region/habitat/elevation summaries from the existing curated genus profile;
- explicit climate placeholder (`null`, not invented);
- occurrence/relationship availability states;
- provenance state;
- loading / no-media / backend-error states;
- controlled `selectSpecies()` limited to species actually present in approved media.

## Failure semantics

- `no_media` means the approved-media contract returned no approved item or invalid genus.
- `error` means the media service failed; it must not be displayed as biological or collection absence.
- no external iNaturalist fallback is introduced.
- no AI-generated image path is introduced.
- duplicate image URLs continue to be rejected by `genusMediaResolver`.

## PR #86 preservation

PR #86 is not superseded. Its Species Exhibit remains a validated candidate for the species-card layer. A later convergence commit should transplant/rebase that implementation onto the current homepage lineage rather than recreating its governance validation from scratch.
