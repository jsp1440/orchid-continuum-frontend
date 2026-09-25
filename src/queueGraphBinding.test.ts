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

    // Five of 120. The issue-side binding now connects the real Featured Genus sentinel to its canonical graph leaf; cap-research-evidence-chain added the 120th node.
    expect(nodes).toBe(120);
    expect([...bound].sort((a, b) => a - b)).toEqual([47, 171, 525, 528, 660]);
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
      pendingNotReachingAdmission: [166, 167, 168].map(n => ({ issueNumber: n, reason: 'a lane label' })), inventory: { queued: 23, prepared: 0, active: 0 } }));
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
      pendingNotReachingAdmission: [166, 167, 610, 675, 683].map(n => ({ issueNumber: n, reason: 'a lane label' })) }));

    for (const number of [166, 167, 610, 675, 683]) expect(report).toContain(`#${number}`);
    expect(report).not.toMatch(/A further \d+ issue\(s\)/);
  });

  it('names them in a wave that admitted something, where the count used to vanish', () => {
    // The shortfall line was gated on the wave being idle, and `idle` requires
    // `plan.issues.length === 0`. One admitted issue and the other five went
    // unmentioned -- no names, and not even the count.
    const report = bindingReport(planWith({ issues: [703], capacity: 7,
      queuedReachingAdmission: 18, pendingNotReachingAdmission: [166, 167].map(n => ({ issueNumber: n, reason: 'a lane label' })) }));

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
    expect(report).toContain('name a leaf that exists');
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


describe('makePlan derives the shortfall itself, and names the real reason', () => {
  /**
   * Round 6 found three things here, and the first two are the same defect the
   * lane exists to remove.
   *
   * The line printed three candidate causes -- "an open PR lineage, an
   * `OC-AUTO-HOLD`, or a lane label" -- and identified none. On this branch's
   * own run all three were FALSE for #703: its only labels were `oc-queued`,
   * its body had no hold marker, and its lineage PR was closed and MERGED. The
   * true cause was not on the list, and the remedy the line implied (go and
   * close the open PR) did not exist.
   *
   * It also omitted an issue whose lease was executing at that moment, which is
   * the commonest cause of all, because `admit-deterministic` never relabels to
   * `oc-running`.
   *
   * And the production wiring was unpinned: every report test injected
   * `pendingNotReachingAdmission` through a fixture, so `makePlan` could return
   * `[]` unconditionally with the whole suite green. These tests go through
   * `makePlan`.
   */
  const SHA = 'a'.repeat(40);
  const base = (issues: unknown[], prs: unknown[] = []) => ({
    issues, prs, integrationSha: SHA, implementationSha: 'b'.repeat(40), material: { architecture: 'm' },
  }) as unknown as Parameters<typeof makePlan>[0];

  const reasonFor = (plan: ReturnType<typeof makePlan>, issueNumber: number) =>
    plan.pendingNotReachingAdmission.find(entry => entry.issueNumber === issueNumber)?.reason;

  const planWith = (over: Record<string, unknown>) => ({
    capacity: 8, issues: [], leaves: [], untrackedLeaves: [], surfacedBlockers: [],
    unboundQueued: [], unreachableQueued: [], unknownNodeDeclarations: [],
    unadmissibleNodeDeclarations: [], starved: false, queuedReachingAdmission: 23,
    reachedAdmission: [], pendingNotReachingAdmission: [],
    inventory: { queued: 23, prepared: 1, validating: 1, blocked: 22, 'owner-gate': 6, 'runtime-backoff': 23, active: 0 },
    ...over,
  }) as unknown as Parameters<typeof bindingReport>[0];

  it('says a merged lineage is merged, because there is nothing to go and close', () => {
    // The live #703 shape, exactly: only `oc-queued`, and one CLOSED, merged PR.
    const plan = makePlan(base(
      [{ number: 703, state: 'open', title: 't', body: null, labels: [{ name: 'oc-queued' }] }],
      [{ number: 705, state: 'closed', merged: true, title: 'Closes #703.', body: 'Closes #703.', head: { ref: 'f' } }],
    ));

    const reason = reasonFor(plan, 703);
    expect(reason).toBeDefined();
    // `merged`, not `closed`: the operator-relevant fact is that there is no
    // open PR to go and close and the lane will not re-admit this by itself.
    // The report could not say it at all until `Pull` carried the field.
    expect(reason).toContain('#705 (merged)');
    expect(reason).toContain('already merged');
    // The three things the old line claimed, none of which is true here. These
    // name strings `reasonFor` can actually return, so they can fail.
    expect(reason).not.toContain('OC-AUTO-HOLD');
    expect(reason).not.toContain('label');
    expect(reason).not.toContain('active lease');
    expect(bindingReport(plan)).toContain('#705 (merged)');
  });

  it('says an active lease is executing it, rather than calling it unreached', () => {
    const snapshot = base([
      { number: 905, state: 'open', title: 't', body: null, labels: [{ name: 'oc-queued' }, { name: 'oc-node:gate-journey-research-matrix' }] },
    ]);
    const lease = { id: 'l', issue: 905, nodeId: 'gate-journey-research-matrix', fingerprint: 'f', waveHash: 'w',
      runId: '1', runAttempt: '1', expiresAt: '2099-01-01T00:00:00.000Z', reservedUsd: 0,
      lane: 'provider-free' as const, state: 'running' as const };
    const plan = makePlan(snapshot, [lease], NOW);

    expect(reasonFor(plan, 905)).toBe('an active lease is executing it');
  });

  it('names a lane label when that is what holds it', () => {
    const plan = makePlan(base([
      { number: 800, state: 'open', title: 't', body: null, labels: [{ name: 'oc-queued' }, { name: 'oc-blocked' }] },
    ]));

    expect(reasonFor(plan, 800)).toContain('oc-blocked');
  });

  it('names an OC-AUTO-HOLD marker when that is what holds it', () => {
    const plan = makePlan(base([
      { number: 801, state: 'open', title: 't', body: 'OC-AUTO-HOLD: true', labels: [{ name: 'oc-queued' }] },
    ]));

    expect(reasonFor(plan, 801)).toContain('OC-AUTO-HOLD');
  });

  it('leaves the shortfall empty when every pending issue reached the ranker', () => {
    const plan = makePlan(base([
      { number: 900, state: 'open', title: 't', body: null, labels: [{ name: 'oc-queued' }] },
    ]));

    expect(plan.reachedAdmission).toContain(900);
    expect(plan.pendingNotReachingAdmission).toEqual([]);
  });

  it('does not count a portfolio steward issue as unreached work', () => {
    // `selectLanes` skips stewards, so reporting one as held would be a
    // permanent phantom line nobody can clear.
    const plan = makePlan(base([
      { number: 950, state: 'open', title: 't', body: null,
        labels: [{ name: 'oc-queued' }, { name: 'oc-portfolio-steward' }, { name: 'oc-blocked' }] },
    ]));

    expect(plan.pendingNotReachingAdmission).toEqual([]);
  });

  it('says nothing at all when there is no free lane to admit into', () => {
    const plan = makePlan(base([
      { number: 800, state: 'open', title: 't', body: null, labels: [{ name: 'oc-queued' }, { name: 'oc-blocked' }] },
    ]));

    expect(bindingReport({ ...plan, capacity: 0 })).toBe('');
  });

  it('says nothing more about an issue an earlier line already named', () => {
    // `note()` consults `said`, not only `admitted`. The per-issue grouping
    // alone cannot cover this: the earlier line comes from a different bucket
    // entirely. The planner partitions these today, so this pins the promise
    // against the input `bindingReport` is given rather than the input it
    // currently gets -- which is exactly how the last version of this guard
    // came to be dead code nobody noticed.
    const report = bindingReport(planWith({
      starved: true,
      unboundQueued: [901],
      unknownNodeDeclarations: [{ issueNumber: 901, nodeId: 'not-a-real-node-at-all' }],
    }));

    expect(report).toContain('901');
    expect(report.match(/901/g)).toHaveLength(1);
    expect(report).not.toContain('Binding refused');
  });

  it('names an issue once when its two refused declarations are of different kinds', () => {
    // Round 6: grouping held WITHIN a category and not across the two, so an
    // issue declaring one unknown node and one non-leaf node got a line from
    // each loop. Both halves now go in the one line, because fixing only the
    // half the operator is told about would not admit the issue.
    const report = bindingReport(planWith({
      starved: true,
      unknownNodeDeclarations: [{ issueNumber: 900, nodeId: 'not-a-real-node-at-all' }],
      unadmissibleNodeDeclarations: [{ issueNumber: 900, nodeId: 'cap-species-dossier-evidence-rendering' }],
    }));

    expect(report.match(/Issue #900/g)).toHaveLength(1);
    expect(report).toContain('not-a-real-node-at-all');
    expect(report).toContain('cap-species-dossier-evidence-rendering');
  });
});


describe('the reason is the rule that actually decides', () => {
  /**
   * `reasonFor` walks `selectLanes`' rules in order, and the ORDER was
   * unpinned: moving the lease check after the label check, or the hold check
   * before it, left the whole 2503-test suite green. "In `selectLanes`' own
   * order" was an unverified claim about the one thing these lines are for.
   *
   * Each case below holds TWO conditions at once, so only the right precedence
   * produces the right line.
   */
  const SHA = 'a'.repeat(40);
  const base = (issues: unknown[], prs: unknown[] = []) => ({
    issues, prs, integrationSha: SHA, implementationSha: 'b'.repeat(40), material: { architecture: 'm' },
  }) as unknown as Parameters<typeof makePlan>[0];
  const reasonFor = (plan: ReturnType<typeof makePlan>, issueNumber: number) =>
    plan.pendingNotReachingAdmission.find(entry => entry.issueNumber === issueNumber)?.reason;
  const lease = (issue: number) => ({
    id: 'l', issue, nodeId: 'gate-journey-research-matrix', fingerprint: 'f', waveHash: 'w',
    runId: '1', runAttempt: '1', expiresAt: '2099-01-01T00:00:00.000Z', reservedUsd: 0,
    lane: 'provider-free' as const, state: 'running' as const });

  it('reports the lease, not the label, when an executing issue also carries one', () => {
    const snapshot = base([{ number: 905, state: 'open', title: 't', body: null,
      labels: [{ name: 'oc-queued' }, { name: 'oc-blocked' }] }]);
    const plan = makePlan(snapshot, [lease(905)], NOW);

    expect(reasonFor(plan, 905)).toBe('an active lease is executing it');
  });

  it('reports the lease, not the hold marker, when both apply', () => {
    const snapshot = base([{ number: 905, state: 'open', title: 't', body: 'OC-AUTO-HOLD: true',
      labels: [{ name: 'oc-queued' }] }]);
    const plan = makePlan(snapshot, [lease(905)], NOW);

    expect(reasonFor(plan, 905)).toBe('an active lease is executing it');
  });

  it('reports the label, not the hold marker, when both apply', () => {
    // `selectLanes` tests BLOCKED_LABELS before the OC-AUTO-HOLD body marker.
    const plan = makePlan(base([{ number: 906, state: 'open', title: 't', body: 'OC-AUTO-HOLD: true',
      labels: [{ name: 'oc-queued' }, { name: 'oc-publication-hold' }] }]));

    expect(reasonFor(plan, 906)).toContain('oc-publication-hold');
    expect(reasonFor(plan, 906)).not.toContain('OC-AUTO-HOLD');
  });

  it('reports the label, not the lineage, when both apply', () => {
    const plan = makePlan(base(
      [{ number: 907, state: 'open', title: 't', body: null,
         labels: [{ name: 'oc-queued' }, { name: 'oc-blocked' }] }],
      [{ number: 908, state: 'closed', title: 'Closes #907.', body: 'Closes #907.', head: { ref: 'f' } }],
    ));

    expect(reasonFor(plan, 907)).toContain('oc-blocked');
    expect(reasonFor(plan, 907)).not.toContain('#908');
  });

  it('releases an oc-repair issue whose single PR was closed unmerged, which was the live starvation', () => {
    // #296 and #308 were `oc-repair` with one CLOSED, unmerged PR, and the live
    // run printed them as pending-and-unreachable every five minutes. One
    // abandoned attempt is not durable work: nothing is in flight, nothing was
    // delivered, and holding it removed the issue from the portfolio for good.
    const plan = makePlan(base(
      [{ number: 296, state: 'open', title: 't', body: null,
         labels: [{ name: 'oc-queued' }, { name: 'oc-repair' }] }],
      [{ number: 303, state: 'closed', title: 'Closes #296.', body: 'Closes #296.', head: { ref: 'f' } }],
    ));

    // No lineage reason holds it any more; what it still lacks is a graph node.
    expect(reasonFor(plan, 296)).toBeUndefined();
    expect(plan.unboundQueued).toContain(296);
  });

  it('still names the lineage branch for an oc-repair issue whose PR is merged', () => {
    const plan = makePlan(base(
      [{ number: 523, state: 'open', title: 't', body: null,
         labels: [{ name: 'oc-queued' }, { name: 'oc-repair' }] }],
      [{ number: 531, state: 'closed', merged: true, title: 'Closes #523.', body: 'Closes #523.', head: { ref: 'f' } }],
    ));

    expect(reasonFor(plan, 523)).toContain('#531 (merged)');
    expect(reasonFor(plan, 523)).toContain('already merged');
  });

  it('admits an oc-repair issue whose single PR is open', () => {
    const plan = makePlan(base(
      [{ number: 297, state: 'open', title: 't', body: null,
         labels: [{ name: 'oc-queued' }, { name: 'oc-repair' }, { name: 'oc-node:gate-journey-research-matrix' }] }],
      [{ number: 304, state: 'open', title: 'Closes #297.', body: 'Closes #297.', head: { ref: 'f' } }],
    ));

    expect(plan.reachedAdmission).toContain(297);
    expect(reasonFor(plan, 297)).toBeUndefined();
  });

  it('does not report a closed issue that still carries a pending label', () => {
    const plan = makePlan(base([{ number: 910, state: 'closed', title: 't', body: null,
      labels: [{ name: 'oc-queued' }] }]));

    expect(plan.pendingNotReachingAdmission).toEqual([]);
  });

  it('reports an oc-prepared issue, not only an oc-queued one', () => {
    const plan = makePlan(base(
      [{ number: 911, state: 'open', title: 't', body: null, labels: [{ name: 'oc-prepared' }] }],
      [{ number: 912, state: 'closed', merged: true, title: 'Closes #911.', body: 'Closes #911.', head: { ref: 'f' } }],
    ));

    expect(reasonFor(plan, 911)).toContain('#912');
  });

  it('lists the issues in ascending order, so two runs read the same', () => {
    const plan = makePlan(base([
      { number: 930, state: 'open', title: 't', body: null, labels: [{ name: 'oc-queued' }, { name: 'oc-blocked' }] },
      { number: 902, state: 'open', title: 't', body: null, labels: [{ name: 'oc-queued' }, { name: 'oc-blocked' }] },
      { number: 915, state: 'open', title: 't', body: null, labels: [{ name: 'oc-queued' }, { name: 'oc-blocked' }] },
    ]));

    expect(plan.pendingNotReachingAdmission.map(e => e.issueNumber)).toEqual([902, 915, 930]);
  });

  it('says nothing about pending issues when the plan was narrowed to one issue', () => {
    // `assertAdmission` re-plans with `onlyIssue`, so that plan is not a wave
    // plan. It used to report every OTHER pending issue with the fallback
    // string -- a confident statement about issues it had deliberately excluded.
    const snapshot = base(
      [
        { number: 905, state: 'open', title: 't', body: null,
          labels: [{ name: 'oc-queued' }, { name: 'oc-node:gate-journey-research-matrix' }] },
        { number: 906, state: 'open', title: 't', body: null, labels: [{ name: 'oc-queued' }] },
      ],
      [{ number: 909, state: 'closed', merged: true, title: 'Closes #906.', body: 'Closes #906.', head: { ref: 'f' } }],
    );

    const narrowed = makePlan(snapshot, [], NOW, undefined, 905);

    expect(narrowed.pendingNotReachingAdmission).toEqual([]);
    // And the wave plan still reports #906, with the rule that really holds it
    // rather than the fallback.
    const wave = makePlan(snapshot, [], NOW);
    expect(reasonFor(wave, 906)).toContain('#909');
    expect(JSON.stringify(wave.pendingNotReachingAdmission)).not.toContain('no rule this report knows about');
  });

  it('lists refused declarations in ascending issue order too', () => {
    // The other sort. Reversing it left the suite green, so two runs of the
    // same wave could print the same facts in different orders.
    const planWith = (over: Record<string, unknown>) => ({
      capacity: 8, issues: [], leaves: [], untrackedLeaves: [], surfacedBlockers: [],
      unboundQueued: [], unreachableQueued: [], unknownNodeDeclarations: [],
      unadmissibleNodeDeclarations: [], starved: true, queuedReachingAdmission: 23,
      reachedAdmission: [], pendingNotReachingAdmission: [],
      inventory: { queued: 23, prepared: 1, validating: 1, blocked: 22, 'owner-gate': 6, 'runtime-backoff': 23, active: 0 },
      ...over,
    }) as unknown as Parameters<typeof bindingReport>[0];

    const report = bindingReport(planWith({
      unknownNodeDeclarations: [
        { issueNumber: 930, nodeId: 'not-real-a' },
        { issueNumber: 902, nodeId: 'not-real-b' },
        { issueNumber: 915, nodeId: 'not-real-c' },
      ],
    }));

    const order = [...report.matchAll(/Issue #(\d+)/g)].map(m => Number(m[1]));
    expect(order).toEqual([902, 915, 930]);
  });

  it('has no reachable path to the fallback reason', () => {
    // `reasonFor` ends with "no rule this report knows about". Changing that
    // string leaves the suite green, and it should: every pending issue that
    // did not reach admission was excluded by one of the rules above it, and an
    // issue excluded by none of them would have been selected and would not be
    // in this list at all. So the fallback is unreachable rather than untested,
    // and this asserts the property instead of claiming coverage of the string.
    const snapshot = base([
      { number: 940, state: 'open', title: 't', body: null, labels: [{ name: 'oc-queued' }] },
      { number: 941, state: 'open', title: 't', body: 'OC-AUTO-HOLD: true', labels: [{ name: 'oc-queued' }] },
      { number: 942, state: 'open', title: 't', body: null, labels: [{ name: 'oc-queued' }, { name: 'oc-blocked' }] },
      { number: 943, state: 'open', title: 't', body: null, labels: [{ name: 'oc-prepared' }] },
    ]);
    const plan = makePlan(snapshot, [], NOW);

    const reasons = plan.pendingNotReachingAdmission.map(e => e.reason);
    expect(reasons).not.toContain('no rule this report knows about -- read `selectLanes`');
    // Every issue is either reported with a real reason or reached the ranker.
    for (const issue of [940, 941, 942, 943]) {
      const reported = plan.pendingNotReachingAdmission.some(e => e.issueNumber === issue);
      expect(reported || plan.reachedAdmission.includes(issue)).toBe(true);
    }
  });

  it('names an admitted issue nowhere, even if a pending entry claims it', () => {
    // The loop added for the shortfall consulted neither `said` nor `admitted`,
    // so an ADMITTED issue could be told it never reached admission while the
    // lane was executing it. `makePlan` keeps the sets disjoint today, which is
    // exactly the reasoning that left the previous guard dead and unnoticed.
    const planWith = (over: Record<string, unknown>) => ({
      capacity: 8, issues: [], leaves: [], untrackedLeaves: [], surfacedBlockers: [],
      unboundQueued: [], unreachableQueued: [], unknownNodeDeclarations: [],
      unadmissibleNodeDeclarations: [], starved: false, queuedReachingAdmission: 23,
      reachedAdmission: [], pendingNotReachingAdmission: [],
      inventory: { queued: 23, prepared: 1, validating: 1, blocked: 22, 'owner-gate': 6, 'runtime-backoff': 23, active: 0 },
      ...over,
    }) as unknown as Parameters<typeof bindingReport>[0];

    const maligned = bindingReport(planWith({
      issues: [901], capacity: 7,
      pendingNotReachingAdmission: [{ issueNumber: 901, reason: 'a lane label' }],
    }));
    expect(maligned).toBe('');

    const twice = bindingReport(planWith({
      starved: true, unboundQueued: [901],
      pendingNotReachingAdmission: [{ issueNumber: 901, reason: 'a lane label' }],
    }));
    expect(twice.match(/901/g)).toHaveLength(1);
  });
});


describe('the numbers the lane prints about itself come from the lane', () => {
  /**
   * Instance nine, and the third time this exact shape has been found here.
   *
   * The STARVED line's count comes from `queuedReachingAdmission`. Replacing
   * that producer with `0` left the whole 2519-test suite green, because the
   * only tests asserting the count hand-build a plan with
   * `queuedReachingAdmission: 23` AND `reachedAdmission: []` -- a combination
   * `buildGraphDispatchPlan` cannot produce, since it derives both from the
   * same set. The number was asserted against a fixture, never against
   * computed output.
   *
   * The PR's own R6 entry recounts this: "every report test injected
   * `pendingNotReachingAdmission` through a fixture, so the production wiring
   * of the R5 fix was untested". Same defect, one field over.
   *
   * So these go through `makePlan` and assert the printed line against the
   * queue that produced it.
   */
  const SHA = 'a'.repeat(40);
  const snapshotOf = (issues: unknown[], prs: unknown[] = []) => ({
    issues, prs, integrationSha: SHA, implementationSha: 'b'.repeat(40), material: { architecture: 'm' },
  }) as unknown as Parameters<typeof makePlan>[0];
  const queued = (number: number, extra: string[] = []) => ({
    number, state: 'open', title: 't', body: null,
    labels: [{ name: 'oc-queued' }, ...extra.map(name => ({ name }))].sort((a, b) => a.name.localeCompare(b.name)),
  });

  it('prints the number of issues that actually reached the ranker', () => {
    // Three reach the ranker; two are held by a lineage and never get there.
    const snapshot = snapshotOf(
      [queued(801), queued(802), queued(803), queued(804), queued(805)],
      [
        { number: 901, state: 'closed', merged: true, title: 'Closes #804.', body: 'Closes #804.', head: { ref: 'a' } },
        { number: 902, state: 'closed', merged: true, title: 'Closes #805.', body: 'Closes #805.', head: { ref: 'b' } },
      ],
    );
    const plan = makePlan(snapshot, [], NOW);

    // Derived, not asserted: whatever reached the ranker is what must print.
    expect(plan.reachedAdmission).toEqual([801, 802, 803]);
    expect(plan.queuedReachingAdmission).toBe(plan.reachedAdmission.length);
    expect(bindingReport(plan)).toContain(`${plan.reachedAdmission.length} issue(s) reached graph admission`);
    expect(bindingReport(plan)).toContain('3 issue(s) reached graph admission');
  });

  it('the count follows the queue when the queue changes', () => {
    // Two runs, different queues, so a constant cannot satisfy both.
    const one = makePlan(snapshotOf([queued(801), queued(802)]), [], NOW);
    const two = makePlan(snapshotOf([queued(801)]), [], NOW);

    expect(bindingReport(one)).toContain('2 issue(s) reached graph admission');
    expect(bindingReport(two)).toContain('1 issue(s) reached graph admission');
  });

  it('counts a wave whose only pending work is oc-prepared as pending work', () => {
    // `census` gates whether the STARVED line prints at all, and dropping
    // `inventory.prepared` from it left the suite green -- so a wave with only
    // prepared work would silently stop reporting starvation.
    const prepared = {
      number: 810, state: 'open', title: 't', body: null,
      labels: [{ name: 'oc-prepared' }, { name: 'oc-blocked' }].sort((a, b) => a.name.localeCompare(b.name)),
    };
    const plan = makePlan(snapshotOf([prepared]), [], NOW);

    expect(plan.inventory.queued).toBe(0);
    expect(plan.inventory.prepared).toBe(1);
    expect(plan.starved).toBe(false);
    expect(bindingReport(plan)).toContain('STARVED');
  });

  it('does not count a closed issue that still carries a pending label', () => {
    // The inventory census's own `state === 'open'`, as distinct from the
    // pending filter's. `inventory` is printed verbatim in every step summary,
    // so a closed issue would inflate a number the lane states about itself.
    const plan = makePlan(snapshotOf([
      queued(820),
      { number: 821, state: 'closed', title: 't', body: null, labels: [{ name: 'oc-queued' }] },
    ]), [], NOW);

    expect(plan.inventory.queued).toBe(1);
    expect(planSummary(plan)).toContain('"queued":1');
  });
});


describe('onlyIssue narrows the queue, and that is all it narrows', () => {
  /**
   * The R4 fix: `assertAdmission` re-plans for one issue, and it must narrow
   * the QUEUE rather than the snapshot -- filtering the snapshot changes
   * `openRefs`, whose repair-PR exclusion is computed from the issue list, so a
   * sibling's repair PR would stop being excluded and a different set of leaves
   * would be admissible.
   *
   * Deleting the narrowing left the suite green. It was disclosed in the PR
   * body as unpinned while the commit message counted zero survivors -- two
   * documents about the same head disagreeing. Pinned now, so both can say the
   * same thing.
   */
  const SHA = 'a'.repeat(40);
  const snapshotOf = (issues: unknown[], prs: unknown[] = []) => ({
    issues, prs, integrationSha: SHA, implementationSha: 'b'.repeat(40), material: { architecture: 'm' },
  }) as unknown as Parameters<typeof makePlan>[0];
  const bound = (number: number, node: string) => ({
    number, state: 'open', title: 't', body: null,
    labels: [{ name: 'oc-queued' }, { name: `oc-node:${node}` }].sort((a, b) => a.name.localeCompare(b.name)),
  });

  it('admits only the named issue, from a queue that could admit several', () => {
    const snapshot = snapshotOf([
      bound(801, 'gate-journey-research-matrix'),
      bound(802, 'cap-conservatory-collection'),
    ]);

    const wave = makePlan(snapshot, [], NOW);
    expect(wave.issues.length).toBeGreaterThan(1);

    const narrowed = makePlan(snapshot, [], NOW, undefined, 802);
    expect(narrowed.issues).toEqual([802]);
  });

  it('leaves the snapshot intact, so the other issues still shape the plan', () => {
    // The property the narrowing exists for: the sibling is still IN the
    // snapshot, so its repair PR is still excluded from `openRefs` and the same
    // leaves stay admissible. Narrowing the snapshot instead would change that.
    const snapshot = snapshotOf(
      [
        bound(801, 'gate-journey-research-matrix'),
        { number: 802, state: 'open', title: 't', body: null,
          labels: [{ name: 'oc-queued' }, { name: 'oc-repair' }].sort((a, b) => a.name.localeCompare(b.name)) },
      ],
      [{ number: 902, state: 'open', title: 'Closes #802.', body: 'Closes #802.', head: { ref: 'oc-auto-802-x' } }],
    );

    const wave = makePlan(snapshot, [], NOW);
    const narrowed = makePlan(snapshot, [], NOW, undefined, 801);

    // The decision about #801 is the same one the wave made.
    expect(narrowed.issues).toEqual([801]);
    expect(wave.issues).toContain(801);
    const inWave = wave.leaves.find(l => l.issueNumber === 801);
    const inNarrowed = narrowed.leaves.find(l => l.issueNumber === 801);
    expect(inNarrowed?.nodeId).toBe(inWave?.nodeId);
    expect(inNarrowed?.fingerprint).toBe(inWave?.fingerprint);
  });
});
