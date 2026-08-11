# CALYX-LEXICON-INTEGRATION-001 — Frontend

This branch migrates the uploaded Famous AI Illustrated Orchid Lexicon into the canonical Orchid Continuum frontend rather than building a replacement glossary UI.

## Preserved Famous capabilities

- Rich lexicon entry/asset/provenance model
- Illustrated A–Z browsing and collection views
- Maturity, certainty, review, provenance, and validation concepts
- Display/accessibility preferences
- Layered concept pages and orchid morphology/figure components
- Famous visual language and lexicon site chrome
- Explicit treatment of missing scientific fields as awaiting enrichment

## Canonical integration

- `/lexicon/*` is mounted inside the existing Orchid Continuum React router.
- Canonical entries are read from `/api/lexicon`.
- Reviewed canonical concepts supersede Famous migration fallback records by slug.
- Legacy Famous scientific writes fail closed; governed Concept Registry/review APIs own future writes.
- Ask Calyx now uses the server-owned `/api/calyx/speak/conversations` path instead of a curated demo response.
- Scientific replies retain mission/provider/review provenance and do not auto-publish.

## Release gates

Frontend test, production build, lint, and focused adapter regression tests must pass before merge.
