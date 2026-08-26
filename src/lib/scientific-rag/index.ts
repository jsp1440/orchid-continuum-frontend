/**
 * Event-driven scientific RAG vertical slice — public barrel.
 *
 * A durable, replayable, fail-closed pipeline that takes a publication from
 * ingestion through claim extraction, taxonomic reconciliation, provenance,
 * embedding/retrieval, knowledge-graph update, grounded Calyx answering, and
 * post-generation verification, with Mission Control metrics derived from the
 * event ledger. Deterministic and fully testable; the store/consumer seams map
 * onto a Neon/Postgres outbox without changing any domain-event contract.
 */

export * from "./hashing";
export * from "./events";
export * from "./claims";
export * from "./ledger";
export * from "./taxonomy";
export * from "./locality";
export * from "./ingestion";
export * from "./extraction";
export * from "./embedding";
export * from "./graph";
export * from "./retrieval";
export * from "./answer";
export * from "./verification";
export * from "./missionControl";
export * from "./pipeline";
export {
  PHALAENOPSIS_PUBLICATION_V1,
  PHALAENOPSIS_PUBLICATION_V1_REINGEST,
  PHALAENOPSIS_PUBLICATION_V2,
} from "./fixtures/phalaenopsisPublication";

/** The canonical demonstration question for the vertical slice. */
export const PHALAENOPSIS_DEMO_QUESTION =
  "Which traits distinguish cool-growing Phalaenopsis from warm-growing Phalaenopsis, and what evidence supports those distinctions?";
