# Orchid Continuum Parallel Contract v1

## Ownership

- Brain supplies governed analyses and design/education/scientific specifications.
- Backend supplies canonical taxonomy, evidence, Knowledge Graph data, identity state, persistence, review, and publication.
- Frontend renders typed responses and captures observations. It does not calculate canonical scientific conclusions.

## Planned routes

- `/` evidence-driven homepage
- `/relationships` Relationship Matrix explorer
- `/identify` guided Orchid Identification
- `/university` education and virtual-lab entry
- `/calyx` governed reasoning and recommendation workspace

## Required client models

### Availability
`available | partial | unavailable | stale | blocked`

### Evidence state
`verified | reviewed | provisional | inferred | predictive | unknown`

### Identification state
`observation_incomplete | candidate_suggestions | ambiguous | requires_expert_review | verified_external_identity`

### Relationship dimensions

- taxonomy
- morphology
- ecology
- geography
- phenology
- pollinator
- mycorrhiza
- conservation
- cultivation
- literature
- graph_evidence

The client must display missing dimensions as unavailable, not as zero similarity.

## Homepage sections

The homepage renders ordered semantic sections supplied by the backend:

1. mission and primary exploration actions;
2. Featured Genus and Species with approved real imagery;
3. Evolution, Relationships, and Species views;
4. conservation hotspots and projects;
5. education and research entry points;
6. current Continuum activity and knowledge growth;
7. explicit degraded/unavailable notices.

## Identification presentation

Candidate cards display supporting observations, conflicting observations, missing observations, confidence by attribute, source provenance, and the next-best observation prompt. The interface must never label a machine suggestion as verified.

## Matrix presentation

The UI consumes backend scores and evidence. It may filter, sort, compare, and visualize, but cannot recompute or invent scientific weights.

## Design and accessibility

- WCAG-oriented keyboard, focus, contrast, reduced-motion, and semantic-heading behavior;
- responsive layouts;
- real approved orchid images rather than generated pollinator/scientific evidence images;
- scientific names, uncertainty, evidence, and provenance remain visible;
- no unsafe HTML from API responses.

## Governance

No automatic deployment, scientific publication, identity verification, or canonical mutation. Brain recommendations appear as reviewable proposals only.
