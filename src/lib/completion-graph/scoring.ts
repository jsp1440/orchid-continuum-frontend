/**
 * Canonical completion graph — scoring and rollup rules.
 *
 * Implements the default gate weighting and rollup semantics from
 * OC-OBSERVATORY-001, including the transparency requirement: a percentage
 * computed from partial evidence must expose how much of the weighting it
 * actually covers, not just the renormalized number.
 */

import type { AcceptanceGateScores, CompletionLevelState, CompletionNode, CompletionStatus, ThreeLevelsOfDone } from './types';

export const GATE_WEIGHTS: Record<keyof AcceptanceGateScores, number> = {
  architectureContracts: 0.2,
  implementationPresent: 0.25,
  integrationCanonicalBranch: 0.15,
  scientificProvenanceSecurity: 0.15,
  browserEndToEnd: 0.15,
  deployedOperational: 0.1,
};

const GATE_KEYS = Object.keys(GATE_WEIGHTS) as (keyof AcceptanceGateScores)[];

export type GateScoreResult = {
  /** Renormalized percentage across only the evaluated categories, or null if none evaluated. */
  percentage: number | null;
  /** Fraction (0-1) of the *applicable* (non-N/A) gate weighting that has actually been evaluated. */
  coverage: number;
  evaluatedCount: number;
  totalCount: number;
  /** Categories explicitly marked 'N/A' — excluded from both percentage and coverage denominators. */
  notApplicableCount: number;
};

const EMPTY_RESULT: GateScoreResult = { percentage: null, coverage: 0, evaluatedCount: 0, totalCount: GATE_KEYS.length, notApplicableCount: 0 };

/**
 * A category marked 'N/A' is explicitly inapplicable to this node and is
 * dropped from both the numerator and the denominator — it renormalizes
 * coverage transparently rather than counting as either a pass or a gap.
 * A category left `null` is still applicable but not yet evaluated: it
 * counts against coverage as a real, visible gap. Conflating the two would
 * let marking something "N/A" quietly substitute for doing the evaluation.
 */
export function computeGateScore(scores: AcceptanceGateScores | undefined): GateScoreResult {
  if (!scores) return EMPTY_RESULT;

  let applicableWeight = 0;
  let evaluatedWeight = 0;
  let valueSum = 0;
  let evaluatedCount = 0;
  let notApplicableCount = 0;

  for (const key of GATE_KEYS) {
    const value = scores[key];
    if (value === 'N/A') {
      notApplicableCount += 1;
      continue;
    }
    const weight = GATE_WEIGHTS[key];
    applicableWeight += weight;
    if (value === null || value === undefined) continue;
    evaluatedWeight += weight;
    valueSum += weight * value;
    evaluatedCount += 1;
  }

  if (evaluatedWeight === 0) {
    return { percentage: null, coverage: 0, evaluatedCount, totalCount: GATE_KEYS.length, notApplicableCount };
  }

  return {
    percentage: Math.round((valueSum / evaluatedWeight) * 100),
    coverage: applicableWeight > 0 ? Math.round((evaluatedWeight / applicableWeight) * 100) / 100 : 0,
    evaluatedCount,
    totalCount: GATE_KEYS.length,
    notApplicableCount,
  };
}

/**
 * Node percentage: a scored leaf uses its own gate score; a branch is the
 * unweighted mean of its children's percentages (siblings are not yet
 * weighted against each other — see README note in completionGraphData.ts).
 * Returns null when nothing under this node has been scored — null must
 * never be displayed as 0.
 */
export function computeNodePercentage(node: CompletionNode): number | null {
  if (node.children.length === 0) {
    return computeGateScore(node.gateScores).percentage;
  }
  const childPercentages = node.children
    .map(computeNodePercentage)
    .filter((p): p is number => p !== null);
  if (childPercentages.length === 0) return null;
  return Math.round(childPercentages.reduce((sum, p) => sum + p, 0) / childPercentages.length);
}

const STATUS_SEVERITY_ORDER: CompletionStatus[] = [
  'EXTERNAL_BLOCKER',
  'BLOCKED',
  'OWNER_ACTION',
  'MISSING',
  'PARTIAL',
  'UNKNOWN',
];

/** Worst-status-wins rollup: a branch is DONE only if every leaf beneath it is DONE. */
export function rollupStatus(node: CompletionNode): CompletionStatus {
  if (node.children.length === 0) return node.status;
  const childStatuses = node.children.map(rollupStatus);
  if (childStatuses.every((s) => s === 'DONE')) return 'DONE';
  for (const severe of STATUS_SEVERITY_ORDER) {
    if (childStatuses.includes(severe)) return severe;
  }
  return 'UNKNOWN';
}

function rollupLevel(children: CompletionNode[], dim: keyof ThreeLevelsOfDone): CompletionLevelState {
  const values = children.map((c) => c.threeLevels[dim]);
  const applicable = values.filter((v) => v !== 'NOT_APPLICABLE');
  if (applicable.length === 0) return 'NOT_APPLICABLE';
  if (applicable.every((v) => v === 'UNKNOWN')) return 'UNKNOWN';
  if (applicable.every((v) => v === 'MET')) return 'MET';
  if (applicable.every((v) => v === 'NOT_MET')) return 'NOT_MET';
  return 'PARTIAL';
}

export function rollupThreeLevels(children: CompletionNode[]): ThreeLevelsOfDone {
  return {
    codeComplete: rollupLevel(children, 'codeComplete'),
    integratedComplete: rollupLevel(children, 'integratedComplete'),
    productComplete: rollupLevel(children, 'productComplete'),
  };
}
