import { describe, expect, it } from 'vitest';
import type { CompletionNode } from './types';
import { graphNodeMarker, resolveExecutableIssue } from './executableIssue';

function node(overrides: Partial<CompletionNode> = {}): CompletionNode {
  return {
    id: 'gate-example',
    parentId: 'parent',
    name: 'Example acceptance gate',
    type: 'acceptance_gate',
    status: 'PARTIAL',
    threeLevels: { codeComplete: 'MET', integratedComplete: 'MET', productComplete: 'NOT_MET' },
    evidence: [],
    nextAction: 'Run the remaining acceptance proof.',
    lastUpdated: '2026-09-01T00:00:00.000Z',
    children: [],
    ...overrides,
  };
}

describe('resolveExecutableIssue', () => {
  it('never coerces historical PR evidence into an issue lease', () => {
    const selected = node({ prs: ['#343'] });
    expect(resolveExecutableIssue(selected, [{ number: 343, body: null }])).toBeNull();
  });

  it('uses a declared issue only when that issue is currently open', () => {
    const selected = node({ issues: ['#498', 'repo#499'] });
    expect(resolveExecutableIssue(selected, [{ number: 499, body: null }])).toBe(499);
    expect(resolveExecutableIssue(selected, [])).toBeNull();
  });

  it('reuses an already-materialized graph issue by stable node marker', () => {
    const selected = node({ prs: ['#343'] });
    const body = `Generated work\n\n${graphNodeMarker(selected.id)}`;
    expect(resolveExecutableIssue(selected, [{ number: 612, body }])).toBe(612);
  });

  it('does not match a materialized issue for another graph node', () => {
    const selected = node();
    expect(resolveExecutableIssue(selected, [{ number: 612, body: graphNodeMarker('gate-other') }])).toBeNull();
  });
});
