import { describe, expect, it } from 'vitest';

import { COMPLETION_GRAPH } from './completionGraphData';
import {
  GATE_EVIDENCE_REQUIRED,
  GATE_LABELS,
  THIN_COVERAGE_THRESHOLD,
  computeGateCoverage,
  demonstratedWeightFraction,
  evidencedWeightFraction,
  neverEvaluatedGates,
  thinlyEvidencedGates,
  type GateCoverageRow,
} from './gateCoverage';
import { GATE_WEIGHTS, computeNodePercentage } from './scoring';
import type { CompletionNode } from './types';

/**
 * What the headline percentage is actually a percentage of.
 *
 * Each leaf renormalises over the gates it was scored on, so a leaf checked
 * for architecture and implementation alone reports 100% without anyone having
 * opened a browser. These tests hold the aggregate view that makes that
 * visible, and pin the live shape of the graph so it cannot drift silently.
 */

function leaf(id: string, scores: Partial<Record<keyof typeof GATE_WEIGHTS, number | null>>): CompletionNode {
  return {
    id,
    parentId: 'root',
    name: id,
    type: 'capability',
    status: 'PARTIAL',
    children: [],
    threeLevels: { codeComplete: 'MET', integratedComplete: 'UNKNOWN', productComplete: 'UNKNOWN' },
    gateScores: {
      architectureContracts: null,
      implementationPresent: null,
      integrationCanonicalBranch: null,
      scientificProvenanceSecurity: null,
      browserEndToEnd: null,
      deployedOperational: null,
      ...scores,
    },
    evidence: [],
  } as CompletionNode;
}

function rootOf(children: CompletionNode[]): CompletionNode {
  return {
    id: 'root',
    parentId: null,
    name: 'root',
    type: 'portfolio',
    status: 'PARTIAL',
    children,
    threeLevels: { codeComplete: 'UNKNOWN', integratedComplete: 'UNKNOWN', productComplete: 'UNKNOWN' },
    evidence: [],
  } as CompletionNode;
}

describe('gate coverage counts what was evaluated, not what scored', () => {
  it('separates evaluated from met', () => {
    const root = rootOf([
      leaf('a', { implementationPresent: 1, browserEndToEnd: 0 }),
      leaf('b', { implementationPresent: 1 }),
    ]);
    const rows = computeGateCoverage(root);
    const impl = rows.find((r) => r.gate === 'implementationPresent') as GateCoverageRow;
    const browser = rows.find((r) => r.gate === 'browserEndToEnd') as GateCoverageRow;

    expect(impl).toMatchObject({ evaluatedLeaves: 2, metLeaves: 2, scoredLeaves: 2 });
    // Evaluated once, met never: a scored zero is evidence, and it is not a pass.
    expect(browser).toMatchObject({ evaluatedLeaves: 1, metLeaves: 0, scoredLeaves: 2 });
  });

  it('does not round a partial gate up to met', () => {
    const rows = computeGateCoverage(rootOf([leaf('a', { implementationPresent: 0.9 })]));
    const impl = rows.find((r) => r.gate === 'implementationPresent') as GateCoverageRow;
    expect(impl.evaluatedLeaves).toBe(1);
    expect(impl.metLeaves).toBe(0);
  });

  it('ignores leaves the census never reached', () => {
    // A leaf with no gate values at all is un-audited, not a zero.
    const rows = computeGateCoverage(rootOf([leaf('a', { implementationPresent: 1 }), leaf('b', {})]));
    expect(rows[0].scoredLeaves).toBe(1);
  });

  it('names a gate no leaf has ever evaluated', () => {
    const rows = computeGateCoverage(rootOf([leaf('a', { implementationPresent: 1 })]));
    const never = neverEvaluatedGates(rows).map((r) => r.gate);
    expect(never).toContain('deployedOperational');
    expect(never).not.toContain('implementationPresent');
  });
});

describe('the honest bracket', () => {
  it('reports evidenced weight below 1 when gates are unevaluated', () => {
    // Only implementation (0.25) evaluated, so 25% of the weighting.
    const rows = computeGateCoverage(rootOf([leaf('a', { implementationPresent: 1 })]));
    expect(evidencedWeightFraction(rows)).toBeCloseTo(0.25, 3);
    expect(demonstratedWeightFraction(rows)).toBeCloseTo(0.25, 3);
  });

  it('keeps demonstrated below evidenced when an evaluated gate failed', () => {
    const rows = computeGateCoverage(rootOf([leaf('a', { implementationPresent: 1, browserEndToEnd: 0 })]));
    expect(evidencedWeightFraction(rows)).toBeCloseTo(0.4, 3);
    expect(demonstratedWeightFraction(rows)).toBeCloseTo(0.25, 3);
  });

  it('returns zero rather than NaN when nothing has been scored', () => {
    const rows = computeGateCoverage(rootOf([leaf('a', {})]));
    expect(evidencedWeightFraction(rows)).toBe(0);
    expect(demonstratedWeightFraction(rows)).toBe(0);
  });

  it('never reports demonstrated above evidenced', () => {
    // A gate cannot be met without having been evaluated, so the floor can
    // never exceed the basis. If this inverts, one of the two is miscounted.
    const rows = computeGateCoverage(COMPLETION_GRAPH);
    expect(demonstratedWeightFraction(rows)).toBeLessThanOrEqual(evidencedWeightFraction(rows));
  });
});

describe('the live graph', () => {
  const rows = computeGateCoverage(COMPLETION_GRAPH);

  it('has never scored anything as deployed and operational', () => {
    // The finding this module was written to surface. If a future census
    // genuinely demonstrates a deployed journey, this test should be updated
    // with that evidence — not deleted to make it pass.
    const deployed = rows.find((r) => r.gate === 'deployedOperational') as GateCoverageRow;
    expect(deployed.metLeaves).toBe(0);
    expect(deployed.evaluatedLeaves).toBeLessThan(deployed.scoredLeaves);
  });

  it('computes its headline percentage from well under the full weighting', () => {
    const headline = computeNodePercentage(COMPLETION_GRAPH);
    expect(headline).not.toBeNull();
    // The gap between these two is the point: the headline is high because it
    // renormalises over the gates that were checked.
    expect(evidencedWeightFraction(rows)).toBeLessThan(0.8);
    expect((headline as number) / 100).toBeGreaterThan(evidencedWeightFraction(rows));
  });

  it('reports the reality gates as thinly evidenced', () => {
    const thin = thinlyEvidencedGates(rows).map((r) => r.gate);
    expect(thin).toContain('deployedOperational');
    expect(thin).toContain('browserEndToEnd');
    // Implementation is not thin — the contrast is what makes the point.
    expect(thin).not.toContain('implementationPresent');
  });

  it('uses a threshold that is a stated policy, not a magic number', () => {
    expect(THIN_COVERAGE_THRESHOLD).toBeGreaterThan(0);
    expect(THIN_COVERAGE_THRESHOLD).toBeLessThanOrEqual(1);
  });
});

describe('every gate is named and its evidence stated', () => {
  it('labels and describes each gate in the weighting', () => {
    for (const gate of Object.keys(GATE_WEIGHTS) as (keyof typeof GATE_WEIGHTS)[]) {
      expect(GATE_LABELS[gate]).toBeTruthy();
      expect(GATE_EVIDENCE_REQUIRED[gate].length).toBeGreaterThan(20);
    }
  });

  it('states that a service health check is not deployment evidence', () => {
    // Mission Control renders live health panels on the same page. A green one
    // means a service answered, not that a scientist finished a journey.
    expect(GATE_EVIDENCE_REQUIRED.deployedOperational).toMatch(/health check is not this evidence/i);
  });
});
