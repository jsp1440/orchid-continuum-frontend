import { GATE_WEIGHTS, computeGateScore } from './scoring';
import type { AcceptanceGateScores, CompletionNode } from './types';

/**
 * Which acceptance gates the census has actually evaluated, and which it has not.
 *
 * WHY THIS EXISTS. `computeGateScore` renormalises the percentage over only
 * the gates that carry a value. That is the right arithmetic — an unevaluated
 * gate is UNKNOWN, and scoring it as zero would report failures nobody
 * observed. But renormalising is silent: a gate that was never evaluated
 * anywhere simply drops out of the denominator, and the headline percentage
 * comes back looking complete on a basis the reader cannot see.
 *
 * The gate that drops out matters. `deployedOperational` carries 10% of the
 * weighting and asks the only question a user cares about — does this work in
 * production. If it is unevaluated across the graph, every percentage on the
 * Observatory is a statement about code and integration that has been
 * renormalised as though deployment were not part of done.
 *
 * This module makes that visible per gate, so "78%" can be read as what it is:
 * 78% of the evidence we actually gathered, not 78% of the product.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not fill an unevaluated gate from
 * any other signal. Mission Control has live service-health panels, and a green
 * one is not deployment evidence: it says a service answered a request, not
 * that a scientist can complete a journey against it. Wiring health into this
 * gate would turn an honest UNKNOWN into a fabricated pass, which is the exact
 * failure the gate exists to prevent.
 */

export type GateKey = keyof AcceptanceGateScores;

export type GateCoverageRow = {
  gate: GateKey;
  /** This gate's share of the total gate weighting. */
  weight: number;
  /** Scored leaves that carry a value for this gate. */
  evaluatedLeaves: number;
  /** Evaluated leaves where the gate is fully met (value 1). */
  metLeaves: number;
  /** Scored leaves overall — the denominator for this gate's coverage. */
  scoredLeaves: number;
};

/** Leaves that have at least one gate value, i.e. leaves the census reached. */
function scoredLeavesOf(node: CompletionNode): CompletionNode[] {
  if (node.children.length === 0) {
    return computeGateScore(node.gateScores).percentage !== null ? [node] : [];
  }
  return node.children.flatMap(scoredLeavesOf);
}

export function computeGateCoverage(root: CompletionNode): GateCoverageRow[] {
  const leaves = scoredLeavesOf(root);
  const gates = Object.keys(GATE_WEIGHTS) as GateKey[];

  return gates.map((gate) => {
    let evaluatedLeaves = 0;
    let metLeaves = 0;
    for (const leaf of leaves) {
      const value = leaf.gateScores?.[gate];
      if (value === null || value === undefined) continue;
      evaluatedLeaves += 1;
      // Strict equality with 1: a partial gate is not a met gate, and rounding
      // a 0.9 up to "met" is how a graph starts reporting done for not-quite.
      if (value === 1) metLeaves += 1;
    }
    return {
      gate,
      weight: GATE_WEIGHTS[gate],
      evaluatedLeaves,
      metLeaves,
      scoredLeaves: leaves.length,
    };
  });
}

/**
 * Gates no scored leaf has ever evaluated.
 *
 * These are the ones silently removed from every percentage in the graph, so
 * they are the ones a reader most needs named.
 */
export function neverEvaluatedGates(rows: GateCoverageRow[]): GateCoverageRow[] {
  return rows.filter((row) => row.evaluatedLeaves === 0);
}

/**
 * Share of the graph's total gate weighting that has actually been evaluated.
 *
 * This is the denominator behind the headline percentage, made explicit. Each
 * leaf renormalises over its own evaluated gates, so a leaf that was scored on
 * architecture and implementation alone can report 100% without anyone having
 * opened a browser. Aggregated across the graph, this number says how much of
 * "done" the headline percentage was computed from at all.
 */
export function evidencedWeightFraction(rows: GateCoverageRow[]): number {
  if (rows.length === 0 || rows[0].scoredLeaves === 0) return 0;
  const evidenced = rows.reduce((sum, row) => sum + row.weight * row.evaluatedLeaves, 0);
  // Gate weights sum to 1, so the maximum possible is one full weighting per leaf.
  const possible = rows[0].scoredLeaves;
  return Math.round((evidenced / possible) * 1000) / 1000;
}

/**
 * Share of the total weighting that is evaluated AND met.
 *
 * This is the floor, not the completion figure. It counts an unevaluated gate
 * as not-yet-evidenced, which is the correct reading for "how much has been
 * demonstrated" and the WRONG reading for "how much is done" — an unevaluated
 * gate is UNKNOWN, and UNKNOWN is not failure. It is published beside the
 * renormalised percentage precisely so neither number can stand alone: the
 * gap between them is the size of what nobody has checked.
 */
export function demonstratedWeightFraction(rows: GateCoverageRow[]): number {
  if (rows.length === 0 || rows[0].scoredLeaves === 0) return 0;
  const met = rows.reduce((sum, row) => sum + row.weight * row.metLeaves, 0);
  return Math.round((met / rows[0].scoredLeaves) * 1000) / 1000;
}

/**
 * Gates evaluated on fewer than this share of scored leaves are reported as
 * barely evidenced. A policy constant: it is the threshold below which a gate's
 * contribution to the headline percentage is too thin to read as coverage.
 */
export const THIN_COVERAGE_THRESHOLD = 0.5;

export function thinlyEvidencedGates(rows: GateCoverageRow[]): GateCoverageRow[] {
  return rows.filter(
    (row) =>
      row.scoredLeaves > 0 && row.evaluatedLeaves / row.scoredLeaves < THIN_COVERAGE_THRESHOLD,
  );
}

/** Human-readable gate names, in the graph's own vocabulary. */
export const GATE_LABELS: Record<GateKey, string> = {
  architectureContracts: 'Architecture & contracts',
  implementationPresent: 'Implementation present',
  integrationCanonicalBranch: 'Integrated on canonical branch',
  scientificProvenanceSecurity: 'Scientific provenance & security',
  browserEndToEnd: 'Browser end-to-end',
  deployedOperational: 'Deployed & operational',
};

/** What evidence each gate would require. Stated so an UNKNOWN is actionable. */
export const GATE_EVIDENCE_REQUIRED: Record<GateKey, string> = {
  architectureContracts: 'A contract or architecture record the implementation can be read against.',
  implementationPresent: 'Code on a branch implementing the contract.',
  integrationCanonicalBranch: 'That code merged into the canonical integration branch.',
  scientificProvenanceSecurity:
    'Provenance preserved and protected data still protected through the changed surface.',
  browserEndToEnd: 'The journey driven in a real browser against a running stack.',
  deployedOperational:
    'The journey completed by a user against the deployed production stack. A service health check is not this evidence: it reports that a service answered, not that a scientist finished anything.',
};
