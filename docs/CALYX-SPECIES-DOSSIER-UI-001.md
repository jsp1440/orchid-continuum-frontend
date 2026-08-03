# Calyx Species Dossier UI 001

Status: implementation contract
Backend dependency: `CALYX_SPECIES_DOSSIER_API_V1`
Brain dependency: `CALYX_FEDERATED_SPECIES_DOSSIER_V1`

## Routes

- `/species/:taxonId`
- `/species/:taxonId/atlas`
- `/federation/resolve`

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

## Degraded behavior

Unavailable sections display an evidence-unavailable state. Generic genus narratives must never substitute for missing species evidence.

## Safety

The frontend does not calculate scientific confidence, infer partner permissions, publish knowledge, mutate the graph, or authorize deployment.
