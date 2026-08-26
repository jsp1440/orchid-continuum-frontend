/**
 * Mission Control observability for the scientific RAG slice.
 *
 * Every figure here is derived from durable ledger events and pipeline stores —
 * never from a hand-entered claim of completion. This is the "real processing
 * evidence" surface: counts of what actually happened, the event backlog, and
 * the oldest pending-event age, with sensitive payloads excluded.
 */

import { DomainEventType } from './contracts'
import { PipelineState } from './pipeline'

export type RagProcessingMetrics = {
  sourcesDiscovered: number
  documentsParsed: number
  parseFailures: number
  claimsExtracted: number
  claimsQuarantined: number
  taxaResolved: number
  taxaAmbiguous: number
  embeddingsCreated: number
  embeddingsReused: number
  embeddingsFailed: number
  graphUpdatesCompleted: number
  graphUpdatesFailed: number
  verifiedAnswers: number
  blockedAnswers: number
  pendingEvents: number
  retryingEvents: number
  deadLetterEvents: number
  oldestPendingEventAgeMs: number
  correlationIds: string[]
  /** Per-correlation stage durations in ms, from first to last event. */
  runDurations: Array<{ correlationId: string; durationMs: number; events: number }>
  /** Indexed embeddings and graph edges currently held. */
  indexedEmbeddings: number
  authoritativeGraphEdges: number
  restrictedGraphEdges: number
}

function countType(state: PipelineState, type: DomainEventType): number {
  return state.ledger.byType(type).length
}

export function computeRagMetrics(state: PipelineState, reference: number = Date.now()): RagProcessingMetrics {
  const counts = state.ledger.counts()
  const history = state.ledger.history()

  const correlationIds = Array.from(new Set(history.map((event) => event.correlationId)))
  const runDurations = correlationIds.map((correlationId) => {
    const events = history.filter((event) => event.correlationId === correlationId)
    const times = events.map((event) => new Date(event.createdAt).getTime()).filter((value) => Number.isFinite(value))
    const durationMs = times.length ? Math.max(...times) - Math.min(...times) : 0
    return { correlationId, durationMs, events: events.length }
  })

  return {
    sourcesDiscovered: countType(state, 'source.discovered'),
    documentsParsed: countType(state, 'document.parsed'),
    parseFailures: countType(state, 'document.parse_failed'),
    claimsExtracted: countType(state, 'claim.extracted'),
    claimsQuarantined: countType(state, 'claim.quarantined'),
    taxaResolved: countType(state, 'taxon.resolved'),
    taxaAmbiguous: countType(state, 'taxon.ambiguous'),
    embeddingsCreated: countType(state, 'embedding.created'),
    embeddingsReused: countType(state, 'embedding.reused'),
    embeddingsFailed: countType(state, 'embedding.failed'),
    graphUpdatesCompleted: countType(state, 'graph.updated'),
    graphUpdatesFailed: countType(state, 'graph.update_failed'),
    verifiedAnswers: countType(state, 'answer.verified'),
    blockedAnswers: countType(state, 'answer.blocked'),
    pendingEvents: counts.pending,
    retryingEvents: counts.retrying,
    deadLetterEvents: counts.dead_letter,
    oldestPendingEventAgeMs: state.ledger.oldestPendingAgeMs(reference),
    correlationIds,
    runDurations,
    indexedEmbeddings: state.index.size(),
    authoritativeGraphEdges: state.graph.authoritativeEdges().length,
    restrictedGraphEdges: state.graph.allEdges().length - state.graph.authoritativeEdges().length,
  }
}
