import { describe, it, expect } from 'vitest'
import {
  validateDomainEvent,
  validateScientificClaim,
  claimIsSupportedBy,
  isProtectedLocality,
  DOMAIN_EVENT_TYPES,
  type ScientificClaim,
} from './contracts'

function validClaim(overrides: Partial<ScientificClaim> = {}): ScientificClaim {
  const passage = 'Phalaenopsis lowii is cool-growing.'
  return {
    claimId: 'c1',
    schemaVersion: '1.0.0',
    originalTaxon: 'Phalaenopsis lowii',
    normalizedSubject: 'Phalaenopsis lowii',
    subjectTaxonId: null,
    predicate: 'growth_habit',
    object: 'cool-growing',
    value: null,
    unit: null,
    qualifiers: [],
    lifeStage: null,
    organ: null,
    geography: null,
    elevationRange: null,
    habitat: null,
    methodology: null,
    sampleSize: null,
    studyType: 'observation',
    category: 'physiology',
    hypothesis: null,
    result: null,
    conclusion: null,
    pollinator: null,
    mycorrhizalAssociate: null,
    trait: null,
    temporalContext: null,
    uncertainty: null,
    extractionConfidence: 0.9,
    reviewStatus: 'unreviewed',
    sourceDocumentId: 'doc1',
    citation: { title: 'A study', authors: 'X', year: 2020, journal: null, doi: null },
    locator: { page: null, section: null, figure: null, table: null, paragraph: 0 },
    supportingPassage: passage,
    passageSpan: { start: 0, end: passage.length },
    extractor: 'test',
    extractorVersion: '1.0.0',
    extractedAt: '2020-01-01T00:00:00.000Z',
    sensitivity: 'public',
    contentHash: 'sha256:abc',
    ...overrides,
  }
}

describe('rag/contracts — event schema validation', () => {
  it('accepts a well-formed event envelope', () => {
    const result = validateDomainEvent({
      eventId: 'e1',
      type: 'claim.extracted',
      schemaVersion: '1.0.0',
      aggregateId: 'c1',
      correlationId: 'run1',
      contentHash: 'sha256:x',
      producer: 'extractor',
      idempotencyKey: 'k1',
      attempt: 0,
      sensitivity: 'public',
    })
    expect(result.valid).toBe(true)
  })

  it('rejects an unknown event type and missing fields', () => {
    const result = validateDomainEvent({ type: 'not.a.real.event' as never, attempt: -1 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('not a known domain event'))).toBe(true)
    expect(result.errors.some((e) => e.includes('eventId'))).toBe(true)
  })

  it('enumerates the full versioned event vocabulary', () => {
    expect(DOMAIN_EVENT_TYPES).toContain('answer.blocked')
    expect(DOMAIN_EVENT_TYPES).toContain('taxon.ambiguous')
    expect(DOMAIN_EVENT_TYPES).toContain('embedding.reused')
  })
})

describe('rag/contracts — claim schema validation', () => {
  it('accepts a claim with a supporting passage and coherent span', () => {
    expect(validateScientificClaim(validClaim()).valid).toBe(true)
  })

  it('rejects a claim with no supporting passage', () => {
    const result = validateScientificClaim(validClaim({ supportingPassage: '' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('supportingPassage'))).toBe(true)
  })

  it('rejects an incoherent passage span', () => {
    const result = validateScientificClaim(validClaim({ passageSpan: { start: 5, end: 5 } }))
    expect(result.valid).toBe(false)
  })

  it('confirms passage support against document text, and rejects a mismatch', () => {
    const doc = 'Phalaenopsis lowii is cool-growing. Extra text.'
    expect(claimIsSupportedBy(validClaim(), doc)).toBe(true)
    expect(claimIsSupportedBy(validClaim({ supportingPassage: 'fabricated claim' }), doc)).toBe(false)
  })
})

describe('rag/contracts — protected locality', () => {
  it('detects decimal-degree coordinates', () => {
    expect(isProtectedLocality('located at 4.2109 N, 114.7550 E on a ridge')).toBe(true)
    expect(isProtectedLocality('grows in montane forest')).toBe(false)
  })
})
