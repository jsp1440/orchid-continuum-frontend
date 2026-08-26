/**
 * Deterministic scientific-claim extraction with passage-level provenance.
 *
 * No model call is made here: extraction is rule-based so CI is reproducible and
 * every claim is anchored to an exact source span. (In production an LLM
 * extractor could feed the same contract, but its output would pass through the
 * identical validation and support checks below; invalid output is quarantined,
 * never accepted.)
 *
 * Each recovered claim preserves the taxon string exactly as published, a
 * normalized representation, the supporting passage, and the [start,end) span of
 * that passage within the full document text. A claim whose passage cannot be
 * confirmed against the document, or that fails contract validation, is routed
 * to quarantine and excluded from evidence.
 */

import {
  ClaimCategory,
  CLAIM_CONTRACT_VERSION,
  ScientificClaim,
  claimIsSupportedBy,
  validateScientificClaim,
} from './contracts'
import { contentHash } from './hash'
import type { ParsedDocument } from './ingestion'
import type { RawPublication } from './fixtures/phalaenopsis'

export const EXTRACTOR = 'oc-rule-extractor'
export const EXTRACTOR_VERSION = '1.0.0'

const TAXON_PATTERN = /Phalaenopsis\s+[a-z]+/g

type ClaimSeed = {
  category: ClaimCategory
  predicate: string
  object: string
  value?: number | null
  unit?: string | null
  trait?: string | null
  elevationRange?: ScientificClaim['elevationRange']
  studyType?: ScientificClaim['studyType']
  sampleSize?: number | null
  pollinator?: string | null
  hypothesis?: string | null
  result?: string | null
  conclusion?: string | null
  qualifiers?: string[]
  confidence: number
}

/** Ordered matchers. Each returns zero or more claim seeds for a paragraph. */
const MATCHERS: Array<(text: string) => ClaimSeed[]> = [
  // Elevation ranges.
  (text) => {
    const m = text.match(/(\d+)\s*to\s*(\d+)\s*m\b/)
    if (!m) return []
    const min = Number(m[1])
    const max = Number(m[2])
    return [{
      category: 'elevation',
      predicate: 'occurs_at_elevation',
      object: `${min}-${max} m`,
      elevationRange: { min, max, unit: 'm' },
      studyType: /observed|recorded/i.test(text) ? 'observation' : 'unknown',
      confidence: 0.9,
    }]
  },
  // Night-temperature tolerance.
  (text) => {
    const m = text.match(/night temperatures of (\d+)\s*to\s*(\d+)\s*C/i)
    if (!m) return []
    const sample = text.match(/n\s*=\s*(\d+)/i)
    return [{
      category: 'physiology',
      predicate: 'tolerates_night_temperature',
      object: `${m[1]}-${m[2]} C`,
      value: Number(m[1]),
      unit: 'C',
      trait: 'night_temperature_tolerance',
      studyType: /experimental|chamber/i.test(text) ? 'experiment' : 'observation',
      sampleSize: sample ? Number(sample[1]) : null,
      qualifiers: [`upper ${m[2]} C`],
      confidence: 0.88,
    }]
  },
  // Leaf persistence / morphology.
  (text) => {
    if (!/leaf|leaves/i.test(text)) return []
    const deciduous = /deciduous|thin|leaf drop|dry-season leaf/i.test(text)
    const evergreen = /evergreen|persistent|thick/i.test(text)
    if (!deciduous && !evergreen) return []
    const persistence = evergreen && !deciduous ? 'evergreen_persistent' : 'deciduous_thin'
    return [{
      category: 'morphology',
      predicate: 'leaf_persistence',
      object: persistence,
      trait: 'leaf_persistence',
      studyType: 'observation',
      confidence: 0.85,
    }]
  },
  // Pollinator association.
  (text) => {
    const m = text.match(/genus\s+([A-Z][a-z]+)/)
    if (!m || !/pollinat/i.test(text)) return []
    return [{
      category: 'pollinators',
      predicate: 'pollinated_by',
      object: m[1],
      pollinator: m[1],
      studyType: 'observation',
      confidence: 0.8,
    }]
  },
  // Hypothesis.
  (text) => {
    if (!/hypothesi/i.test(text)) return []
    return [{ category: 'hypothesis', predicate: 'hypothesis', object: text.trim(), hypothesis: text.trim(), studyType: 'review', confidence: 0.7 }]
  },
  // Result.
  (text) => {
    if (!/^Results/i.test(text.trim()) && !/results supported/i.test(text)) return []
    const sample = text.match(/(\d+)\s*of\s*(\d+)/)
    return [{
      category: 'result',
      predicate: 'result',
      object: text.trim(),
      result: text.trim(),
      sampleSize: sample ? Number(sample[2]) : null,
      studyType: 'observation',
      confidence: 0.82,
    }]
  },
  // Conclusion.
  (text) => {
    if (!/we conclude/i.test(text)) return []
    return [{ category: 'conclusion', predicate: 'conclusion', object: text.trim(), conclusion: text.trim(), studyType: 'review', confidence: 0.8 }]
  },
]

export type ExtractionResult = {
  accepted: ScientificClaim[]
  quarantined: Array<{ claim: ScientificClaim; reasons: string[] }>
}

function normalizeSubject(taxon: string): string {
  return taxon.replace(/\s+/g, ' ').trim()
}

/**
 * Extract claims from a parsed document. Only non-protected paragraphs are
 * considered; protected-locality passages never reach extraction. Spans are
 * recorded against the full document text for auditability.
 */
export function extractClaims(
  document: ParsedDocument,
  publication: RawPublication,
  now: () => string = () => new Date().toISOString(),
): ExtractionResult {
  const accepted: ScientificClaim[] = []
  const quarantined: ExtractionResult['quarantined'] = []
  let seq = 0

  for (const paragraph of document.paragraphs) {
    if (paragraph.sensitivity === 'protected_locality') continue

    const taxa = Array.from(paragraph.text.matchAll(TAXON_PATTERN)).map((m) => m[0])
    const originalTaxon = taxa[0] ?? 'Phalaenopsis'

    for (const matcher of MATCHERS) {
      for (const seed of matcher(paragraph.text)) {
        seq += 1
        const growthClass = /cool-growing/i.test(paragraph.text)
          ? 'cool-growing'
          : /warm-growing/i.test(paragraph.text)
            ? 'warm-growing'
            : null

        const claim: ScientificClaim = {
          claimId: `${document.documentId}::claim::${seq}`,
          schemaVersion: CLAIM_CONTRACT_VERSION,
          originalTaxon,
          normalizedSubject: normalizeSubject(originalTaxon),
          subjectTaxonId: null,
          predicate: seed.predicate,
          object: seed.object,
          value: seed.value ?? null,
          unit: seed.unit ?? null,
          qualifiers: [...(seed.qualifiers ?? []), ...(growthClass ? [growthClass] : [])],
          lifeStage: null,
          organ: seed.category === 'morphology' ? 'leaf' : null,
          geography: null,
          elevationRange: seed.elevationRange ?? null,
          habitat: /montane|lowland|forest/i.test(paragraph.text)
            ? (paragraph.text.match(/(montane[\w\s]*forest|lowland[\w\s]*forest)/i)?.[0]?.trim() ?? null)
            : null,
          methodology: seed.studyType === 'experiment' ? 'controlled chamber experiment' : null,
          sampleSize: seed.sampleSize ?? null,
          studyType: seed.studyType ?? 'unknown',
          category: seed.category,
          hypothesis: seed.hypothesis ?? null,
          result: seed.result ?? null,
          conclusion: seed.conclusion ?? null,
          pollinator: seed.pollinator ?? null,
          mycorrhizalAssociate: null,
          trait: seed.trait ?? null,
          temporalContext: /wet season|dry season/i.test(paragraph.text)
            ? (paragraph.text.match(/(early wet season|cool dry season|dry season)/i)?.[0] ?? null)
            : null,
          uncertainty: null,
          extractionConfidence: seed.confidence,
          reviewStatus: 'unreviewed',
          sourceDocumentId: document.documentId,
          citation: {
            title: publication.title,
            authors: publication.authors,
            year: publication.year,
            journal: publication.journal,
            doi: publication.doi,
          },
          locator: {
            page: null,
            section: paragraph.index === 1 ? 'Abstract' : null,
            figure: null,
            table: null,
            paragraph: paragraph.index,
          },
          supportingPassage: paragraph.text,
          passageSpan: paragraph.span,
          extractor: EXTRACTOR,
          extractorVersion: EXTRACTOR_VERSION,
          extractedAt: now(),
          sensitivity: 'public',
          contentHash: '',
        }
        claim.contentHash = contentHash({
          doc: document.documentId,
          predicate: claim.predicate,
          object: claim.object,
          span: claim.passageSpan,
          extractorVersion: claim.extractorVersion,
        })

        const reasons = validateScientificClaim(claim).errors
        if (!claimIsSupportedBy(claim, document.fullText)) {
          reasons.push('supportingPassage does not match the source document at the declared span')
        }
        if (reasons.length) {
          quarantined.push({ claim: { ...claim, reviewStatus: 'quarantined' }, reasons })
        } else {
          accepted.push(claim)
        }
      }
    }
  }

  return { accepted, quarantined }
}
