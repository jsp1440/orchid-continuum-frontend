import { describe, it, expect } from 'vitest';
import {
  correlateEvents,
  buildIncident,
  buildIncidents,
} from '@/lib/security/incident';
import { SECURITY_EVENT_SCHEMA_VERSION, type SecurityEvent } from '@/lib/security/envelope';
import type { Signal } from '@/lib/security/signals';

let seq = 0;
function ev(overrides: Partial<SecurityEvent>): SecurityEvent {
  seq += 1;
  return {
    event_id: `aaaaaaaa-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    schema_version: SECURITY_EVENT_SCHEMA_VERSION,
    occurred_at: '2026-08-27T10:00:00.000Z',
    source: 'svc',
    source_category: 'agent',
    environment: 'production',
    service: 'calyx',
    event_type: 'agent.tool.call',
    actor_type: 'agent',
    outcome: 'success',
    severity: 'info',
    confidence: 1,
    risk_signals: [],
    provenance: { emitter: 'test', derivation: 'observed' },
    correlation: {},
    redaction: { status: 'clean', redacted_field_count: 0 },
    metadata: {},
    ...overrides,
  };
}

describe('correlateEvents', () => {
  it('groups events sharing a mission id into one cluster', () => {
    const events = [
      ev({ correlation: { mission_id: 'm1' }, event_type: 'ai.prompt_injection.detected' }),
      ev({ correlation: { mission_id: 'm1' }, event_type: 'agent.tool.denied' }),
      ev({ correlation: { mission_id: 'm1' }, event_type: 'agent.secret.denied' }),
      ev({ correlation: { mission_id: 'm2' }, event_type: 'agent.tool.call' }),
    ];
    const clusters = correlateEvents(events);
    expect(clusters).toHaveLength(2);
    const big = clusters.find((c) => c.length === 3);
    expect(big).toBeDefined();
  });

  it('does not merge same-actor events outside the time window', () => {
    const events = [
      ev({ actor_ref: 'u_x', occurred_at: '2026-08-27T10:00:00.000Z' }),
      ev({ actor_ref: 'u_x', occurred_at: '2026-08-27T22:00:00.000Z' }),
    ];
    expect(correlateEvents(events, { timeProximityMs: 60_000 })).toHaveLength(2);
  });

  it('merges same-actor events within the time window', () => {
    const events = [
      ev({ actor_ref: 'u_y', occurred_at: '2026-08-27T10:00:00.000Z' }),
      ev({ actor_ref: 'u_y', occurred_at: '2026-08-27T10:05:00.000Z' }),
    ];
    expect(correlateEvents(events, { timeProximityMs: 15 * 60_000 })).toHaveLength(1);
  });
});

describe('buildIncident — the directive worked-example correlation', () => {
  it('forms one incident narrative from an injection→tool→secret→denied chain', () => {
    const events = [
      ev({
        source_category: 'ingestion',
        event_type: 'ai.prompt_injection.detected',
        provenance: { emitter: 'guard', derivation: 'derived' },
        correlation: { mission_id: 'm-lit-42', trace_id: 't1' },
        occurred_at: '2026-08-27T10:00:00.000Z',
      }),
      ev({
        event_type: 'agent.tool.denied',
        outcome: 'denied',
        correlation: { mission_id: 'm-lit-42', trace_id: 't1' },
        occurred_at: '2026-08-27T10:00:05.000Z',
      }),
      ev({
        event_type: 'agent.secret.access.denied',
        outcome: 'denied',
        correlation: { mission_id: 'm-lit-42', trace_id: 't1' },
        occurred_at: '2026-08-27T10:00:07.000Z',
      }),
      ev({
        source_category: 'api',
        event_type: 'api.egress.denied',
        outcome: 'denied',
        correlation: { mission_id: 'm-lit-42', trace_id: 't1' },
        occurred_at: '2026-08-27T10:00:09.000Z',
      }),
    ];
    const signals: Signal[] = [
      {
        signal_id: 'ai.prompt_injection',
        reason: 'retrieved content attempts to override system policy',
        evidence: [events[0].event_id],
        confidence: 0.8,
        severity: 'high',
        recommended_response: 'quarantine content',
        false_positive_notes: 'quoted policy discussion',
      },
    ];
    const clusters = correlateEvents(events);
    expect(clusters).toHaveLength(1);
    const incident = buildIncident(clusters[0], signals, {
      idFactory: () => 'inc_fixed',
      now: () => new Date('2026-08-27T10:01:00.000Z'),
    });
    expect(incident.incident_id).toBe('inc_fixed');
    expect(incident.timeline).toHaveLength(4);
    // Timeline is ordered.
    expect(incident.timeline[0].event_type).toBe('ai.prompt_injection.detected');
    expect(incident.timeline[3].event_type).toBe('api.egress.denied');
    // Facts vs inference are separated.
    expect(incident.narrative.deterministic_results.length).toBeGreaterThan(0);
    expect(incident.narrative.summary).toContain('does not imply causation');
    // Correlation rationale cites shared identifiers, not just time.
    expect(incident.correlation_rationale).toContain('mission');
    // Risk reflects the policy violation.
    expect(incident.risk.deterministicPolicyViolation).toBe(true);
  });
});

describe('buildIncident — simulated flag', () => {
  it('marks incidents with any test-environment event as simulated', () => {
    const inc = buildIncident([ev({ environment: 'test' })], [], {
      idFactory: () => 'x',
    });
    expect(inc.simulated).toBe(true);
  });
});

describe('buildIncidents — signal routing', () => {
  it('routes each signal to the cluster holding its evidence', () => {
    const a = ev({ correlation: { mission_id: 'ma' } });
    const b = ev({ correlation: { mission_id: 'mb' } });
    const signals: Signal[] = [
      {
        signal_id: 's_a',
        reason: 'r',
        evidence: [a.event_id],
        confidence: 0.5,
        severity: 'medium',
        recommended_response: '',
        false_positive_notes: '',
      },
    ];
    const incidents = buildIncidents([a, b], signals, { idFactory: () => 'i' });
    const withSignal = incidents.filter((i) => i.contributing_signals.length > 0);
    expect(withSignal).toHaveLength(1);
    expect(withSignal[0].contributing_event_ids).toContain(a.event_id);
  });
});
