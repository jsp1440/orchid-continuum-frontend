import { describe, expect, it } from 'vitest';
import {
  countIncompleteLeaves,
  countLeavesByStatus,
  findNode,
  getBreadcrumb,
  getLeaves,
  groupLeavesByLane,
  listBlockers,
  listOwnerActions,
  selectNextUnmetGate,
} from './graphOps';
import type { CompletionNode } from './types';

function leaf(overrides: Partial<CompletionNode>): CompletionNode {
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

function tree(children: CompletionNode[]): CompletionNode {
  return leaf({ id: 'root', parentId: null, type: 'domain', children });
}

describe('getLeaves / flattenGraph', () => {
  it('treats any childless node as a leaf regardless of declared type', () => {
    const root = tree([leaf({ id: 'a', type: 'capability' }), leaf({ id: 'b', type: 'acceptance_gate' })]);
    expect(getLeaves(root).map((n) => n.id).sort()).toEqual(['a', 'b']);
  });
});

describe('countIncompleteLeaves / countLeavesByStatus', () => {
  it('counts everything not DONE as incomplete', () => {
    const root = tree([
      leaf({ id: 'a', status: 'DONE' }),
      leaf({ id: 'b', status: 'PARTIAL' }),
      leaf({ id: 'c', status: 'UNKNOWN' }),
    ]);
    expect(countIncompleteLeaves(root)).toBe(2);
    expect(countLeavesByStatus(root)).toMatchObject({ DONE: 1, PARTIAL: 1, UNKNOWN: 1 });
  });

  it('counts RECOVERABLE_LEGACY leaves separately from MISSING', () => {
    const root = tree([leaf({ id: 'a', status: 'RECOVERABLE_LEGACY' }), leaf({ id: 'b', status: 'MISSING' })]);
    expect(countLeavesByStatus(root)).toMatchObject({ RECOVERABLE_LEGACY: 1, MISSING: 1 });
  });
});

describe('findNode / getBreadcrumb', () => {
  it('finds a nested node by id and returns its ancestor trail', () => {
    const target = leaf({ id: 'target' });
    const mid = { ...leaf({ id: 'mid', type: 'module' }), children: [target] };
    const root = tree([mid]);
    expect(findNode(root, 'target')?.id).toBe('target');
    expect(findNode(root, 'missing')).toBeNull();
    expect(getBreadcrumb(root, 'target').map((n) => n.id)).toEqual(['root', 'mid', 'target']);
  });
});

describe('groupLeavesByLane', () => {
  it('buckets leaves by their declared execution lane', () => {
    const root = tree([
      leaf({ id: 'a', lane: 'PRODUCT_COMPLETION' }),
      leaf({ id: 'b', lane: 'RELEASE_ACCEPTANCE' }),
      leaf({ id: 'c' }), // no lane -> excluded
    ]);
    const groups = groupLeavesByLane(root);
    expect(groups.PRODUCT_COMPLETION.map((n) => n.id)).toEqual(['a']);
    expect(groups.RELEASE_ACCEPTANCE.map((n) => n.id)).toEqual(['b']);
    expect(groups.INTEGRATION_COMPLETION).toEqual([]);
  });
});

describe('selectNextUnmetGate', () => {
  it('excludes blocked/owner-action/external-blocker leaves — a blocker must not stop the program', () => {
    const root = tree([
      leaf({ id: 'blocked', status: 'BLOCKED' }),
      leaf({ id: 'owner', status: 'OWNER_ACTION' }),
      leaf({ id: 'external', status: 'EXTERNAL_BLOCKER' }),
      leaf({ id: 'actionable', status: 'MISSING' }),
    ]);
    expect(selectNextUnmetGate(root)?.id).toBe('actionable');
  });

  it('returns null when there is nothing actionable left', () => {
    const root = tree([leaf({ id: 'done', status: 'DONE' }), leaf({ id: 'blocked', status: 'BLOCKED' })]);
    expect(selectNextUnmetGate(root)).toBeNull();
  });

  it('prefers lower explicit priority, then lane order, then lowest percentage', () => {
    const root = tree([
      leaf({ id: 'low-priority', status: 'PARTIAL', priority: 10 }),
      leaf({ id: 'high-priority', status: 'PARTIAL', priority: 1 }),
    ]);
    expect(selectNextUnmetGate(root)?.id).toBe('high-priority');
  });

  it('treats RECOVERABLE_LEGACY as actionable, per OC-ARCHAEOLOGY-001 (#308) — the scheduler may prefer a bounded port over a rebuild', () => {
    const root = tree([leaf({ id: 'blocked', status: 'BLOCKED' }), leaf({ id: 'legacy', status: 'RECOVERABLE_LEGACY' })]);
    expect(selectNextUnmetGate(root)?.id).toBe('legacy');
  });
});

describe('listBlockers / listOwnerActions', () => {
  it('separates blocker classes from owner actions', () => {
    const root = tree([
      leaf({ id: 'a', status: 'BLOCKED' }),
      leaf({ id: 'b', status: 'EXTERNAL_BLOCKER' }),
      leaf({ id: 'c', status: 'OWNER_ACTION' }),
      leaf({ id: 'd', status: 'DONE' }),
    ]);
    expect(listBlockers(root).map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(listOwnerActions(root).map((n) => n.id)).toEqual(['c']);
  });
});
