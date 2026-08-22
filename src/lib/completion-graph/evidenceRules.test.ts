import { describe, expect, it } from 'vitest';
import { evidenceCountsAsActive, findCreditViolations, findThreeLevelsViolations, hasActiveEvidence } from './evidenceRules';
import type { CompletionNode } from './types';

function leaf(overrides: Partial<CompletionNode> = {}): CompletionNode {
  return {
    id: 'leaf',
    parentId: 'root',
    name: 'leaf',
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

describe('evidenceCountsAsActive', () => {
  it('rejects skipped and cancelled CI', () => {
    expect(evidenceCountsAsActive({ kind: 'ci', ref: 'wf', ciState: 'skipped' })).toBe(false);
    expect(evidenceCountsAsActive({ kind: 'ci', ref: 'wf', ciState: 'cancelled' })).toBe(false);
  });

  it('rejects failed and pending CI', () => {
    expect(evidenceCountsAsActive({ kind: 'ci', ref: 'wf', ciState: 'failure' })).toBe(false);
    expect(evidenceCountsAsActive({ kind: 'ci', ref: 'wf', ciState: 'pending' })).toBe(false);
  });

  it('accepts only successful CI', () => {
    expect(evidenceCountsAsActive({ kind: 'ci', ref: 'wf', ciState: 'success' })).toBe(true);
  });

  it('fails closed on CI evidence with no declared state', () => {
    expect(evidenceCountsAsActive({ kind: 'ci', ref: 'wf' })).toBe(false);
  });

  it('rejects stale, superseded, and closed PRs', () => {
    expect(evidenceCountsAsActive({ kind: 'pr', ref: '#1', prState: 'stale' })).toBe(false);
    expect(evidenceCountsAsActive({ kind: 'pr', ref: '#1', prState: 'superseded' })).toBe(false);
    expect(evidenceCountsAsActive({ kind: 'pr', ref: '#1', prState: 'closed' })).toBe(false);
  });

  it('accepts merged and open PRs, and legacy PR citations with no declared state', () => {
    expect(evidenceCountsAsActive({ kind: 'pr', ref: '#1', prState: 'merged' })).toBe(true);
    expect(evidenceCountsAsActive({ kind: 'pr', ref: '#1', prState: 'open' })).toBe(true);
    expect(evidenceCountsAsActive({ kind: 'pr', ref: '#1' })).toBe(true);
  });

  it('accepts presence-based evidence unconditionally', () => {
    expect(evidenceCountsAsActive({ kind: 'file', ref: 'src/x.ts' })).toBe(true);
    expect(evidenceCountsAsActive({ kind: 'route', ref: '/x' })).toBe(true);
    expect(evidenceCountsAsActive({ kind: 'test', ref: 'x.test.ts' })).toBe(true);
    expect(evidenceCountsAsActive({ kind: 'doc', ref: 'README.md' })).toBe(true);
    expect(evidenceCountsAsActive({ kind: 'commit', ref: 'abc123' })).toBe(true);
    expect(evidenceCountsAsActive({ kind: 'issue', ref: '#1' })).toBe(true);
  });
});

describe('hasActiveEvidence', () => {
  it('is true when at least one citation is active', () => {
    const node = leaf({ evidence: [{ kind: 'ci', ref: 'wf', ciState: 'skipped' }, { kind: 'file', ref: 'src/x.ts' }] });
    expect(hasActiveEvidence(node)).toBe(true);
  });

  it('is false when every citation is inactive', () => {
    const node = leaf({ evidence: [{ kind: 'ci', ref: 'wf', ciState: 'skipped' }, { kind: 'pr', ref: '#1', prState: 'stale' }] });
    expect(hasActiveEvidence(node)).toBe(false);
  });

  it('is false with zero citations', () => {
    expect(hasActiveEvidence(leaf({ evidence: [] }))).toBe(false);
  });
});

describe('findCreditViolations', () => {
  const scoredArchitecture = {
    architectureContracts: 1 as const,
    implementationPresent: null,
    integrationCanonicalBranch: null,
    scientificProvenanceSecurity: null,
    browserEndToEnd: null,
    deployedOperational: null,
  };

  it('flags a gate score of 1 with zero evidence', () => {
    const node = leaf({ gateScores: scoredArchitecture, evidence: [] });
    expect(findCreditViolations(node)).toHaveLength(1);
  });

  it('flags a gate score of 1 backed only by skipped CI', () => {
    const node = leaf({ gateScores: scoredArchitecture, evidence: [{ kind: 'ci', ref: 'wf', ciState: 'skipped' }] });
    expect(findCreditViolations(node)).toHaveLength(1);
  });

  it('flags a gate score of 1 backed only by cancelled CI', () => {
    const node = leaf({ gateScores: scoredArchitecture, evidence: [{ kind: 'ci', ref: 'wf', ciState: 'cancelled' }] });
    expect(findCreditViolations(node)).toHaveLength(1);
  });

  it('flags a gate score of 1 backed only by a stale/superseded PR', () => {
    const stale = leaf({ id: 'stale', gateScores: scoredArchitecture, evidence: [{ kind: 'pr', ref: '#1', prState: 'stale' }] });
    const superseded = leaf({ id: 'superseded', gateScores: scoredArchitecture, evidence: [{ kind: 'pr', ref: '#1', prState: 'superseded' }] });
    expect(findCreditViolations(stale)).toHaveLength(1);
    expect(findCreditViolations(superseded)).toHaveLength(1);
  });

  it('passes a gate score of 1 backed by a file citation', () => {
    const node = leaf({ gateScores: scoredArchitecture, evidence: [{ kind: 'file', ref: 'src/x.ts' }] });
    expect(findCreditViolations(node)).toEqual([]);
  });

  it('passes a gate score of 1 backed by a merged PR or successful CI', () => {
    const merged = leaf({ id: 'merged', gateScores: scoredArchitecture, evidence: [{ kind: 'pr', ref: '#1', prState: 'merged' }] });
    const ciSuccess = leaf({ id: 'ci-success', gateScores: scoredArchitecture, evidence: [{ kind: 'ci', ref: 'wf', ciState: 'success' }] });
    expect(findCreditViolations(merged)).toEqual([]);
    expect(findCreditViolations(ciSuccess)).toEqual([]);
  });

  it('does not flag a leaf with no gate scores at all', () => {
    expect(findCreditViolations(leaf())).toEqual([]);
  });

  it('does not flag a leaf whose gate scores are all 0/null/N-A', () => {
    const node = leaf({
      gateScores: { architectureContracts: 0, implementationPresent: null, integrationCanonicalBranch: 'N/A', scientificProvenanceSecurity: null, browserEndToEnd: null, deployedOperational: null },
      evidence: [],
    });
    expect(findCreditViolations(node)).toEqual([]);
  });

  it('recurses into children and reports the violating node id', () => {
    const bad = leaf({ id: 'bad', gateScores: scoredArchitecture, evidence: [] });
    const good = leaf({ id: 'good', gateScores: scoredArchitecture, evidence: [{ kind: 'file', ref: 'src/x.ts' }] });
    const root: CompletionNode = { ...leaf({ id: 'root' }), type: 'domain', children: [bad, good] };
    expect(findCreditViolations(root).map((v) => v.nodeId)).toEqual(['bad']);
  });
});

describe('findThreeLevelsViolations', () => {
  const fullyMetScores = {
    architectureContracts: 1 as const,
    implementationPresent: 1 as const,
    integrationCanonicalBranch: 1 as const,
    scientificProvenanceSecurity: 1 as const,
    browserEndToEnd: 1 as const,
    deployedOperational: null,
  };

  it('flags productComplete=MET without a confirmed deployedOperational gate', () => {
    const node = leaf({
      threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'MET' },
      gateScores: fullyMetScores,
      evidence: [{ kind: 'file', ref: 'src/x.ts' }],
    });
    expect(findThreeLevelsViolations(node)).toHaveLength(1);
  });

  it('passes productComplete=MET with a confirmed deployedOperational gate', () => {
    const node = leaf({
      threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'MET' },
      gateScores: { ...fullyMetScores, deployedOperational: 1 },
      evidence: [{ kind: 'file', ref: 'src/x.ts' }],
    });
    expect(findThreeLevelsViolations(node)).toEqual([]);
  });

  it('ignores branches — rollup productComplete is not a direct claim', () => {
    const branchNode: CompletionNode = {
      ...leaf({ id: 'branch', threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'MET' } }),
      type: 'module',
      children: [leaf({ id: 'child' })],
    };
    expect(findThreeLevelsViolations(branchNode)).toEqual([]);
  });

  it('does not flag productComplete states other than MET', () => {
    const node = leaf({ threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'NOT_MET' } });
    expect(findThreeLevelsViolations(node)).toEqual([]);
  });
});
