import { describe, it, expect } from 'vitest';
import { computeMetrics } from '@/lib/security/metrics';
import { buildIncident } from '@/lib/security/incident';
import { applyDisposition } from '@/lib/security/disposition';
import { SECURITY_EVENT_SCHEMA_VERSION, type SecurityEvent } from '@/lib/security/envelope';
import type { Signal } from '@/lib/security/signals';

let seq = 0;
function ev(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  seq += 1;
  return {
    event_id: `cccccccc-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    schema_version: SECURITY_EVENT_SCHEMA_VERSION,
    occurred_at: '2026-08-27T10:00:00.000Z',
    source: 'svc',
    source_category: 'auth',
    environment: 'production',
    service: 'auth',
    event_type: 'auth.login.failure',
    actor_type: 'user',
    outcome: 'failure',
    severity: 'low',
    confidence: 1,
    risk_signals: [],
    provenance: { emitter: 'test', derivation: 'observed' },
    correlation: {},
    redaction: { status: 'clean', redacted_field_count: 0 },
    metadata: {},
    resource_type: 'account',
    ...overrides,
  };
}

function sig(id: string, severity: Signal['severity'] = 'medium'): Signal {
  return {
    signal_id: id,
    reason: 'r',
    evidence: [],
    confidence: 1,
    severity,
    recommended_response: '',
    false_positive_notes: '',
  };
}

describe('computeMetrics', () => {
  it('aggregates status, severity band, signals, and assets', () => {
    const a = buildIncident([ev()], [sig('auth.repeated_failures', 'high')], { idFactory: () => 'a' });
    const b = buildIncident([ev()], [sig('auth.repeated_failures', 'high')], { idFactory: () => 'b' });
    const m = computeMetrics({ incidents: [a, b], eventsRejected: 4, preventedOrPausedActions: 2 });
    expect(m.signals_by_rule['auth.repeated_failures']).toBe(2);
    expect(m.repeat_affected_assets[0]).toMatchObject({ asset: 'auth:account', count: 2 });
    expect(m.events_rejected).toBe(4);
    expect(m.prevented_or_paused_actions).toBe(2);
  });

  it('computes confirmed-vs-false-positive rate and mean review time', () => {
    const a0 = buildIncident([ev()], [sig('r')], {
      idFactory: () => 'a',
      now: () => new Date('2026-08-27T10:00:00.000Z'),
    });
    const b0 = buildIncident([ev()], [sig('r')], {
      idFactory: () => 'b',
      now: () => new Date('2026-08-27T10:00:00.000Z'),
    });
    const a = applyDisposition(a0, {
      incident_id: 'a',
      disposition: 'confirmed_incident',
      reviewer: 'rev',
      at: '2026-08-27T10:10:00.000Z',
    }).incident!;
    const b = applyDisposition(b0, {
      incident_id: 'b',
      disposition: 'false_positive',
      reviewer: 'rev',
      false_positive_reason: 'benign',
      at: '2026-08-27T10:30:00.000Z',
    }).incident!;
    const m = computeMetrics({ incidents: [a, b] });
    expect(m.confirmed_vs_false_positive).toMatchObject({ confirmed: 1, false_positive: 1 });
    expect(m.confirmed_vs_false_positive.rate).toBeCloseTo(0.5, 5);
    // Mean of 10 min and 30 min = 20 min.
    expect(m.mean_time_to_review_ms).toBe(20 * 60 * 1000);
  });

  it('counts simulated incidents separately', () => {
    const sim = buildIncident([ev({ environment: 'test' })], [], { idFactory: () => 's' });
    const m = computeMetrics({ incidents: [sim] });
    expect(m.simulated_incidents).toBe(1);
  });
});
