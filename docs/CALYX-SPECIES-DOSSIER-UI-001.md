# Calyx Species Dossier UI 001

Status: implementation in progress
Backend dependency: `CALYX_SPECIES_DOSSIER_API_V1`
Brain dependency: `CALYX_FEDERATED_SPECIES_DOSSIER_V1`

## Routes

- `/species/:taxonId`
- `/species/:taxonId/atlas`
- `/federation/resolve`

## Executable client

`src/lib/speciesDossier.ts` now defines and consumes:

- `oc-species-dossier-v1`
- `oc-species-atlas-v1`
- federation resolution results
- evidence receipts and evidence states
- partner references and permission dimensions

It calls the governed backend routes and preserves unavailable states. It does not calculate confidence, infer partner permissions, create scientific claims, or substitute genus text for missing species evidence.

## Dossier presentation

The canonical dossier page renders server-owned evidence and narratives in this order:

1. identity and accepted name
2. nomenclatural history and protologue
3. type material and earliest documentary evidence
4. historical plates, sketches, specimens, and photographs
5. modern living media
6. morphology and diagnostic traits
7. Atlas and distribution
8. ecology, phenology, pollinators, and fungi
9. conservation and literature
10. Identification Matrix and related species
11. Calyx interpretation and research gaps
12. external partners, provenance, and freshness

Historical documentary media must remain visually and semantically distinct from living photographs.

## Atlas presentation

The Atlas route renders backend-owned layers only. Layer controls expose:

- observed occurrences
- countries and regions
- elevation
- flowering time
- habitat/ecoregions
- climate
- pollinator evidence/routes where supported
- fungi
- protected areas
- threats/conservation
- dated historical records
- modeled or inferred historical range where labeled

Each map feature opens an evidence receipt. Evidence states are visible as `available`, `provisional`, `conflicting`, `modeled`, `inferred`, or `unavailable`.

## Federation entry

The adaptive resolver accepts partner, name, synonym, slug, source URL, or taxon ID and delegates resolution to the backend. It does not parse scientific identity independently in the browser.

Resolved pages show reciprocal attribution and a return link to the partner source. No permission to quote, display images, index content, or extract traits is inferred from the existence of a link.

## Featured Genus integration

Every species card links by canonical `taxon_id` to `/species/:taxonId`. No card may link by an unverified display label alone.

## Matrix integration

The dossier provides an `Open in Identification Matrix` action using the backend-supplied Matrix handoff and preloaded canonical taxon.

## Next implementation

1. Register the canonical routes.
2. Add dossier and Atlas page shells.
3. Add resolved, ambiguous, unresolved, and invalid federation entry states.
4. Connect Featured Genus cards after the species-exhibit endpoint is operational.
5. Add responsive and accessibility regression coverage.

## Safety

The frontend does not calculate scientific confidence, infer partner permissions, publish knowledge, mutate the graph, or authorize deployment.
