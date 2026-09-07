# Knowledge Graph route/naming contract

Parent: `jsp1440/Orchid-Continuum-Brain#96`. Resolves the naming/architecture
conflict recorded against `cap-kg-visualization-graph` in
`src/lib/completion-graph/completionGraphData.ts`.

## Conflict this contract resolves

Two unrelated implementations were both reachable under the "Knowledge Graph"
name:

1. `fetchGenusGraphEvidence()` (`src/lib/knowledgeGraph.ts`) — a real,
   backend-integrated capability. It calls
   `GET /api/knowledge-graph/genus/:genus` and returns genus-scoped domain and
   ecological-domain coverage counts, failing closed to `unavailable` /
   `not_found` / `invalid` rather than fabricating evidence. Consumed by
   `GenusDetail.tsx` and `DailyGenusGraphEvidence.tsx`.
2. `fetchIntelligenceGraph()` (`src/lib/orchidContinuum.ts`) — a client-derived
   aggregate node-link rollup assembled in the browser from
   `loadSpeciesRows`/`loadAtlasRows`/`loadMycorrhizalRows`, already loaded
   elsewhere. It never calls a knowledge-graph backend endpoint. Rendered by
   `src/pages/IntelligenceGraph.tsx`, routed at both `/intelligence-graph` and
   `/knowledge`.

These two capabilities have incompatible shapes: (1) is genus-scoped
domain-coverage evidence for a single genus; (2) is a whole-database,
multi-kind relationship graph with no genus scope. Presenting (2) under the
"Knowledge Graph" brand implied it was, or would become, the same capability
as (1).

## Canonical decision

"Knowledge Graph" (as a proper-noun capability name) is reserved exclusively
for the backend-integrated, genus-scoped evidence capability
(`fetchGenusGraphEvidence` / `GET /api/knowledge-graph/genus/:genus`) and its
existing "Knowledge Graph Evidence" surfaces on genus pages.

The routes `/intelligence-graph` and `/knowledge` continue to serve
`IntelligenceGraph.tsx`'s client-derived aggregate relationship visualization,
under the distinct name **Intelligence Graph**. This capability must not be
labeled "Knowledge Graph" in UI copy, navigation labels, or route naming going
forward. `Footer.tsx` now links this route as "Intelligence Graph" (it
previously read "Knowledge Graph").

No route rename or removal was required: `/intelligence-graph` was already
the canonical route for this page; `/knowledge` remains a live alias for it
(existing internal links and tests depend on the `/knowledge` path existing),
but no UI copy may re-attach the "Knowledge Graph" name to it.

## Scientific/locality safeguard preserved

`fetchIntelligenceGraph()` was re-read for this contract: its `GraphNode`/
`GraphEdge` output carries species/genus identity, habitat/biome label, IUCN
code, country name, pollinator/mycorrhiza taxon — categorical, already-public
fields. It does not include raw coordinates, exact locality strings, or
occurrence/project identifiers. No change was required to satisfy the
locality/coordinate safeguard; this contract only records that the check was
made.

## What would violate this contract

- Labeling `/knowledge`, `/intelligence-graph`, or `IntelligenceGraph.tsx` as
  "Knowledge Graph" in user-facing copy.
- Making `fetchIntelligenceGraph()` call `/api/knowledge-graph/*` without
  updating this contract to describe the merged shape.
- Adding coordinates, exact locality strings, or occurrence/project
  identifiers to `GraphNode`/`GraphEdge`.

## Verification

`src/lib/knowledgeGraphNamingContract.test.ts` asserts the naming split holds:
`Footer.tsx` does not label the `/knowledge` route "Knowledge Graph",
`IntelligenceGraph.tsx` does not brand itself "Knowledge Graph", and the two
data-fetch functions remain on their respective backend/client-derived sides.
