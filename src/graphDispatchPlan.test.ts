import { describe, expect, it } from 'vitest';
import { buildGraphDispatchPlan } from '../scripts/oc-graph-dispatch-plan';

describe('graph dispatch plan', () => {
  it('never exceeds remaining lane capacity', () => {
    const plan = buildGraphDispatchPlan({
      maxActiveLanes: 8,
      runningCount: 6,
      queuedIssueNumbers: Array.from({ length: 1000 }, (_, i) => i + 1),
      now: '2026-09-13T20:00:00.000Z',
    });
    expect(plan.capacity).toBe(2);
    expect(plan.issues.length).toBeLessThanOrEqual(2);
  });

  it('only emits issues that are currently queued', () => {
    const queued = [301, 523, 661, 662];
    const plan = buildGraphDispatchPlan({
      maxActiveLanes: 8,
      queuedIssueNumbers: queued,
      now: '2026-09-13T20:00:00.000Z',
    });
    expect(plan.issues.every((issue) => queued.includes(issue))).toBe(true);
  });

  it('is deterministic for the same graph state and clock', () => {
    const input = {
      maxActiveLanes: 8,
      runningCount: 0,
      queuedIssueNumbers: [301, 523, 661, 662],
      openWorkRefs: ['#99999'],
      now: '2026-09-13T20:00:00.000Z',
    };
    expect(buildGraphDispatchPlan(input)).toEqual(buildGraphDispatchPlan(input));
  });
});
