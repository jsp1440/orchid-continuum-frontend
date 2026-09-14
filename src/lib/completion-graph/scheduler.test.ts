import { describe, expect, it } from 'vitest';
import { selectAdmissibleLeaf } from './scheduler';
import { computeNodePercentage } from './scoring';
import type { CompletionNode } from './types';

const NOW = '2026-08-22T00:00:00.000Z';

function leaf(overrides: Partial<CompletionNode>): CompletionNode {
  return {
    id: 'leaf',
    parentId: 'root',
    name: 'leaf',
    type: 'acceptance_gate',
    status: 'MISSING',
    threeLevels: { codeComplete: 'NOT_MET', integratedComplete: 'NOT_MET', productComplete: 'NOT_MET' },
    evidence: [],
    nextAction: 'n/a',
    lastUpdated: NOW,
    children: [],
    ...overrides,
  };
}

function tree(children: CompletionNode[]): CompletionNode {
  return leaf({ id: 'root', parentId: null, type: 'domain', children, status: 'UNKNOWN' });
}

describe('selectAdmissibleLeaf — priority', () => {
  it('picks the highest explicit priority unmet leaf over lower-priority generic backlog work', () => {
    const root = tree([
      leaf({ id: 'generic-backlog', status: 'MISSING', priority: 50 }),
      leaf({ id: 'known-leaf', status: 'MISSING', priority: 1 }),
    ]);
    const result = selectAdmissibleLeaf(root, { now: NOW });
    expect(result.selected?.node.id).toBe('known-leaf');
  });
});

describe('selectAdmissibleLeaf — dependencies', () => {
  it('does not dispatch a leaf whose dependency has not rolled up to DONE', () => {
    const root = tree([
      leaf({ id: 'prereq', status: 'MISSING' }),
      leaf({ id: 'dependent', status: 'MISSING', priority: 1, dependsOn: ['prereq'] }),
    ]);
    const result = selectAdmissibleLeaf(root, { now: NOW });
    expect(result.selected?.node.id).toBe('prereq');
  });

  it('admits the dependent leaf once its dependency is DONE', () => {
    const root = tree([
      leaf({ id: 'prereq', status: 'DONE' }),
      leaf({ id: 'dependent', status: 'MISSING', priority: 1, dependsOn: ['prereq'] }),
    ]);
    const result = selectAdmissibleLeaf(root, { now: NOW });
    expect(result.selected?.node.id).toBe('dependent');
  });

  it('fails closed when a dependency id does not resolve in the graph', () => {
    const root = tree([leaf({ id: 'dependent', status: 'MISSING', dependsOn: ['ghost-node'] })]);
    const result = selectAdmissibleLeaf(root, { now: NOW });
    expect(result.selected).toBeNull();
  });
});

describe('selectAdmissibleLeaf — owner/external blockers', () => {
  it('surfaces owner-action and external-blocker leaves without admitting or bypassing them', () => {
    const root = tree([
      leaf({ id: 'owner', status: 'OWNER_ACTION' }),
      leaf({ id: 'external', status: 'EXTERNAL_BLOCKER' }),
      leaf({ id: 'actionable', status: 'MISSING' }),
    ]);
    const result = selectAdmissibleLeaf(root, { now: NOW });
    expect(result.selected?.node.id).toBe('actionable');
    expect(result.surfacedBlockers.map((n) => n.id).sort()).toEqual(['external', 'owner']);
  });

  it('admits an internally repairable BLOCKED leaf (distinct from owner/external blockers)', () => {
    const root = tree([leaf({ id: 'repairable', status: 'BLOCKED' })]);
    const result = selectAdmissibleLeaf(root, { now: NOW });
    expect(result.selected?.node.id).toBe('repairable');
  });

  it('a blocker on one leaf does not stop the program from selecting other actionable work', () => {
    const root = tree([
      leaf({ id: 'owner', status: 'OWNER_ACTION', priority: 1 }),
      leaf({ id: 'actionable', status: 'MISSING', priority: 50 }),
    ]);
    const result = selectAdmissibleLeaf(root, { now: NOW });
    expect(result.selected?.node.id).toBe('actionable');
  });
});

describe('selectAdmissibleLeaf — duplicate suppression', () => {
  it('suppresses a leaf that already has an open tracked issue/PR', () => {
    const root = tree([
      leaf({ id: 'duplicate', status: 'MISSING', priority: 1, issues: ['#301'] }),
      leaf({ id: 'fresh', status: 'MISSING', priority: 50 }),
    ]);
    const result = selectAdmissibleLeaf(root, { now: NOW, openWorkRefs: new Set(['#301']) });
    expect(result.selected?.node.id).toBe('fresh');
    expect(result.suppressedDuplicates.map((n) => n.id)).toEqual(['duplicate']);
  });

  it('does not suppress a leaf whose issue reference is no longer open', () => {
    const root = tree([leaf({ id: 'closed-ref', status: 'MISSING', issues: ['#999'] })]);
    const result = selectAdmissibleLeaf(root, { now: NOW, openWorkRefs: new Set(['#301']) });
    expect(result.selected?.node.id).toBe('closed-ref');
  });
});

describe('selectAdmissibleLeaf — lane fairness', () => {
  it('does not let a recently-run lane starve scientific/data or release/acceptance work at equal priority', () => {
    const root = tree([
      leaf({ id: 'product', status: 'MISSING', priority: 10, lane: 'PRODUCT_COMPLETION' }),
      leaf({ id: 'science', status: 'MISSING', priority: 10, lane: 'SCIENTIFIC_DATA_COMPLETION' }),
      leaf({ id: 'release', status: 'MISSING', priority: 10, lane: 'RELEASE_ACCEPTANCE' }),
    ]);
    const recentLaneHistory: CompletionNode['lane'][] = ['PRODUCT_COMPLETION', 'PRODUCT_COMPLETION', 'PRODUCT_COMPLETION'];
    const result = selectAdmissibleLeaf(root, { now: NOW, recentLaneHistory: recentLaneHistory as never });
    expect(result.selected?.node.id).not.toBe('product');
  });

  it('exempts a security/governance cross-cutting gate from lane-fairness deprioritization', () => {
    const root = tree([
      leaf({ id: 'security', status: 'MISSING', priority: 10, lane: 'PRODUCT_COMPLETION', securityGate: true }),
      leaf({ id: 'other-product', status: 'MISSING', priority: 10, lane: 'PRODUCT_COMPLETION' }),
    ]);
    const recentLaneHistory: CompletionNode['lane'][] = ['PRODUCT_COMPLETION', 'PRODUCT_COMPLETION'];
    const result = selectAdmissibleLeaf(root, { now: NOW, recentLaneHistory: recentLaneHistory as never });
    expect(result.selected?.node.id).toBe('security');
  });
});

describe('selectAdmissibleLeaf — evidence advancing the leaf', () => {
  it('selects the next eligible leaf once the previous winner is independently evidenced as DONE', () => {
    const first = leaf({ id: 'first', status: 'PARTIAL', priority: 1 });
    const second = leaf({ id: 'second', status: 'MISSING', priority: 2 });
    const root = tree([first, second]);

    const before = selectAdmissibleLeaf(root, { now: NOW });
    expect(before.selected?.node.id).toBe('first');

    first.status = 'DONE';
    first.threeLevels = { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'MET' };

    const after = selectAdmissibleLeaf(root, { now: NOW });
    expect(after.selected?.node.id).toBe('second');
  });
});

describe('selectAdmissibleLeaf — provider independence', () => {
  it('produces an identical decision regardless of which provider field is smuggled into the context', () => {
    const root = tree([
      leaf({ id: 'a', status: 'MISSING', priority: 5 }),
      leaf({ id: 'b', status: 'MISSING', priority: 1 }),
    ]);
    const withClaude = selectAdmissibleLeaf(root, { now: NOW, ...( { provider: 'claude' } as object) });
    const withGemini = selectAdmissibleLeaf(root, { now: NOW, ...( { provider: 'gemini' } as object) });
    const withOpenAi = selectAdmissibleLeaf(root, { now: NOW, ...( { provider: 'openai' } as object) });
    expect(withClaude.selected?.node.id).toBe('b');
    expect(withGemini.selected?.node.id).toBe(withClaude.selected?.node.id);
    expect(withOpenAi.selected?.node.id).toBe(withClaude.selected?.node.id);
  });
});

describe('selectAdmissibleLeaf — no completion inflation from mere execution', () => {
  it('does not change a leaf percentage merely because the scheduler ran repeatedly', () => {
    const root = tree([
      leaf({
        id: 'scored',
        status: 'PARTIAL',
        gateScores: {
          architectureContracts: 1,
          implementationPresent: 1,
          integrationCanonicalBranch: null,
          scientificProvenanceSecurity: null,
          browserEndToEnd: null,
          deployedOperational: null,
        },
      }),
    ]);
    const scoredNode = root.children[0];
    const before = computeNodePercentage(scoredNode);

    selectAdmissibleLeaf(root, { now: NOW });
    selectAdmissibleLeaf(root, { now: NOW });
    selectAdmissibleLeaf(root, { now: NOW });

    expect(computeNodePercentage(scoredNode)).toBe(before);
  });

  it('returns null with nothing surfaced or suppressed when every leaf is already DONE', () => {
    const root = tree([leaf({ id: 'done', status: 'DONE' })]);
    const result = selectAdmissibleLeaf(root, { now: NOW });
    expect(result.selected).toBeNull();
    expect(result.surfacedBlockers).toEqual([]);
    expect(result.suppressedDuplicates).toEqual([]);
  });
});

describe('selectAdmissibleLeaf — acceptance-stage deficit and staleness tiebreaks', () => {
  it('prefers converging a nearly-done leaf over an equally-prioritized fresh leaf', () => {
    const root = tree([
      leaf({
        id: 'nearly-done',
        status: 'PARTIAL',
        priority: 10,
        threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'NOT_MET' },
      }),
      leaf({
        id: 'brand-new',
        status: 'MISSING',
        priority: 10,
        threeLevels: { codeComplete: 'NOT_MET', integratedComplete: 'NOT_MET', productComplete: 'NOT_MET' },
      }),
    ]);
    const result = selectAdmissibleLeaf(root, { now: NOW });
    expect(result.selected?.node.id).toBe('nearly-done');
  });

  it('prefers the longest-neglected leaf when priority and deficit are tied', () => {
    const root = tree([
      leaf({ id: 'recent', status: 'MISSING', priority: 10, lastUpdated: '2026-08-21T00:00:00.000Z' }),
      leaf({ id: 'stale', status: 'MISSING', priority: 10, lastUpdated: '2026-01-01T00:00:00.000Z' }),
    ]);
    const result = selectAdmissibleLeaf(root, { now: NOW });
    expect(result.selected?.node.id).toBe('stale');
  });
});
