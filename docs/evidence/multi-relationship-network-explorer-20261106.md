# Multi-relationship network explorer — frontend evidence

Owner assignment: implement the scientific multi-relationship network using existing repositories, read-only production inspection and isolated testing. Coordination: backend #1823 and Brain #143. This is a continuation of the existing Relationship Explorer, not a replacement knowledge graph.

## Result

The static network-preview card in `src/pages/RelationshipExplorer.tsx` is replaced by a live React network component, mounted independently of the older species-card payload. Existing `/relationship-explorer` routes remain unchanged. The client-derived Intelligence Graph and its naming contract are unchanged.

The component requests the existing backend knowledge-graph router's bounded `/search`, `/network` and `/edge/{id}` extensions. Search results require explicit identity selection, including similar/historical names. Clicking any returned numeric KG node requests a two-hop neighborhood without forcing a taxonomy intermediate. Edge inspection retrieves attributable evidence records separately. Stored categories, predicates, calibrated confidence, canonical identity and scientific validation are not conflated.

The separate opt-in recorded-source view requests `/source-search` and `/source-network`. It preserves namespaced source identities, unverified assertions and unresolved crosswalks. Source nodes inspect their loaded neighborhood; they are never passed to numeric KG endpoints. This view does not publish or materialize accepted scientific relationships.

The SVG uses a deterministic bounded spring layout. Multiple node/edge categories render simultaneously, uncertain/inactive assertions are dashed, and source direction remains visible. Controls provide search, relationship/evidence/status/source/taxonomic-status filtering, zoom, pointer pan, reset, isolate, loaded-view alternative paths and JSON export. View diagnostics include components, singletons, reverse assertions and parallel assertions. They are explicitly scoped to the returned view. Export contains only the normalized allowlisted projection; raw metadata, private contributor fields, coordinates and withheld citation contents are excluded.

## Validation and limits

Base: frontend main `57600f246d1b024b37e40851b866722c4a09b58a`.

- Focused Vitest: **16 passed** (11 model/privacy/bounds tests and 5 mounted HTTP-consumer journeys). Fixtures are explicitly synthetic and isolated. Mounted tests mock the backend base URL and HTTP responses; they do not establish production science or a live backend pass.
- Scoped strict TypeScript check: new model, HTTP client and component plus their actual backend-configuration imports passed. The whole application typecheck was not run.
- Repository-equivalent ESLint rules: all six changed/new production and test files passed.
- Browser acceptance bundle builds from the same production component. This is a local acceptance harness, not a deployed product build. The complete Vite application build is not claimed.

Local materialization is a partial source checkout. The isolated test runtime uses React/ReactDOM18.3.1, TypeScript5.5.4, Vitest3.2.6 and jsdom30.0.1. The repository package manifest and lockfile are unchanged. Canonical full-checkout commands before merge:

```bash
npm ci
npm run test -- src/lib/scientificNetwork.test.ts src/components/orchid/ScientificNetworkExplorer.test.tsx
npm run typecheck
npm run lint
npm run validate:deployment
npm run build
```

Hosted validation, an eligible independent exact-head review, and the combined backend/browser scientific demonstration must be attributed separately. Same-account subagents do not establish protected independent principal acceptance.

## Rollout, migration and rollback

No frontend migration is required. Backend bounded network/search/evidence and optional source-projection endpoints must be reviewed and tested first. Deployments remain owner-gated on Render. Missing endpoints or auth refusal produce an explicit unavailable/refused state without fabricated cached science. Existing default-off Brain/MCP controls are unchanged.

Only after backend readiness and owner authorization should this frontend candidate receive the existing fail-closed validation/build and controlled release. Reverting the frontend commit removes the new component and restores the prior page. No database rollback, taxonomy activation, source-data rewrite or production KG mutation is involved.
