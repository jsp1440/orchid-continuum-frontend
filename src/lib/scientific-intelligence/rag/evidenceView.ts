/**
 * View-model for the user-visible evidence / provenance surface.
 *
 * Kept as pure functions (node-testable) so the React component stays a thin
 * renderer. It maps a query run to the seven display states the directive
 * requires — verified, inferred, disputed, ambiguous, quarantined,
 * insufficient evidence, blocked — without inventing any state the backend
 * pipeline did not produce.
 */

import { GroundedAnswer } from './answer'
import { RetrievedEvidence } from './retrieval'
import { AnswerVerificationResult } from './verification'

export type EvidenceDisplayState =
  | 'verified'
  | 'inferred'
  | 'disputed'
  | 'ambiguous'
  | 'quarantined'
  | 'insufficient_evidence'
  | 'blocked'

export type EvidenceRowView = {
  claimId: string
  displayState: EvidenceDisplayState
  claim: string
  acceptedName: string | null
  originalName: string
  evidenceType: string
  studyType: string
  confidence: number
  citation: string
  supportingPassage: string
  locator: string
  taxonomyStatus: string
  contentHash: string
  contradiction: string | null
}

export type EvidenceViewModel = {
  correlationId: string
  question: string
  answerState: EvidenceDisplayState
  answerStateLabel: string
  statements: Array<{
    id: string
    text: string
    kind: 'observed' | 'inferred'
    scope: 'species' | 'general_cultivation'
    confidence: number
  }>
  rows: EvidenceRowView[]
  checks: AnswerVerificationResult['checks']
  blockedReasons: string[]
  reproducibilityHashes: string[]
}

const STATE_LABEL: Record<EvidenceDisplayState, string> = {
  verified: 'Verified',
  inferred: 'Inferred',
  disputed: 'Disputed',
  ambiguous: 'Ambiguous taxon',
  quarantined: 'Quarantined',
  insufficient_evidence: 'Insufficient evidence',
  blocked: 'Blocked',
}

export function stateLabel(state: EvidenceDisplayState): string {
  return STATE_LABEL[state]
}

function locatorText(locator: RetrievedEvidence['locator']): string {
  const parts: string[] = []
  if (locator.section) parts.push(locator.section)
  if (locator.paragraph != null) parts.push(`¶${locator.paragraph}`)
  if (locator.page != null) parts.push(`p.${locator.page}`)
  if (locator.figure) parts.push(`fig.${locator.figure}`)
  if (locator.table) parts.push(`tbl.${locator.table}`)
  return parts.length ? parts.join(' · ') : 'no locator'
}

export type BuildEvidenceViewInput = {
  answer: GroundedAnswer
  verification: AnswerVerificationResult
  evidence: RetrievedEvidence[]
  quarantinedClaimIds?: Set<string>
  contradictions?: Map<string, string>
}

export function buildEvidenceView(input: BuildEvidenceViewInput): EvidenceViewModel {
  const { answer, verification, evidence } = input
  const quarantined = input.quarantinedClaimIds ?? new Set<string>()
  const contradictions = input.contradictions ?? new Map<string, string>()

  const answerState: EvidenceDisplayState =
    answer.status === 'insufficient_evidence'
      ? 'insufficient_evidence'
      : verification.verdict === 'blocked'
        ? 'blocked'
        : 'verified'

  const usedClaimIds = new Set(answer.statements.flatMap((statement) => statement.evidenceClaimIds))

  const rows: EvidenceRowView[] = evidence.map((item) => {
    const contradiction = contradictions.get(item.claimId) ?? null
    let displayState: EvidenceDisplayState
    if (quarantined.has(item.claimId)) displayState = 'quarantined'
    else if (item.taxonomyStatus === 'ambiguous' || item.taxonomyStatus === 'unresolved') displayState = 'ambiguous'
    else if (contradiction) displayState = 'disputed'
    else if (answerState === 'blocked') displayState = 'blocked'
    else if (usedClaimIds.has(item.claimId) && answerState === 'verified') displayState = 'verified'
    else displayState = 'inferred'

    return {
      claimId: item.claimId,
      displayState,
      claim: `${item.predicate.replace(/_/g, ' ')}: ${item.object}`,
      acceptedName: item.acceptedName,
      originalName: item.originalTaxon,
      evidenceType: item.category,
      studyType: item.studyType,
      confidence: Number(item.evidenceQuality.toFixed(2)),
      citation: `${item.citation.authors} (${item.citation.year ?? 'n.d.'}) — ${item.citation.title}`,
      supportingPassage: item.supportingPassage,
      locator: locatorText(item.locator),
      taxonomyStatus: item.taxonomyStatus,
      contentHash: item.contentHash,
      contradiction,
    }
  })

  return {
    correlationId: answer.correlationId,
    question: answer.question,
    answerState,
    answerStateLabel: STATE_LABEL[answerState],
    statements: answer.statements.map((statement) => ({
      id: statement.id,
      text: statement.text,
      kind: statement.kind,
      scope: statement.scope,
      confidence: statement.confidence,
    })),
    rows,
    checks: verification.checks,
    blockedReasons: verification.blockedReasons,
    reproducibilityHashes: answer.usedEvidenceHashes,
  }
}
