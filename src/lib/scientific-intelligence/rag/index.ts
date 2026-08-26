/**
 * Public surface of the event-driven scientific RAG slice.
 *
 * This is a deterministic, dependency-free reference implementation of the
 * ingestion → extraction → reconciliation → provenance → embedding → graph →
 * retrieval → grounded-answer → verification pipeline, with a durable event
 * ledger and Mission Control metrics. It introduces no new infrastructure and
 * its domain-event contracts are transportable onto Kafka-compatible platforms
 * without change.
 */

export * from './contracts'
export * from './hash'
export { EventLedger, LedgerError } from './eventLedger'
export type { AppendEventInput, LedgerOptions } from './eventLedger'

export {
  ingestPublication,
  parseDocument,
  isProtectedLocalityText,
  PARSER_VERSION,
} from './ingestion'
export type { SourceRecord, ParsedDocument, ParsedParagraph, IngestionOutcome } from './ingestion'

export { extractClaims, EXTRACTOR, EXTRACTOR_VERSION } from './extraction'
export type { ExtractionResult } from './extraction'

export { reconcileTaxon, TAXONOMY_SOURCE, TAXONOMY_VERSION } from './taxonomy'
export type { TaxonReconciliation } from './taxonomy'

export {
  RetrievalIndex,
  embedText,
  cosineSimilarity,
  EMBEDDING_MODEL,
  EMBEDDING_VERSION,
  EMBEDDING_DIM,
} from './embeddingIndex'
export type { EmbeddingRecord, RetrievalFilters, UpsertInput, UpsertOutcome } from './embeddingIndex'

export { KnowledgeGraph } from './knowledgeGraph'
export type { GraphNode, GraphEdge, GraphEdgeActivation, UpsertEdgeInput } from './knowledgeGraph'

export { retrieveEvidence, buildEvidenceRecord } from './retrieval'
export type { RetrievedEvidence, EvidenceStores } from './retrieval'

export { composeGroundedAnswer } from './answer'
export type { GroundedAnswer, AnswerStatement } from './answer'

export { verifyAnswer } from './verification'
export type { AnswerVerificationResult, AnswerCheck, VerificationContext } from './verification'

export {
  createPipeline,
  ingestAndProcess,
  answerQuestion,
} from './pipeline'
export type { PipelineState, IngestionRunResult, QueryRunResult } from './pipeline'

export { computeRagMetrics } from './missionControl'
export type { RagProcessingMetrics } from './missionControl'

export { buildEvidenceView, stateLabel } from './evidenceView'
export type { EvidenceViewModel, EvidenceRowView, EvidenceDisplayState, BuildEvidenceViewInput } from './evidenceView'

export {
  PHALAENOPSIS_PUBLICATION,
  PHALAENOPSIS_PUBLICATION_V2,
  DEMO_QUESTION,
  spanOf,
} from './fixtures/phalaenopsis'
export type { RawPublication } from './fixtures/phalaenopsis'
