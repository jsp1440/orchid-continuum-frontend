/**
 * Disposition workflow + closed-loop feedback.
 *
 * Reviewers assign a verified disposition to an incident. Verified dispositions
 * feed a feedback loop that PROPOSES reviewable changes — threshold tweaks,
 * noisy-rule flags, fixture suggestions. Critically, the system never silently
 * retrains itself or alters enforcement: proposals are versioned, reviewable,
 * and must be promoted through the normal repository process.
 *
 * See docs/security/RULE_CATALOG.md ("Rule health") and
 * docs/security/INCIDENT_RESPONSE_RUNBOOK.md.
 */

import {
  DISPOSITIONS,
  type Disposition,
  type Incident,
  type IncidentStatus,
} from './incident';

export interface DispositionInput {
  incident_id: string;
  disposition: Disposition;
  reviewer: string;
  false_positive_reason?: string;
  resolution_notes?: string;
  at?: string;
}

const TERMINAL_STATUS: Record<Disposition, IncidentStatus> = {
  confirmed_incident: 'contained',
  benign_expected: 'closed',
  false_positive: 'closed',
  policy_violation_no_compromise: 'resolved',
  needs_investigation: 'investigating',
  test_simulation: 'closed',
};

export interface DispositionResult {
  ok: boolean;
  incident?: Incident;
  error?: string;
}

/**
 * Apply a disposition to an incident (pure — returns a new incident object).
 * Enforces that a false_positive requires a reason and a human reviewer.
 */
export function applyDisposition(
  incident: Incident,
  input: DispositionInput,
): DispositionResult {
  if (!DISPOSITIONS.includes(input.disposition)) {
    return { ok: false, error: 'unknown disposition' };
  }
  if (!input.reviewer || input.reviewer.trim().length === 0) {
    return { ok: false, error: 'a human reviewer is required' };
  }
  if (input.disposition === 'false_positive' && !input.false_positive_reason) {
    return { ok: false, error: 'false_positive requires a reason' };
  }
  const at = input.at ?? new Date().toISOString();
  const human_conclusions = [
    ...incident.narrative.human_conclusions,
    `${input.reviewer} @ ${at}: ${input.disposition}${
      input.resolution_notes ? ` — ${input.resolution_notes}` : ''
    }`,
  ];
  return {
    ok: true,
    incident: {
      ...incident,
      disposition: input.disposition,
      reviewer: input.reviewer,
      false_positive_reason: input.false_positive_reason,
      resolution_notes: input.resolution_notes,
      status: TERMINAL_STATUS[input.disposition],
      updated_at: at,
      narrative: { ...incident.narrative, human_conclusions },
    },
  };
}

// ---------------------------------------------------------------------------
// Feedback loop — proposals only, never auto-applied.
// ---------------------------------------------------------------------------

export interface RuleHealth {
  signal_id: string;
  fired: number;
  confirmed: number;
  false_positive: number;
  /** confirmed / (confirmed + false_positive), undefined when no verdicts. */
  precision?: number;
}

export interface RuleChangeProposal {
  signal_id: string;
  kind: 'raise_threshold' | 'add_fixture' | 'review_noisy_rule' | 'increase_confidence';
  rationale: string;
  /** Evidence: incident ids supporting the proposal. */
  evidence_incident_ids: string[];
  /** Must be promoted through review — never auto-applied. */
  auto_apply: false;
}

/**
 * Compute rule health from a set of dispositioned incidents.
 */
export function computeRuleHealth(incidents: Incident[]): RuleHealth[] {
  const map = new Map<string, RuleHealth>();
  for (const inc of incidents) {
    for (const s of inc.contributing_signals) {
      const h =
        map.get(s.signal_id) ??
        { signal_id: s.signal_id, fired: 0, confirmed: 0, false_positive: 0 };
      h.fired += 1;
      if (inc.disposition === 'confirmed_incident') h.confirmed += 1;
      if (inc.disposition === 'false_positive') h.false_positive += 1;
      map.set(s.signal_id, h);
    }
  }
  for (const h of map.values()) {
    const verdicts = h.confirmed + h.false_positive;
    h.precision = verdicts > 0 ? h.confirmed / verdicts : undefined;
  }
  return [...map.values()];
}

export interface ProposalOptions {
  /** Precision at/below which a rule is flagged noisy. */
  noisyPrecision: number;
  /** Minimum verdicts before precision is trusted. */
  minVerdicts: number;
}

export const DEFAULT_PROPOSAL_OPTIONS: ProposalOptions = {
  noisyPrecision: 0.3,
  minVerdicts: 5,
};

/**
 * Produce reviewable rule-change proposals from rule health + incidents.
 * Deterministic and side-effect-free. Never mutates rule config.
 */
export function proposeRuleChanges(
  incidents: Incident[],
  options: Partial<ProposalOptions> = {},
): RuleChangeProposal[] {
  const opts = { ...DEFAULT_PROPOSAL_OPTIONS, ...options };
  const health = computeRuleHealth(incidents);
  const proposals: RuleChangeProposal[] = [];

  const incidentIdsFor = (signalId: string, only: Disposition) =>
    incidents
      .filter(
        (i) =>
          i.disposition === only &&
          i.contributing_signals.some((s) => s.signal_id === signalId),
      )
      .map((i) => i.incident_id);

  for (const h of health) {
    const verdicts = h.confirmed + h.false_positive;
    if (
      verdicts >= opts.minVerdicts &&
      h.precision !== undefined &&
      h.precision <= opts.noisyPrecision
    ) {
      proposals.push({
        signal_id: h.signal_id,
        kind: 'review_noisy_rule',
        rationale: `precision ${(h.precision * 100).toFixed(0)}% over ${verdicts} verified verdicts (≤ ${
          opts.noisyPrecision * 100
        }% noisy threshold). Consider raising the rule threshold or adding fixtures.`,
        evidence_incident_ids: incidentIdsFor(h.signal_id, 'false_positive'),
        auto_apply: false,
      });
    }
    // Confirmed incidents → suggest fixtures so regressions are caught.
    if (h.confirmed > 0) {
      proposals.push({
        signal_id: h.signal_id,
        kind: 'add_fixture',
        rationale: `${h.confirmed} confirmed incident(s) — capture as regression fixtures to prevent silent rule drift.`,
        evidence_incident_ids: incidentIdsFor(h.signal_id, 'confirmed_incident'),
        auto_apply: false,
      });
    }
  }
  return proposals;
}
