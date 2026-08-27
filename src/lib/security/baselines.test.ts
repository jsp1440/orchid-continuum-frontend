import { describe, it, expect } from 'vitest';
import { BaselineStore } from '@/lib/security/baselines';

function iso(dayOffset: number): string {
  return new Date(Date.UTC(2026, 7, 27) - dayOffset * 86400000).toISOString();
}

describe('BaselineStore', () => {
  it('reports cold-start until minSamples reached', () => {
    const store = new BaselineStore({ windowMs: 30 * 86400000, minSamples: 30, windowLabel: '30d' });
    for (let i = 0; i < 5; i += 1) {
      store.add({ dimension: 'db.read_rows', key: 'reporter', value: 10, at: iso(i) });
    }
    const stat = store.lookup('db.read_rows', 'reporter');
    expect(stat?.coldStart).toBe(true);
    expect(stat?.sampleSize).toBe(5);
  });

  it('computes mean and stddev once warm', () => {
    const store = new BaselineStore({ windowMs: 60 * 86400000, minSamples: 3, windowLabel: '60d' });
    for (const v of [10, 12, 8, 10, 10]) {
      store.add({ dimension: 'api.rpm', key: 'calyx', value: v, at: iso(0) });
    }
    const stat = store.lookup('api.rpm', 'calyx')!;
    expect(stat.coldStart).toBe(false);
    expect(stat.mean).toBeCloseTo(10, 1);
    expect(stat.stddev).toBeGreaterThan(0);
  });

  it('returns a cold-start stat for an unknown key (no crash)', () => {
    const store = new BaselineStore();
    const stat = store.lookup('unknown', 'nothing');
    expect(stat?.coldStart).toBe(true);
    expect(stat?.sampleSize).toBe(0);
  });

  it('trims samples outside the rolling window', () => {
    const store = new BaselineStore({ windowMs: 3 * 86400000, minSamples: 1, windowLabel: '3d' });
    store.add({ dimension: 'd', key: 'k', value: 1, at: iso(10) }); // old
    store.add({ dimension: 'd', key: 'k', value: 2, at: iso(0) }); // recent → trims old
    const stat = store.lookup('d', 'k')!;
    expect(stat.sampleSize).toBe(1);
    expect(stat.mean).toBe(2);
  });

  it('coverage lists dimensions and cold-start status', () => {
    const store = new BaselineStore({ windowMs: 86400000 * 30, minSamples: 10, windowLabel: '30d' });
    store.add({ dimension: 'd', key: 'k', value: 1, at: iso(0) });
    const cov = store.coverage();
    expect(cov[0]).toMatchObject({ dimension: 'd', key: 'k', coldStart: true });
  });
});
