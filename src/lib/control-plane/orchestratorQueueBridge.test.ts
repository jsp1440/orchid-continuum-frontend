import { describe, expect, it } from 'vitest';
import { planQueueBridge, sourceKey, type QueueBridgeCandidate } from './orchestratorQueueBridge';

const candidate = (id: string, overrides: Partial<QueueBridgeCandidate> = {}): QueueBridgeCandidate => ({
  sourceRepo: 'jsp1440/orchid-calyx-backend',
  sourceKind: 'self-audit',
  sourceId: id,
  title: `Repair ${id}`,
  body: `Bounded unfinished work ${id}`,
  priority: 'oc-p1',
  unfinished: true,
  ...overrides,
});

describe('Orchestrator Queue Bridge', () => {
  it('is idempotent across unchanged repeated cycles', () => {
    const source = candidate('audit-1');
    const first = planQueueBridge([source], [], 1);
    expect(first.create).toHaveLength(1);

    const existing = [{
      sourceKey: sourceKey(source),
      title: first.create[0].title,
      state: 'open' as const,
      kind: 'issue' as const,
    }];
    const second = planQueueBridge([source], existing, 1);
    expect(second.create).toHaveLength(0);
    expect(second.retire).toHaveLength(0);
    expect(second.suppressed).toEqual([{ sourceKey: sourceKey(source), reason: 'existing-open-lineage' }]);
  });

  it('refills deterministically when prepared capacity is depleted', () => {
    const a = candidate('a');
    const b = candidate('b');
    const c = candidate('c');
    const first = planQueueBridge([c, b, a], [], 2);
    expect(first.create.map((item) => item.sourceKey)).toEqual([sourceKey(a), sourceKey(b)]);

    const existing = [{ sourceKey: sourceKey(a), title: a.title, state: 'open' as const, kind: 'issue' as const }];
    const refill = planQueueBridge([c, b, a], existing, 2);
    expect(refill.create.map((item) => item.sourceKey)).toEqual([sourceKey(b)]);
  });

  it('refills highest-priority safe work first with stable source-key tie breaking', () => {
    const p4 = candidate('a-low', { priority: 'oc-p4' });
    const p0z = candidate('z-high', { priority: 'oc-p0' });
    const p0b = candidate('b-high', { priority: 'oc-p0' });
    const p1 = candidate('c-mid', { priority: 'oc-p1' });

    const plan = planQueueBridge([p4, p0z, p1, p0b], [], 3);

    expect(plan.create.map((item) => item.sourceKey)).toEqual([
      sourceKey(p0b),
      sourceKey(p0z),
      sourceKey(p1),
    ]);
  });

  it('retires a completed source before calculating refill depth', () => {
    const completed = candidate('done', { unfinished: false });
    const next = candidate('next');
    const existing = [{
      sourceKey: sourceKey(completed),
      title: completed.title,
      state: 'open' as const,
      kind: 'issue' as const,
    }];

    const plan = planQueueBridge([completed, next], existing, 1);

    expect(plan.retire).toEqual([{ sourceKey: sourceKey(completed), reason: 'source-completed' }]);
    expect(plan.preparedOpenCount).toBe(0);
    expect(plan.create.map((item) => item.sourceKey)).toEqual([sourceKey(next)]);
  });

  it('allows deterministic refill when a retiring lineage has the same normalized title', () => {
    const completed = candidate('done', { unfinished: false, title: 'Shared repair' });
    const next = candidate('next', { title: '  Shared   repair  ' });
    const existing = [{
      sourceKey: sourceKey(completed),
      title: completed.title,
      state: 'open' as const,
      kind: 'issue' as const,
    }];

    const plan = planQueueBridge([completed, next], existing, 1);

    expect(plan.retire).toEqual([{ sourceKey: sourceKey(completed), reason: 'source-completed' }]);
    expect(plan.create.map((item) => item.sourceKey)).toEqual([sourceKey(next)]);
  });

  it('does not repeatedly retire an already closed lineage', () => {
    const completed = candidate('done', { unfinished: false });
    const existing = [{
      sourceKey: sourceKey(completed),
      title: completed.title,
      state: 'closed' as const,
      kind: 'issue' as const,
    }];

    const plan = planQueueBridge([completed], existing, 1);
    expect(plan.retire).toHaveLength(0);
    expect(plan.create).toHaveLength(0);
  });

  it('reconciles conflicting duplicate source states before planning actions', () => {
    const staleCompleted = candidate('conflict', { unfinished: false, title: 'Old title' });
    const currentUnfinished = candidate('conflict', { unfinished: true, title: 'Current title' });
    const existing = [{
      sourceKey: sourceKey(staleCompleted),
      title: staleCompleted.title,
      state: 'open' as const,
      kind: 'issue' as const,
    }];

    const plan = planQueueBridge([staleCompleted, currentUnfinished], existing, 1);

    expect(plan.retire).toHaveLength(0);
    expect(plan.create).toHaveLength(0);
    expect(plan.suppressed).toEqual([{ sourceKey: sourceKey(currentUnfinished), reason: 'existing-open-lineage' }]);
  });

  it('deduplicates duplicate source records and matching open PR titles', () => {
    const a = candidate('same');
    const plan = planQueueBridge(
      [a, a, candidate('other', { title: a.title })],
      [{ title: a.title, state: 'open', kind: 'pr' }],
      4,
    );
    expect(plan.create).toHaveLength(0);
    expect(plan.suppressed.every((item) => item.reason === 'existing-open-lineage')).toBe(true);
  });

  it('reuses a verified active integration delivery instead of refilling a duplicate mirror', () => {
    const source = candidate('1252', { title: 'Conservation status service' });
    const activeDelivery = {
      title: 'feat(conservation): implement status service',
      state: 'open' as const,
      kind: 'pr' as const,
      referencedSourceKeys: [sourceKey(source)],
      baseBranch: 'oc-autonomous-integration',
      deliveryEvidence: 'explicit-source-reference' as const,
    };

    const first = planQueueBridge([source], [activeDelivery], 1);
    const repeated = planQueueBridge([source], [activeDelivery], 1);

    expect(first.create).toHaveLength(0);
    expect(first.preparedOpenCount).toBe(1);
    expect(first.suppressed).toEqual([
      { sourceKey: sourceKey(source), reason: 'existing-open-lineage' },
    ]);
    expect(repeated).toEqual(first);
  });

  it('fails closed on ambiguous or unauthorized PR references', () => {
    const source = candidate('1252', { title: 'Conservation status service' });
    const reference = {
      title: 'Unrelated delivery title',
      state: 'open' as const,
      kind: 'pr' as const,
      referencedSourceKeys: [sourceKey(source)],
    };

    const missingEvidence = planQueueBridge([source], [{
      ...reference,
      baseBranch: 'oc-autonomous-integration',
    }], 1);
    const wrongBase = planQueueBridge([source], [{
      ...reference,
      baseBranch: 'main',
      deliveryEvidence: 'explicit-source-reference' as const,
    }], 1);

    expect(missingEvidence.create.map((item) => item.sourceKey)).toEqual([sourceKey(source)]);
    expect(wrongBase.create.map((item) => item.sourceKey)).toEqual([sourceKey(source)]);
  });

  it('classifies protected work fail-closed and never fills executable prepared depth with it', () => {
    const protectedCandidate = candidate('publish', {
      sourceKind: 'brain-knowledge-gap',
      protectedClasses: ['scientific-publication', 'sensitive-locality-exposure'],
    });
    const plan = planQueueBridge([protectedCandidate], [], 3);
    expect(plan.create).toHaveLength(0);
    expect(plan.protected).toHaveLength(1);
    expect(plan.protected[0].labels).toContain('oc-owner-gate');
    expect(plan.protected[0].blockedReasons).toEqual(['scientific-publication', 'sensitive-locality-exposure']);
  });

  it('suppresses a syntactically open source when integration already contains its implementation', () => {
    const source = candidate('stale-open', { integratedCompletion: true });
    const plan = planQueueBridge([source], [], 1);

    expect(plan.create).toHaveLength(0);
    expect(plan.eligibleCount).toBe(0);
  });

  it('retires a stale prepared mirror once when integration completion is discovered', () => {
    const source = candidate('stale-mirror', { integratedCompletion: true });
    const existing = [{
      sourceKey: sourceKey(source),
      title: source.title,
      state: 'open' as const,
      kind: 'issue' as const,
    }];

    const first = planQueueBridge([source], existing, 1);
    expect(first.retire).toEqual([{ sourceKey: sourceKey(source), reason: 'source-completed' }]);
    expect(first.create).toHaveLength(0);

    const closed = [{ ...existing[0], state: 'closed' as const }];
    const repeated = planQueueBridge([source], closed, 1);
    expect(repeated.retire).toHaveLength(0);
    expect(repeated.create).toHaveLength(0);
  });

  it('lets explicit requeue override prior integration completion', () => {
    const source = candidate('follow-on', {
      integratedCompletion: true,
      explicitRequeue: true,
    });
    const plan = planQueueBridge([source], [], 1);

    expect(plan.create.map((item) => item.sourceKey)).toEqual([sourceKey(source)]);
  });

  it('reconciles stale open and integration-complete observations toward completion unless explicitly requeued', () => {
    const staleOpen = candidate('merged-source', { unfinished: true });
    const integrationComplete = candidate('merged-source', { unfinished: true, integratedCompletion: true });
    const plan = planQueueBridge([staleOpen, integrationComplete], [], 1);

    expect(plan.create).toHaveLength(0);

    const requeued = candidate('merged-source', {
      unfinished: true,
      integratedCompletion: true,
      explicitRequeue: true,
    });
    const requeuePlan = planQueueBridge([integrationComplete, requeued], [], 1);
    expect(requeuePlan.create.map((item) => item.sourceKey)).toEqual([sourceKey(requeued)]);
  });
});
