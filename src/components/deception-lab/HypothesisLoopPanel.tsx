import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, FlaskConical, Loader2, ShieldCheck } from 'lucide-react';
import {
  EVIDENCE_SOURCE_KINDS,
  EVIDENCE_STANCES,
  FLORAL_SIGNAL_CUES,
  FieldHypothesisApiError,
  KNOWLEDGE_GRAPH_PUBLICATION_BLOCKED,
  LOCALITY_SENSITIVITIES,
  OBSERVER_CERTAINTIES,
  POLLINATION_EVIDENCE_TYPES,
  REPRODUCTIVE_OUTCOMES,
  REWARD_CHECKS,
  SensitiveLocalityError,
  VISITOR_BEHAVIORS,
  VISITOR_GROUPS,
  cueLabel,
  evidenceStateLabel,
  generateFieldHypotheses,
  hypothesisClassLabel,
  recordHypothesisEvidence,
  type EvidenceSourceKind,
  type EvidenceStance,
  type FieldHypothesis,
  type FieldHypothesisSet,
  type FloralSignalCue,
  type LocalitySensitivity,
  type ObservationSnapshot,
  type ObserverCertainty,
  type PollinationEvidenceType,
  type ReproductiveOutcomeCue,
  type RewardCheck,
  type VisitorBehavior,
  type VisitorGroup,
} from '@/lib/fieldHypotheses';

/**
 * HypothesisLoopPanel — the live Deception Lab research-workspace loop.
 *
 * Observation cues → ≥2 competing hypotheses → supporting / contradicting /
 * unknown evidence per hypothesis → non-destructive on-site follow-up.
 * Backed by orchid-calyx-backend `app/field_hypotheses` (deterministic,
 * provider-free). Until that API is deployed the panel renders an explicit
 * "In development" state rather than pretending.
 *
 * Epistemic posture: nothing shown here is a fact. Every hypothesis carries
 * `epistemic_status = HYPOTHESIS` and Knowledge Graph publication is blocked
 * pending human scientific review. No coordinate or place name is collected;
 * only a coarse locality sensitivity class is sent.
 */

export interface HypothesisLoopPanelProps {
  /** Opaque observer identity (auth subject). Never an email address. */
  observerId: string;
  /** Journey-5 observation id when the observation already exists; otherwise a client id. */
  observationId?: string;
  /** Pre-filled taxon hint from the Field Journal record, if any. */
  initialTaxonHint?: string;
  /** Test seam / integration seam for the generate call. */
  generate?: typeof generateFieldHypotheses;
  /** Test seam / integration seam for the evidence call. */
  recordEvidence?: typeof recordHypothesisEvidence;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

const humanize = (value: string) => value.replace(/_/g, ' ');

const STANCE_STYLES: Record<EvidenceStance, string> = {
  SUPPORTING: 'border-green-200 bg-green-50 text-green-800',
  CONTRADICTING: 'border-red-200 bg-red-50 text-red-800',
  UNKNOWN: 'border-[#d4b34a]/40 bg-[#f5f0e8] text-[#7a7466]',
};

function newClientObservationId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `field-journal-draft:${random}`;
}

const ToggleChip: React.FC<{ label: string; active: boolean; onClick: () => void; testId: string }> = ({ label, active, onClick, testId }) => (
  <button
    type="button"
    data-testid={testId}
    aria-pressed={active}
    onClick={onClick}
    className={
      'font-mono text-[10px] tracking-[0.12em] uppercase px-2 py-1 rounded-full border transition-colors ' +
      (active ? 'bg-[#1a2e1a] text-[#f5f0e8] border-[#1a2e1a]' : 'bg-white text-[#3d3028] border-[#d4b34a]/40 hover:border-[#d4b34a]')
    }
  >
    {label}
  </button>
);

const EvidenceForm: React.FC<{
  hypothesis: FieldHypothesis;
  observerId: string;
  observationId: string;
  onRecorded: (updated: FieldHypothesis) => void;
  recordEvidence: typeof recordHypothesisEvidence;
}> = ({ hypothesis, observerId, observationId, onRecorded, recordEvidence }) => {
  const [stance, setStance] = useState<EvidenceStance>('UNKNOWN');
  const [evidenceType, setEvidenceType] = useState<PollinationEvidenceType>('directly_observed_visit');
  const [sourceKind, setSourceKind] = useState<EvidenceSourceKind>('field_observation');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!summary.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await recordEvidence(hypothesis.hypothesis_id, {
        stance,
        evidence_type: evidenceType,
        summary: summary.trim(),
        source_kind: sourceKind,
        source_reference: observationId,
        recorder_subject: observerId,
      });
      onRecorded(updated);
      setSummary('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evidence could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} data-testid={`evidence-form-${hypothesis.hypothesis_id}`} className="mt-3 border-t border-[#d4b34a]/15 pt-3 space-y-2">
      <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#b8962a]">Record evidence for this hypothesis</div>
      <div className="flex flex-wrap gap-2">
        {EVIDENCE_STANCES.map((option) => (
          <ToggleChip key={option} label={option.toLowerCase()} active={stance === option} onClick={() => setStance(option)} testId={`stance-${hypothesis.hypothesis_id}-${option}`} />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="font-body text-[12px] text-[#3d3028]">
          Evidence type
          <select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value as PollinationEvidenceType)} className="mt-1 w-full rounded-sm border border-[#d4b34a]/40 bg-white px-2 py-1 text-[12px]">
            {POLLINATION_EVIDENCE_TYPES.map((option) => (
              <option key={option} value={option}>{humanize(option)}</option>
            ))}
          </select>
        </label>
        <label className="font-body text-[12px] text-[#3d3028]">
          Source
          <select value={sourceKind} onChange={(e) => setSourceKind(e.target.value as EvidenceSourceKind)} className="mt-1 w-full rounded-sm border border-[#d4b34a]/40 bg-white px-2 py-1 text-[12px]">
            {EVIDENCE_SOURCE_KINDS.map((option) => (
              <option key={option} value={option}>{humanize(option)}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block font-body text-[12px] text-[#3d3028]">
        What was seen or read (no locality)
        <textarea
          data-testid={`evidence-summary-${hypothesis.hypothesis_id}`}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={2000}
          rows={2}
          className="mt-1 w-full rounded-sm border border-[#d4b34a]/40 bg-white px-2 py-1 text-[12px]"
        />
      </label>
      {error ? <p role="alert" className="font-mono text-[10px] text-red-700">{error}</p> : null}
      <button
        type="submit"
        data-testid={`evidence-submit-${hypothesis.hypothesis_id}`}
        disabled={busy || !summary.trim()}
        className="font-mono text-[10px] tracking-[0.18em] uppercase px-3 py-1.5 rounded-sm bg-[#1a2e1a] text-[#f5f0e8] disabled:opacity-40"
      >
        {busy ? 'Recording…' : 'Record evidence'}
      </button>
    </form>
  );
};

const HypothesisCard: React.FC<{
  hypothesis: FieldHypothesis;
  index: number;
  observerId: string;
  observationId: string;
  onUpdated: (updated: FieldHypothesis) => void;
  recordEvidence: typeof recordHypothesisEvidence;
}> = ({ hypothesis, index, observerId, observationId, onUpdated, recordEvidence }) => {
  const balance = hypothesis.evidence_balance;
  return (
    <article data-testid={`hypothesis-card-${hypothesis.hypothesis_id}`} className="border border-[#d4b34a]/25 rounded-sm bg-white p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#d4b34a]">
            Hypothesis {index + 1} · {hypothesis.epistemic_status.toLowerCase()} · {hypothesisClassLabel(hypothesis.hypothesis_class)}
          </div>
          <p className="font-display text-[15px] text-[#1a2e1a] mt-1 leading-snug">{hypothesis.statement}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border border-[#1a2e1a]/20 text-[#1a2e1a]">
            {humanize(hypothesis.status.toLowerCase())}
          </span>
          <span className="font-mono text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border border-[#d4b34a]/40 text-[#b8962a]">
            {humanize(hypothesis.review_state)}
          </span>
        </div>
      </div>

      {hypothesis.cue_matches.length > 0 ? (
        <p className="font-mono text-[10px] text-[#7a7466] mt-2">
          Consistent with observed cues: {hypothesis.cue_matches.map(cueLabel).join(' · ')}
        </p>
      ) : (
        <p className="font-mono text-[10px] text-[#7a7466] mt-2">Included as a competing alternative, not from a cue match.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-green-800">Would support</div>
          <ul className="mt-1 space-y-1">{hypothesis.would_support.map((line) => <li key={line} className="font-body text-[12px] text-[#3d3028] leading-relaxed">→ {line}</li>)}</ul>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-red-800">Would contradict</div>
          <ul className="mt-1 space-y-1">{hypothesis.would_contradict.map((line) => <li key={line} className="font-body text-[12px] text-[#3d3028] leading-relaxed">→ {line}</li>)}</ul>
        </div>
      </div>

      <div data-testid={`evidence-balance-${hypothesis.hypothesis_id}`} className="grid grid-cols-3 gap-2 mt-4">
        {EVIDENCE_STANCES.map((stance) => (
          <div key={stance} className={`rounded-sm border p-2 text-center ${STANCE_STYLES[stance]}`}>
            <div className="font-mono text-[9px] tracking-[0.2em] uppercase">{stance.toLowerCase()}</div>
            <div className="font-display text-[18px]" data-testid={`balance-${hypothesis.hypothesis_id}-${stance}`}>
              {stance === 'SUPPORTING' ? balance.supporting : stance === 'CONTRADICTING' ? balance.contradicting : balance.unknown}
            </div>
          </div>
        ))}
      </div>
      <p className="font-mono text-[10px] text-[#7a7466] mt-2" data-testid={`evidence-state-${hypothesis.hypothesis_id}`}>
        {evidenceStateLabel(hypothesis.evidence_state)}. Counts describe the record, not a verdict.
      </p>

      {hypothesis.evidence.length > 0 ? (
        <ul className="mt-2 space-y-1" data-testid={`evidence-list-${hypothesis.hypothesis_id}`}>
          {hypothesis.evidence.map((item) => (
            <li key={item.evidence_id} className="font-body text-[12px] text-[#3d3028]">
              <span className="font-mono text-[9px] uppercase tracking-[0.15em] mr-2">{item.stance}</span>
              {item.summary} <span className="text-[#7a7466]">({humanize(item.evidence_type)}, {humanize(item.source_kind)})</span>
            </li>
          ))}
        </ul>
      ) : null}

      <EvidenceForm hypothesis={hypothesis} observerId={observerId} observationId={observationId} onRecorded={onUpdated} recordEvidence={recordEvidence} />
    </article>
  );
};

export const HypothesisLoopPanel: React.FC<HypothesisLoopPanelProps> = ({
  observerId,
  observationId,
  initialTaxonHint = '',
  generate = generateFieldHypotheses,
  recordEvidence = recordHypothesisEvidence,
}) => {
  const resolvedObservationId = useMemo(() => observationId ?? newClientObservationId(), [observationId]);

  const [taxonHint, setTaxonHint] = useState(initialTaxonHint);
  const [certainty, setCertainty] = useState<ObserverCertainty>('POSSIBLE');
  const [sensitivity, setSensitivity] = useState<LocalitySensitivity>('PRIVATE');
  const [visitorObserved, setVisitorObserved] = useState(false);
  const [visitorGroup, setVisitorGroup] = useState<VisitorGroup>('unknown');
  const [behaviors, setBehaviors] = useState<VisitorBehavior[]>([]);
  const [rewardCheck, setRewardCheck] = useState<RewardCheck>('not_checked');
  const [signals, setSignals] = useState<FloralSignalCue[]>([]);
  const [outcome, setOutcome] = useState<ReproductiveOutcomeCue>('unknown');
  const [notes, setNotes] = useState('');

  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FieldHypothesisSet | null>(null);

  const toggle = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  const snapshot = useCallback((): ObservationSnapshot => ({
    observer_id: observerId,
    observed_at: new Date().toISOString(),
    taxon_hint: taxonHint.trim() || null,
    observation_text: notes.trim() || null,
    epistemic_certainty: certainty,
    locality_sensitivity: sensitivity,
    interaction: {
      visitor_observed: visitorObserved,
      visitor_group: visitorObserved ? visitorGroup : 'unknown',
      visitor_behaviors: visitorObserved ? behaviors : [],
      reward_check: rewardCheck,
      floral_signal_cues: signals,
      reproductive_outcome: outcome,
    },
  }), [observerId, taxonHint, notes, certainty, sensitivity, visitorObserved, visitorGroup, behaviors, rewardCheck, signals, outcome]);

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    setState('loading');
    setError(null);
    try {
      const set = await generate(resolvedObservationId, snapshot());
      setResult(set);
      setState('ready');
    } catch (err) {
      if (err instanceof FieldHypothesisApiError && err.kind === 'route_unavailable') {
        setState('unavailable');
        return;
      }
      setState('error');
      setError(
        err instanceof SensitiveLocalityError
          ? 'Locality data must stay in the Field Journal; remove it and try again.'
          : err instanceof Error ? err.message : 'Hypotheses could not be generated.',
      );
    }
  };

  const updateHypothesis = (updated: FieldHypothesis) => {
    setResult((current) =>
      current ? { ...current, hypotheses: current.hypotheses.map((h) => (h.hypothesis_id === updated.hypothesis_id ? updated : h)) } : current,
    );
  };

  return (
    <section data-testid="hypothesis-loop-panel" className="space-y-6">
      <div className="bg-[#0d2535]/5 border border-[#0d2535]/15 rounded-sm p-4 flex gap-3" role="note" data-testid="hypothesis-loop-epistemic-notice">
        <ShieldCheck className="h-4 w-4 text-[#0d2535] shrink-0 mt-0.5" aria-hidden="true" />
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[#0d2535]/80 leading-relaxed">
          Hypotheses are proposals, not findings. At least two always compete. Evidence is recorded as supporting,
          contradicting or unknown and is never collapsed into a verdict. Knowledge Graph publication is blocked
          pending human scientific review. Coordinates and place names are never collected here — record locality
          only in the Field Journal under its sensitivity class.
        </p>
      </div>

      <form onSubmit={run} data-testid="observation-cue-form" className="bg-white border border-[#d4b34a]/25 rounded-sm p-5 space-y-4">
        <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#d4b34a]">1 · Field observation cues</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="font-body text-[12px] text-[#3d3028]">
            Orchid (observer's hint, not a determination)
            <input data-testid="taxon-hint" value={taxonHint} onChange={(e) => setTaxonHint(e.target.value)} maxLength={500} className="mt-1 w-full rounded-sm border border-[#d4b34a]/40 bg-white px-2 py-1 text-[12px]" />
          </label>
          <label className="font-body text-[12px] text-[#3d3028]">
            Identification certainty
            <select data-testid="certainty" value={certainty} onChange={(e) => setCertainty(e.target.value as ObserverCertainty)} className="mt-1 w-full rounded-sm border border-[#d4b34a]/40 bg-white px-2 py-1 text-[12px]">
              {OBSERVER_CERTAINTIES.map((option) => <option key={option} value={option}>{option.toLowerCase()}</option>)}
            </select>
          </label>
          <label className="font-body text-[12px] text-[#3d3028]">
            Locality sensitivity (class only)
            <select data-testid="locality-sensitivity" value={sensitivity} onChange={(e) => setSensitivity(e.target.value as LocalitySensitivity)} className="mt-1 w-full rounded-sm border border-[#d4b34a]/40 bg-white px-2 py-1 text-[12px]">
              {LOCALITY_SENSITIVITIES.map((option) => <option key={option} value={option}>{humanize(option.toLowerCase())}</option>)}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 font-body text-[13px] text-[#1a2e1a]">
          <input type="checkbox" data-testid="visitor-observed" checked={visitorObserved} onChange={(e) => setVisitorObserved(e.target.checked)} />
          A visitor was observed at the flower
        </label>

        {visitorObserved ? (
          <div className="space-y-3 pl-1" data-testid="visitor-cues">
            <label className="block font-body text-[12px] text-[#3d3028]">
              Visitor group
              <select data-testid="visitor-group" value={visitorGroup} onChange={(e) => setVisitorGroup(e.target.value as VisitorGroup)} className="mt-1 w-full sm:w-64 rounded-sm border border-[#d4b34a]/40 bg-white px-2 py-1 text-[12px]">
                {VISITOR_GROUPS.map((option) => <option key={option} value={option}>{humanize(option)}</option>)}
              </select>
            </label>
            <div>
              <div className="font-body text-[12px] text-[#3d3028] mb-1">Behaviour seen (descriptive, not interpretive)</div>
              <div className="flex flex-wrap gap-2">
                {VISITOR_BEHAVIORS.map((option) => (
                  <ToggleChip key={option} label={humanize(option)} active={behaviors.includes(option)} onClick={() => setBehaviors((b) => toggle(b, option))} testId={`behavior-${option}`} />
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="font-body text-[12px] text-[#3d3028]">
            Visual reward check (never dissect)
            <select data-testid="reward-check" value={rewardCheck} onChange={(e) => setRewardCheck(e.target.value as RewardCheck)} className="mt-1 w-full rounded-sm border border-[#d4b34a]/40 bg-white px-2 py-1 text-[12px]">
              {REWARD_CHECKS.map((option) => <option key={option} value={option}>{humanize(option)}</option>)}
            </select>
          </label>
          <label className="font-body text-[12px] text-[#3d3028]">
            Reproductive outcome seen
            <select data-testid="reproductive-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as ReproductiveOutcomeCue)} className="mt-1 w-full rounded-sm border border-[#d4b34a]/40 bg-white px-2 py-1 text-[12px]">
              {REPRODUCTIVE_OUTCOMES.map((option) => <option key={option} value={option}>{humanize(option)}</option>)}
            </select>
          </label>
        </div>

        <div>
          <div className="font-body text-[12px] text-[#3d3028] mb-1">Floral signals noted</div>
          <div className="flex flex-wrap gap-2">
            {FLORAL_SIGNAL_CUES.map((option) => (
              <ToggleChip key={option} label={humanize(option)} active={signals.includes(option)} onClick={() => setSignals((s) => toggle(s, option))} testId={`signal-${option}`} />
            ))}
          </div>
        </div>

        <label className="block font-body text-[12px] text-[#3d3028]">
          Notes (kept with the hypothesis set; never echoed back; no locality)
          <textarea data-testid="observation-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={10000} rows={2} className="mt-1 w-full rounded-sm border border-[#d4b34a]/40 bg-white px-2 py-1 text-[12px]" />
        </label>

        <button
          type="submit"
          data-testid="generate-hypotheses"
          disabled={state === 'loading'}
          className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] uppercase px-4 py-2 rounded-sm bg-[#1a2e1a] text-[#f5f0e8] disabled:opacity-40"
        >
          {state === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />}
          Propose competing hypotheses
        </button>
      </form>

      {state === 'unavailable' ? (
        <div data-testid="hypothesis-loop-unavailable" role="status" className="border border-[#d4b34a]/40 bg-[#d4b34a]/10 rounded-sm p-4">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#b8962a]">In development</div>
          <p className="font-body text-[13px] text-[#3d3028] mt-1 leading-relaxed">
            The field hypothesis API is not deployed on this backend yet. The loop above is the contract it will serve;
            nothing has been sent or stored.
          </p>
        </div>
      ) : null}

      {state === 'error' && error ? (
        <div role="alert" data-testid="hypothesis-loop-error" className="border border-red-200 bg-red-50 rounded-sm p-4 flex gap-2">
          <AlertTriangle className="h-4 w-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="font-body text-[13px] text-red-800">{error}</p>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-4" data-testid="hypothesis-set">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#d4b34a]">
            2 · Competing hypotheses ({result.hypotheses.length}; minimum {result.minimum_competing_hypotheses}) · {result.generation.mode.replace(/_/g, ' ')} · provider called: {String(result.generation.provider_called)}
          </div>
          {result.hypotheses.map((hypothesis, index) => (
            <HypothesisCard
              key={hypothesis.hypothesis_id}
              hypothesis={hypothesis}
              index={index}
              observerId={observerId}
              observationId={resolvedObservationId}
              onUpdated={updateHypothesis}
              recordEvidence={recordEvidence}
            />
          ))}

          <div className="bg-white border border-[#d4b34a]/25 rounded-sm p-5" data-testid="follow-up-protocol">
            <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#d4b34a] mb-3">3 · Non-destructive follow-up while still on site</div>
            <ol className="space-y-3">
              {result.follow_up_protocol.map((step, index) => (
                <li key={step.step_id} className="flex gap-3" data-testid={`follow-up-${step.step_id}`}>
                  <div className="h-6 w-6 rounded-full bg-[#1a2e1a] text-[#f5f0e8] flex items-center justify-center font-mono text-[10px] shrink-0 mt-0.5">{index + 1}</div>
                  <div>
                    <div className="font-body text-[13px] text-[#1a2e1a] leading-relaxed">{step.instruction}</div>
                    <div className="font-mono text-[10px] text-[#7a7466] mt-0.5">
                      {step.purpose} · {step.while_on_site ? 'on site' : 'later revisit'} · non-destructive · separates: {step.discriminates.map(hypothesisClassLabel).join(', ')}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <ul className="mt-4 space-y-1" data-testid="protocol-constraints">
              {result.protocol_constraints.map((line) => (
                <li key={line} className="font-mono text-[10px] text-[#7a7466] leading-relaxed">• {line}</li>
              ))}
            </ul>
          </div>

          <p className="font-mono text-[10px] text-[#7a7466]" data-testid="hypothesis-set-footer">
            Knowledge Graph publication: {result.knowledge_graph_publication === KNOWLEDGE_GRAPH_PUBLICATION_BLOCKED ? 'blocked pending human scientific review' : result.knowledge_graph_publication}.
            Library {result.generation.library_version}. Observation summary carries only the locality class ({humanize(result.observation.locality_sensitivity.toLowerCase())}).
          </p>
        </div>
      ) : null}
    </section>
  );
};

export default HypothesisLoopPanel;
