import { describe, it, expect } from 'vitest';
import { ingestSecurityEvent, ingestBatch } from '@/lib/security/ingest';
import { SECURITY_EVENT_SCHEMA_VERSION } from '@/lib/security/envelope';

const fixedNow = () => new Date('2026-08-27T12:00:00.000Z');

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    event_id: '22222222-2222-4222-8222-222222222222',
    schema_version: SECURITY_EVENT_SCHEMA_VERSION,
    occurred_at: '2026-08-27T11:59:00.000Z',
    source: 'calyx-backend',
    source_category: 'agent',
    environment: 'production',
    service: 'calyx',
    event_type: 'agent.tool.call',
    actor_type: 'agent',
    outcome: 'success',
    severity: 'info',
    confidence: 1,
    provenance: { emitter: 'agent-runtime' },
    ...overrides,
  };
}

describe('ingestSecurityEvent', () => {
  it('accepts a clean event and stamps received_at', () => {
    const result = ingestSecurityEvent(candidate(), { now: fixedNow });
    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      expect(result.event.received_at).toBe('2026-08-27T12:00:00.000Z');
      expect(result.event.redaction.status).toBe('clean');
    }
  });

  it('sanitizes secret metadata before storage and marks redacted', () => {
    const result = ingestSecurityEvent(
      candidate({
        metadata: {
          api_key: 'ghp_SECRETSECRETSECRETSECRETSECRET1234',
          note: 'agent used tool',
        },
      }),
      { now: fixedNow },
    );
    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      const serialized = JSON.stringify(result.event);
      expect(serialized).not.toContain('ghp_');
      expect(result.event.redaction.status).toBe('redacted');
      expect(result.event.redaction.redacted_field_count).toBeGreaterThan(0);
    }
  });

  it('quarantines a non-object', () => {
    expect(ingestSecurityEvent('nope').status).toBe('quarantined');
    expect(ingestSecurityEvent([]).status).toBe('quarantined');
    expect(ingestSecurityEvent(null).status).toBe('quarantined');
  });

  it('quarantines an unsupported schema version with a safe reason', () => {
    const result = ingestSecurityEvent(
      candidate({ schema_version: 'security-event/0' }),
    );
    expect(result.status).toBe('quarantined');
    if (result.status === 'quarantined') {
      expect(result.reason).toContain('schema_version');
    }
  });

  it('quarantines a schema-invalid event', () => {
    const result = ingestSecurityEvent(candidate({ confidence: 5 }));
    expect(result.status).toBe('quarantined');
  });

  it('quarantines when a secret survives into an allowlisted-looking field', () => {
    // resource_id is a free string field; a JWT there is caught by the final
    // belt-and-braces scan even though the key is not "secret-looking".
    const result = ingestSecurityEvent(
      candidate({
        resource_id:
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abcDEFghiJKLmnoPQRstuVWXyz012345',
      }),
    );
    expect(result.status).toBe('quarantined');
    if (result.status === 'quarantined') {
      expect(result.reason).toContain('secret-like');
    }
  });

  it('never leaks the payload in a quarantine result', () => {
    const result = ingestSecurityEvent(
      candidate({ confidence: 5, metadata: { password: 'hunter2' } }),
    );
    expect(JSON.stringify(result)).not.toContain('hunter2');
  });
});

describe('ingestBatch', () => {
  it('is idempotent on event_id within a batch', () => {
    const one = candidate();
    const dup = candidate();
    const other = candidate({ event_id: '33333333-3333-4333-8333-333333333333' });
    const { accepted, quarantined } = ingestBatch([one, dup, other], {
      now: fixedNow,
    });
    expect(accepted).toHaveLength(2);
    expect(quarantined).toHaveLength(0);
  });

  it('separates accepted from quarantined', () => {
    const { accepted, quarantined } = ingestBatch(
      [candidate(), 'garbage', candidate({ confidence: 9 })],
      { now: fixedNow },
    );
    expect(accepted).toHaveLength(1);
    expect(quarantined).toHaveLength(2);
  });
});
