# CALYX-MATRIX-UI-002 — Guided Matrix Experience Contract

Parent: `jsp1440/Orchid-Continuum-Brain#62`.

## Goal
Evolve the existing Matrix Identification Lab from JSON-first expert tooling into a guided, dynamic identification workspace while preserving the existing evaluator and scientific semantics.

## First journey
1. Start identification.
2. Add image reference/upload when supported, or continue without image.
3. Select/resolve bounded taxonomic scope.
4. Receive server-derived candidate universe.
5. Add structured character observations with certainty/evidence state.
6. Watch ranked candidates update with score and coverage displayed separately.
7. Receive next-best observation request with a structured “why this helps” explanation.
8. Open morphology help using canonical lexicon/Calyx content.
9. Review image-linked morphology suggestions explicitly when present.
10. View evidence trail and save/open a provenance-bearing report.

## Required visual states
- direct observation
- AI suggestion
- inference
- reviewed evidence
- canonical knowledge
- unavailable/not analyzed

Never encode scientific status by color alone.

## Deconstruct-the-flower rendering contract
When evidence exists, support layers for original image, labels, masks, contours, landmarks, symmetry axes, measurements, schematic/blueprint representation, and candidate comparison. Every absent layer must render truthfully as unavailable rather than being synthesized in the browser.

## Progressive disclosure
VISUAL → PLAIN LANGUAGE → BOTANICAL TERM → STRUCTURED CHARACTER → SOURCE EVIDENCE.

Reuse `/api/lexicon` and canonical Calyx conversations. Do not hardcode a competing glossary.

## Interaction model
Appropriate motion may communicate candidate narrowing, evidence addition, uncertainty changes, structure focus and comparison. No decorative motion should obscure scientific state.

## Preserve expert mode
Keep an expert/raw Matrix view for direct registry/character inspection; guided mode should not require JSON editing or candidate-matrix submission.

## Validation
- preserve existing MATRIX-IDENTIFICATION evaluator regression behavior;
- stale async/session response isolation;
- error handling without fixture fallback;
- score/coverage distinction;
- evidence-state accessibility;
- iPad/phone/laptop/desktop responsive behavior;
- keyboard and focus navigation;
- no client-side scientific inference.

## Famous AI
Do not start a greenfield Famous AI build. Once session/retrieval/next-observation contracts are live, prepare a bounded Famous implementation brief for candidate narrowing, morphology layers, evidence trail and guided interaction, then reconcile approved output into this repository.
