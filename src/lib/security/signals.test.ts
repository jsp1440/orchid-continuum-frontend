import { describe, it, expect } from 'vitest';
import {
  evaluateSignals,
  ruleRepeatedAuthFailures,
  ruleBulkAccess,
  ruleUnexpectedDeploymentBranch,
  ruleReadOnlyServiceWrite,
  DEFAULT_RULE_CONFIG,
  type RuleContext,
} from '@/lib/security/signals';
import { SECURITY_EVENT_SCHEMA_VERSION, type SecurityEvent } from '@/lib/security/envelope';

let seq = 0;
function ev(overrides: Partial<SecurityEvent>): SecurityEvent {
  seq += 1;
  return {
    event_id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
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
    ...overrides,
  };
}

function ctx(events: SecurityEvent[]): RuleContext {
  return { events, config: DEFAULT_RULE_CONFIG };
}

describe('ruleRepeatedAuthFailures', () => {
  it('fires when failures exceed the threshold in the window for one actor', () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      ev({
        actor_ref: 'u_alice',
        occurred_at: new Date(Date.UTC(2026, 7, 27, 10, i, 0)).toISOString(),
      }),
    );
    const signals = ruleRepeatedAuthFailures(ctx(events));
    expect(signals).toHaveLength(1);
    expect(signals[0].signal_id).toBe('auth.repeated_failures');
    expect(signals[0].evidence.length).toBeGreaterThanOrEqual(5);
  });

  it('does NOT fire when failures are spread beyond the window', () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      ev({
        actor_ref: 'u_bob',
        occurred_at: new Date(Date.UTC(2026, 7, 27, 10 + i, 0, 0)).toISOString(),
      }),
    );
    expect(ruleRepeatedAuthFailures(ctx(events))).toHaveLength(0);
  });

  it('does not conflate failures across different actors', () => {
    const events = [
      ...Array.from({ length: 3 }, () => ev({ actor_ref: 'u_a' })),
      ...Array.from({ length: 3 }, () => ev({ actor_ref: 'u_b' })),
    ];
    expect(ruleRepeatedAuthFailures(ctx(events))).toHaveLength(0);
  });

  it('respects a configurable threshold', () => {
    const events = Array.from({ length: 3 }, () => ev({ actor_ref: 'u_c' }));
    const signals = ruleRepeatedAuthFailures({
      events,
      config: { ...DEFAULT_RULE_CONFIG, authFailureThreshold: 3 },
    });
    expect(signals).toHaveLength(1);
  });
});

describe('ruleBulkAccess', () => {
  it('fires on absolute row threshold', () => {
    const e = ev({
      source_category: 'database',
      event_type: 'database.query',
      outcome: 'success',
      metadata: { row_count: 5000 },
    });
    const signals = ruleBulkAccess(ctx([e]));
    expect(signals[0].signal_id).toBe('database.bulk_access');
  });

  it('fires on baseline deviation even below the absolute threshold', () => {
    const e = ev({
      source_category: 'database',
      service: 'reporter',
      metadata: { row_count: 200 },
    });
    const signals = ruleBulkAccess({
      events: [e],
      config: DEFAULT_RULE_CONFIG,
      baseline: () => ({
        mean: 20,
        stddev: 5,
        sampleSize: 100,
        coldStart: false,
        windowLabel: 'trailing 14d',
      }),
    });
    expect(signals).toHaveLength(1);
    expect(signals[0].reason).toContain('σ above');
  });

  it('does not fire on a cold-start baseline below the absolute threshold', () => {
    const e = ev({ source_category: 'database', metadata: { row_count: 200 } });
    const signals = ruleBulkAccess({
      events: [e],
      config: DEFAULT_RULE_CONFIG,
      baseline: () => ({
        mean: 20,
        stddev: 5,
        sampleSize: 3,
        coldStart: true,
        windowLabel: 'trailing 14d',
      }),
    });
    expect(signals).toHaveLength(0);
  });
});

describe('ruleUnexpectedDeploymentBranch', () => {
  it('fires for a non-governed branch deploy', () => {
    const e = ev({
      source_category: 'ci',
      event_type: 'ci.deploy.start',
      outcome: 'success',
      metadata: { branch: 'attacker-patch', governed_branch: false },
    });
    expect(ruleUnexpectedDeploymentBranch(ctx([e]))[0].signal_id).toBe(
      'ci.unexpected_deploy_branch',
    );
  });

  it('does not fire for a governed branch', () => {
    const e = ev({
      source_category: 'ci',
      event_type: 'ci.deploy.start',
      metadata: { branch: 'main', governed_branch: true },
    });
    expect(ruleUnexpectedDeploymentBranch(ctx([e]))).toHaveLength(0);
  });
});

describe('ruleReadOnlyServiceWrite', () => {
  it('fires when a read-only service writes', () => {
    const e = ev({
      source_category: 'database',
      action: 'write',
      metadata: { declared_access: 'read-only' },
    });
    expect(ruleReadOnlyServiceWrite(ctx([e]))[0].signal_id).toBe(
      'database.readonly_write',
    );
  });
});

describe('evaluateSignals — scientific novelty is NOT a security signal', () => {
  it('produces no signals for unusual-but-benign scientific ingestion', () => {
    const events = [
      ev({
        source_category: 'ingestion',
        event_type: 'ingestion.occurrence.recorded',
        outcome: 'success',
        severity: 'info',
        metadata: { taxon: 'Bulbophyllum nocturnum', novelty: 'rare', row_count: 1 },
      }),
    ];
    expect(evaluateSignals(events)).toHaveLength(0);
  });
});
