# HOMEPAGE-RECOVERY-001 — Design Convergence

Status: design authority candidate / implementation fan-out blocked until accepted by issue #163

## Source authority

This document converges, rather than replaces:

- `docs/architecture/Living_Homepage_Philosophy.md`
- `docs/architecture/Homepage_Viewport_Rules.md`
- `docs/trackers/LIVING_HOMEPAGE_MASTER_BACKLOG.md`
- current `src/components/AppLayout.tsx`
- current homepage component implementations
- issue #163

## Current-main audit

Current `AppLayout.tsx` renders the public page in this order:

1. HomeHero
2. WhyContinuumExists
3. DailyGenusFeature
4. TheKnowledgeGraph
5. PublicCalyxGuide
6. HabitatCards
7. HomeAtlas
8. ContinuumWeb
9. CapabilityGrid
10. OrchidGallery
11. WhyOrchidsMatter
12. HumanStewardship
13. NewsFromContinuum
14. Footer

This is too long and contains several overlapping explanations of the same idea. The page currently behaves more like a sequence of modules than a guided public story.

### Section dispositions

| Current section | Disposition | Reason |
|---|---|---|
| HomeHero | REWRITE | Keep the opening, but the orchid should be the dominant hero. Reduce competing CTAs and institutional/product language. |
| WhyContinuumExists | MERGE / MOVE | The public need should be explained later, after visitors have seen the orchid and its relationships. Remove product/platform proof blocks from the public tour. |
| DailyGenusFeature | KEEP + REBUILD | Make this the living narrative anchor. Repair images and synchronize species/genus context with relationships, Atlas, and Calyx. |
| TheKnowledgeGraph | KEEP + REWRITE | Present as an explorable relationship story, not a technical graph demonstration. |
| PublicCalyxGuide | MERGE | Calyx should be contextual and native across the experience rather than a standalone instructional block. |
| HabitatCards | DEEP-LINK / MERGE | Habitat becomes a thematic relationship/Atlas layer; large generic card grids move deeper. |
| HomeAtlas | REBUILD | Replace GIS-control-panel behavior with a thematic Earth experience. |
| ContinuumWeb | MERGE | Overlaps with relationship/knowledge-graph explanation. Preserve useful visual concepts but avoid a second relationship section. |
| CapabilityGrid / Identification Matrix | PREVIEW + DEEP-LINK | One concise discovery-tool invitation, not a long module exposition. |
| OrchidGallery | MERGE / DEEP-LINK | Featured Genus already carries the primary visual story. Keep only if it creates a distinct reason to explore. |
| WhyOrchidsMatter | MERGE | Conservation meaning belongs after exploration, in one concise section. |
| HumanStewardship | MERGE | Combine with conservation/participation. |
| NewsFromContinuum | DEEP-LINK / COMPACT | Small return-value strip or footer pathway, not another major full-height section. |
| Footer | KEEP + QUIET | Institutional, governance, Mission Control, partners, API, research, and other deep pathways belong here. |

## Canonical public flow

### 1. WONDER — living orchid hero

Purpose: create immediate visual and emotional engagement.

- Featured Genus species image is the primary visual, not the logo.
- species name and concise location/context caption travel with the image;
- one primary CTA: explore the Featured Genus;
- one secondary path at most;
- institutional sponsorship language remains quiet and non-dominant.

### 2. DIVERSITY — Featured Genus

Purpose: show how one lineage contains variation, geography, ecology, and unanswered questions.

- real media only, with attribution;
- genus cadence and internal species rotation remain;
- selected species becomes shared page context;
- avoid unrelated species unless clearly framed as a comparison;
- concise species/gallery presentation rather than nested walls of cards.

### 3. RELATIONSHIPS — the living network

Purpose: reveal what connects the selected orchid to other organisms and evidence.

The section should answer questions, for example:

- Who pollinates it?
- What fungi support it?
- What habitat and climate shape it?
- What does literature support?
- What remains unknown?

The public visual may use an interactive graph/network, but advanced graph controls move deeper. This section subsumes redundant relationship explanations from `ContinuumWeb` where appropriate.

### 4. NEED — why the Continuum exists

Purpose: after the visitor has seen fragmented relationships, explain why bringing them together matters.

Public copy should be short. Do not present a software architecture list or grant-facing proof panel. Explain the fragmentation problem and the value of connected evidence.

### 5. EXPLORATION — thematic Earth / Atlas

Purpose: let the visitor see the selected orchid in place and ask geographically meaningful questions.

This is not a homepage GIS workstation.

#### Homepage Earth interaction

Default state:

- center/fly to the active genus/species distribution where evidence supports it;
- show a beautiful Earth/basemap context;
- one concise explanatory sentence from Calyx/context;
- a small set of thematic choices, not a wall of filters.

Initial public thematic set should be converged to approximately 4–6 choices. Recommended first candidates:

1. **Where it lives** — occurrences/distribution with explicit data-coverage semantics.
2. **Habitat & elevation** — biome/topography/elevation context.
3. **Climate** — rainfall/temperature/climate envelope where supported.
4. **Relationships** — pollinator and/or mycorrhizal geographic overlap where evidence exists.
5. **Flowering through time** — phenology/temporal observation or image evidence where sufficient.
6. **Conservation & knowledge gaps** — protected areas, documented projects, sampling gaps, or evidence gaps where supported.

The full Atlas workspace retains advanced filtering, country/genus lists, diagnostics, detailed legends, research controls, and dense GIS functionality.

#### Critical map semantics

- `unknown / no records` must never be presented as biological absence;
- occurrence density must not imply population abundance unless the data supports that claim;
- source/provenance and coverage caveats must remain accessible;
- thematic layers unavailable for the active taxon should be shown as unavailable, not fabricated;
- backend failure must be distinguishable from true empty evidence.

#### Earth integration research boundary

Evaluate an immersive Earth/globe implementation only against concrete requirements: mobile/iPad performance, accessibility, attribution/licensing, thematic-layer support, maintainability, and compatibility with existing occurrence data. Do not adopt a 3D globe solely for visual novelty. A high-quality 2D/2.5D Earth experience is acceptable if it better serves the public narrative.

## 6. DISCOVERY TOOLS — go deeper

One compact section may introduce deeper pathways such as:

- Matrix Identification
- full Atlas
- Relationship Explorer / Knowledge Graph
- Orchid University / Lexicon
- Research Center

Do not explain each product/module in detail on the homepage.

## 7. CONSERVATION + PARTICIPATION

Purpose: show why connected knowledge matters in action and give visitors a clear next step.

Combine overlapping `WhyOrchidsMatter` and `HumanStewardship` material. Keep participation choices concise: learn, contribute observations/knowledge, partner, support conservation, or return to explore.

## 8. RETURN VALUE / FOOTER

A compact latest-discovery/news strip may remain if it genuinely changes and gives visitors a reason to return. Institutional navigation then lives in the footer.

## Language corrections

Remove public-facing wording that sounds like internal engineering, grant preparation, or operator documentation.

Examples found on current main that should not survive unchanged:

- `Grant-ready platform evidence`
- public proof cards that describe Calyx as `mission control, governance, and constitutional orchestration`
- repeated use of `integrated platform` / product-feature inventories where a visitor-facing natural-history explanation would be clearer
- instructional Calyx language that explains system mechanics instead of helping the visitor explore

Preferred language characteristics:

- natural-history first;
- scientifically bounded;
- concise;
- curious rather than promotional;
- explains significance, not architecture;
- distinguishes evidence, inference, uncertainty, and unavailable data.

## Calyx design contract

Calyx is not a separate homepage section that merely says “chat with me.” Calyx acts as the page-aware curator.

Calyx should receive context containing, when available:

- active genus;
- active species;
- current homepage section;
- active Atlas theme;
- evidence/data availability state;
- relationship nodes currently visible;
- relevant caveats/provenance.

Calyx may then:

- explain why a visible relationship matters;
- suggest a meaningful map theme;
- identify an evidence gap;
- offer a deeper route;
- simplify scientific language without changing scientific status.

Calyx must not invent relationships or imply unavailable data exists.

## Backend recovery contract

Before visual implementation is considered complete, each homepage dependency must be classified as one of:

- WORKING_CANONICAL
- FRONTEND_ROUTE_BUG
- BACKEND_CONTRACT_GAP
- WRONG_HOST_OR_PREFIX
- STALE_OR_LEGACY_ROUTE
- INTENTIONALLY_DEFERRED
- UNAVAILABLE_WITH_HONEST_EMPTY_STATE

Known convergence evidence already includes frontend PR #161, which identified the missing `/api` prefix for Atlas occurrence calls and documented additional endpoint gaps. That PR must be incorporated or superseded deliberately rather than duplicated.

## Implementation gates

Broad implementation fan-out is allowed only after this contract is accepted as the canonical interpretation of issue #163.

Then use parallel lanes:

1. hero + story-flow reduction;
2. Featured Genus image/data repair;
3. relationship presentation convergence;
4. Atlas thematic-Earth implementation;
5. backend contract fixes;
6. contextual Calyx integration;
7. responsive/deployed end-to-end validation.

## Completion criteria

The homepage is not complete until a deployed candidate demonstrates:

- real Featured Genus media with attribution;
- substantially shorter page;
- no redundant major sections;
- one distinct idea per major viewport;
- functioning Atlas with real geographic data;
- thematic Atlas interaction rather than a GIS control wall;
- explicit no-data vs absence semantics;
- functioning frontend/backend routes for the visible experiences;
- active genus/species context shared across Featured Genus, relationships, Atlas, and Calyx;
- desktop, iPad, and iPhone review;
- no unsupported claims or internal/operator language in the public tour.
