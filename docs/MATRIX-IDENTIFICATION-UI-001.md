# MATRIX-IDENTIFICATION-UI-001

## Status
Implemented on `feature/matrix-identification-ui-001`.

## Objective
Replace the fixture-backed Orchid Identification page with a live, owner-authenticated Matrix Identification workspace using the merged Calyx endpoint:

`POST /api/matrix-identification/evaluate`

## Completed work
- editable observation matrix with certainty and weight;
- editable governed candidate matrix;
- live authenticated request through the shared Calyx backend configuration;
- explicit validation and API errors rather than silent fixture fallback;
- ranked candidate results with separate score and coverage;
- character-level explanations for matched, partial, conflicting, missing, and ignored-unknown states;
- provenance display;
- retained warning that candidate ranking is not a verified taxonomic identification.

## Evidence semantics
- `unknown` observations contribute no score;
- missing candidate states lower coverage but are not treated as biological absence;
- uncertain observations contribute reduced effective weight;
- score and data coverage are displayed separately;
- every result remains review evidence only.

## Non-goals
- no canonical taxonomy mutation;
- no Conservatory record mutation;
- no automatic candidate retrieval from the knowledge graph;
- no image-derived character assertion;
- no automatic publication of an identification.

## Next integration
1. versioned character-matrix registry;
2. candidate retrieval by canonical genus or clade;
3. plant-linked observation sessions;
4. reviewed image-character suggestions;
5. saved identification reports with provenance and reviewer decisions.
