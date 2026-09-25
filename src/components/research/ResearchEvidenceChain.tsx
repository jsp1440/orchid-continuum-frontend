import React, { useEffect, useState } from 'react';

import type { LedgerRevision } from '@/lib/reasoningLedger';
import {
  candidateSources,
  candidateStanding,
  candidateStatement,
  conflictsForCandidate,
  fetchCandidateKnowledge,
  ledgerCitations,
  listCandidateConflicts,
  listProjectReasoningLedgers,
  type CandidateConflict,
  type CandidateKnowledgeRecord,
} from '@/lib/researchEvidenceChain';
import type { ResearchEvidenceLink } from '@/lib/researchStation';

type Loaded<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'unavailable'; message: string };

function reason(error: unknown): string {
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
 * came from, open conflicts, and the reasoning-ledger entries that cite it.
 * Anything that cannot be read is said to be unreadable — never omitted.
 */
const ResearchEvidenceChain: React.FC<{ projectId: string; links: ResearchEvidenceLink[] }> = ({ projectId, links }) => {
  const [candidates, setCandidates] = useState<Record<string, Loaded<CandidateKnowledgeRecord>>>({});
  const [conflicts, setConflicts] = useState<Loaded<CandidateConflict[]>>({ status: 'loading' });
  const [ledgers, setLedgers] = useState<Loaded<LedgerRevision[]>>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    const ids = links.filter((item) => item.evidence_kind === 'CANDIDATE').map((item) => item.evidence_id);
    setCandidates(Object.fromEntries(ids.map((id) => [id, { status: 'loading' } as const])));
    for (const id of ids) {
      fetchCandidateKnowledge(id).then(
        (value) => live && setCandidates((current) => ({ ...current, [id]: { status: 'ready', value } })),
        (error) => live && setCandidates((current) => ({ ...current, [id]: { status: 'unavailable', message: reason(error) } })),
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
      (error) => live && setLedgers({ status: 'unavailable', message: reason(error) }),
    );
    return () => { live = false; };
  }, [projectId, links]);

  return (
    <ul className="grid gap-2" data-testid="research-evidence-chain">
      {links.map((link) => {
        const contradicting = link.relationship === 'CONTRADICTS';
        const loaded = link.evidence_kind === 'CANDIDATE' ? candidates[link.evidence_id] : undefined;
        const openConflicts = conflicts.status === 'ready'
          ? conflictsForCandidate(conflicts.value, link.evidence_id).filter((item) => item.state === 'OPEN')
          : [];
        const citations = ledgers.status === 'ready' ? ledgerCitations(ledgers.value, link.evidence_id) : [];
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

            {link.evidence_kind !== 'CANDIDATE' ? (
              <p className="mt-1 text-white/55">Aggregate detail is not read on this page; only the link is shown.</p>
            ) : !loaded || loaded.status === 'loading' ? (
              <p className="mt-1 text-white/55">Reading the candidate record…</p>
            ) : loaded.status === 'unavailable' ? (
              <p className="mt-1 text-amber-200/90">Candidate record could not be read: {loaded.message}</p>
            ) : (
              <div className="mt-2 space-y-1">
                <p className="text-sm text-white/90" data-testid="research-candidate-statement">{candidateStatement(loaded.value)}</p>
                <p className="text-white/55">
                  {loaded.value.kind.replaceAll('_', ' ').toLowerCase()} candidate · version {loaded.value.version ?? 'not recorded'} ·
                  confidence {typeof loaded.value.confidence === 'number' ? loaded.value.confidence : 'not recorded'}
                  {loaded.value.confidence_components
                    ? ` (${Object.entries(loaded.value.confidence_components).map(([key, value]) => `${key} ${value}`).join(', ')})`
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
                    Open conflict: {openConflicts.map((item) => `candidates ${item.candidate_ids.join(' vs ')}`).join('; ')} — unresolved, awaiting review.
                  </p>
                ) : null}
              </div>
            )}

            <div className="mt-2" data-testid="research-evidence-ledger">
              {ledgers.status === 'loading' ? (
                <p className="text-white/55">Reading reasoning ledgers…</p>
              ) : ledgers.status === 'unavailable' ? (
                <p className="text-amber-200/90">Reasoning ledgers could not be read: {ledgers.message}</p>
              ) : citations.length ? (
                <ul className="space-y-1">
                  {citations.map(({ ledgerId, ledgerTitle, ledgerVersion, ledgerStatus, entry }) => (
                    <li key={`${ledgerId}-${entry.entry_id}`}>
                      Cited in ledger “{ledgerTitle}” revision {ledgerVersion ?? 'not recorded'} ({ledgerStatus}) as{' '}
                      {entry.kind ?? 'an entry'}: {entry.text ?? 'no text recorded'}
                      {entry.uncertainty ? (
                        <span>
                          {' '}· confidence {entry.uncertainty.confidence ?? 'not recorded'}
                          {entry.uncertainty.unresolved_assumptions?.length
                            ? ` · unresolved: ${entry.uncertainty.unresolved_assumptions.join('; ')}`
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
