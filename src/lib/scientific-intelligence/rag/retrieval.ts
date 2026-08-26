/**
 * Hybrid retrieval that hydrates full, provenance-bearing evidence records from
 * an index hit.
 *
 * Retrieval combines semantic index search with the exact taxon/entity, quality,
 * and sensitivity filters the index enforces, then joins each hit back to its
 * stored claim and taxon reconciliation so the answer layer receives evidence
 * carrying accepted + original names, the supporting passage, the locator, the
 * citation, and the content hash. Protected locality is excluded upstream by the
 * index and never appears here.
 */

import { ScientificClaim, SensitivityClass } from './contracts'
import { RetrievalIndex, RetrievalFilters } from './embeddingIndex'
import { TaxonReconciliation } from './taxonomy'

export type RetrievedEvidence = {
  claimId: string
  score: number
  originalTaxon: string
  acceptedName: string | null
  subjectTaxonId: string | null
  taxonomyStatus: TaxonReconciliation['status']
  predicate: string
  object: string
  value: number | null
  unit: string | null
  category: ScientificClaim['category']
  studyType: ScientificClaim['studyType']
  trait: string | null
  supportingPassage: string
  passageSpan: { start: number; end: number }
  locator: ScientificClaim['locator']
  citation: ScientificClaim['citation']
  contentHash: string
  evidenceQuality: number
  sensitivity: SensitivityClass
  reviewRequired: boolean
}

export type EvidenceStores = {
  claims: Map<string, ScientificClaim>
  reconciliations: Map<string, TaxonReconciliation>
}

export function buildEvidenceRecord(
  claim: ScientificClaim,
  reconciliation: TaxonReconciliation | undefined,
  score: number,
  evidenceQuality: number,
): RetrievedEvidence {
  return {
    claimId: claim.claimId,
    score,
    originalTaxon: claim.originalTaxon,
    acceptedName: reconciliation?.acceptedName ?? null,
    subjectTaxonId: reconciliation?.acceptedTaxonId ?? claim.subjectTaxonId,
    taxonomyStatus: reconciliation?.status ?? 'unresolved',
    predicate: claim.predicate,
    object: claim.object,
    value: claim.value,
    unit: claim.unit,
    category: claim.category,
    studyType: claim.studyType,
    trait: claim.trait,
    supportingPassage: claim.supportingPassage,
    passageSpan: claim.passageSpan,
    locator: claim.locator,
    citation: claim.citation,
    contentHash: claim.contentHash,
    evidenceQuality,
    sensitivity: claim.sensitivity,
    reviewRequired: reconciliation?.reviewRequired ?? true,
  }
}

export function retrieveEvidence(
  question: string,
  index: RetrievalIndex,
  stores: EvidenceStores,
  filters: RetrievalFilters = {},
): RetrievedEvidence[] {
  const hits = index.search(question, {
    allowedSensitivity: ['public'],
    ...filters,
  })

  const evidence: RetrievedEvidence[] = []
  for (const hit of hits) {
    const claim = stores.claims.get(hit.record.claimId)
    if (!claim) continue
    // Defence in depth: never surface protected content even if it reached the store.
    if (claim.sensitivity === 'protected_locality') continue
    const reconciliation = stores.reconciliations.get(claim.claimId)
    evidence.push(buildEvidenceRecord(claim, reconciliation, hit.score, hit.record.evidenceQuality))
  }
  return evidence
}
