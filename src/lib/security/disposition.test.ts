import { describe, it, expect } from 'vitest';
import {
  applyDisposition,
  computeRuleHealth,
  proposeRuleChanges,
} from '@/lib/security/disposition';
import { buildIncident } from '@/lib/security/incident';
import { SECURITY_EVENT_SCHEMA_VERSION, type SecurityEvent } from '@/lib/security/envelope';
import type { Signal } from '@/lib/security/signals';

let seq = 0;
function ev(): SecurityEvent {
  seq += 1;
  return {
    event_id: `bbbbbbbb-0000-4000-8000-${String(seq).padStart(12, '0')}`,
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
  };
}

function sig(signal_id: string): Signal {
  return {
    signal_id,
    reason: 'r',
    evidence: [],
    confidence: 0.5,
    severity: 'medium',
    recommended_response: '',
    false_positive_notes: '',
  };
}

function incidentWith(signal_id: string, id: string) {
  return buildIncident([ev()], [sig(signal_id)], { idFactory: () => id });
}

describe('applyDisposition', () => {
  it('requires a human reviewer', () => {
    const inc = incidentWith('r1', 'i1');
    const res = applyDisposition(inc, {
      incident_id: inc.incident_id,
      disposition: 'false_positive',
      reviewer: '',
    });
    expect(res.ok).toBe(false);
  });

  it('requires a reason for false_positive', () => {
    const inc = incidentWith('r1', 'i1');
    const res = applyDisposition(inc, {
      incident_id: inc.incident_id,
      disposition: 'false_positive',
      reviewer: 'alice',
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('reason');
  });

  it('records a false positive and closes the incident', () => {
    const inc = incidentWith('r1', 'i1');
    const res = applyDisposition(inc, {
      incident_id: inc.incident_id,
      disposition: 'false_positive',
      reviewer: 'alice',
      false_positive_reason: 'scheduled export job',
      at: '2026-08-27T11:00:00.000Z',
    });
    expect(res.ok).toBe(true);
    expect(res.incident?.status).toBe('closed');
    expect(res.incident?.disposition).toBe('false_positive');
    expect(res.incident?.narrative.human_conclusions[0]).toContain('alice');
  });

  it('does not mutate the original incident', () => {
    const inc = incidentWith('r1', 'i1');
    applyDisposition(inc, {
      incident_id: inc.incident_id,
      disposition: 'confirmed_incident',
      reviewer: 'bob',
    });
    expect(inc.disposition).toBeUndefined();
  });
});

describe('computeRuleHealth + proposeRuleChanges', () => {
  it('computes precision from verified dispositions', () => {
    const incidents = [
      confirm(incidentWith('noisy', 'a')),
      fp(incidentWith('noisy', 'b')),
      fp(incidentWith('noisy', 'c')),
    ];
    const health = computeRuleHealth(incidents).find((h) => h.signal_id === 'noisy')!;
    expect(health.fired).toBe(3);
    expect(health.precision).toBeCloseTo(1 / 3, 3);
  });

  it('proposes reviewing a noisy rule but never auto-applies', () => {
    const incidents = [
      ...Array.from({ length: 5 }, (_, i) => fp(incidentWith('spammy', `fp${i}`))),
      confirm(incidentWith('spammy', 'ok')),
    ];
    const proposals = proposeRuleChanges(incidents, { minVerdicts: 5, noisyPrecision: 0.3 });
    const noisy = proposals.find((p) => p.kind === 'review_noisy_rule');
    expect(noisy).toBeDefined();
    expect(noisy?.auto_apply).toBe(false);
    expect(noisy?.evidence_incident_ids.length).toBeGreaterThan(0);
  });

  it('does not flag a rule with too few verdicts', () => {
    const incidents = [fp(incidentWith('young', 'y1'))];
    const proposals = proposeRuleChanges(incidents, { minVerdicts: 5 });
    expect(proposals.find((p) => p.kind === 'review_noisy_rule')).toBeUndefined();
  });
});

function confirm(inc: ReturnType<typeof incidentWith>) {
  return applyDisposition(inc, {
    incident_id: inc.incident_id,
    disposition: 'confirmed_incident',
    reviewer: 'rev',
  }).incident!;
}
function fp(inc: ReturnType<typeof incidentWith>) {
  return applyDisposition(inc, {
    incident_id: inc.incident_id,
    disposition: 'false_positive',
    reviewer: 'rev',
    false_positive_reason: 'benign',
  }).incident!;
}
