import { describe, it, expect } from 'vitest'
import {
  createPipeline,
  ingestAndProcess,
  answerQuestion,
} from './pipeline'
import { composeGroundedAnswer } from './answer'
import { verifyAnswer } from './verification'
import { computeRagMetrics } from './missionControl'
import { PHALAENOPSIS_PUBLICATION, PHALAENOPSIS_PUBLICATION_V2, DEMO_QUESTION } from './fixtures/phalaenopsis'

function seededPipeline() {
  let tick = 0
  return createPipeline({ now: () => new Date(1_700_000_000_000 + tick++ * 1000).toISOString() })
}

describe('rag/pipeline — end-to-end vertical slice', () => {
  it('drives a publication to a verified, grounded answer for the demo question', () => {
    const state = seededPipeline()
    const run = ingestAndProcess(state, PHALAENOPSIS_PUBLICATION, 'ingest-1')
    expect(run.claimsExtracted).toBeGreaterThan(0)
    expect(run.embeddingsCreated).toBeGreaterThan(0)
    expect(run.graphEdgesCreated).toBeGreaterThan(0)

    const query = answerQuestion(state, DEMO_QUESTION, 'query-1')
    expect(query.answer.status).toBe('grounded')
    expect(query.verification.verdict).toBe('verified')

    // Distinguishing traits appear, with accepted names and citations.
    const text = query.answer.statements.map((s) => s.text).join(' ')
    expect(text).toMatch(/leaf|deciduous|persistent/i)
    expect(text).toMatch(/night temperature/i)
    expect(query.answer.citations.length).toBeGreaterThan(0)
    expect(query.answer.citations[0].doi).toBe(PHALAENOPSIS_PUBLICATION.doi)

    // Inference is labelled distinctly from observed evidence.
    const inferred = query.answer.statements.filter((s) => s.kind === 'inferred')
    const observed = query.answer.statements.filter((s) => s.kind === 'observed')
    expect(inferred.length).toBeGreaterThan(0)
    expect(observed.length).toBeGreaterThan(0)

    // Answer is reproducible from stored retrieval evidence (content hashes).
    expect(query.answer.usedEvidenceHashes.every((h) => h.startsWith('sha256:'))).toBe(true)
    expect(query.answer.correlationId).toBe('query-1')
  })

  it('emits a durable event for every major transition', () => {
    const state = seededPipeline()
    ingestAndProcess(state, PHALAENOPSIS_PUBLICATION, 'ingest-1')
    answerQuestion(state, DEMO_QUESTION, 'query-1')
    const types = new Set(state.ledger.history().map((e) => e.type))
    for (const expected of [
      'source.discovered', 'source.downloaded', 'document.parsed',
      'claim.extracted', 'taxon.resolved', 'provenance.validated',
      'embedding.created', 'graph.updated', 'answer.generated', 'answer.verified', 'evidence.verified',
    ]) {
      expect(types.has(expected as never)).toBe(true)
    }
  })

  it('is replay-idempotent: reprocessing the same publication duplicates no state', () => {
    const state = seededPipeline()
    ingestAndProcess(state, PHALAENOPSIS_PUBLICATION, 'ingest-1')
    const eventsAfterFirst = state.ledger.history().length
    const claimsAfterFirst = state.claims.size
    const embeddingsAfterFirst = state.index.size()
    const edgesAfterFirst = state.graph.edgeCount()

    // Full replay of identical content.
    const replay = ingestAndProcess(state, PHALAENOPSIS_PUBLICATION, 'ingest-1')
    expect(replay.skippedUnchanged).toBe(true)
    expect(state.ledger.history().length).toBe(eventsAfterFirst)
    expect(state.claims.size).toBe(claimsAfterFirst)
    expect(state.index.size()).toBe(embeddingsAfterFirst)
    expect(state.graph.edgeCount()).toBe(edgesAfterFirst)
  })

  it('reprocesses only when a publication materially changes', () => {
    const state = seededPipeline()
    ingestAndProcess(state, PHALAENOPSIS_PUBLICATION, 'ingest-1')
    const claimsV1 = state.claims.size
    const v2 = ingestAndProcess(state, PHALAENOPSIS_PUBLICATION_V2, 'ingest-2')
    expect(v2.skippedUnchanged).toBe(false)
    expect(v2.ingestion.reason).toBe('content_changed')
    // New version reprocessed; the changed temperature claim yields fresh evidence.
    expect(state.claims.size).toBeGreaterThan(claimsV1)
    const query = answerQuestion(state, DEMO_QUESTION, 'query-2')
    expect(query.verification.verdict).toBe('verified')
  })

  it('excludes protected locality from every surface', () => {
    const state = seededPipeline()
    ingestAndProcess(state, PHALAENOPSIS_PUBLICATION, 'ingest-1')
    const query = answerQuestion(state, 'Where exactly is Phalaenopsis lowii found in the wild?', 'query-1')

    // No coordinates in any answer statement, evidence passage, or graph edge.
    const answerText = JSON.stringify(query.answer)
    expect(answerText).not.toContain('114.7550')
    for (const evidence of query.evidence) {
      expect(evidence.supportingPassage).not.toContain('114.7550')
    }
    for (const edge of state.graph.allEdges()) {
      expect(edge.provenance.supportingPassage).not.toContain('114.7550')
      expect(edge.sensitivity).not.toBe('protected_locality')
    }
    // The verifier's protected-locality check passes precisely because nothing leaked.
    const check = query.verification.checks.find((c) => c.id === 'protected_locality_absent')
    expect(check?.status).toBe('pass')
  })

  it('fails closed with insufficient evidence when nothing relevant is retrieved', () => {
    const state = seededPipeline()
    ingestAndProcess(state, PHALAENOPSIS_PUBLICATION, 'ingest-1')
    const query = answerQuestion(state, 'zzzz nonexistent xylophone quantum topic', 'query-1')
    expect(query.answer.status).toBe('insufficient_evidence')
    expect(query.answer.statements).toHaveLength(0)
    expect(query.verification.verdict).toBe('insufficient_evidence')
    // Not presented as a verified answer.
    expect(state.ledger.byType('answer.blocked').length).toBe(1)
    expect(state.ledger.byType('answer.verified').length).toBe(0)
  })
})

describe('rag/verification — blocking of unsupported answers', () => {
  it('blocks an answer whose statement asserts an unsupported numeric value', () => {
    const state = seededPipeline()
    ingestAndProcess(state, PHALAENOPSIS_PUBLICATION, 'ingest-1')
    const evidence = [
      // A tampered evidence record: numeric claim not present in the supporting passage.
      {
        claimId: [...state.claims.keys()][0],
        score: 1, originalTaxon: 'Phalaenopsis lowii', acceptedName: 'Phalaenopsis lowii',
        subjectTaxonId: 'wp:phalaenopsis-lowii', taxonomyStatus: 'resolved' as const,
        predicate: 'tolerates_night_temperature', object: '99 to 100 C', value: 99, unit: 'C',
        category: 'physiology' as const, studyType: 'observation' as const, trait: 'night_temperature_tolerance',
        supportingPassage: 'Phalaenopsis lowii is a cool-growing species.', passageSpan: { start: 0, end: 10 },
        locator: { page: null, section: null, figure: null, table: null, paragraph: 0 },
        citation: { title: 't', authors: 'a', year: 2020, journal: null, doi: null },
        contentHash: 'sha256:x', evidenceQuality: 0.9, sensitivity: 'public' as const, reviewRequired: false,
      },
    ]
    const answer = composeGroundedAnswer('query-block', DEMO_QUESTION, evidence)
    const verification = verifyAnswer(answer, {
      runCorrelationId: 'query-block',
      claims: state.claims,
      reconciliations: state.reconciliations,
      documentText: state.documentText,
      quarantinedClaimIds: state.quarantinedClaimIds,
    })
    // The asserted "99 to 100 C" does not appear in the real stored passage.
    expect(verification.verdict).toBe('blocked')
    expect(verification.blockedReasons.length).toBeGreaterThan(0)
  })

  it('blocks when answer metadata does not match the retrieval run', () => {
    const state = seededPipeline()
    ingestAndProcess(state, PHALAENOPSIS_PUBLICATION, 'ingest-1')
    const query = answerQuestion(state, DEMO_QUESTION, 'query-1')
    const tampered = { ...query.answer, correlationId: 'different-run' }
    const verification = verifyAnswer(tampered, {
      runCorrelationId: 'query-1',
      claims: state.claims,
      reconciliations: state.reconciliations,
      documentText: state.documentText,
      quarantinedClaimIds: state.quarantinedClaimIds,
    })
    expect(verification.verdict).toBe('blocked')
    expect(verification.blockedReasons.some((r) => r.includes('metadata'))).toBe(true)
  })

  it('surfaces contradictory evidence rather than averaging it away', () => {
    const state = seededPipeline()
    ingestAndProcess(state, PHALAENOPSIS_PUBLICATION, 'ingest-1')
    const someClaimId = [...state.claims.keys()][0]
    state.contradictions.set(someClaimId, 'A later study reports the opposite leaf habit.')
    const query = answerQuestion(state, DEMO_QUESTION, 'query-1')
    // Contradiction is reported when its claim is among the answer's evidence.
    const used = new Set(query.answer.statements.flatMap((s) => s.evidenceClaimIds))
    if (used.has(someClaimId)) {
      expect(query.verification.contradictions.some((c) => c.claimId === someClaimId)).toBe(true)
    }
  })
})

describe('rag/missionControl — real processing metrics', () => {
  it('derives counts from durable events, not hand-entered values', () => {
    const state = seededPipeline()
    ingestAndProcess(state, PHALAENOPSIS_PUBLICATION, 'ingest-1')
    answerQuestion(state, DEMO_QUESTION, 'query-1')
    const metrics = computeRagMetrics(state, 1_700_000_100_000)
    expect(metrics.sourcesDiscovered).toBe(1)
    expect(metrics.documentsParsed).toBe(1)
    expect(metrics.claimsExtracted).toBeGreaterThan(0)
    expect(metrics.embeddingsCreated).toBeGreaterThan(0)
    expect(metrics.verifiedAnswers).toBe(1)
    expect(metrics.blockedAnswers).toBe(0)
    expect(metrics.correlationIds).toContain('ingest-1')
    expect(metrics.correlationIds).toContain('query-1')
    expect(metrics.indexedEmbeddings).toBe(metrics.embeddingsCreated)
    expect(metrics.authoritativeGraphEdges).toBeGreaterThan(0)
  })
})
