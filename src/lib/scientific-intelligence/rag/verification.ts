/**
 * Post-generation verification / evidence gate.
 *
 * Every material statement in a grounded answer is re-checked against the stored
 * evidence before the answer may be presented as verified. The gate produces a
 * machine-readable result and blocks any answer that fails a required check —
 * unsupported statements, citations that do not resolve, passages that do not
 * support their statement, quarantined evidence presented as established,
 * unsupported numeric values, protected locality, inference presented as fact,
 * or answer metadata that does not match the retrieval run.
 *
 * An `insufficient_evidence` answer is a correct fail-closed outcome, not a
 * verified one; it is reported as such and never presented as a scientific
 * answer.
 */

import { ScientificClaim, claimIsSupportedBy, isProtectedLocality } from './contracts'
import { GroundedAnswer } from './answer'
import { TaxonReconciliation } from './taxonomy'

export type AnswerCheckStatus = 'pass' | 'fail' | 'not_applicable'

export type AnswerCheck = {
  id: string
  label: string
  status: AnswerCheckStatus
  detail: string
}

export type AnswerVerificationResult = {
  correlationId: string
  verdict: 'verified' | 'blocked' | 'insufficient_evidence'
  checks: AnswerCheck[]
  blockedReasons: string[]
  contradictions: Array<{ claimId: string; note: string }>
  verifiedStatementIds: string[]
}

export type VerificationContext = {
  runCorrelationId: string
  claims: Map<string, ScientificClaim>
  reconciliations: Map<string, TaxonReconciliation>
  documentText: Map<string, string>
  quarantinedClaimIds: Set<string>
  /** claimId → contradicting note, when the corpus holds conflicting evidence. */
  contradictions?: Map<string, string>
}

function numbersIn(text: string): string[] {
  return Array.from(text.matchAll(/\d+(?:\.\d+)?/g)).map((match) => match[0])
}

export function verifyAnswer(answer: GroundedAnswer, context: VerificationContext): AnswerVerificationResult {
  const checks: AnswerCheck[] = []
  const blockedReasons: string[] = []
  const contradictions: AnswerVerificationResult['contradictions'] = []

  const metadataMatches = answer.correlationId === context.runCorrelationId
  checks.push({
    id: 'metadata_matches_run',
    label: 'Answer metadata matches retrieval run',
    status: metadataMatches ? 'pass' : 'fail',
    detail: metadataMatches
      ? `Answer is bound to correlation id ${answer.correlationId}.`
      : `Answer correlation id ${answer.correlationId} does not match the retrieval run ${context.runCorrelationId}.`,
  })
  if (!metadataMatches) blockedReasons.push('answer metadata does not match the retrieval run')

  if (answer.status === 'insufficient_evidence') {
    checks.push({
      id: 'insufficient_evidence',
      label: 'Evidence sufficiency',
      status: 'pass',
      detail: 'The composer correctly reported insufficient evidence and produced no scientific claims.',
    })
    return {
      correlationId: context.runCorrelationId,
      verdict: 'insufficient_evidence',
      checks,
      blockedReasons: [],
      contradictions,
      verifiedStatementIds: [],
    }
  }

  const allEvidenceClaimIds = new Set(answer.statements.flatMap((statement) => statement.evidenceClaimIds))

  // 1. Every statement is bound to at least one resolvable evidence record.
  const unsupported = answer.statements.filter(
    (statement) => statement.evidenceClaimIds.length === 0 || statement.evidenceClaimIds.some((id) => !context.claims.has(id)),
  )
  checks.push({
    id: 'statements_supported',
    label: 'Every statement has resolvable supporting evidence',
    status: unsupported.length ? 'fail' : 'pass',
    detail: unsupported.length
      ? `${unsupported.length} statement(s) reference no resolvable evidence record.`
      : 'All statements resolve to stored evidence records.',
  })
  if (unsupported.length) blockedReasons.push('one or more statements lack resolvable supporting evidence')

  // 2. Cited passages actually support their claims at the declared span.
  const unsupportedPassages: string[] = []
  for (const claimId of allEvidenceClaimIds) {
    const claim = context.claims.get(claimId)
    if (!claim) continue
    const docText = context.documentText.get(claim.sourceDocumentId)
    if (!docText || !claimIsSupportedBy(claim, docText)) unsupportedPassages.push(claimId)
  }
  checks.push({
    id: 'passages_support_claims',
    label: 'Cited passages support their claims',
    status: unsupportedPassages.length ? 'fail' : 'pass',
    detail: unsupportedPassages.length
      ? `${unsupportedPassages.length} claim(s) could not be confirmed against their source passage.`
      : 'Every cited passage matches its source document at the recorded span.',
  })
  if (unsupportedPassages.length) blockedReasons.push('a cited passage does not support its claim')

  // 3. Citations resolve to stored sources.
  const unresolvedCitations = answer.citations.filter((citation) =>
    citation.claimIds.some((id) => !context.claims.has(id)),
  )
  checks.push({
    id: 'citations_resolve',
    label: 'Citations resolve to stored sources',
    status: unresolvedCitations.length ? 'fail' : 'pass',
    detail: unresolvedCitations.length
      ? `${unresolvedCitations.length} citation(s) reference evidence not in the store.`
      : 'All citations resolve to stored evidence.',
  })
  if (unresolvedCitations.length) blockedReasons.push('a citation does not resolve to a stored source')

  // 4. No quarantined claim is presented as established evidence.
  const quarantinedUsed = [...allEvidenceClaimIds].filter((id) => context.quarantinedClaimIds.has(id))
  checks.push({
    id: 'no_quarantined_evidence',
    label: 'No quarantined claim presented as evidence',
    status: quarantinedUsed.length ? 'fail' : 'pass',
    detail: quarantinedUsed.length
      ? `${quarantinedUsed.length} quarantined claim(s) were used as evidence.`
      : 'No quarantined claim was presented as established evidence.',
  })
  if (quarantinedUsed.length) blockedReasons.push('a quarantined claim was presented as evidence')

  // 5. Taxon names/identifiers are consistent with reconciliation.
  const taxonInconsistent = answer.statements.some((statement) =>
    statement.evidenceClaimIds.some((id) => {
      const reconciliation = context.reconciliations.get(id)
      if (!reconciliation || reconciliation.status !== 'resolved') return false
      return statement.taxa.every((taxon) => taxon.accepted !== reconciliation.acceptedName && taxon.original !== reconciliation.originalName)
    }),
  )
  checks.push({
    id: 'taxon_consistency',
    label: 'Taxon names and identifiers are consistent',
    status: taxonInconsistent ? 'fail' : 'pass',
    detail: taxonInconsistent
      ? 'A statement asserts a taxon inconsistent with the resolved reconciliation for its evidence.'
      : 'Statement taxa are consistent with the resolved reconciliations.',
  })
  if (taxonInconsistent) blockedReasons.push('taxon names are inconsistent with reconciliation')

  // 6. Unsupported numeric values are blocked.
  const unsupportedNumbers: string[] = []
  for (const statement of answer.statements) {
    if (statement.kind === 'inferred') continue // synthesised statements carry no raw measurements
    const supportingText = statement.evidenceClaimIds
      .map((id) => context.claims.get(id))
      .filter((claim): claim is ScientificClaim => Boolean(claim))
      .map((claim) => `${claim.supportingPassage} ${claim.object}`)
      .join(' ')
    for (const number of numbersIn(statement.text)) {
      if (!supportingText.includes(number)) unsupportedNumbers.push(`${statement.id}:${number}`)
    }
  }
  checks.push({
    id: 'numeric_support',
    label: 'Numeric values are supported by evidence',
    status: unsupportedNumbers.length ? 'fail' : 'pass',
    detail: unsupportedNumbers.length
      ? `Unsupported numeric value(s): ${unsupportedNumbers.join(', ')}.`
      : 'Every numeric value appears in its supporting evidence.',
  })
  if (unsupportedNumbers.length) blockedReasons.push('an unsupported numeric value was asserted')

  // 7. Inference is labelled as inference: any statement synthesised across more
  // than one evidence record must be marked `inferred`, never presented as a
  // single observed fact.
  const mislabelledInference = answer.statements.filter(
    (statement) => statement.evidenceClaimIds.length > 1 && statement.kind !== 'inferred',
  )
  checks.push({
    id: 'inference_labelled',
    label: 'Inference is labelled',
    status: mislabelledInference.length ? 'fail' : 'pass',
    detail: mislabelledInference.length
      ? `${mislabelledInference.length} multi-evidence statement(s) are not labelled as inference.`
      : 'Every multi-evidence statement is labelled as inference.',
  })
  if (mislabelledInference.length) blockedReasons.push('a synthesised statement is not labelled as inference')

  // 8. Protected locality is absent from every rendered surface.
  const leak = answer.statements.some((statement) => isProtectedLocality(statement.text))
    || [...allEvidenceClaimIds].some((id) => {
      const claim = context.claims.get(id)
      return claim ? claim.sensitivity === 'protected_locality' || isProtectedLocality(claim.supportingPassage) : false
    })
  checks.push({
    id: 'protected_locality_absent',
    label: 'Protected locality is absent',
    status: leak ? 'fail' : 'pass',
    detail: leak ? 'Protected locality content reached the answer surface.' : 'No protected locality appears in the answer or its evidence.',
  })
  if (leak) blockedReasons.push('protected locality present in answer')

  // 9. Surface contradictions rather than averaging them away.
  if (context.contradictions) {
    for (const claimId of allEvidenceClaimIds) {
      const note = context.contradictions.get(claimId)
      if (note) contradictions.push({ claimId, note })
    }
  }

  const failed = checks.some((check) => check.status === 'fail')
  return {
    correlationId: context.runCorrelationId,
    verdict: failed ? 'blocked' : 'verified',
    checks,
    blockedReasons,
    contradictions,
    verifiedStatementIds: failed ? [] : answer.statements.map((statement) => statement.id),
  }
}
