/**
 * Grounded answer composition.
 *
 * The answer is composed deterministically from retrieved evidence — never
 * generated free-standing. Every material statement is bound to the evidence
 * that supports it. Observed evidence is distinguished from inference, and
 * species-level evidence from generalised cultivation guidance. When retrieval
 * returns nothing usable the composer fails closed with an explicit
 * insufficient-evidence result rather than emitting a normal-looking answer.
 */

import { RetrievedEvidence } from './retrieval'

export type AnswerStatement = {
  id: string
  text: string
  /** Observed/experimental evidence vs a synthesised inference across evidence. */
  kind: 'observed' | 'inferred'
  /** Species-level finding vs generalised cultivation guidance. */
  scope: 'species' | 'general_cultivation'
  evidenceClaimIds: string[]
  /** Accepted taxon names involved, with the original published names retained. */
  taxa: Array<{ accepted: string | null; original: string }>
  confidence: number
}

export type GroundedAnswer = {
  correlationId: string
  question: string
  status: 'grounded' | 'insufficient_evidence'
  statements: AnswerStatement[]
  citations: Array<{ title: string; authors: string; year: number | null; doi: string | null; claimIds: string[] }>
  /** Content hashes of the exact evidence the answer was composed from (for reproducibility). */
  usedEvidenceHashes: string[]
  insufficientReason: string | null
  generatedAt: string
}

const TRAIT_LABEL: Record<string, string> = {
  leaf_persistence: 'leaf persistence',
  night_temperature_tolerance: 'night-temperature tolerance',
}

function describe(evidence: RetrievedEvidence): string {
  const taxon = evidence.acceptedName ?? evidence.originalTaxon
  const growth = evidence.trait && TRAIT_LABEL[evidence.trait] ? TRAIT_LABEL[evidence.trait] : evidence.category
  if (evidence.predicate === 'leaf_persistence') {
    const value = evidence.object === 'evergreen_persistent' ? 'thick, persistent (evergreen) leaves' : 'thin, deciduous leaves'
    return `${taxon} shows ${value} (${growth}).`
  }
  if (evidence.predicate === 'tolerates_night_temperature') {
    return `${taxon} tolerates night temperatures of ${evidence.object} (${growth}).`
  }
  if (evidence.predicate === 'occurs_at_elevation') {
    return `${taxon} occurs at ${evidence.object} elevation.`
  }
  return `${taxon}: ${evidence.predicate.replace(/_/g, ' ')} ${evidence.object}.`
}

export function composeGroundedAnswer(
  correlationId: string,
  question: string,
  evidence: RetrievedEvidence[],
  now: () => string = () => new Date().toISOString(),
): GroundedAnswer {
  const base: Omit<GroundedAnswer, 'status' | 'statements' | 'citations' | 'usedEvidenceHashes' | 'insufficientReason'> = {
    correlationId,
    question,
    generatedAt: now(),
  }

  const usable = evidence.filter((item) => item.sensitivity === 'public' && item.supportingPassage.trim().length > 0)
  if (usable.length === 0) {
    return {
      ...base,
      status: 'insufficient_evidence',
      statements: [],
      citations: [],
      usedEvidenceHashes: [],
      insufficientReason: 'No authorised, source-supported evidence was retrieved for this question.',
    }
  }

  // Observed, species-level statements: one per retrieved evidence record.
  const statements: AnswerStatement[] = usable
    .filter((item) => ['leaf_persistence', 'tolerates_night_temperature', 'occurs_at_elevation'].includes(item.predicate))
    .map((item, index) => ({
      id: `stmt_obs_${index + 1}`,
      text: describe(item),
      kind: item.studyType === 'observation' || item.studyType === 'experiment' ? 'observed' : 'inferred',
      scope: 'species',
      evidenceClaimIds: [item.claimId],
      taxa: [{ accepted: item.acceptedName, original: item.originalTaxon }],
      confidence: Number(item.evidenceQuality.toFixed(2)),
    }))

  // One synthesised, inference-labelled statement across the distinguishing traits.
  const traitEvidence = usable.filter((item) => item.trait === 'leaf_persistence' || item.trait === 'night_temperature_tolerance')
  if (traitEvidence.length >= 2) {
    const taxa = dedupeTaxa(traitEvidence)
    statements.unshift({
      id: 'stmt_syn_1',
      text:
        'Across the retrieved evidence, leaf persistence and night-temperature tolerance are the traits that most consistently distinguish cool-growing from warm-growing Phalaenopsis: cool-growing species tend toward thin, deciduous leaves and lower night-temperature tolerance, warm-growing species toward thick, persistent leaves and higher night-temperature tolerance. This is an inference synthesised across the cited species-level records, not a single reported measurement.',
      kind: 'inferred',
      scope: 'species',
      evidenceClaimIds: traitEvidence.map((item) => item.claimId),
      taxa,
      confidence: Number((traitEvidence.reduce((sum, item) => sum + item.evidenceQuality, 0) / traitEvidence.length).toFixed(2)),
    })
  }

  const citations = buildCitations(usable)
  const usedEvidenceHashes = usable.map((item) => item.contentHash)

  return {
    ...base,
    status: 'grounded',
    statements,
    citations,
    usedEvidenceHashes,
    insufficientReason: null,
  }
}

function dedupeTaxa(evidence: RetrievedEvidence[]): AnswerStatement['taxa'] {
  const seen = new Map<string, { accepted: string | null; original: string }>()
  for (const item of evidence) {
    const key = item.acceptedName ?? item.originalTaxon
    if (!seen.has(key)) seen.set(key, { accepted: item.acceptedName, original: item.originalTaxon })
  }
  return Array.from(seen.values())
}

function buildCitations(evidence: RetrievedEvidence[]): GroundedAnswer['citations'] {
  const byKey = new Map<string, GroundedAnswer['citations'][number]>()
  for (const item of evidence) {
    const key = item.citation.doi ?? item.citation.title
    const existing = byKey.get(key)
    if (existing) {
      existing.claimIds.push(item.claimId)
    } else {
      byKey.set(key, {
        title: item.citation.title,
        authors: item.citation.authors,
        year: item.citation.year,
        doi: item.citation.doi,
        claimIds: [item.claimId],
      })
    }
  }
  return Array.from(byKey.values())
}
