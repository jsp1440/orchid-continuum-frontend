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

  it('deduplicates duplicate source records and matching open PR titles', () => {
    const a = candidate('same');
    const plan = planQueueBridge(
      [a, a, candidate('other', { title: a.title })],
      [{ title: a.title, state: 'open', kind: 'pr' }],
      4,
    );
    expect(plan.create).toHaveLength(0);
    expect(plan.suppressed.every((item) => ['existing-open-lineage', 'duplicate-source-candidate'].includes(item.reason))).toBe(true);
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
});
