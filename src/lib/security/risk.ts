/**
 * Explainable, bounded risk scoring.
 *
 * A risk score summarizes a set of signals for reviewer triage. It is NOT a
 * verdict. Rules that make it trustworthy (see docs/security/RULE_CATALOG.md):
 *  - Every contribution is visible (returned in `contributions`).
 *  - Confidence and severity are kept SEPARATE dimensions and combined
 *    explicitly, never conflated.
 *  - Many low-confidence signals do NOT automatically prove compromise — the
 *    score is capped and confidence-weighted, and a deterministic policy
 *    violation is flagged independently of the anomaly score.
 *  - Scientific novelty contributes nothing (those events never become
 *    signals in the first place).
 *  - Thresholds are configuration-controlled and tested.
 */

import type { Signal } from './signals';
import type { Severity } from './envelope';

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 3,
  high: 7,
  critical: 12,
};

export interface RiskBand {
  band: 'minimal' | 'low' | 'elevated' | 'high' | 'critical';
  min: number;
}

/** Score is bounded to [0,100]. Bands are configuration-controlled. */
export const DEFAULT_RISK_BANDS: RiskBand[] = [
  { band: 'critical', min: 80 },
  { band: 'high', min: 55 },
  { band: 'elevated', min: 30 },
  { band: 'low', min: 10 },
  { band: 'minimal', min: 0 },
];

export interface RiskContribution {
  signal_id: string;
  severity: Severity;
  confidence: number;
  /** severity weight × confidence, before normalization. */
  weighted: number;
}

export interface RiskAssessment {
  /** Bounded [0,100]. */
  score: number;
  band: RiskBand['band'];
  contributions: RiskContribution[];
  /**
   * True when at least one deterministic policy-violation signal is present.
   * Such a signal may justify blocking an action even if the anomaly score is
   * low — kept as a separate flag so the two are never conflated.
   */
  deterministicPolicyViolation: boolean;
  /** Human-readable one-liner for the incident header. */
  rationale: string;
}

/**
 * Signals whose presence is a hard policy violation regardless of anomaly
 * confidence. These gate consequential actions independently of `score`.
 */
const POLICY_VIOLATION_SIGNALS = new Set<string>([
  'agent.secret_access_denied',
  'agent.unapproved_tool',
  'agent.scope_expansion',
  'ai.prompt_injection',
  'ai.destructive_command',
  'locality.sensitive_disclosure',
  'database.readonly_write',
]);

export interface RiskOptions {
  bands?: RiskBand[];
  /** Normalization divisor: higher = more signals needed to saturate. */
  saturation?: number;
}

function bandFor(score: number, bands: RiskBand[]): RiskBand['band'] {
  for (const b of [...bands].sort((a, z) => z.min - a.min)) {
    if (score >= b.min) return b.band;
  }
  return 'minimal';
}

/**
 * Combine signals into a bounded, explainable score. Uses a diminishing-returns
 * (saturating) curve so that a pile of low-confidence signals cannot linearly
 * sum its way to "critical".
 */
export function assessRisk(signals: Signal[], options: RiskOptions = {}): RiskAssessment {
  const bands = options.bands ?? DEFAULT_RISK_BANDS;
  const saturation = options.saturation ?? 18;

  const contributions: RiskContribution[] = signals.map((s) => {
    const weighted = SEVERITY_WEIGHT[s.severity] * clamp01(s.confidence);
    return {
      signal_id: s.signal_id,
      severity: s.severity,
      confidence: clamp01(s.confidence),
      weighted,
    };
  });

  const raw = contributions.reduce((a, c) => a + c.weighted, 0);
  // Saturating map [0,∞) → [0,100): score = 100 * raw / (raw + saturation).
  const score = signals.length === 0 ? 0 : Math.round((100 * raw) / (raw + saturation));

  const deterministicPolicyViolation = signals.some((s) =>
    POLICY_VIOLATION_SIGNALS.has(s.signal_id),
  );

  const band = bandFor(score, bands);
  const rationale = buildRationale(contributions, band, deterministicPolicyViolation);

  return { score, band, contributions, deterministicPolicyViolation, rationale };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function buildRationale(
  contributions: RiskContribution[],
  band: RiskBand['band'],
  policyViolation: boolean,
): string {
  if (contributions.length === 0) return 'No security signals in window; risk minimal.';
  const top = [...contributions]
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, 3)
    .map((c) => `${c.signal_id} (${c.severity}, conf ${c.confidence.toFixed(2)})`);
  const policy = policyViolation
    ? ' A deterministic policy violation is present and gates consequential actions regardless of score.'
    : '';
  return `Risk band ${band}; top contributors: ${top.join(', ')}.${policy}`;
}

/** Convenience: does this assessment justify blocking a consequential action? */
export function shouldGateAction(assessment: RiskAssessment, blockScore = 55): boolean {
  return assessment.deterministicPolicyViolation || assessment.score >= blockScore;
}
