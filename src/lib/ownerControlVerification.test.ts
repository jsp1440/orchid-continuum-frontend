// BUILD-065A — Owner Control Verification
//
// Tests for createOwnerControlVerification and readOwnerControlVerification.
//
// Validates:
// - unauthenticated write is rejected at the HTTP level
// - authenticated write succeeds (credentials: 'include' in every request)
// - record persists and is readable via the returned id
// - read-back confirms the record
// - failures are surfaced honestly (no fake success)
// - GET/DELETE requests no longer include Content-Type or X-Orchid-Actor
//   (the headers that were causing CORS preflight failures in production)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createOwnerControlVerification,
  readOwnerControlVerification,
  validateOwnerSession,
} from './ownerOperationsConsole';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_RECORD = {
  id: 'ctrl-verify-001',
  label: 'owner-control-verification',
  created_at: '2026-01-01T00:00:00Z',
  session_owner: 'owner',
  read_back_confirmed: true,
};

function mockFetch(responses: Array<{ ok: boolean; status?: number; body: unknown }>) {
  let callIndex = 0;
  return vi.fn(() => {
    const resp = responses[callIndex++];
    if (!resp) throw new Error(`mockFetch: no response at index ${callIndex - 1}`);
    return Promise.resolve({
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 401),
      statusText: resp.ok ? 'OK' : 'Unauthorized',
      text: () => Promise.resolve(JSON.stringify(resp.body)),
    });
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('createOwnerControlVerification', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('always sends credentials: "include" in the write request', async () => {
    const capturedInits: RequestInit[] = [];
    globalThis.fetch = vi.fn((_url: unknown, init?: RequestInit) => {
      if (init) capturedInits.push(init);
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify(SAMPLE_RECORD)),
      });
    }) as typeof fetch;

    await createOwnerControlVerification();

    expect(capturedInits.length).toBeGreaterThan(0);
    expect(capturedInits[0].credentials).toBe('include');
  });

  it('returns the persisted record on a successful write', async () => {
    globalThis.fetch = mockFetch([{ ok: true, body: SAMPLE_RECORD }]);

    const record = await createOwnerControlVerification();

    expect(record.id).toBe('ctrl-verify-001');
    expect(record.label).toBe('owner-control-verification');
    expect(record.created_at).toBe('2026-01-01T00:00:00Z');
    expect(record.session_owner).toBe('owner');
  });

  it('throws with the backend error detail when write is rejected (unauthenticated)', async () => {
    globalThis.fetch = mockFetch([
      { ok: false, status: 401, body: { detail: 'Owner session required' } },
    ]);

    await expect(createOwnerControlVerification()).rejects.toThrow(/owner session required/i);
  });

  it('throws when the server returns a non-2xx error', async () => {
    globalThis.fetch = mockFetch([
      { ok: false, status: 500, body: { detail: 'Internal server error' } },
    ]);

    await expect(createOwnerControlVerification()).rejects.toThrow(/500/);
  });

  it('throws on network failure without claiming success', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Load failed')));

    await expect(createOwnerControlVerification()).rejects.toThrow(/load failed/i);
  });
});

describe('readOwnerControlVerification', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('always sends credentials: "include" in the read request', async () => {
    const capturedInits: RequestInit[] = [];
    globalThis.fetch = vi.fn((_url: unknown, init?: RequestInit) => {
      if (init) capturedInits.push(init);
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify(SAMPLE_RECORD)),
      });
    }) as typeof fetch;

    await readOwnerControlVerification('ctrl-verify-001');

    expect(capturedInits.length).toBeGreaterThan(0);
    expect(capturedInits[0].credentials).toBe('include');
  });

  it('returns the persisted record on a successful read-back', async () => {
    globalThis.fetch = mockFetch([{ ok: true, body: SAMPLE_RECORD }]);

    const record = await readOwnerControlVerification('ctrl-verify-001');

    expect(record.id).toBe('ctrl-verify-001');
    expect(record.read_back_confirmed).toBe(true);
  });

  it('does NOT include Content-Type or X-Orchid-Actor in GET headers (CORS fix)', async () => {
    const capturedInits: RequestInit[] = [];
    globalThis.fetch = vi.fn((_url: unknown, init?: RequestInit) => {
      if (init) capturedInits.push(init);
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify(SAMPLE_RECORD)),
      });
    }) as typeof fetch;

    await readOwnerControlVerification('ctrl-verify-001');

    const sentHeaders = new Headers(capturedInits[0]?.headers);
    expect(sentHeaders.has('content-type')).toBe(false);
    expect(sentHeaders.has('x-orchid-actor')).toBe(false);
  });

  it('throws when read-back is unauthorized', async () => {
    globalThis.fetch = mockFetch([
      { ok: false, status: 401, body: { detail: 'Owner session required' } },
    ]);

    await expect(readOwnerControlVerification('ctrl-verify-001')).rejects.toThrow(/owner session required/i);
  });
});

describe('validateOwnerSession GET headers — CORS preflight fix (BUILD-065A)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('does NOT include Content-Type in the GET session validation request', async () => {
    const capturedInits: RequestInit[] = [];
    globalThis.fetch = vi.fn((_url: unknown, init?: RequestInit) => {
      if (init) capturedInits.push(init);
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({
          authenticated: true,
          status: 'active',
          owner: 'owner',
          expires_at: null,
          allowedActions: {},
        })),
      });
    }) as typeof fetch;

    await validateOwnerSession();

    const sentHeaders = new Headers(capturedInits[0]?.headers);
    // Content-Type must be absent from GET requests so it is not included in
    // the CORS preflight Access-Control-Request-Headers.
    expect(sentHeaders.has('content-type')).toBe(false);
  });

  it('does NOT include X-Orchid-Actor in the GET session validation request', async () => {
    const capturedInits: RequestInit[] = [];
    globalThis.fetch = vi.fn((_url: unknown, init?: RequestInit) => {
      if (init) capturedInits.push(init);
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({
          authenticated: true,
          status: 'active',
          owner: 'owner',
          expires_at: null,
          allowedActions: {},
        })),
      });
    }) as typeof fetch;

    await validateOwnerSession();

    const sentHeaders = new Headers(capturedInits[0]?.headers);
    // X-Orchid-Actor must be absent from GET requests so the preflight only
    // needs to allow Accept and Authorization — not a custom header.
    expect(sentHeaders.has('x-orchid-actor')).toBe(false);
  });

  it('still sends credentials: "include" in the GET session validation request', async () => {
    const capturedInits: RequestInit[] = [];
    globalThis.fetch = vi.fn((_url: unknown, init?: RequestInit) => {
      if (init) capturedInits.push(init);
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({
          authenticated: false,
          status: 'missing',
          owner: '',
          expires_at: null,
          allowedActions: {},
        })),
      });
    }) as typeof fetch;

    await validateOwnerSession();

    expect(capturedInits[0]?.credentials).toBe('include');
  });
});
