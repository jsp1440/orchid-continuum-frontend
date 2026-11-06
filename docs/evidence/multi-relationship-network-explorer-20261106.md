# Multi-relationship network explorer — frontend evidence

Owner assignment: implement the scientific multi-relationship network using existing repositories, read-only production inspection and isolated testing. Coordination: backend #1823 and Brain #143. This is a continuation of the existing Relationship Explorer, not a replacement knowledge graph.

## Result

The static network-preview card in `src/pages/RelationshipExplorer.tsx` is replaced by a live React network component, mounted independently of the older species-card payload. Existing `/relationship-explorer` routes remain unchanged. The client-derived Intelligence Graph and its naming contract are unchanged.

The component requests the existing backend knowledge-graph router's bounded `/search`, `/network` and `/edge/{id}` extensions. Search results require explicit identity selection, including similar/historical names. Clicking any returned numeric KG node requests a two-hop neighborhood without forcing a taxonomy intermediate. Edge inspection retrieves attributable evidence records separately. Stored categories, predicates, calibrated confidence, canonical identity and scientific validation are not conflated.

The separate opt-in recorded-source view requests `/source-search` and `/source-network`. It preserves namespaced source identities, unverified assertions and unresolved crosswalks. Source nodes inspect their loaded neighborhood; they are never passed to numeric KG endpoints. This view does not publish or materialize accepted scientific relationships.

The explicit Brain explanation action uses authenticated `POST /brain/missions/graph-evidence` or `/source-evidence` with only the selected numeric root/source ID and bounded limits. It renders normalized retrieved path steps, classifications, validation states, citations and missing-evidence codes. It retains default-off, owner-authentication and reader-scope refusals, including an unavailable-source packet returned with HTTP200. It neither enables the feature nor calls a paid model, writes a ledger or publishes science. The Calyx conversation and active Resolve/shared-memory integration remain outside this patch.

Non-maker contract review exposed projected-text metadata and source-ID namespace mismatches. The follow-up preserves privacy-projected licence/taxonomy text, honors withheld text, and matches the MCP220-character source namespace including parenthesized/semicolon DOI suffixes. It also retains safe assertion/conflict linkage, withheld/truncated markers and review/verification states in the evidence inspector and normalized export. Declared restricted conflict IDs are omitted with an explicit withheld marker.

The SVG uses a deterministic bounded spring layout. Multiple node/edge categories render simultaneously, uncertain/inactive assertions are dashed, and source direction remains visible. Controls provide search, relationship/evidence/status/source/taxonomic-status filtering, zoom, pointer pan, reset, isolate, loaded-view alternative paths and JSON export. View diagnostics include components, singletons, reverse assertions and parallel assertions. They are explicitly scoped to the returned view. Export contains only the normalized allowlisted projection; raw metadata, private contributor fields, coordinates and withheld citation contents are excluded.

## Validation and limits

Base: frontend main `57600f246d1b024b37e40851b866722c4a09b58a`.

- Focused Vitest: **23 passed** (13 model/privacy/bounds tests and 10 mounted HTTP-consumer journeys). Fixtures are explicitly synthetic and isolated. Mounted tests mock the backend base URL and HTTP responses; they do not establish production science or a live backend pass.
- Scoped strict TypeScript check: new model, HTTP client and component plus their actual backend-configuration imports passed. The whole application typecheck was not run.
- Repository-equivalent ESLint rules: changed/new production and test files passed, including the portable browser acceptance entry.
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

The shared isolated acceptance harness separately executed actual React DOM emulation → HTTP → FastAPI → disposable PostgreSQL/WASM: five interaction checks, eight HTTP calls and zero DOM execution errors, plus four SQL/HTTP endpoint checks. The materialized-graph controls are synthetic; the recorded-source view replays two actual audited fungal-literature records from one shared study, producing six nodes and six edges across source orchid concept, assertion, fungal name and publication. These records are not independent studies or accepted KG relationships. This proof does not establish native psycopg, live Neon, Render or full-application acceptance. Graphical Chromium acceptance remains unavailable after one normal installation attempt received a truncated archive; no network bypass or repeated download was used. The coordinator matched the portable proof's current-asset hashes to the final tested asset.

Backend draft #2317 contains the portable isolated HTTP/SQL replay harness. Build its frontend asset from this repository's committed test-only entry (the exact production React component is imported):

```bash
node node_modules/esbuild/bin/esbuild tests/network-browser-entry.tsx --bundle --format=esm --jsx=automatic --alias:@=./src '--define:import.meta.env={}' --outfile=/tmp/oc-network-browser.js
```

Follow backend `tools/kg_network_demo/README.md` to run that asset with its isolated services. This entry is not a replacement route or a static dataset, and does not connect to production. Non-maker same-account bounded source/contract review reproduced all23 tests and found no remaining blocking contract defect; protected independent-principal acceptance is not implied.

## Rollout, migration and rollback

No frontend migration is required. Backend bounded network/search/evidence and optional source-projection endpoints must be reviewed and tested first. Deployments remain owner-gated on Render. Missing endpoints or auth refusal produce an explicit unavailable/refused state without fabricated cached science. Existing default-off Brain/MCP controls are unchanged.

Only after backend readiness and owner authorization should this frontend candidate receive the existing fail-closed validation/build and controlled release. Reverting the frontend commit removes the new component and restores the prior page. No database rollback, taxonomy activation, source-data rewrite or production KG mutation is involved.
