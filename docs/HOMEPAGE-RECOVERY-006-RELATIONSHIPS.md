# HOMEPAGE-RECOVERY-006 — Relationships / Knowledge Graph convergence

Parent: #163
Issue: #169
Base: #174

## Convergence classification

- `TheKnowledgeGraph` — SUPERSEDE on the homepage as a generic node/edge explainer; replace with taxon-linked relationship evidence.
- `ContinuumWeb` — DEEP-LINK / not remounted on the homepage.
- `DailyGenusGraphEvidence` and `DailyGenusRelationshipChips` — CONTINUE as deeper/legacy evidence surfaces; do not duplicate their state.
- `homepageFeaturedContext` — CONTINUE as the active genus/species authority.
- canonical graph-path / species-packet backend contract — BACKEND_CONTRACT_GAP for this public homepage lane until a verified, taxon-linked response contract is exposed.

## Relationship contract matrix

| Relationship | Current homepage source | Scope | Classification | Notes |
|---|---|---|---|---|
| Habitat | curated genus profile (`homepageFeaturedContext`) | genus | GENUS_LEVEL_ONLY | Never presented as species-specific when a species is selected. |
| Geography | curated genus profile + Atlas deep link | genus | GENUS_LEVEL_ONLY | Exact occurrence evidence belongs to Atlas. |
| Pollinators | no verified public taxon-linked relationship payload in this lane | genus/unknown | BACKEND_CONTRACT_GAP | Category presence is not treated as a confirmed relationship. |
| Mycorrhizal fungi | no verified public taxon-linked relationship payload in this lane | genus/unknown | BACKEND_CONTRACT_GAP | No inferred fungal partner is fabricated. |
| Neighboring orchids / co-occurrence | no verified canonical public homepage contract | genus/unknown | BACKEND_CONTRACT_GAP | Missing graph edges do not mean ecological absence. |
| Conservation context | no verified relationship payload in the current homepage contract | genus/unknown | UNAVAILABLE_WITH_HONEST_STATE | Deeper conservation pages remain available separately. |

## Public experience

The generic engineering-oriented graph is replaced with a compact relationship web tied to the active Featured Genus/species context. Every card carries an availability/scope label and caveat. Unknown or unexposed relationships remain visibly unresolved rather than becoming placeholder claims.

## Scientific semantics

- genus-level evidence is labeled genus-level;
- unavailable or unexposed data are not interpreted as biological absence;
- inferred relationships are not presented as observations;
- missing graph edges are not treated as negative evidence;
- provenance is shown when the current public context supplies it.

## Calyx handoff

`homepageRelationshipContext` exposes the active subject, relationship categories, availability, scope, evidence state, provenance, caveats, and selected relationship. Issue #170 can consume this directly without creating a second relationship state system.
