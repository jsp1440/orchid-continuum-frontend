import { describe, expect, it } from 'vitest';
import { decideGraphIssueAction, priorityTier, STALE_NODE_DATA_DAYS } from './graphIssueDecision';
import { graphNodeMarker } from './executableIssue';
import type { CompletionNode } from './types';

const NOW = '2026-09-05T00:00:00.000Z';

function node(overrides: Partial<CompletionNode> = {}): CompletionNode {
  return {
    id: 'gate-example',
    parentId: 'parent',
    name: 'Example acceptance gate',
    type: 'acceptance_gate',
    status: 'MISSING',
    threeLevels: { codeComplete: 'NOT_MET', integratedComplete: 'NOT_MET', productComplete: 'NOT_MET' },
    lane: 'INTEGRATION_COMPLETION',
    evidence: [],
    nextAction: 'Do the specific bounded thing.',
    lastUpdated: NOW,
    children: [],
    ...overrides,
  };
}

describe('priorityTier', () => {
  it('maps low numbers to P0 and the documented default to P5', () => {
    expect(priorityTier(0)).toBe('P0');
    expect(priorityTier(5)).toBe('P0');
    expect(priorityTier(15)).toBe('P1');
    expect(priorityTier(25)).toBe('P2');
    expect(priorityTier(35)).toBe('P3');
    expect(priorityTier(45)).toBe('P4');
    expect(priorityTier(50)).toBe('P5');
    expect(priorityTier(999)).toBe('P5');
  });
});

describe('decideGraphIssueAction — no admissible node', () => {
  it('fails closed with a distinct reason when nothing was selected', () => {
    const decision = decideGraphIssueAction(null, [], NOW);
    expect(decision.action).toBe('no-admissible-node');
  });
});

describe('decideGraphIssueAction — create path', () => {
  it('creates a bounded issue prefixed with the priority tier, using nextAction as acceptance criteria', () => {
    const selected = node({ priority: 5, nextAction: 'Wire the thing end to end.' });
    const decision = decideGraphIssueAction(selected, [], NOW);
    expect(decision.action).toBe('create');
    if (decision.action !== 'create') throw new Error('expected create');
    expect(decision.title).toBe('P0 Graph leaf: Example acceptance gate');
    expect(decision.labels).toEqual(['oc-queued', 'oc-auto-generated']);
    expect(decision.body).toContain('## Acceptance criteria');
    expect(decision.body).toContain('Wire the thing end to end.');
    expect(decision.body).toContain(graphNodeMarker(selected.id));
    expect(decision.markerNodeId).toBe(selected.id);
  });

  it('falls back to tier P5 when the node declares no explicit priority, rather than guessing urgency', () => {
    const selected = node({ priority: undefined });
    const decision = decideGraphIssueAction(selected, [], NOW);
    expect(decision.action).toBe('create');
    if (decision.action !== 'create') throw new Error('expected create');
    expect(decision.title.startsWith('P5 ')).toBe(true);
  });
});

describe('decideGraphIssueAction — dedup / reuse', () => {
  it('reuses a declared open issue instead of creating a duplicate', () => {
    const selected = node({ issues: ['#777'] });
    const decision = decideGraphIssueAction(selected, [{ number: 777, body: null }], NOW);
    expect(decision).toEqual({
      action: 'reuse-existing',
      issueNumber: 777,
      reason: expect.stringContaining('#777'),
    });
  });

  it('reuses a previously materialized graph issue found by its stable marker', () => {
    const selected = node();
    const body = `Some generated body\n\n${graphNodeMarker(selected.id)}`;
    const decision = decideGraphIssueAction(selected, [{ number: 888, body }], NOW);
    expect(decision.action).toBe('reuse-existing');
    if (decision.action !== 'reuse-existing') throw new Error('expected reuse');
    expect(decision.issueNumber).toBe(888);
  });

  it('does not reuse a closed-issue-only PR reference and instead creates fresh work', () => {
    const selected = node({ prs: ['#343'] });
    const decision = decideGraphIssueAction(selected, [], NOW);
    expect(decision.action).toBe('create');
  });
});

describe('decideGraphIssueAction — fail-closed on stale/ambiguous/missing data', () => {
  it('fails closed when nextAction is blank', () => {
    const selected = node({ nextAction: '   ' });
    const decision = decideGraphIssueAction(selected, [], NOW);
    expect(decision.action).toBe('fail-closed');
    if (decision.action !== 'fail-closed') throw new Error('expected fail-closed');
    expect(decision.reason).toContain('nextAction');
  });

  it('fails closed when lastUpdated cannot be parsed', () => {
    const selected = node({ lastUpdated: 'not-a-date' });
    const decision = decideGraphIssueAction(selected, [], NOW);
    expect(decision.action).toBe('fail-closed');
    if (decision.action !== 'fail-closed') throw new Error('expected fail-closed');
    expect(decision.reason).toContain('parseable date');
  });

  it(`fails closed when lastUpdated is older than the ${STALE_NODE_DATA_DAYS}d staleness window`, () => {
    const selected = node({ lastUpdated: '2026-01-01T00:00:00.000Z' });
    const decision = decideGraphIssueAction(selected, [], NOW);
    expect(decision.action).toBe('fail-closed');
    if (decision.action !== 'fail-closed') throw new Error('expected fail-closed');
    expect(decision.reason).toContain('staleness window');
  });

  it('fails closed when the selected node status contradicts creatable work (e.g. already DONE)', () => {
    const selected = node({ status: 'DONE' });
    const decision = decideGraphIssueAction(selected, [], NOW);
    expect(decision.action).toBe('fail-closed');
    if (decision.action !== 'fail-closed') throw new Error('expected fail-closed');
    expect(decision.reason).toContain('does not justify');
  });

  it('fails closed when the selected node is not a structural leaf', () => {
    const selected = node({ children: [node({ id: 'child' })] });
    const decision = decideGraphIssueAction(selected, [], NOW);
    expect(decision.action).toBe('fail-closed');
    if (decision.action !== 'fail-closed') throw new Error('expected fail-closed');
    expect(decision.reason).toContain('not a structural leaf');
  });

  it('fails closed when id is blank', () => {
    const selected = node({ id: '' });
    const decision = decideGraphIssueAction(selected, [], NOW);
    expect(decision.action).toBe('fail-closed');
  });
});
