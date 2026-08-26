import { describe, it, expect } from 'vitest'
import { createPipeline, ingestAndProcess, answerQuestion } from './pipeline'
import { retrieveEvidence } from './retrieval'
import { buildEvidenceView } from './evidenceView'
import { PHALAENOPSIS_PUBLICATION, DEMO_QUESTION } from './fixtures/phalaenopsis'

function seeded() {
  let tick = 0
  return createPipeline({ now: () => new Date(1_700_000_000_000 + tick++ * 1000).toISOString() })
}

describe('rag/evidenceView', () => {
  it('maps a verified run to verified statements and evidence rows', () => {
    const state = seeded()
    ingestAndProcess(state, PHALAENOPSIS_PUBLICATION, 'ingest-1')
    const query = answerQuestion(state, DEMO_QUESTION, 'query-1')
    const view = buildEvidenceView({
      answer: query.answer,
      verification: query.verification,
      evidence: query.evidence,
    })
    expect(view.answerState).toBe('verified')
    expect(view.rows.length).toBeGreaterThan(0)
    expect(view.rows.some((r) => r.displayState === 'verified')).toBe(true)
    // Accepted names shown, original names preserved.
    expect(view.rows.every((r) => r.originalName.length > 0)).toBe(true)
    // Reproducibility hashes carried through.
    expect(view.reproducibilityHashes.every((h) => h.startsWith('sha256:'))).toBe(true)
  })

  it('marks quarantined and ambiguous evidence distinctly', () => {
    const state = seeded()
    ingestAndProcess(state, PHALAENOPSIS_PUBLICATION, 'ingest-1')
    const query = answerQuestion(state, DEMO_QUESTION, 'query-1')
    const claimId = query.evidence[0].claimId
    const view = buildEvidenceView({
      answer: query.answer,
      verification: query.verification,
      evidence: query.evidence,
      quarantinedClaimIds: new Set([claimId]),
      contradictions: new Map([[query.evidence[1]?.claimId ?? 'none', 'conflicting later study']]),
    })
    expect(view.rows.find((r) => r.claimId === claimId)?.displayState).toBe('quarantined')
  })

  it('reports insufficient evidence as its own display state', () => {
    const state = seeded()
    ingestAndProcess(state, PHALAENOPSIS_PUBLICATION, 'ingest-1')
    const query = answerQuestion(state, 'unrelated nonsense qqqq zzzz', 'query-1')
    const view = buildEvidenceView({
      answer: query.answer,
      verification: query.verification,
      evidence: retrieveEvidence('unrelated nonsense qqqq zzzz', state.index, { claims: state.claims, reconciliations: state.reconciliations }),
    })
    expect(view.answerState).toBe('insufficient_evidence')
    expect(view.statements).toHaveLength(0)
  })
})
