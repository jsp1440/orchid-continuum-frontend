import { describe, it, expect } from 'vitest';
import {
  validateSecurityEvent,
  isSecurityEvent,
  SECURITY_EVENT_SCHEMA_VERSION,
  type SecurityEventInput,
} from '@/lib/security/envelope';

function baseEvent(overrides: Partial<SecurityEventInput> = {}): SecurityEventInput {
  return {
    event_id: '11111111-1111-4111-8111-111111111111',
    schema_version: SECURITY_EVENT_SCHEMA_VERSION,
    occurred_at: '2026-08-27T10:00:00.000Z',
    source: 'calyx-backend',
    source_category: 'auth',
    environment: 'production',
    service: 'auth-service',
    event_type: 'auth.login.failure',
    actor_type: 'user',
    outcome: 'failure',
    severity: 'low',
    confidence: 0.9,
    provenance: { emitter: 'auth-mw', derivation: 'observed' },
    ...overrides,
  };
}

describe('securityEvent envelope validation', () => {
  it('accepts a well-formed event and applies defaults', () => {
    const result = validateSecurityEvent(baseEvent());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.risk_signals).toEqual([]);
      expect(result.event.redaction.status).toBe('clean');
      expect(result.event.correlation).toEqual({});
      expect(result.event.metadata).toEqual({});
    }
  });

  it('rejects an unknown schema_version', () => {
    const result = validateSecurityEvent(
      baseEvent({ schema_version: 'security-event/999' as never }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects unknown top-level keys (strict mode)', () => {
    const result = validateSecurityEvent({
      ...baseEvent(),
      raw_password: 'should-not-be-here',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a non-uuid event_id', () => {
    const result = validateSecurityEvent(baseEvent({ event_id: 'not-a-uuid' }));
    expect(result.ok).toBe(false);
  });

  it('rejects confidence outside [0,1]', () => {
    expect(validateSecurityEvent(baseEvent({ confidence: 1.4 })).ok).toBe(false);
    expect(validateSecurityEvent(baseEvent({ confidence: -0.1 })).ok).toBe(false);
  });

  it('rejects an actor_ref that looks like an email (PII guard)', () => {
    const result = validateSecurityEvent(
      baseEvent({ actor_ref: 'someone@example.com' }),
    );
    expect(result.ok).toBe(false);
  });

  it('accepts a pseudonymous actor_ref', () => {
    const result = validateSecurityEvent(
      baseEvent({ actor_ref: 'u_9f8c2a1b4d' }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a malformed event_type token', () => {
    const result = validateSecurityEvent(
      baseEvent({ event_type: 'has spaces and !!!' }),
    );
    expect(result.ok).toBe(false);
  });

  it('never echoes offending values in issue strings', () => {
    const result = validateSecurityEvent(
      baseEvent({ actor_ref: 'topsecret@example.com' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      for (const issue of result.issues) {
        expect(issue).not.toContain('topsecret@example.com');
      }
    }
  });

  it('isSecurityEvent guard rejects garbage but accepts valid input', () => {
    expect(isSecurityEvent(null)).toBe(false);
    expect(isSecurityEvent({})).toBe(false);
    expect(isSecurityEvent(baseEvent())).toBe(true);
  });
});
