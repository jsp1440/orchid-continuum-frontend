import { describe, expect, it } from 'vitest';
import { buildGraphDispatchPlan } from '../scripts/oc-graph-dispatch-plan';
import { declaredNodesByIssue, type Issue } from '../scripts/oc-dispatch-control';
import { bindingReport } from '../scripts/oc-dispatch-runtime';
import { COMPLETION_GRAPH } from '../src/lib/completion-graph/completionGraphData';

const NOW = '2026-09-19T19:06:57.000Z';

// The queue as the scheduler actually saw it in run 35463293876, which logged
// `{"queued":23, ...}; graph plan: []; capacity=8` and skipped dispatch.
const QUEUED_AT_STARVATION = [
  166, 167, 168, 169, 170, 188, 189, 243, 289, 296, 308, 523,
  610, 662, 664, 675, 676, 679, 680, 681, 682, 683, 703,
];

// Selected first by the ranker against the live graph, and discarded every pass
// for want of a queued issue bound to it.
const ADMISSIBLE_LEAF = 'gate-journey-research-matrix';

const issue = (number: number, labels: string[]): Issue =>
  ({ number, state: 'open', title: `issue ${number}`, body: null, labels: labels.map(name => ({ name })) });

describe('the starvation in run 35463293876', () => {
  it('admits nothing, because no queued issue is bound to any node', () => {
    const plan = buildGraphDispatchPlan({ maxActiveLanes: 8, runningCount: 0, queuedIssueNumbers: QUEUED_AT_STARVATION, now: NOW });

    expect(plan.capacity).toBe(8);
    expect(plan.issues).toEqual([]);
    expect(plan.unboundQueued).toEqual(QUEUED_AT_STARVATION);
    expect(plan.untrackedLeaves.length).toBeGreaterThan(0);
  });

  it('calls that starvation, rather than reporting a healthy idle wave', () => {
    const plan = buildGraphDispatchPlan({ maxActiveLanes: 8, runningCount: 0, queuedIssueNumbers: QUEUED_AT_STARVATION, now: NOW });
    expect(plan.starved).toBe(true);
  });

  it('does not call an empty queue starvation', () => {
    const plan = buildGraphDispatchPlan({ maxActiveLanes: 8, runningCount: 0, queuedIssueNumbers: [], now: NOW });
    expect(plan.starved).toBe(false);
  });

  it('does not call a full lane starvation', () => {
    const plan = buildGraphDispatchPlan({ maxActiveLanes: 8, runningCount: 8, queuedIssueNumbers: QUEUED_AT_STARVATION, now: NOW });
    expect(plan.capacity).toBe(0);
    expect(plan.starved).toBe(false);
  });
});

describe('binding a queued issue from the issue side', () => {
  it('carries a declared issue into the wave', () => {
    const plan = buildGraphDispatchPlan({
      maxActiveLanes: 8, runningCount: 0, queuedIssueNumbers: QUEUED_AT_STARVATION, now: NOW,
      declaredNodesByIssue: { 703: [ADMISSIBLE_LEAF] },
    });

    expect(plan.issues).toContain(703);
    expect(plan.leaves.find(leaf => leaf.issueNumber === 703)?.nodeId).toBe(ADMISSIBLE_LEAF);
    expect(plan.starved).toBe(false);
    expect(plan.unboundQueued).not.toContain(703);
  });

  it('leaves the rest of the queue unbound and says so', () => {
    const plan = buildGraphDispatchPlan({
      maxActiveLanes: 8, runningCount: 0, queuedIssueNumbers: QUEUED_AT_STARVATION, now: NOW,
      declaredNodesByIssue: { 703: [ADMISSIBLE_LEAF] },
    });
    expect(plan.unboundQueued).toEqual(QUEUED_AT_STARVATION.filter(n => n !== 703));
  });

  it('never admits an issue that is not queued, however it declares itself', () => {
    const plan = buildGraphDispatchPlan({
      maxActiveLanes: 8, runningCount: 0, queuedIssueNumbers: QUEUED_AT_STARVATION, now: NOW,
      declaredNodesByIssue: { 171: [ADMISSIBLE_LEAF] },
    });
    expect(plan.issues).not.toContain(171);
  });

  it('refuses a declaration naming a node the graph does not have, rather than guessing one', () => {
    const plan = buildGraphDispatchPlan({
      maxActiveLanes: 8, runningCount: 0, queuedIssueNumbers: QUEUED_AT_STARVATION, now: NOW,
      declaredNodesByIssue: { 703: ['cap-no-such-node'] },
    });

    expect(plan.unknownNodeDeclarations).toEqual([{ issueNumber: 703, nodeId: 'cap-no-such-node' }]);
    expect(plan.issues).toEqual([]);
    expect(plan.unboundQueued).toContain(703);
  });

  it('keeps the graph the source of truth where it does bind an issue', () => {
    const bound = new Set<number>();
    const walk = (node: typeof COMPLETION_GRAPH) => {
      (node.issues ?? []).forEach(ref => bound.add(Number(ref.replace(/\D/g, ''))));
      node.children.forEach(walk);
    };
    walk(COMPLETION_GRAPH);

    // Three of seventy-nine nodes. This is the gap the label surface exists to close.
    expect([...bound].sort((a, b) => a - b)).toEqual([171, 525, 528]);
  });

  it('is still deterministic once declarations are in play', () => {
    const input = {
      maxActiveLanes: 8, runningCount: 0, queuedIssueNumbers: QUEUED_AT_STARVATION, now: NOW,
      declaredNodesByIssue: { 703: [ADMISSIBLE_LEAF] },
    };
    expect(buildGraphDispatchPlan(input)).toEqual(buildGraphDispatchPlan(input));
  });
});

describe('the oc-node label surface', () => {
  it('reads a node id off a deliberately applied label', () => {
    expect(declaredNodesByIssue([issue(703, ['oc-queued', `oc-node:${ADMISSIBLE_LEAF}`])]))
      .toEqual({ 703: [ADMISSIBLE_LEAF] });
  });

  it('reads nothing off prose, however precisely the prose names a node', () => {
    const prose: Issue = { number: 703, state: 'open', title: `fix ${ADMISSIBLE_LEAF} now`,
      body: `This issue implements ${ADMISSIBLE_LEAF}. oc-node:${ADMISSIBLE_LEAF}`, labels: [{ name: 'oc-queued' }] };
    expect(declaredNodesByIssue([prose])).toEqual({});
  });

  it('ignores labels that are not declarations', () => {
    expect(declaredNodesByIssue([issue(703, ['oc-queued', 'oc-p0', 'oc-cap:test-execution', 'oc-node-ish'])])).toEqual({});
  });

  it('accepts several declarations and drops duplicates', () => {
    expect(declaredNodesByIssue([issue(703, [`oc-node:${ADMISSIBLE_LEAF}`, `OC-NODE: ${ADMISSIBLE_LEAF}`, 'oc-node:cap-vision-intelligence-adapter'])]))
      .toEqual({ 703: [ADMISSIBLE_LEAF, 'cap-vision-intelligence-adapter'] });
  });

  it('omits issues that declare nothing', () => {
    expect(declaredNodesByIssue([issue(1, ['oc-queued']), issue(2, [`oc-node:${ADMISSIBLE_LEAF}`])]))
      .toEqual({ 2: [ADMISSIBLE_LEAF] });
  });
});

describe('what the scheduler run says when it admits nothing', () => {
  const planWith = (over: Record<string, unknown>) => ({
    capacity: 8, issues: [], leaves: [], untrackedLeaves: [], surfacedBlockers: [],
    unboundQueued: [], unknownNodeDeclarations: [], starved: false,
    inventory: { queued: 23, prepared: 1, validating: 1, blocked: 22, 'owner-gate': 6, 'runtime-backoff': 23, active: 0 },
    ...over,
  }) as unknown as Parameters<typeof bindingReport>[0];

  it('names the starvation, the free lanes and the discarded leaves', () => {
    const report = bindingReport(planWith({
      starved: true,
      untrackedLeaves: [{ nodeId: ADMISSIBLE_LEAF, nodeName: 'n', reasons: [] }],
    }));
    expect(report).toContain('STARVED');
    expect(report).toContain('8 free lane(s)');
    expect(report).toContain('23 queued issue(s)');
    expect(report).toContain('1 admissible graph leaf/leaves carried no queued issue');
  });

  it('lists the queued issues no node names, and how to bind one', () => {
    const report = bindingReport(planWith({ starved: true, unboundQueued: [166, 703] }));
    expect(report).toContain('166, 703');
    expect(report).toContain('oc-node:<node-id>');
  });

  it('names a declaration it refused rather than silently dropping it', () => {
    const report = bindingReport(planWith({ unknownNodeDeclarations: [{ issueNumber: 703, nodeId: 'cap-no-such-node' }] }));
    expect(report).toContain("#703 declares node 'cap-no-such-node'");
    expect(report).toContain('Binding refused');
  });

  it('says nothing when the wave is genuinely healthy', () => {
    expect(bindingReport(planWith({ issues: [703] }))).toBe('');
  });
});
