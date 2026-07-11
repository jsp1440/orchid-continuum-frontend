// BUILD-058 — Centralized Owner Session Validation
// Executable tests for validateOwnerSession() shared authorization logic.
//
// These tests verify that privileged controls cannot be activated from
// session.authenticated alone, and that all restore/refresh/init paths
// rely on the shared validation result.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateOwnerSession, createOwnerSession } from './ownerOperationsConsole';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_VALID_SESSION = {
  authenticated: true,
  status: 'active',
  owner: 'owner',
  expires_at: null,
  allowedActions: {},
  credential_transport: 'cookie',
};

function mockFetch(responses: Array<{ ok: boolean; status?: number; body: unknown }>) {
  let callIndex = 0;
  return vi.fn(() => {
    const resp = responses[callIndex++] ?? responses[responses.length - 1];
    return Promise.resolve({
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 401),
      statusText: resp.ok ? 'OK' : 'Unauthorized',
      text: () => Promise.resolve(JSON.stringify(resp.body)),
    });
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('validateOwnerSession — shared owner-session authorization', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: Fresh login succeeds — shared validation confirms owner permission
  // -------------------------------------------------------------------------
  it('returns token: "cookie" when authenticated is true and owner is present', async () => {
    globalThis.fetch = mockFetch([{ ok: true, body: BASE_VALID_SESSION }]);

    const session = await validateOwnerSession();

    expect(session.authenticated).toBe(true);
    expect(session.owner).toBe('owner');
    expect(session.token).toBe('cookie');
  });

  // -------------------------------------------------------------------------
  // Test 2: Fresh login succeeds but owner identity is empty
  // -------------------------------------------------------------------------
  it('does NOT return token: "cookie" when authenticated true but owner is empty', async () => {
    globalThis.fetch = mockFetch([{ ok: true, body: { ...BASE_VALID_SESSION, owner: '' } }]);

    const session = await validateOwnerSession();

    // Privileged token must NOT be set
    expect(session.token).toBeUndefined();
    // The reason field should explain the rejection
    expect(session.reason).toMatch(/owner identity absent/i);
  });

  // -------------------------------------------------------------------------
  // Test 3: Cookie restore returns authenticated: true but owner permission absent
  // -------------------------------------------------------------------------
  it('rejects restore when authenticated: true but owner is missing from response', async () => {
    globalThis.fetch = mockFetch([{ ok: true, body: { ...BASE_VALID_SESSION, owner: null } }]);

    const session = await validateOwnerSession();

    expect(session.token).toBeUndefined();
    expect(session.reason).toMatch(/owner identity absent/i);
  });

  // -------------------------------------------------------------------------
  // Test 4: Page refresh returns authenticated: true but owner identity empty
  // -------------------------------------------------------------------------
  it('rejects refresh when authenticated: true but owner is whitespace-only', async () => {
    globalThis.fetch = mockFetch([{ ok: true, body: { ...BASE_VALID_SESSION, owner: '   ' } }]);

    const session = await validateOwnerSession();

    expect(session.token).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test 5: Session inspection network failure
  // -------------------------------------------------------------------------
  it('returns unauthenticated session on network failure', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

    const session = await validateOwnerSession();

    expect(session.authenticated).toBe(false);
    expect(session.token).toBeUndefined();
    expect(session.reason).toMatch(/network error/i);
  });

  // -------------------------------------------------------------------------
  // Test 6: Malformed inspection response
  // -------------------------------------------------------------------------
  it('returns unauthenticated session when response body is not a valid object', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve('"not-an-object"'),
    }));

    const session = await validateOwnerSession();

    expect(session.authenticated).toBe(false);
    expect(session.token).toBeUndefined();
    expect(session.reason).toMatch(/malformed/i);
  });

  // -------------------------------------------------------------------------
  // Test 7: Expired / revoked session
  // -------------------------------------------------------------------------
  it('returns unauthenticated session when backend reports authenticated: false (expired/revoked)', async () => {
    globalThis.fetch = mockFetch([{ ok: true, body: { ...BASE_VALID_SESSION, authenticated: false, reason: 'Session expired' } }]);

    const session = await validateOwnerSession();

    expect(session.authenticated).toBe(false);
    expect(session.token).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test 8: Successful valid session restore
  // -------------------------------------------------------------------------
  it('returns full valid session with token on successful restore', async () => {
    globalThis.fetch = mockFetch([{ ok: true, body: { ...BASE_VALID_SESSION, expires_at: 9999999999 } }]);

    const session = await validateOwnerSession();

    expect(session.authenticated).toBe(true);
    expect(session.token).toBe('cookie');
    expect(session.owner).toBe('owner');
    expect(session.expires_at).toBe(9999999999);
  });

  // -------------------------------------------------------------------------
  // Test 9: Logout path — endOwnerSession clears authenticated state
  // Tested here via createOwnerSession → then validateOwnerSession returning unauth.
  // Full UI-state teardown is in MissionControl; this verifies the function contracts.
  // -------------------------------------------------------------------------
  it('createOwnerSession throws when post-login inspection shows authenticated: false', async () => {
    globalThis.fetch = mockFetch([
      // POST login → success
      { ok: true, body: { ...BASE_VALID_SESSION } },
      // GET inspect → unauthenticated (simulates revoked/logout race)
      { ok: true, body: { ...BASE_VALID_SESSION, authenticated: false, reason: 'Session revoked' } },
    ]);

    await expect(createOwnerSession('test-code')).rejects.toThrow(/session revoked/i);
  });

  // -------------------------------------------------------------------------
  // Test 10: Privileged controls never activate until shared validation succeeds
  // -------------------------------------------------------------------------
  it('privileged token is absent until both authenticated===true AND owner is non-empty', async () => {
    // Scenario A: authenticated false, owner present → no token
    globalThis.fetch = mockFetch([{ ok: true, body: { ...BASE_VALID_SESSION, authenticated: false } }]);
    const sessionA = await validateOwnerSession();
    expect(sessionA.token).toBeUndefined();

    // Scenario B: authenticated true, owner absent → no token
    globalThis.fetch = mockFetch([{ ok: true, body: { ...BASE_VALID_SESSION, owner: '' } }]);
    const sessionB = await validateOwnerSession();
    expect(sessionB.token).toBeUndefined();

    // Scenario C: both conditions met → token present
    globalThis.fetch = mockFetch([{ ok: true, body: BASE_VALID_SESSION }]);
    const sessionC = await validateOwnerSession();
    expect(sessionC.token).toBe('cookie');
  });
});

describe('createOwnerSession — fresh login shared validation', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('succeeds and returns token: "cookie" when login + inspection both confirm owner', async () => {
    globalThis.fetch = mockFetch([
      { ok: true, body: BASE_VALID_SESSION },       // POST login
      { ok: true, body: BASE_VALID_SESSION },       // GET inspect
    ]);

    const session = await createOwnerSession('valid-code');

    expect(session.authenticated).toBe(true);
    expect(session.token).toBe('cookie');
    expect(session.owner).toBe('owner');
  });

  it('throws when login POST succeeds but inspection returns empty owner', async () => {
    globalThis.fetch = mockFetch([
      { ok: true, body: BASE_VALID_SESSION },                         // POST login
      { ok: true, body: { ...BASE_VALID_SESSION, owner: '' } },      // GET inspect → no owner
    ]);

    await expect(createOwnerSession('valid-code')).rejects.toThrow(/owner.*absent|owner identity absent/i);
  });
});

