import { describe, it, expect } from 'vitest';
import { assessRisk, shouldGateAction } from '@/lib/security/risk';
import type { Signal } from '@/lib/security/signals';

function sig(overrides: Partial<Signal>): Signal {
  return {
    signal_id: 'x',
    reason: 'r',
    evidence: [],
    confidence: 0.5,
    severity: 'low',
    recommended_response: '',
    false_positive_notes: '',
    ...overrides,
  };
}

describe('assessRisk', () => {
  it('scores zero with no signals', () => {
    const a = assessRisk([]);
    expect(a.score).toBe(0);
    expect(a.band).toBe('minimal');
  });

  it('exposes every contribution', () => {
    const a = assessRisk([sig({ signal_id: 'a', severity: 'medium', confidence: 0.8 })]);
    expect(a.contributions).toHaveLength(1);
    expect(a.contributions[0].weighted).toBeCloseTo(3 * 0.8, 5);
  });

  it('keeps the score bounded to [0,100] even with many signals', () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      sig({ signal_id: `s${i}`, severity: 'high', confidence: 1 }),
    );
    const a = assessRisk(many);
    expect(a.score).toBeLessThanOrEqual(100);
    expect(a.score).toBeGreaterThan(80);
  });

  it('does not let many low-confidence signals prove compromise', () => {
    const weak = Array.from({ length: 10 }, (_, i) =>
      sig({ signal_id: `w${i}`, severity: 'low', confidence: 0.1 }),
    );
    const a = assessRisk(weak);
    // 10 * (1 * 0.1) = 1 weighted → tiny score.
    expect(a.score).toBeLessThan(10);
    expect(a.band).toBe('minimal');
    expect(a.deterministicPolicyViolation).toBe(false);
  });

  it('flags a deterministic policy violation independently of the score', () => {
    const a = assessRisk([
      sig({ signal_id: 'agent.unapproved_tool', severity: 'low', confidence: 0.2 }),
    ]);
    expect(a.deterministicPolicyViolation).toBe(true);
    // Even a low score must gate the action.
    expect(shouldGateAction(a)).toBe(true);
  });

  it('gates on a high anomaly score even without a policy violation', () => {
    const a = assessRisk([
      sig({ signal_id: 'z', severity: 'critical', confidence: 1 }),
      sig({ signal_id: 'y', severity: 'critical', confidence: 1 }),
    ]);
    expect(a.deterministicPolicyViolation).toBe(false);
    expect(a.score).toBeGreaterThanOrEqual(55);
    expect(shouldGateAction(a)).toBe(true);
  });

  it('rationale names the top contributors', () => {
    const a = assessRisk([
      sig({ signal_id: 'top', severity: 'critical', confidence: 1 }),
      sig({ signal_id: 'minor', severity: 'low', confidence: 0.2 }),
    ]);
    expect(a.rationale).toContain('top');
  });
});
