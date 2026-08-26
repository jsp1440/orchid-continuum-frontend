# Event-Driven Scientific RAG — Vertical Slice

Canonical location: `src/lib/scientific-rag/`
Consumer surface: `src/components/calyx/ScientificEvidencePanel.tsx`
Live diagnostics: `/diagnostics/scientific-rag`

## What this is

A durable, replayable, fail-closed reference implementation of the full
scientific RAG path, adopting the useful architecture of an event-driven RAG
blueprint **without** adopting Kafka/Flink/Confluent or any paid platform. It
runs deterministically in the Vitest node environment and in the browser, so it
is CI-safe and needs no external service.

```
publication fixture
  → ingestion + change detection
  → document parse
  → scientific claim extraction (passage-level provenance)
  → taxonomic reconciliation (original + accepted names; ambiguity fails closed)
  → provenance validation
  → embedding / retrieval index (reuse-aware, versioned)
  → knowledge-graph update (idempotent, provenance-bearing, activation-gated)
  → Calyx hybrid retrieval
  → grounded answer (observation vs inference; cited; fail-closed)
  → post-generation verification gate (verified | blocked)
  → user-visible evidence view + Mission Control metrics
```

Every transition is recorded as a durable domain event on an append-only ledger
with a per-run correlation id and causation ids.

## Module map

| File | Responsibility |
|------|----------------|
| `hashing.ts` | Deterministic content/structural hashing, idempotency keys |
| `events.ts` | Versioned domain-event vocabulary + strict envelope/payload contracts |
| `claims.ts` | Strict scientific-claim contract (assertion, taxon, provenance) |
| `ledger.ts` | Durable outbox/ledger: transaction, idempotent produce/consume, retries, dead-letter, quarantine, replay |
| `taxonomy.ts` | World Plants/Hassler-style reconciliation; ambiguity + version-scoped reprocessing |
| `locality.ts` | Protected-locality fail-closed screening/assertion |
| `ingestion.ts` | Source record, content hash, dedup, change detection |
| `extraction.ts` | Deterministic claim extraction; schema-validated or quarantined |
| `embedding.ts` | Versioned, reuse-aware embedding/retrieval vectors |
| `graph.ts` | Idempotent, provenance-bearing KG edges; activation gating |
| `retrieval.ts` | Hybrid retrieval with taxon/category/quality/sensitivity filters |
| `answer.ts` | Extractive grounded answer; fail-closed insufficiency |
| `verification.ts` | Post-generation evidence gate (machine + human readable) |
| `missionControl.ts` | Metrics derived from durable ledger records |
| `pipeline.ts` | Orchestrator wiring stages through the ledger |
| `evidenceView.ts` | Pure view model for the consumer surface |
| `fixtures/phalaenopsisPublication.ts` | Deterministic publication fixtures |

## Event contract (v1)

Versioned via `CURRENT_EVENT_SCHEMA_VERSION`. Every envelope carries: immutable
`id`, `type`, `schemaVersion`, `aggregateId`, `correlationId`, `causationId`,
`sourceRecordId`, `contentHash`, `createdAt`, `producer`, `status`, `attempt`,
`maxAttempts`, `retryable`, `lastError`, `lastErrorClass`, `versions`
(parser/extractor/model/embedding/taxonomy/verifier), `sensitivity`, and
`idempotencyKey`. Payloads are validated per type; malformed events are rejected
at the boundary and never stored.

Event types: `source.discovered`, `source.downloaded`, `document.parsed`,
`document.parse_failed`, `claim.extracted`, `claim.quarantined`,
`taxon.resolved`, `taxon.ambiguous`, `provenance.validated`,
`embedding.requested`, `embedding.created`, `embedding.reused`,
`embedding.failed`, `graph.update_requested`, `graph.updated`,
`graph.update_failed`, `evidence.verified`, `evidence.rejected`,
`answer.generated`, `answer.verified`, `answer.blocked`.

## Guarantees

- **Transactional outbox** — events accompany the state change (`transaction`).
- **At-least-once + idempotent consumers** — keyed by content-derived idempotency keys.
- **Bounded retries → dead-letter**, plus a distinct **quarantine** terminal state.
- **Safe replay** — replaying the ledger, or a forced re-run over identical
  content, produces **no duplicate scientific state** (claims, embeddings, edges).
- **Deterministic no-op** — unchanged republication does nothing downstream.
- **Fail closed** — protected locality is excluded from ingestion→retrieval→answer→UI;
  ambiguous/unresolved taxa are retained but never activated as authoritative;
  an answer with no eligible evidence reports insufficiency instead of fabricating.

## Migrations / persistence

This is the frontend repository; there are **no database migrations**. The
reference stores are in-memory and deterministic (ideal for CI and for a
frontend/worker that hydrates from an API). The seams map onto a Neon/Postgres
outbox without changing any domain-event contract:

- `LedgerStore` → an `events` outbox table (append-only; unique on `idempotencyKey`).
- `SourceRegistry` → `sources` (unique `sourceRecordId`, `contentHash`, `version`).
- claim store → `claims` (unique `claimId`; `contentHash` for dedup/reuse).
- `EmbeddingIndex` → `claim_embeddings` (pgvector; unique `claimId`, reuse on `contentHash` + model version).
- `KnowledgeGraph` → `kg_edges` (unique `edgeId`; `activated` flag; provenance FK to claim).

A future transport swap (e.g. a Kafka-compatible log) requires no change to the
event or claim contracts, because nothing in the domain layer depends on the
storage mechanism.

## Tests

`src/lib/scientific-rag/*.test.ts` and
`src/components/calyx/ScientificEvidencePanel.render.test.tsx` cover event/claim
schema validation, outbox transaction + rollback, idempotent produce/consume,
duplicate delivery, bounded retry, dead-letter/quarantine, deterministic hashing,
unchanged no-op, changed reprocessing, passage-level provenance, malformed
rejection, ambiguous taxonomy, taxonomy-version reprocessing, embedding reuse,
graph idempotency, hybrid retrieval filters, protected-locality exclusion,
unsupported-citation/numeric/locality/metadata blocking, contradiction surfacing,
insufficiency fail-closed, the end-to-end verified answer, and the rendered
consumer surface.

Run: `npx vitest run src/lib/scientific-rag src/components/calyx/ScientificEvidencePanel.render.test.tsx`
