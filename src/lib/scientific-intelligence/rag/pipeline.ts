/**
 * The event-driven scientific RAG orchestrator.
 *
 * Wires the vertical slice end to end under a single correlation id:
 *
 *   ingest → parse → extract → reconcile → validate provenance →
 *   embed/index → update knowledge graph  (ingestion run)
 *   retrieve → compose grounded answer → verify → verified/blocked  (query run)
 *
 * Every major transition appends a durable event to the ledger. Because event
 * idempotency keys and downstream stores are content-addressed, re-running the
 * same publication is a safe replay: no duplicate events, claims, embeddings, or
 * graph edges are produced.
 *
 * All state is held in in-memory stores behind narrow interfaces; a
 * Postgres/pgvector-backed implementation is a drop-in without changing the
 * domain-event contracts.
 */

import { ScientificClaim } from './contracts'
import { EventLedger, LedgerOptions } from './eventLedger'
import { contentHash } from './hash'
import {
  IngestionOutcome,
  ParsedDocument,
  SourceRecord,
  ingestPublication,
  parseDocument,
} from './ingestion'
import { extractClaims } from './extraction'
import { TaxonReconciliation, TAXONOMY_VERSION, reconcileTaxon } from './taxonomy'
import { RetrievalIndex } from './embeddingIndex'
import { KnowledgeGraph } from './knowledgeGraph'
import { RetrievedEvidence, retrieveEvidence } from './retrieval'
import { GroundedAnswer, composeGroundedAnswer } from './answer'
import { AnswerVerificationResult, verifyAnswer } from './verification'
import type { RawPublication } from './fixtures/phalaenopsis'

export type PipelineState = {
  ledger: EventLedger
  sources: Map<string, SourceRecord>
  documents: Map<string, ParsedDocument>
  documentText: Map<string, string>
  claims: Map<string, ScientificClaim>
  reconciliations: Map<string, TaxonReconciliation>
  quarantinedClaimIds: Set<string>
  index: RetrievalIndex
  graph: KnowledgeGraph
  contradictions: Map<string, string>
}

export function createPipeline(options: LedgerOptions = {}): PipelineState {
  const now = options.now ?? (() => new Date().toISOString())
  return {
    ledger: new EventLedger(options),
    sources: new Map(),
    documents: new Map(),
    documentText: new Map(),
    claims: new Map(),
    reconciliations: new Map(),
    quarantinedClaimIds: new Set(),
    index: new RetrievalIndex(now),
    graph: new KnowledgeGraph(now),
    contradictions: new Map(),
  }
}

export type IngestionRunResult = {
  correlationId: string
  ingestion: IngestionOutcome
  documentId: string | null
  claimsExtracted: number
  claimsQuarantined: number
  taxaResolved: number
  taxaAmbiguous: number
  embeddingsCreated: number
  embeddingsReused: number
  graphEdgesCreated: number
  graphEdgesRestricted: number
  skippedUnchanged: boolean
}

let correlationSeq = 0
function newCorrelationId(): string {
  correlationSeq += 1
  return `run_${correlationSeq.toString(36).padStart(6, '0')}`
}

/** Evidence quality heuristic from a claim's provenance completeness. */
function evidenceQualityOf(claim: ScientificClaim, reconciliation: TaxonReconciliation): number {
  let quality = claim.extractionConfidence
  if (reconciliation.status === 'resolved') quality += 0.05
  if (claim.studyType === 'experiment' || claim.studyType === 'observation') quality += 0.03
  if (claim.sampleSize && claim.sampleSize > 0) quality += 0.02
  return Math.min(1, Number(quality.toFixed(3)))
}

/**
 * Ingest and fully process one publication. Idempotent: an unchanged
 * publication is a no-op that records no new durable events or state.
 */
export function ingestAndProcess(
  state: PipelineState,
  publication: RawPublication,
  correlationId: string = newCorrelationId(),
): IngestionRunResult {
  const prior = state.sources.get(publication.sourceId) ?? null
  const ingestion = ingestPublication(publication, prior)

  const result: IngestionRunResult = {
    correlationId,
    ingestion,
    documentId: null,
    claimsExtracted: 0,
    claimsQuarantined: 0,
    taxaResolved: 0,
    taxaAmbiguous: 0,
    embeddingsCreated: 0,
    embeddingsReused: 0,
    graphEdgesCreated: 0,
    graphEdgesRestricted: 0,
    skippedUnchanged: false,
  }

  // source.discovered records the source regardless of change; idempotency key is
  // the content hash, so an unchanged re-ingest appends nothing new.
  state.ledger.append({
    type: 'source.discovered',
    aggregateId: ingestion.source.sourceId,
    correlationId,
    producer: 'ingestion',
    sourceId: ingestion.source.sourceId,
    contentHashOverride: ingestion.source.contentHash,
    payload: { doi: ingestion.source.doi, version: ingestion.source.version, reason: ingestion.reason },
  })

  if (!ingestion.changed) {
    result.skippedUnchanged = true
    return result
  }

  state.sources.set(ingestion.source.sourceId, ingestion.source)
  state.ledger.append({
    type: 'source.downloaded',
    aggregateId: ingestion.source.sourceId,
    correlationId,
    producer: 'ingestion',
    sourceId: ingestion.source.sourceId,
    contentHashOverride: ingestion.source.contentHash,
    payload: { license: ingestion.source.license, version: ingestion.source.version },
  })

  const document = parseDocument(publication, ingestion.source)
  result.documentId = document.documentId
  state.documents.set(document.documentId, document)
  state.documentText.set(document.documentId, document.fullText)
  state.ledger.append({
    type: 'document.parsed',
    aggregateId: document.documentId,
    correlationId,
    causationId: null,
    producer: 'parser',
    sourceId: ingestion.source.sourceId,
    contentHashOverride: document.contentHash,
    versions: { parser: document.parserVersion },
    payload: {
      paragraphs: document.paragraphs.length,
      protectedParagraphs: document.paragraphs.filter((p) => p.sensitivity === 'protected_locality').length,
    },
  })

  const extraction = extractClaims(document, publication)

  for (const { claim, reasons } of extraction.quarantined) {
    state.quarantinedClaimIds.add(claim.claimId)
    state.claims.set(claim.claimId, claim)
    state.ledger.append({
      type: 'claim.quarantined',
      aggregateId: claim.claimId,
      correlationId,
      producer: 'extractor',
      sourceId: ingestion.source.sourceId,
      contentHashOverride: claim.contentHash,
      payload: { reasons },
    })
    result.claimsQuarantined += 1
  }

  for (const claim of extraction.accepted) {
    result.claimsExtracted += 1
    state.claims.set(claim.claimId, claim)
    state.ledger.append({
      type: 'claim.extracted',
      aggregateId: claim.claimId,
      correlationId,
      producer: 'extractor',
      sourceId: ingestion.source.sourceId,
      contentHashOverride: claim.contentHash,
      versions: { extractor: claim.extractorVersion },
      payload: { predicate: claim.predicate, category: claim.category },
    })

    // Taxon reconciliation.
    const reconciliation = reconcileTaxon(claim.originalTaxon)
    state.reconciliations.set(claim.claimId, reconciliation)
    if (reconciliation.status === 'resolved') {
      result.taxaResolved += 1
      state.ledger.append({
        type: 'taxon.resolved',
        aggregateId: claim.claimId,
        correlationId,
        producer: 'taxonomy',
        sourceId: ingestion.source.sourceId,
        contentHashOverride: contentHash({ claim: claim.claimId, accepted: reconciliation.acceptedTaxonId }),
        versions: { taxonomy: reconciliation.taxonomyVersion },
        payload: { accepted: reconciliation.acceptedName, taxonId: reconciliation.acceptedTaxonId },
      })
    } else {
      result.taxaAmbiguous += 1
      state.ledger.append({
        type: 'taxon.ambiguous',
        aggregateId: claim.claimId,
        correlationId,
        producer: 'taxonomy',
        sourceId: ingestion.source.sourceId,
        contentHashOverride: contentHash({ claim: claim.claimId, status: reconciliation.status }),
        versions: { taxonomy: reconciliation.taxonomyVersion },
        payload: { status: reconciliation.status, candidates: reconciliation.candidates.length },
      })
    }

    // Provenance validation gate.
    state.ledger.append({
      type: 'provenance.validated',
      aggregateId: claim.claimId,
      correlationId,
      producer: 'provenance',
      sourceId: ingestion.source.sourceId,
      contentHashOverride: claim.contentHash,
      payload: { locator: claim.locator, span: claim.passageSpan },
    })

    // Embedding / retrieval index update.
    const quality = evidenceQualityOf(claim, reconciliation)
    state.ledger.append({
      type: 'embedding.requested',
      aggregateId: claim.claimId,
      correlationId,
      producer: 'embedder',
      contentHashOverride: claim.contentHash,
      payload: {},
    })
    const upsert = state.index.upsert({
      claimId: claim.claimId,
      sourceId: ingestion.source.sourceId,
      sourceVersion: ingestion.source.version,
      contentHash: claim.contentHash,
      taxonomyVersion: TAXONOMY_VERSION,
      subjectTaxonId: reconciliation.acceptedTaxonId,
      sensitivity: claim.sensitivity,
      evidenceQuality: quality,
      text: `${claim.normalizedSubject} ${claim.predicate} ${claim.object} ${claim.supportingPassage}`,
    })
    if (upsert.reused) {
      result.embeddingsReused += 1
      state.ledger.append({
        type: 'embedding.reused',
        aggregateId: claim.claimId,
        correlationId,
        producer: 'embedder',
        contentHashOverride: claim.contentHash,
        payload: { embeddingId: upsert.record.embeddingId },
      })
    } else {
      result.embeddingsCreated += 1
      state.ledger.append({
        type: 'embedding.created',
        aggregateId: claim.claimId,
        correlationId,
        producer: 'embedder',
        contentHashOverride: claim.contentHash,
        versions: { model: upsert.record.model, embedding: upsert.record.embeddingVersion },
        payload: { embeddingId: upsert.record.embeddingId, dimensions: upsert.record.dimensions },
      })
    }

    // Knowledge-graph update. Ambiguous/unresolved taxa are admitted only in a
    // restricted activation state, never as unrestricted authoritative knowledge.
    const activation = reconciliation.status === 'resolved' ? 'authoritative' : 'restricted'
    state.ledger.append({
      type: 'graph.update_requested',
      aggregateId: claim.claimId,
      correlationId,
      producer: 'graph',
      contentHashOverride: claim.contentHash,
      payload: { activation },
    })
    const edge = state.graph.upsertEdge({
      subjectTaxonId: reconciliation.acceptedTaxonId ?? `unresolved:${claim.normalizedSubject}`,
      subjectAcceptedName: reconciliation.acceptedName,
      subjectOriginalName: claim.originalTaxon,
      predicate: claim.predicate,
      object: claim.object,
      activation,
      claimId: claim.claimId,
      sourceDocumentId: claim.sourceDocumentId,
      supportingPassage: claim.supportingPassage,
      passageSpan: claim.passageSpan,
      contentHash: claim.contentHash,
      taxonomyVersion: TAXONOMY_VERSION,
      extractorVersion: claim.extractorVersion,
      sensitivity: claim.sensitivity,
    })
    if (edge.created) {
      result.graphEdgesCreated += 1
      if (activation === 'restricted') result.graphEdgesRestricted += 1
    }
    state.ledger.append({
      type: 'graph.updated',
      aggregateId: claim.claimId,
      correlationId,
      producer: 'graph',
      contentHashOverride: contentHash({ edge: edge.edge.edgeId, activation }),
      payload: { edgeId: edge.edge.edgeId, activation, created: edge.created },
    })
  }

  return result
}

export type QueryRunResult = {
  correlationId: string
  evidence: RetrievedEvidence[]
  answer: GroundedAnswer
  verification: AnswerVerificationResult
}

/** Retrieve, compose a grounded answer, and verify it under one correlation id. */
export function answerQuestion(
  state: PipelineState,
  question: string,
  correlationId: string = newCorrelationId(),
): QueryRunResult {
  const evidence = retrieveEvidence(question, state.index, {
    claims: state.claims,
    reconciliations: state.reconciliations,
  })

  const answer = composeGroundedAnswer(correlationId, question, evidence)
  state.ledger.append({
    type: 'answer.generated',
    aggregateId: correlationId,
    correlationId,
    producer: 'calyx',
    contentHashOverride: contentHash({ correlationId, statements: answer.statements.map((s) => s.text) }),
    payload: { status: answer.status, statements: answer.statements.length },
  })

  const verification = verifyAnswer(answer, {
    runCorrelationId: correlationId,
    claims: state.claims,
    reconciliations: state.reconciliations,
    documentText: state.documentText,
    quarantinedClaimIds: state.quarantinedClaimIds,
    contradictions: state.contradictions,
  })

  for (const claimId of new Set(answer.statements.flatMap((s) => s.evidenceClaimIds))) {
    state.ledger.append({
      type: verification.verdict === 'verified' ? 'evidence.verified' : 'evidence.rejected',
      aggregateId: claimId,
      correlationId,
      producer: 'verifier',
      contentHashOverride: contentHash({ correlationId, claimId, verdict: verification.verdict }),
      payload: { verdict: verification.verdict },
    })
  }

  state.ledger.append({
    type: verification.verdict === 'verified' ? 'answer.verified' : 'answer.blocked',
    aggregateId: correlationId,
    correlationId,
    producer: 'verifier',
    contentHashOverride: contentHash({ correlationId, verdict: verification.verdict, reasons: verification.blockedReasons }),
    payload: { verdict: verification.verdict, blockedReasons: verification.blockedReasons },
  })

  return { correlationId, evidence, answer, verification }
}
