# FRONTEND-R2 — Archie Design Review Checklist

Use this checklist to review the Orchid Continuum homepage as a first-time visitor, not as a developer.

## Core question

Does the homepage explain the Orchid Continuum as one connected orchid knowledge system?

## 1. First 30 seconds

- [ ] Can a visitor understand what the Orchid Continuum is?
- [ ] Is it clear that this is about orchid biodiversity, conservation, research, and education?
- [ ] Does the hero lead naturally into the four hubs?
- [ ] Does the page feel like one story rather than a pile of modules?

## 2. Four-hub architecture

### Orchid Observatory

- [ ] Does this clearly represent Atlas, species, maps, images, and occurrence records?
- [ ] Does the primary route lead to the strongest Observatory surface?
- [ ] Are unfinished image/gallery pieces labelled honestly?

### Orchid Conservatory

- [ ] Does this clearly represent collections, cultivation, OASIS, and living records?
- [ ] Is it clear which parts require sign-in?
- [ ] Does it connect cultivated orchids to conservation rather than feeling like a hobby-only feature?

### Orchid Science Station

- [ ] Does this clearly represent Matrix, literature, relationship graph, and research tools?
- [ ] Is the Research Station positioned as the analytical engine of the Continuum?
- [ ] Are Matrix/literature/relationship routes discoverable without overpromising finished wiring?

### Orchid Continuum University

- [ ] Does this clearly represent education, deception lab, glossary, and classroom pathways?
- [ ] Is it clear which learning pieces are live versus coming soon?
- [ ] Does it feel connected to the science rather than separate from it?

## 3. Homepage section order

Target order:

1. Hero
2. Four Hubs
3. Today’s Genus
4. Knowledge Graph
5. Habitat / Atlas / Gallery
6. Science Station / Matrix / Continuum Web
7. Why Orchids Matter
8. Stewardship / Join
9. News / Footer

Review:

- [ ] Does each section naturally answer the question raised by the previous section?
- [ ] Are there duplicate concepts that should be merged?
- [ ] Are there sections that should move lower or become hub subpages?
- [ ] Are empty data panels replaced with meaningful context?

## 4. Navigation and routing

- [ ] Do the four hub cards route somewhere useful?
- [ ] Are prototype areas labelled as Preview, Wiring, or Soon?
- [ ] Does the public nav avoid overwhelming first-time visitors?
- [ ] Are deep links preserved for admin/prototype work?

## 5. Release readiness

- [ ] `npm run build` passes in GitHub Actions.
- [ ] Homepage renders on desktop.
- [ ] Homepage renders on mobile.
- [ ] Hub cards do not create layout overflow.
- [ ] Hub links route correctly.
- [ ] No section shows a raw “No data yet” failure without explanation.

## Design-review outcome

At the end of review, classify each homepage section:

- `KEEP_AS_IS`
- `MOVE_UP`
- `MOVE_DOWN`
- `MERGE_WITH_HUB`
- `REWRITE_COPY`
- `WIRE_TO_BACKEND`
- `HIDE_FOR_PREVIEW`
