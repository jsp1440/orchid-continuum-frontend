import { describe, it, expect } from 'vitest';
import {
  sanitizeDeep,
  containsSecretMaterial,
  REDACTION_MARKER,
  TRUNCATION_MARKER,
} from '@/lib/security/sanitize';

// Canary strings that resemble real credentials. The core guarantee of the
// security control plane is that NONE of these ever survive into a stored
// event. Each test asserts both that the marker replaced the value AND that
// the serialized output contains no fragment of the canary.
const CANARIES = {
  githubPat: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  openaiKey: 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd',
  googleKey: 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7',
  slackToken: 'xoxb-1234567890-ABCDEFGHIJKLMNOPQRST',
  awsKey: 'AKIAIOSFODNN7EXAMPLE',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEFghiJKLmnoPQRstuVWXyz012345',
  pgUri: 'postgresql://admin:s3cr3tP4ss@db.internal:5432/orchid',
  pem: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----',
  bearer: 'Bearer sk-verysecrettokenvalue1234567890',
} as const;

function serialize(v: unknown): string {
  return JSON.stringify(v);
}

describe('sanitizeDeep — secret keys', () => {
  it('redacts values under secret-looking keys regardless of content', () => {
    const { value, stats } = sanitizeDeep({
      password: 'hunter2',
      api_key: 'plainlookingbutkey',
      Authorization: 'anything',
      db_connection_string: 'x',
      normal_field: 'keep-me',
    });
    const v = value as Record<string, string>;
    expect(v.password).toBe(REDACTION_MARKER);
    expect(v.api_key).toBe(REDACTION_MARKER);
    expect(v.Authorization).toBe(REDACTION_MARKER);
    expect(v.db_connection_string).toBe(REDACTION_MARKER);
    expect(v.normal_field).toBe('keep-me');
    expect(stats.redacted).toBe(4);
  });

  it('redacts sensitive-locality fields', () => {
    const { value } = sanitizeDeep({
      latitude: 12.3456,
      longitude: 98.7654,
      geohash: 'u4pruydqqvj',
      country: 'Ecuador',
    });
    const v = value as Record<string, unknown>;
    expect(v.latitude).toBe(REDACTION_MARKER);
    expect(v.longitude).toBe(REDACTION_MARKER);
    expect(v.geohash).toBe(REDACTION_MARKER);
    expect(v.country).toBe('Ecuador'); // coarse admin unit is not redacted
  });
});

describe('sanitizeDeep — secret values by pattern', () => {
  for (const [name, canary] of Object.entries(CANARIES)) {
    it(`redacts a ${name} value stored under an innocent key`, () => {
      const { value } = sanitizeDeep({ note: canary, deeply: { nested: [canary] } });
      const out = serialize(value);
      // The canary must not appear anywhere in the output.
      const fragment = canary.slice(0, 12);
      expect(out).not.toContain(fragment);
      expect(out).toContain(REDACTION_MARKER);
    });
  }
});

describe('sanitizeDeep — recursion, arrays, depth, size', () => {
  it('walks nested objects and arrays', () => {
    const { value } = sanitizeDeep({
      a: { b: { c: { token: CANARIES.githubPat } } },
      list: [{ secret: 'x' }, { ok: 'y' }],
    });
    const out = serialize(value);
    expect(out).not.toContain('ghp_');
    const v = value as { list: Array<Record<string, string>> };
    expect(v.list[0].secret).toBe(REDACTION_MARKER);
    expect(v.list[1].ok).toBe('y');
  });

  it('truncates oversized strings so bodies cannot be captured wholesale', () => {
    const big = 'lorem ipsum '.repeat(500); // prose with whitespace, not a token
    const { value } = sanitizeDeep({ body: big });
    const v = value as Record<string, string>;
    expect(v.body.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(v.body.length).toBeLessThan(big.length);
  });

  it('caps very long arrays', () => {
    const arr = Array.from({ length: 500 }, (_, i) => i);
    const { value } = sanitizeDeep({ arr });
    const v = value as Record<string, number[]>;
    expect(v.arr.length).toBeLessThanOrEqual(50);
  });

  it('drops branches beyond max depth', () => {
    // Build a chain deeper than MAX_DEPTH (6).
    let deep: Record<string, unknown> = { leaf: 'value' };
    for (let i = 0; i < 12; i += 1) deep = { child: deep };
    const { value, stats } = sanitizeDeep(deep);
    expect(stats.dropped).toBeGreaterThan(0);
    // Must not throw and must remain serializable.
    expect(() => serialize(value)).not.toThrow();
  });

  it('drops unserializable leaf types', () => {
    const { value } = sanitizeDeep({ fn: () => 1, sym: Symbol('x') as unknown });
    const v = value as unknown as Record<string, string>;
    expect(v.fn).toBe('[DROPPED]');
  });

  it('never mutates the input', () => {
    const input = { password: 'x', nested: { list: [1, 2, 3] } };
    const snapshot = serialize(input);
    sanitizeDeep(input);
    expect(serialize(input)).toBe(snapshot);
  });
});

describe('containsSecretMaterial', () => {
  it('detects known secret patterns in a serialized blob', () => {
    for (const canary of Object.values(CANARIES)) {
      expect(containsSecretMaterial(canary)).toBe(true);
    }
  });

  it('does not flag ordinary text', () => {
    expect(containsSecretMaterial('Bulbophyllum was observed in Ecuador in 2019')).toBe(
      false,
    );
  });
});
