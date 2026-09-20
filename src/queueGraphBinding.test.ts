import { describe, expect, it } from 'vitest';
import { buildGraphDispatchPlan } from '../scripts/oc-graph-dispatch-plan';
import { declaredNodesByIssue, makePlan, type Issue, type Snapshot } from '../scripts/oc-dispatch-control';
import { bindingReport, planSummary } from '../scripts/oc-dispatch-runtime';
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
    expect(plan.unknownNodeDeclarations).toEqual([]);
    // Named by the declaration line, so not repeated in the unbound list.
    expect(plan.unboundQueued).not.toContain(703);
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
    expect(plan.unboundQueued).not.toContain(703);
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

  it('requires the label to be the whole declaration, not a substring of one', () => {
    // Unanchored, `legacy-oc-node:...` would bind and `oc-node:x extra` would
    // bind as `x` -- a label that reads as something else entirely on the issue.
    expect(declaredNodesByIssue([issue(703, [`legacy-oc-node:${ADMISSIBLE_LEAF}`])])).toEqual({});
    expect(declaredNodesByIssue([issue(704, [`oc-node:${ADMISSIBLE_LEAF} and more`])])).toEqual({});
    expect(declaredNodesByIssue([issue(705, [`prefix oc-node:${ADMISSIBLE_LEAF}`])])).toEqual({});
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
    unboundQueued: [], unreachableQueued: [], unknownNodeDeclarations: [],
    unadmissibleNodeDeclarations: [], starved: false, queuedReachingAdmission: 23,
    reachedAdmission: [], pendingNotReachingAdmission: [],
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
    expect(report).toContain('23 issue(s) reached graph admission');
    expect(report).toContain('1 admissible graph leaf/leaves carried no pending issue');
  });

  it('lists the queued issues no node names, and how to bind one', () => {
    const report = bindingReport(planWith({ starved: true, unboundQueued: [166, 703] }));
    expect(report).toContain('No completion-graph node names these issues');
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
    const report = bindingReport(planWith({ starved: false, queuedReachingAdmission: 0,
      pendingNotReachingAdmission: [166, 167, 168], inventory: { queued: 23, prepared: 0, active: 0 } }));
    expect(report).toContain('STARVED');
    expect(report).toContain('0 issue(s) reached graph admission');
    expect(report).toContain('never reached admission');
  });

  it('names the issues that never reached admission, rather than counting them', () => {
    // Live on 07ebd53: "A further 5 issue(s) are labelled pending but never
    // reached admission: an open PR lineage, an `OC-AUTO-HOLD`, or a lane
    // label." Three candidate causes, no cause identified, and five issues that
    // appeared nowhere else in a report promising to name every one of them.
    const report = bindingReport(planWith({ starved: true, queuedReachingAdmission: 18,
      pendingNotReachingAdmission: [166, 167, 610, 675, 683] }));

    for (const number of [166, 167, 610, 675, 683]) expect(report).toContain(`#${number}`);
    expect(report).not.toMatch(/A further \d+ issue\(s\)/);
  });

  it('names them in a wave that admitted something, where the count used to vanish', () => {
    // The shortfall line was gated on the wave being idle, and `idle` requires
    // `plan.issues.length === 0`. One admitted issue and the other five went
    // unmentioned -- no names, and not even the count.
    const report = bindingReport(planWith({ issues: [703], capacity: 7,
      queuedReachingAdmission: 18, pendingNotReachingAdmission: [166, 167] }));

    expect(report).toContain('#166');
    expect(report).toContain('#167');
    // Still not starved: a wave that admitted work is not a binding failure.
    expect(report).not.toContain('STARVED');
  });

  it('names an issue once, however many declarations it got wrong', () => {
    const report = bindingReport(planWith({ starved: true,
      unknownNodeDeclarations: [{ issueNumber: 703, nodeId: 'cap-no-such-node' }, { issueNumber: 703, nodeId: 'cap-also-not-real' }] }));

    expect(report.match(/Issue #703/g)).toHaveLength(1);
    expect(report).toContain('`cap-no-such-node`, `cap-also-not-real`');
  });

  it('names an issue once even if two buckets claim it', () => {
    // The planner partitions these buckets, so this cannot arise from
    // `buildGraphDispatchPlan` today. `bindingReport` takes a plan, and the
    // promise it makes is "once each" -- which has to hold for the input it is
    // given, not only for the input it currently gets.
    const report = bindingReport(planWith({ starved: true, unboundQueued: [703],
      unreachableQueued: [{ issueNumber: 703, nodeIds: ['gate-journey-research-matrix'] }] }));

    expect(report.match(/703/g)).toHaveLength(1);
  });

  it('says nothing about an issue the wave admitted, whichever bucket names it', () => {
    // Belt and braces over the planner's own exclusion: an admitted issue is
    // being executed, so no line in this report may suggest otherwise.
    const report = bindingReport(planWith({ issues: [703], capacity: 7,
      unboundQueued: [703], unreachableQueued: [{ issueNumber: 703, nodeIds: ['x'] }] }));

    expect(report).toBe('');
  });

  it('says nothing about a refused declaration on an issue the wave admitted', () => {
    // An issue can declare two nodes, bind on one and have the other refused.
    // The report's only line about it read "Binding refused" -- while the lane
    // was executing it.
    const report = bindingReport(planWith({ issues: [703], capacity: 7,
      unknownNodeDeclarations: [{ issueNumber: 703, nodeId: 'cap-no-such-node' }] }));

    expect(report).not.toContain('#703');
    expect(report).toBe('');
  });

  it('says nothing when the wave is genuinely healthy', () => {
    expect(bindingReport(planWith({ issues: [703] }))).toBe('');
  });

  it('does not call a wave starved because its lanes are busy', () => {
    // 23 issues still carry `oc-queued` while five lanes execute them: the label
    // census counts work in flight, so on its own it reports a healthy pipeline
    // as starvation, and an operator learns to ignore the line.
    const report = bindingReport(planWith({ starved: false, queuedReachingAdmission: 0,
      inventory: { queued: 23, prepared: 0, active: 5 } }));
    expect(report).toBe('');
  });

  it('still calls out real starvation while other lanes are busy', () => {
    // `starved` comes from the set the ranker actually saw, so it stands on its
    // own: eligible work that could not bind is a failure however busy the rest is.
    const report = bindingReport(planWith({ starved: true, queuedReachingAdmission: 18,
      inventory: { queued: 23, prepared: 0, active: 5 } }));
    expect(report).toContain('STARVED');
    // The number printed is the one it can account for, not the label census.
    expect(report).toContain('18 issue(s) reached graph admission');
    expect(report).not.toContain('23 issue(s) reached');
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

  it('says nothing when there is no lane free to admit into', () => {
    // Capacity 0 is not starvation: there was nowhere to put the work.
    // MAX_ACTIVE_LANES configured to 0 leaves capacity 0 with nothing running.
    expect(bindingReport(planWith({ capacity: 0, starved: false, queuedReachingAdmission: 23,
      unboundQueued: [166], inventory: { queued: 23, prepared: 0, active: 0 } }))).toBe('');
    expect(bindingReport(planWith({ capacity: 0, starved: false, queuedReachingAdmission: 23,
      inventory: { queued: 23, prepared: 0, active: 8 } }))).toBe('');
  });

  it('says nothing when there is simply no queued work', () => {
    expect(bindingReport(planWith({ queuedReachingAdmission: 0, inventory: { queued: 0, prepared: 0, active: 0 } }))).toBe('');
  });
});

describe('the label actually reaching the planner', () => {
  const snapshotWith = (labels: string[]): Snapshot => ({
    issues: [{ number: 703, state: 'open', title: 'a queued issue', body: null, labels: labels.map(name => ({ name })) }],
    prs: [],
    integrationSha: 'a'.repeat(40),
    implementationSha: 'b'.repeat(40),
    material: { architecture: 'current material' },
  });

  // Nothing pinned this path: every other declaration test calls
  // `buildGraphDispatchPlan` with a hand-built map, so the wiring that carries a
  // label off the issue snapshot into the planner could be deleted outright and
  // the whole suite stayed green. That wiring is this PR's entire deliverable.
  it('admits an issue whose oc-node label names an admissible leaf, end to end', () => {
    const plan = makePlan(snapshotWith(['oc-queued', `oc-node:${ADMISSIBLE_LEAF}`]), [], NOW);

    expect(plan.issues).toEqual([703]);
    expect(plan.leaves[0]?.nodeId).toBe(ADMISSIBLE_LEAF);
    expect(plan.starved).toBe(false);
  });

  it('admits nothing for the same issue without the label', () => {
    const plan = makePlan(snapshotWith(['oc-queued']), [], NOW);

    expect(plan.issues).toEqual([]);
    expect(plan.starved).toBe(true);
    expect(plan.unboundQueued).toEqual([703]);
  });

  it('carries a refused declaration through to the plan the workflow writes', () => {
    const plan = makePlan(snapshotWith(['oc-queued', 'oc-node:cap-no-such-node']), [], NOW);

    expect(plan.unknownNodeDeclarations).toEqual([{ issueNumber: 703, nodeId: 'cap-no-such-node' }]);
    expect(plan.issues).toEqual([]);
  });

  it('puts the report into the summary the step writes', () => {
    // The other end of the same wiring: `bindingReport` could be dropped from
    // the summary string with nothing going red.
    const plan = makePlan(snapshotWith(['oc-queued']), [], NOW);
    expect(bindingReport(plan)).toContain('STARVED');
    expect(planSummary(plan)).toContain(bindingReport(plan));
  });
});

describe('no unadmitted queued issue is left unnamed', () => {
  const NAMES = [
    ADMISSIBLE_LEAF,              // admissible leaf
    'gate-journey-research-lexicon', // a real leaf the ranker will not select
    'domain-species-dossier',     // a real node that is not a leaf
    'cap-no-such-node',           // not in the graph
  ];

  it('names every queued issue it did not admit, exactly once, across every declaration shape', () => {
    for (const name of NAMES) {
      for (const also of [[], [ADMISSIBLE_LEAF]]) {
        const queued = [701, 702, 703];
        const plan = buildGraphDispatchPlan({
          maxActiveLanes: 8, runningCount: 0, queuedIssueNumbers: queued, now: NOW,
          declaredNodesByIssue: { 703: [name], 702: also },
        });

        const named = [
          ...plan.issues,
          ...plan.unboundQueued,
          ...plan.unreachableQueued.map(entry => entry.issueNumber),
          ...plan.unknownNodeDeclarations.map(entry => entry.issueNumber),
          ...plan.unadmissibleNodeDeclarations.map(entry => entry.issueNumber),
        ];

        expect([...named].sort((a, b) => a - b)).toEqual(queued);
        expect(new Set(named).size).toBe(named.length);
      }
    }
  });

  it('names an issue whose declared leaf the ranker can never select', () => {
    // A real leaf, and `OWNER_ACTION`, so `selectAdmissibleLeaf` never returns
    // it. Counting it as bound removed it from every line -- less informative
    // with the label than without.
    const plan = buildGraphDispatchPlan({
      maxActiveLanes: 8, runningCount: 0, queuedIssueNumbers: [703], now: NOW,
      declaredNodesByIssue: { 703: ['gate-journey-research-lexicon'] },
    });

    expect(plan.issues).toEqual([]);
    expect(plan.unreachableQueued).toEqual([{ issueNumber: 703, nodeIds: ['gate-journey-research-lexicon'] }]);
    expect(bindingReport({ ...plan, inventory: { queued: 1, prepared: 0, active: 0 } } as never))
      .toContain('#703 (`gate-journey-research-lexicon`)');
  });

  it('names the issue that lost a node to another issue declaring the same one', () => {
    const plan = buildGraphDispatchPlan({
      maxActiveLanes: 8, runningCount: 0, queuedIssueNumbers: [703, 704], now: NOW,
      declaredNodesByIssue: { 703: [ADMISSIBLE_LEAF], 704: [ADMISSIBLE_LEAF] },
    });

    expect(plan.issues).toEqual([703]);
    expect(plan.unreachableQueued.map(entry => entry.issueNumber)).toEqual([704]);
  });
});
