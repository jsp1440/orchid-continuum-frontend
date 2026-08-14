# HOMEPAGE-RECOVERY-004 — Thematic homepage Atlas

Parent: #163
Issue: #167
Base: #173 / shared Featured Genus context
Validation gate: focused tests, production build, and lint must pass on the final head before integrated review.

## Convergence classification

- PR #161 Atlas prefix fix — CONVERGE / ALREADY_DONE. This lane consumes the corrected canonical `/api/atlas/occurrences` path and does not recreate that repair.
- legacy `HomeAtlas` GIS control panel — SUPERSEDE on the homepage only. The full Atlas workspace remains the home for dense filters and research controls.
- direct Supabase `orchidContinuum.ts` homepage load path — SUPERSEDE for the public homepage Atlas. It remains available to deeper workspaces until separately converged.
- Leaflet/CARTO basemap implementation — CONTINUE. It is retained because it is accessible, performant on mobile/iPad, attribution-capable, maintainable, and already integrated.
- 3D globe — INTENTIONALLY_DEFERRED. No 3D dependency is added merely for novelty.

## Data-path decision

The homepage Atlas now uses a small `homepageAtlasData` adapter against the canonical public endpoint established by PR #161:

`GET /api/atlas/occurrences?genus={genus}&limit=1200`

This was chosen over direct Supabase access for the public homepage because it provides:

- one public backend contract;
- simpler provenance and deployment boundaries;
- no browser-side dependency on private table structure;
- explicit transport status handling;
- compatibility with the shared Featured Genus context;
- easier future backend caching and contract evolution.

The adapter deliberately distinguishes:

- `ok`: valid georeferenced rows were returned;
- `empty`: the service responded successfully but returned no valid occurrence rows;
- `error`: transport failure or non-2xx backend response.

A backend error is never rendered as biological absence.

## Thematic experience — first functional slice

The homepage now presents six public themes:

1. Where it lives
2. Habitat & elevation
3. Climate
4. Relationships
5. Flowering through time
6. Conservation & gaps

Only themes supported by the current response/context are enabled. Unsupported themes are visibly marked `Not yet`; no placeholder layer is fabricated.

The first fully spatial slice is occurrence/distribution. Habitat/elevation and relationship evidence may be described when evidence exists, but the UI explicitly states when that evidence is contextual rather than a complete spatial layer.

## Scientific semantics

- occurrence points are evidence of documented observations/specimens, not population abundance;
- missing points do not establish biological absence;
- species-level mapping is used when exact species records exist in the current response;
- if exact species records are absent but genus records exist, the map explicitly says it is showing genus-level evidence instead;
- occurrence year is not treated as flowering date;
- text habitat/elevation metadata is not presented as a spatial raster;
- pollinator/mycorrhizal relationships are not presented as geographic overlap unless a spatial overlap contract exists.

## Earth/globe decision

This slice keeps the existing Leaflet + CARTO/OSM basemap rather than adding a 3D globe dependency. That is an implementation decision, not a permanent visual prohibition. A globe can be revisited when it can demonstrably meet iPad/mobile performance, accessibility, attribution, thematic-layer, and maintainability requirements better than the current 2D/2.5D approach.

## Handoff

- #169 can consume the shared active genus/species context and relationship availability without creating a second state system.
- #170 can consume active genus/species plus the selected Atlas theme once that context handoff is added.
- #171 must validate the assembled page in deployed desktop, iPad, and iPhone views.
