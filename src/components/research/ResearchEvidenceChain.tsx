import React, { useEffect, useState } from 'react';

import { CalyxApiError } from '@/lib/calyxWorkspace';
import { memberReadRefusal, REFUSAL_MESSAGE } from '@/lib/memberReadAuth';
import type { LedgerRevision } from '@/lib/reasoningLedger';
import {
  aggregateCounts,
  aggregatePriority,
  aggregateStanding,
  aggregateStatement,
  aggregateUncertainty,
  candidateSources,
  candidateStanding,
  candidateStatement,
  confidenceBreakdown,
  conflictsForCandidate,
  displayList,
  displayText,
  displayWords,
  fetchCandidateKnowledge,
  fetchEvidenceAggregate,
  ledgerCitations,
  listCandidateConflicts,
  listProjectReasoningLedgers,
  type CandidateConflictList,
  type CandidateKnowledgeRecord,
  type EvidenceAggregateRecord,
} from '@/lib/researchEvidenceChain';
import type { ResearchEvidenceLink } from '@/lib/researchStation';

type Loaded<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'unavailable'; message: string };

/**
 * Why a record could not be read. Aggregate and conflict reads are member
 * reads; candidate detail and project reasoning ledgers are owner-only for
 * members (backend #1643), so a refusal there is an owner-only view, not a
 * session problem — and is never phrased as "sign in again".
 */
function reason(error: unknown, memberScoped = true): string {
  const refusal = error instanceof CalyxApiError
    ? memberReadRefusal(error.status, error.code, { memberScoped })
    : null;
  if (refusal) return REFUSAL_MESSAGE[refusal];
  return error instanceof Error ? error.message : 'The record could not be read.';
}

const RELATIONSHIP_LABEL: Record<string, string> = {
  SUPPORTS: 'linked as supporting',
  CONTRADICTS: 'linked as contradicting',
  CONTEXT: 'linked as context',
  REVIEW: 'linked for review',
};

/**
 * Each evidence link resolved into what the backend holds for it: the
 * extracted candidate claim, its review standing, the literature anchor it
 * came from, open conflicts, and the reasoning-ledger entries that cite it;
 * an aggregate link resolves to its active aggregate version (consensus status,
 * evidence counts, uncertainty, contributing candidates, review standing).
 * Anything that cannot be read is said to be unreadable — never omitted.
 */
const ResearchEvidenceChain: React.FC<{ projectId: string; links: ResearchEvidenceLink[] }> = ({ projectId, links }) => {
  const [candidates, setCandidates] = useState<Record<string, Loaded<CandidateKnowledgeRecord>>>({});
  const [aggregates, setAggregates] = useState<Record<string, Loaded<EvidenceAggregateRecord>>>({});
  const [conflicts, setConflicts] = useState<Loaded<CandidateConflictList>>({ status: 'loading' });
  const [ledgers, setLedgers] = useState<Loaded<LedgerRevision[]>>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    const ids = links.filter((item) => item.evidence_kind === 'CANDIDATE').map((item) => item.evidence_id);
    setCandidates(Object.fromEntries(ids.map((id) => [id, { status: 'loading' } as const])));
    for (const id of ids) {
      fetchCandidateKnowledge(id).then(
        (value) => live && setCandidates((current) => ({ ...current, [id]: { status: 'ready', value } })),
        (error) => live && setCandidates((current) => ({ ...current, [id]: { status: 'unavailable', message: reason(error, false) } })),
      );
    }
    const aggregateIds = links.filter((item) => item.evidence_kind === 'AGGREGATE').map((item) => item.evidence_id);
    setAggregates(Object.fromEntries(aggregateIds.map((id) => [id, { status: 'loading' } as const])));
    for (const id of aggregateIds) {
      fetchEvidenceAggregate(id).then(
        (value) => live && setAggregates((current) => ({ ...current, [id]: { status: 'ready', value } })),
        (error) => live && setAggregates((current) => ({ ...current, [id]: { status: 'unavailable', message: reason(error) } })),
      );
    }
    if (ids.length) {
      listCandidateConflicts().then(
        (value) => live && setConflicts({ status: 'ready', value }),
        (error) => live && setConflicts({ status: 'unavailable', message: reason(error) }),
      );
    }
    listProjectReasoningLedgers(projectId).then(
      (value) => live && setLedgers({ status: 'ready', value }),
      (error) => live && setLedgers({ status: 'unavailable', message: reason(error, false) }),
    );
    return () => { live = false; };
  }, [projectId, links]);

  return (
    <ul className="grid gap-2" data-testid="research-evidence-chain">
      {links.map((link) => {
        const contradicting = link.relationship === 'CONTRADICTS';
        const isCandidate = link.evidence_kind === 'CANDIDATE';
        const loaded = isCandidate ? candidates[link.evidence_id] : undefined;
        const aggregate = link.evidence_kind === 'AGGREGATE' ? aggregates[link.evidence_id] : undefined;
        const openConflicts = conflicts.status === 'ready'
          ? conflictsForCandidate(conflicts.value.items, link.evidence_id).filter((item) => item.state === 'OPEN')
          : [];
        // Ledger provenance cites candidates by id; an aggregate id is a different
        // id space, so it is never matched against candidate citations.
        const citations = isCandidate && ledgers.status === 'ready' ? ledgerCitations(ledgers.value, link.evidence_id) : [];
        return (
          <li
            key={`${link.evidence_kind}-${link.evidence_id}`}
            data-testid={`research-evidence-${link.evidence_kind}-${link.evidence_id}`}
            className={`rounded-xl border px-4 py-3 text-xs leading-5 ${contradicting ? 'border-amber-300/30 bg-amber-300/[0.06] text-amber-100/90' : 'border-white/10 bg-black/20 text-white/75'}`}
          >
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/70">
                {link.evidence_kind.toLowerCase()} #{link.evidence_id}
              </span>
              <span data-testid="research-evidence-relationship">{RELATIONSHIP_LABEL[link.relationship ?? ''] ?? 'relationship not recorded'}</span>
            </p>

            {!isCandidate ? (
              !aggregate || aggregate.status === 'loading' ? (
                <p className="mt-1 text-white/55">Reading the aggregate record…</p>
              ) : aggregate.status === 'unavailable' ? (
                <p className="mt-1 text-amber-200/90" data-testid="research-aggregate-unavailable">Aggregate record could not be read: {aggregate.message}</p>
              ) : (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-white/90" data-testid="research-aggregate-statement">{aggregateStatement(aggregate.value)}</p>
                  <p className="text-white/55">
                    {displayWords(aggregate.value.aggregate_type, 'unclassified')} · version {displayText(aggregate.value.version, 'not recorded')} ·
                    ruleset {displayText(aggregate.value.aggregation_ruleset_version, 'not recorded')} · reconciliation {displayText(aggregate.value.reconciliation_model_version, 'not recorded')}
                  </p>
                  <p data-testid="research-aggregate-standing">{aggregateStanding(aggregate.value).join(' · ')}</p>
                  <p data-testid="research-aggregate-counts">Evidence: {aggregateCounts(aggregate.value).join(' · ')}</p>
                  <p data-testid="research-aggregate-uncertainty">
                    {aggregateUncertainty(aggregate.value).length
                      ? `Uncertainty: ${aggregateUncertainty(aggregate.value).map(([key, value]) => `${key} ${value}`).join(' · ')}`
                      : 'Uncertainty not recorded.'}
                  </p>
                  {aggregatePriority(aggregate.value) ? (
                    <p className="text-white/55" data-testid="research-aggregate-priority">{aggregatePriority(aggregate.value)}</p>
                  ) : null}
                  <p data-testid="research-aggregate-candidates">
                    Contributing candidates: {aggregate.value.contributing_candidate_ids.length
                      ? displayList(aggregate.value.contributing_candidate_version_ids).length
                        ? displayList(aggregate.value.contributing_candidate_version_ids).map((id) => `#${id.replace(':', ' v')}`).join(', ')
                        : aggregate.value.contributing_candidate_ids.map((id) => `#${id}`).join(', ')
                      : 'none recorded'}
                  </p>
                </div>
              )
            ) : !loaded || loaded.status === 'loading' ? (
              <p className="mt-1 text-white/55">Reading the candidate record…</p>
            ) : loaded.status === 'unavailable' ? (
              <p className="mt-1 text-amber-200/90">Candidate record could not be read: {loaded.message}</p>
            ) : (
              <div className="mt-2 space-y-1">
                <p className="text-sm text-white/90" data-testid="research-candidate-statement">{candidateStatement(loaded.value)}</p>
                <p className="text-white/55">
                  {displayWords(loaded.value.kind, 'unclassified')} candidate · version {displayText(loaded.value.version, 'not recorded')} ·
                  confidence {typeof loaded.value.confidence === 'number' ? loaded.value.confidence : 'not recorded'}
                  {confidenceBreakdown(loaded.value.confidence_components).length
                    ? ` (${confidenceBreakdown(loaded.value.confidence_components).map(([key, value]) => `${key} ${value}`).join(', ')})`
                    : ''}
                </p>
                <p data-testid="research-candidate-standing">{candidateStanding(loaded.value).join(' · ')}</p>
                <ul className="space-y-1" data-testid="research-candidate-sources">
                  {candidateSources(loaded.value).length ? candidateSources(loaded.value).map((source) => (
                    <li key={source.label}>
                      Source: {source.label} · display {source.policy}
                      {source.quote ? <q className="ml-1 italic text-white/80">{source.quote}</q> : null}
                    </li>
                  )) : <li>No source anchor recorded for this candidate.</li>}
                </ul>
                {conflicts.status === 'unavailable' ? (
                  <p className="text-amber-200/90" data-testid="research-candidate-conflicts-unavailable">
                    Conflicts could not be read: {conflicts.message} Whether this claim is contested is unknown.
                  </p>
                ) : conflicts.status === 'loading' ? (
                  <p className="text-white/55">Reading conflicts…</p>
                ) : openConflicts.length ? (
                  <p className="text-amber-200/90" data-testid="research-candidate-conflicts">
                    Open conflict: {openConflicts.map((item) => `candidates ${item.candidate_ids.map((id) => displayText(id, '?')).join(' vs ')}`).join('; ')} — unresolved, awaiting review.
                  </p>
                ) : conflicts.status === 'ready' && !conflicts.value.complete ? (
                  <p className="text-amber-200/90" data-testid="research-candidate-conflicts-unavailable">
                    Only {conflicts.value.items.length} of {conflicts.value.total ?? 'an unreported number of'} conflicts could be read. Whether this claim is contested is unknown.
                  </p>
                ) : null}
              </div>
            )}

            <div className="mt-2" data-testid="research-evidence-ledger">
              {!isCandidate ? (
                <p className="text-white/55">Reasoning-ledger citations are matched for candidate links only; citations of aggregates are not matched on this page.</p>
              ) : ledgers.status === 'loading' ? (
                <p className="text-white/55">Reading reasoning ledgers…</p>
              ) : ledgers.status === 'unavailable' ? (
                <p className="text-amber-200/90">Reasoning ledgers could not be read: {ledgers.message}</p>
              ) : citations.length ? (
                <ul className="space-y-1">
                  {citations.map(({ ledgerId, ledgerTitle, ledgerVersion, ledgerStatus, entry }) => (
                    <li key={`${ledgerId}-${displayText(entry.entry_id, '')}`}>
                      Cited in ledger “{ledgerTitle}” revision {ledgerVersion ?? 'not recorded'} ({ledgerStatus}) as{' '}
                      {displayText(entry.kind, 'an entry')}: {displayText(entry.text, 'no text recorded')}
                      {entry.uncertainty && typeof entry.uncertainty === 'object' ? (
                        <span>
                          {' '}· confidence {displayText(entry.uncertainty.confidence, 'not recorded')}
                          {displayList(entry.uncertainty.unresolved_assumptions).length
                            ? ` · unresolved: ${displayList(entry.uncertainty.unresolved_assumptions).join('; ')}`
                            : ''}
                        </span>
                      ) : ' · uncertainty not recorded'}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-white/55">No reasoning-ledger entry cites this evidence yet.</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default ResearchEvidenceChain;
