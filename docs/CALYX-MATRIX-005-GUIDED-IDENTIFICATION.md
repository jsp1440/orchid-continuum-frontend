# CALYX-MATRIX-005 — Guided Identification Experience

## Mission

Replace the developer-facing JSON Matrix laboratory with a session-driven identification experience backed by governed Matrix registry versions, CALYX-MATRIX-003 sessions, and CALYX-MATRIX-004 explanations.

## User journey

1. Load available governed registry versions.
2. Select a bounded scientific scope.
3. Start a registry-bound identification session.
4. Receive the Matrix-selected next discriminating character.
5. Record the observation and certainty.
6. Re-evaluate the governed candidate set.
7. Review candidate score and evidence coverage separately.
8. Ask Calyx why the next observation matters or how candidates differ.
9. Repeat until the registry cannot further discriminate the remaining candidates.

## Scientific boundaries

- The frontend does not rank candidates locally.
- The frontend does not invent a candidate universe.
- The frontend does not treat score as taxonomic probability.
- Missing candidate data remain distinct from biological absence.
- Calyx narrative is explanatory output, not Matrix state.
- The deterministic next observation comes from the backend Matrix session and is never replaced by generated prose.
- No taxonomy, Candidate Knowledge, publication state, or Knowledge Graph relationship is mutated.

## UX

The primary experience now uses guided observation cards, adaptive next-question guidance, candidate ranking cards, separate match/coverage displays, Calyx explanation controls, and a collapsed expert provenance trail. The former JSON-first workflow is no longer the primary identification interface.

## Dependencies

Backend support required:

- CALYX-MATRIX-003 — governed identification sessions and next observation.
- CALYX-MATRIX-004 — structured Calyx explanation adapter.

The frontend fails visibly when those governed endpoints are unavailable; it does not substitute fixture results.
