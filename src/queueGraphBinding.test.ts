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

  it('refuses a declaration naming a real node that is not a leaf, and still reports the issue as unbound', () => {
    // A domain, not a leaf. `selectAdmissibleLeaf` only ever returns leaves, so
    // this issue can never be admitted -- and counting it as bound would delete
    // the one line telling the operator to fix the label.
    const plan = buildGraphDispatchPlan({
      maxActiveLanes: 8, runningCount: 0, queuedIssueNumbers: QUEUED_AT_STARVATION, now: NOW,
      declaredNodesByIssue: { 703: ['domain-species-dossier'] },
    });

    expect(plan.unadmissibleNodeDeclarations).toEqual([{ issueNumber: 703, nodeId: 'domain-species-dossier' }]);
    expect(plan.issues).toEqual([]);
    expect(plan.unboundQueued).toContain(703);
    expect(plan.unknownNodeDeclarations).toEqual([]);
  });

  it('binds an uppercase declaration, which GitHub labels can carry', () => {
    const plan = buildGraphDispatchPlan({
      maxActiveLanes: 8, runningCount: 0, queuedIssueNumbers: QUEUED_AT_STARVATION, now: NOW,
      declaredNodesByIssue: declaredNodesByIssue([issue(703, ['oc-queued', `oc-node:${ADMISSIBLE_LEAF.toUpperCase()}`])]),
    });
    expect(plan.issues).toContain(703);
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

  // A data assertion, not a behavioural one: it measures the gap, it does not
  // exercise the planner. The graph-side lookup it describes is covered by the
  // pre-existing dispatch tests, which go red when it is removed.
  it('records how few nodes the graph itself binds', () => {
    let nodes = 0;
    const bound = new Set<number>();
    const walk = (node: typeof COMPLETION_GRAPH) => {
      nodes += 1;
      (node.issues ?? []).forEach(ref => bound.add(Number(ref.replace(/\D/g, ''))));
      node.children.forEach(walk);
    };
    walk(COMPLETION_GRAPH);

    // Three of 119. This is the gap the label surface exists to close.
    expect(nodes).toBe(119);
    expect([...bound].sort((a, b) => a - b)).toEqual([171, 525, 528]);
  });

  it('admits a graph-bound issue without any declaration', () => {
    const plan = buildGraphDispatchPlan({ maxActiveLanes: 8, runningCount: 0, queuedIssueNumbers: [525], now: NOW });
    expect(plan.issues).toEqual([525]);
    expect(plan.leaves[0]?.nodeId).toBe('cap-research-trait-explorer');
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
    unboundQueued: [], unknownNodeDeclarations: [], unadmissibleNodeDeclarations: [], starved: false,
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
    expect(report).toContain('24 pending issue(s)');
    expect(report).toContain('1 admissible graph leaf/leaves carried no pending issue');
  });

  it('lists the queued issues no node names, and how to bind one', () => {
    const report = bindingReport(planWith({ starved: true, unboundQueued: [166, 703] }));
    expect(report).toContain('166, 703');
    // Backticked, because the step summary renders Markdown with HTML
    // passthrough and would strip a bare <node-id> as an unknown tag --
    // deleting the only thing this line tells an operator to type.
    expect(report).toContain('`oc-node:<node-id>`');
  });

  it('survives the Markdown renderer the step summary uses', () => {
    const report = bindingReport(planWith({
      starved: true,
      unboundQueued: [166],
      unknownNodeDeclarations: [{ issueNumber: 703, nodeId: 'cap-no-such-node' }],
    }));
    // Every angle-bracketed placeholder is inside code spans, and the lines are
    // list items separated from the preceding paragraph, so they do not collapse.
    expect(report.replace(/`[^`]*`/g, '')).not.toContain('<');
    expect(report.startsWith('\n- ')).toBe(true);
    report.trimEnd().split('\n').filter(Boolean).forEach(line => expect(line.startsWith('- ')).toBe(true));
  });

  it('names a declaration it refused rather than silently dropping it', () => {
    const report = bindingReport(planWith({ unknownNodeDeclarations: [{ issueNumber: 703, nodeId: 'cap-no-such-node' }] }));
    expect(report).toContain('#703 declares node `cap-no-such-node`');
    expect(report).toContain('Binding refused');
  });

  it('calls out an idle wave whose queue never reached the ranker at all', () => {
    // Every queued issue filtered out before graph admission: the planner sees an
    // empty queue and reports starved=false, which used to print nothing.
    const report = bindingReport(planWith({ starved: false, inventory: { queued: 23, prepared: 0, active: 0 } }));
    expect(report).toContain('STARVED');
    expect(report).toContain('No pending issue reached graph admission');
  });

  it('says nothing when the wave is genuinely healthy', () => {
    expect(bindingReport(planWith({ issues: [703] }))).toBe('');
  });

  it('does not call a wave starved because its lanes are busy', () => {
    // 23 issues still carry `oc-queued` while five lanes execute them: the label
    // census counts work in flight, so on its own it reports a healthy pipeline
    // as starvation, and an operator learns to ignore the line.
    const report = bindingReport(planWith({ starved: false, inventory: { queued: 23, prepared: 0, active: 5 } }));
    expect(report).toBe('');
  });

  it('still calls out real starvation while other lanes are busy', () => {
    // `starved` comes from the set the ranker actually saw, so it stands on its
    // own: eligible work that could not bind is a failure however busy the rest is.
    const report = bindingReport(planWith({ starved: true, inventory: { queued: 23, prepared: 0, active: 5 } }));
    expect(report).toContain('STARVED');
  });

  it('names a declaration that points at a node the ranker can never select', () => {
    const report = bindingReport(planWith({
      starved: true,
      unadmissibleNodeDeclarations: [{ issueNumber: 703, nodeId: 'domain-species-dossier' }],
    }));
    expect(report).toContain('#703 declares node `domain-species-dossier`');
    expect(report).toContain('is not a leaf');
    expect(report).toContain('name a leaf instead');
  });

  it('says nothing when there is simply no queued work', () => {
    expect(bindingReport(planWith({ inventory: { queued: 0, prepared: 0, active: 0 } }))).toBe('');
  });
});
