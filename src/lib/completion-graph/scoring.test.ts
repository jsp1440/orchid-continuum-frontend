import { describe, expect, it } from 'vitest';
import { computeGateScore, computeNodeCensusCoverage, computeNodePercentage, rollupStatus, rollupThreeLevels } from './scoring';
import type { CompletionNode } from './types';

function gateNode(overrides: Partial<CompletionNode> = {}): CompletionNode {
  return {
    id: 'gate-1',
    parentId: 'parent-1',
    name: 'Test gate',
    type: 'acceptance_gate',
    status: 'UNKNOWN',
    threeLevels: { codeComplete: 'UNKNOWN', integratedComplete: 'UNKNOWN', productComplete: 'UNKNOWN' },
    evidence: [],
    nextAction: 'n/a',
    lastUpdated: '2026-08-22T00:00:00.000Z',
    children: [],
    ...overrides,
  };
}

describe('computeGateScore', () => {
  it('returns a null percentage and zero coverage when no gateScores are set', () => {
    const result = computeGateScore(undefined);
    expect(result.percentage).toBeNull();
    expect(result.coverage).toBe(0);
    expect(result.evaluatedCount).toBe(0);
  });

  it('returns 100% when every evaluated category is fully met, with coverage reflecting only what was scored', () => {
    const result = computeGateScore({
      architectureContracts: 1,
      implementationPresent: 1,
      integrationCanonicalBranch: null,
      scientificProvenanceSecurity: null,
      browserEndToEnd: null,
      deployedOperational: null,
    });
    expect(result.percentage).toBe(100);
    expect(result.evaluatedCount).toBe(2);
    expect(result.totalCount).toBe(6);
    expect(result.coverage).toBeCloseTo(0.45, 5); // 0.20 + 0.25
  });

  it('renormalizes across only the evaluated (non-null) categories', () => {
    const result = computeGateScore({
      architectureContracts: 1,
      implementationPresent: 1,
      integrationCanonicalBranch: 1,
      scientificProvenanceSecurity: 1,
      browserEndToEnd: 0,
      deployedOperational: null,
    });
    // matches the Species Dossier evidence gate: (.20+.25+.15+.15)/(.20+.25+.15+.15+.15) = .75/.90
    expect(result.percentage).toBe(Math.round((0.75 / 0.9) * 100));
    expect(result.coverage).toBeCloseTo(0.9, 5);
  });

  it('treats all-N/A as unscored, never as 0', () => {
    const result = computeGateScore({
      architectureContracts: null,
      implementationPresent: null,
      integrationCanonicalBranch: null,
      scientificProvenanceSecurity: null,
      browserEndToEnd: null,
      deployedOperational: null,
    });
    expect(result.percentage).toBeNull();
  });
});

describe('computeNodePercentage', () => {
  it('returns the leaf gate percentage directly', () => {
    const leaf = gateNode({ gateScores: { architectureContracts: 1, implementationPresent: 1, integrationCanonicalBranch: null, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null } });
    expect(computeNodePercentage(leaf)).toBe(100);
  });

  it('returns null for an unscored leaf rather than 0', () => {
    const leaf = gateNode();
    expect(computeNodePercentage(leaf)).toBeNull();
  });

  it('averages children percentages, ignoring unscored siblings', () => {
    const scored = gateNode({ id: 'a', gateScores: { architectureContracts: 1, implementationPresent: 1, integrationCanonicalBranch: 1, scientificProvenanceSecurity: 1, browserEndToEnd: 1, deployedOperational: 1 } });
    const unscored = gateNode({ id: 'b' });
    const branch: CompletionNode = { ...gateNode({ id: 'branch' }), type: 'module', children: [scored, unscored] };
    expect(computeNodePercentage(branch)).toBe(100);
  });

  it('returns null when no descendant has been scored', () => {
    const unscoredA = gateNode({ id: 'a' });
    const unscoredB = gateNode({ id: 'b' });
    const branch: CompletionNode = { ...gateNode({ id: 'branch' }), type: 'module', children: [unscoredA, unscoredB] };
    expect(computeNodePercentage(branch)).toBeNull();
  });

  it('weights sibling branches by structural leaf count, not a flat per-branch average', () => {
    const fullScores = { architectureContracts: 1, implementationPresent: 1, integrationCanonicalBranch: 1, scientificProvenanceSecurity: 1, browserEndToEnd: 1, deployedOperational: 1 };
    // One branch has a single 100%-scored leaf; the other has three 0%-scored leaves.
    // A flat per-branch average would read 50%; leaf-count weighting must read 25% (1*100 + 3*0) / 4.
    const smallBranch: CompletionNode = { ...gateNode({ id: 'small' }), type: 'module', children: [gateNode({ id: 'small-leaf', gateScores: fullScores })] };
    const bigBranch: CompletionNode = {
      ...gateNode({ id: 'big' }),
      type: 'module',
      children: [
        gateNode({ id: 'big-1', gateScores: { architectureContracts: 0, implementationPresent: null, integrationCanonicalBranch: null, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null } }),
        gateNode({ id: 'big-2', gateScores: { architectureContracts: 0, implementationPresent: null, integrationCanonicalBranch: null, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null } }),
        gateNode({ id: 'big-3', gateScores: { architectureContracts: 0, implementationPresent: null, integrationCanonicalBranch: null, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null } }),
      ],
    };
    const domain: CompletionNode = { ...gateNode({ id: 'domain' }), type: 'domain', children: [smallBranch, bigBranch] };
    expect(computeNodePercentage(domain)).toBe(25);
  });
});

describe('computeNodeCensusCoverage', () => {
  it('is 0 when nothing under the node has been evaluated', () => {
    const branch: CompletionNode = { ...gateNode({ id: 'branch' }), type: 'module', children: [gateNode({ id: 'a' }), gateNode({ id: 'b' })] };
    expect(computeNodeCensusCoverage(branch)).toBe(0);
  });

  it('is 1 when every leaf has been evaluated, regardless of the score they received', () => {
    const scored = gateNode({ id: 'a', gateScores: { architectureContracts: 1, implementationPresent: null, integrationCanonicalBranch: null, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null } });
    const confirmedAbsent = gateNode({ id: 'b', gateScores: { architectureContracts: 0, implementationPresent: null, integrationCanonicalBranch: null, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null } });
    const branch: CompletionNode = { ...gateNode({ id: 'branch' }), type: 'module', children: [scored, confirmedAbsent] };
    expect(computeNodeCensusCoverage(branch)).toBe(1);
  });

  it('reports the fraction of leaves evaluated when only some have been', () => {
    const scored = gateNode({ id: 'a', gateScores: { architectureContracts: 1, implementationPresent: null, integrationCanonicalBranch: null, scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null } });
    const unscored = gateNode({ id: 'b' });
    const branch: CompletionNode = { ...gateNode({ id: 'branch' }), type: 'module', children: [scored, unscored] };
    expect(computeNodeCensusCoverage(branch)).toBe(0.5);
  });
});

describe('rollupStatus', () => {
  it('returns the leaf status unchanged', () => {
    expect(rollupStatus(gateNode({ status: 'PARTIAL' }))).toBe('PARTIAL');
  });

  it('is DONE only when every leaf beneath it is DONE', () => {
    const allDone: CompletionNode = { ...gateNode({ id: 'branch' }), type: 'module', children: [gateNode({ id: 'a', status: 'DONE' }), gateNode({ id: 'b', status: 'DONE' })] };
    expect(rollupStatus(allDone)).toBe('DONE');

    const mixed: CompletionNode = { ...gateNode({ id: 'branch' }), type: 'module', children: [gateNode({ id: 'a', status: 'DONE' }), gateNode({ id: 'b', status: 'PARTIAL' })] };
    expect(rollupStatus(mixed)).toBe('PARTIAL');
  });

  it('surfaces the most severe status among children (blockers before missing/partial/unknown)', () => {
    const branch: CompletionNode = {
      ...gateNode({ id: 'branch' }),
      type: 'module',
      children: [gateNode({ id: 'a', status: 'PARTIAL' }), gateNode({ id: 'b', status: 'BLOCKED' }), gateNode({ id: 'c', status: 'UNKNOWN' })],
    };
    expect(rollupStatus(branch)).toBe('BLOCKED');
  });

  it('rolls up to RECOVERABLE_LEGACY when that is the most severe status present (worse than PARTIAL/UNKNOWN, less severe than MISSING/blockers)', () => {
    const withLegacyOnly: CompletionNode = {
      ...gateNode({ id: 'branch' }),
      type: 'module',
      children: [gateNode({ id: 'a', status: 'PARTIAL' }), gateNode({ id: 'b', status: 'RECOVERABLE_LEGACY' })],
    };
    expect(rollupStatus(withLegacyOnly)).toBe('RECOVERABLE_LEGACY');

    const withMissingToo: CompletionNode = {
      ...gateNode({ id: 'branch' }),
      type: 'module',
      children: [gateNode({ id: 'a', status: 'RECOVERABLE_LEGACY' }), gateNode({ id: 'b', status: 'MISSING' })],
    };
    expect(rollupStatus(withMissingToo)).toBe('MISSING');
  });
});

describe('rollupThreeLevels', () => {
  it('is MET only when every applicable child is MET', () => {
    const children = [
      gateNode({ id: 'a', threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'NOT_APPLICABLE' } }),
      gateNode({ id: 'b', threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'NOT_APPLICABLE' } }),
    ];
    const result = rollupThreeLevels(children);
    expect(result.codeComplete).toBe('MET');
    expect(result.productComplete).toBe('NOT_APPLICABLE');
  });

  it('is PARTIAL on a mix of MET and NOT_MET', () => {
    const children = [
      gateNode({ id: 'a', threeLevels: { codeComplete: 'MET', integratedComplete: 'UNKNOWN', productComplete: 'UNKNOWN' } }),
      gateNode({ id: 'b', threeLevels: { codeComplete: 'NOT_MET', integratedComplete: 'UNKNOWN', productComplete: 'UNKNOWN' } }),
    ];
    expect(rollupThreeLevels(children).codeComplete).toBe('PARTIAL');
  });
});
