import { describe, it, expect } from 'vitest'
import { ingestPublication, parseDocument } from './ingestion'
import { extractClaims } from './extraction'
import { reconcileTaxon, TAXONOMY_VERSION } from './taxonomy'
import { RetrievalIndex } from './embeddingIndex'
import { KnowledgeGraph } from './knowledgeGraph'
import { claimIsSupportedBy } from './contracts'
import { PHALAENOPSIS_PUBLICATION, PHALAENOPSIS_PUBLICATION_V2 } from './fixtures/phalaenopsis'

describe('rag/ingestion — content hashing & change detection', () => {
  it('produces a stable content hash and treats unchanged re-ingest as a no-op', () => {
    const first = ingestPublication(PHALAENOPSIS_PUBLICATION, null)
    expect(first.changed).toBe(true)
    expect(first.reason).toBe('new')
    const again = ingestPublication(PHALAENOPSIS_PUBLICATION, first.source)
    expect(again.changed).toBe(false)
    expect(again.reason).toBe('unchanged')
    expect(again.source.contentHash).toBe(first.source.contentHash)
  })

  it('detects a materially changed publication and bumps the version', () => {
    const first = ingestPublication(PHALAENOPSIS_PUBLICATION, null)
    const changed = ingestPublication(PHALAENOPSIS_PUBLICATION_V2, first.source)
    expect(changed.changed).toBe(true)
    expect(changed.reason).toBe('content_changed')
    expect(changed.source.version).toBe(first.source.version + 1)
    expect(changed.source.contentHash).not.toBe(first.source.contentHash)
  })

  it('classifies protected-locality passages and excludes them from extractable text', () => {
    const { source } = ingestPublication(PHALAENOPSIS_PUBLICATION, null)
    const doc = parseDocument(PHALAENOPSIS_PUBLICATION, source)
    const protectedParas = doc.paragraphs.filter((p) => p.sensitivity === 'protected_locality')
    expect(protectedParas.length).toBe(1)
    expect(doc.extractableText).not.toContain('114.7550')
    // The full text is retained for audit, but the coordinates never reach extraction.
    expect(doc.fullText).toContain('114.7550')
  })
})

describe('rag/extraction — passage-level provenance & quarantine', () => {
  const { source } = ingestPublication(PHALAENOPSIS_PUBLICATION, null)
  const doc = parseDocument(PHALAENOPSIS_PUBLICATION, source)

  it('extracts claims whose passages are confirmed against the source', () => {
    const result = extractClaims(doc, PHALAENOPSIS_PUBLICATION)
    expect(result.accepted.length).toBeGreaterThan(0)
    for (const claim of result.accepted) {
      expect(claimIsSupportedBy(claim, doc.fullText)).toBe(true)
      expect(claim.originalTaxon).toMatch(/Phalaenopsis/)
      expect(claim.supportingPassage.length).toBeGreaterThan(0)
    }
  })

  it('recovers distinguishing traits: leaf persistence and night-temperature tolerance', () => {
    const result = extractClaims(doc, PHALAENOPSIS_PUBLICATION)
    const predicates = new Set(result.accepted.map((c) => c.predicate))
    expect(predicates.has('leaf_persistence')).toBe(true)
    expect(predicates.has('tolerates_night_temperature')).toBe(true)
    expect(predicates.has('occurs_at_elevation')).toBe(true)
  })

  it('never extracts from protected-locality paragraphs', () => {
    const result = extractClaims(doc, PHALAENOPSIS_PUBLICATION)
    for (const claim of [...result.accepted, ...result.quarantined.map((q) => q.claim)]) {
      expect(claim.supportingPassage).not.toContain('114.7550')
    }
  })
})

describe('rag/taxonomy — reconciliation & ambiguity', () => {
  it('resolves an accepted name, preserving original and accepted', () => {
    const r = reconcileTaxon('Phalaenopsis lowii')
    expect(r.status).toBe('resolved')
    expect(r.acceptedName).toBe('Phalaenopsis lowii')
    expect(r.originalName).toBe('Phalaenopsis lowii')
    expect(r.acceptedTaxonId).toBe('wp:phalaenopsis-lowii')
    expect(r.taxonomyVersion).toBe(TAXONOMY_VERSION)
  })

  it('maps a synonym to its accepted name', () => {
    const r = reconcileTaxon('Phalaenopsis grandiflora')
    expect(r.status).toBe('resolved')
    expect(r.relationship).toBe('synonym')
    expect(r.acceptedName).toBe('Phalaenopsis amabilis')
    expect(r.synonymOf).toBe('Phalaenopsis amabilis')
  })

  it('fails closed on a materially ambiguous name', () => {
    const r = reconcileTaxon('Phalaenopsis intermedia')
    expect(r.status).toBe('ambiguous')
    expect(r.acceptedTaxonId).toBeNull()
    expect(r.reviewRequired).toBe(true)
    expect(r.candidates.length).toBeGreaterThan(1)
  })
})

describe('rag/embeddingIndex — reuse & hybrid filters', () => {
  it('reuses an embedding when content hash and model/version are unchanged', () => {
    const index = new RetrievalIndex(() => '2020-01-01T00:00:00.000Z')
    const input = {
      claimId: 'c1', sourceId: 's1', sourceVersion: 1, contentHash: 'sha256:aaa',
      taxonomyVersion: TAXONOMY_VERSION, subjectTaxonId: 'wp:phalaenopsis-lowii',
      sensitivity: 'public' as const, evidenceQuality: 0.9, text: 'cool growing thin leaves',
    }
    const first = index.upsert(input)
    expect(first.reused).toBe(false)
    const again = index.upsert(input)
    expect(again.reused).toBe(true)
    expect(index.size()).toBe(1)
  })

  it('regenerates when content changes', () => {
    const index = new RetrievalIndex(() => '2020-01-01T00:00:00.000Z')
    const base = {
      claimId: 'c1', sourceId: 's1', sourceVersion: 1,
      taxonomyVersion: TAXONOMY_VERSION, subjectTaxonId: null,
      sensitivity: 'public' as const, evidenceQuality: 0.9, text: 'text',
    }
    index.upsert({ ...base, contentHash: 'sha256:aaa' })
    const changed = index.upsert({ ...base, contentHash: 'sha256:bbb' })
    expect(changed.reused).toBe(false)
  })

  it('applies taxon and sensitivity filters, never returning protected locality', () => {
    const index = new RetrievalIndex(() => '2020-01-01T00:00:00.000Z')
    index.upsert({ claimId: 'c1', sourceId: 's', sourceVersion: 1, contentHash: 'sha256:1', taxonomyVersion: TAXONOMY_VERSION, subjectTaxonId: 'wp:phalaenopsis-lowii', sensitivity: 'public', evidenceQuality: 0.9, text: 'cool growing montane thin deciduous leaves' })
    index.upsert({ claimId: 'c2', sourceId: 's', sourceVersion: 1, contentHash: 'sha256:2', taxonomyVersion: TAXONOMY_VERSION, subjectTaxonId: 'wp:phalaenopsis-amabilis', sensitivity: 'public', evidenceQuality: 0.9, text: 'warm growing lowland thick evergreen leaves' })
    index.upsert({ claimId: 'c3', sourceId: 's', sourceVersion: 1, contentHash: 'sha256:3', taxonomyVersion: TAXONOMY_VERSION, subjectTaxonId: 'wp:phalaenopsis-lowii', sensitivity: 'protected_locality', evidenceQuality: 0.9, text: 'cool growing montane locality coordinates' })

    const taxonHits = index.search('cool growing thin leaves', { subjectTaxonId: 'wp:phalaenopsis-lowii' })
    expect(taxonHits.every((h) => h.record.subjectTaxonId === 'wp:phalaenopsis-lowii')).toBe(true)
    // Even if a caller explicitly asks for protected sensitivity, it is excluded.
    const leak = index.search('cool growing montane', { allowedSensitivity: ['public', 'protected_locality'] })
    expect(leak.every((h) => h.record.sensitivity !== 'protected_locality')).toBe(true)
  })
})

describe('rag/knowledgeGraph — idempotency & provenance', () => {
  const edgeInput = {
    subjectTaxonId: 'wp:phalaenopsis-lowii', subjectAcceptedName: 'Phalaenopsis lowii', subjectOriginalName: 'Phalaenopsis lowii',
    predicate: 'leaf_persistence', object: 'deciduous_thin', activation: 'authoritative' as const,
    claimId: 'c1', sourceDocumentId: 'doc1', supportingPassage: 'leaves are thin', passageSpan: { start: 0, end: 15 },
    contentHash: 'sha256:aaa', taxonomyVersion: TAXONOMY_VERSION, extractorVersion: '1.0.0', sensitivity: 'public' as const,
  }

  it('does not duplicate an edge when the same claim is applied twice (replay-safe)', () => {
    const graph = new KnowledgeGraph(() => '2020-01-01T00:00:00.000Z')
    const first = graph.upsertEdge(edgeInput)
    expect(first.created).toBe(true)
    const again = graph.upsertEdge(edgeInput)
    expect(again.created).toBe(false)
    expect(graph.edgeCount()).toBe(1)
    expect(again.edge.provenance.claimId).toBe('c1')
  })

  it('refuses protected-locality content', () => {
    const graph = new KnowledgeGraph()
    expect(() => graph.upsertEdge({ ...edgeInput, sensitivity: 'protected_locality' })).toThrow(/protected/i)
  })

  it('keeps ambiguous-derived edges out of the authoritative set', () => {
    const graph = new KnowledgeGraph(() => '2020-01-01T00:00:00.000Z')
    graph.upsertEdge({ ...edgeInput, claimId: 'c2', activation: 'restricted', subjectTaxonId: 'unresolved:x' })
    expect(graph.authoritativeEdges().length).toBe(0)
    expect(graph.allEdges().length).toBe(1)
  })
})
