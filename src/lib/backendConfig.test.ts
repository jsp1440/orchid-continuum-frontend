// @vitest-environment jsdom
//
// Tests for backendConfig.ts's installOwnerSessionTransport() - a global
// window.fetch monkey-patch that every owner-authenticated tool (Mission
// Control, taxonomy, runtime, harvester, governance) relies on implicitly.
// Flagged as the highest-risk untested frontend code path (real recurring
// bugfix history) in Brain's AUDIT-0002. Only the native fetch boundary is
// mocked - the transport logic itself runs for real.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CALYX_BASE = 'https://orchid-calyx-backend.onrender.com';
const OWNER_SESSION_PATH = '/api/mission-control/owner/session';
const OWNER_TOKEN_SESSION_PATH = '/api/mission-control/owner/session-token';
const OWNER_TOKEN_REFRESH_PATH = '/api/mission-control/owner/session-token/refresh';
const BEARER_STORAGE_KEY = 'calyx_owner_session_bearer_v1';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * (Re)installs the transport against a fresh native-fetch mock. The module
 * captures "native fetch" once, at install time, so the mock must be in
 * place before the module (re-)runs its top-level installOwnerSessionTransport()
 * call - hence vi.resetModules() plus clearing the window-scoped install guard.
 */
async function freshModule(nativeFetchMock: ReturnType<typeof vi.fn>) {
  vi.resetModules();
  delete (window as unknown as Record<string, unknown>).__calyxOwnerSessionTransportInstalled;
  window.fetch = nativeFetchMock as unknown as typeof window.fetch;
  sessionStorage.clear();
  await import('./backendConfig');
}

describe('installOwnerSessionTransport (backendConfig.ts)', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('passes non-Calyx requests through untouched, without an Authorization header', async () => {
    const native = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await freshModule(native);

    await window.fetch('https://example.com/whatever');

    expect(native).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = native.mock.calls[0];
    expect(calledUrl).toBe('https://example.com/whatever');
    const headers = new Headers(init?.headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('does not force credentials: include on non-Calyx requests (third-party CORS)', async () => {
    // A live browser audit of production found this exact default breaking
    // real fetches to iNaturalist, Supabase, and the harvester: their public
    // read endpoints correctly serve a wildcard Access-Control-Allow-Origin,
    // which the Fetch spec forbids combining with a credentialed request.
    const native = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await freshModule(native);

    await window.fetch('https://api.inaturalist.org/v1/taxa?q=Cattleya');

    const [, init] = native.mock.calls[0];
    expect(init?.credentials).toBe('same-origin');
  });

  it('still defaults Calyx requests to credentials: include', async () => {
    const native = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await freshModule(native);

    await window.fetch(`${CALYX_BASE}/api/media/genus/Cattleya`);

    const [, init] = native.mock.calls[0];
    expect(init?.credentials).toBe('include');
  });

  it('rewrites the owner-login POST to the token-session endpoint and stores the returned bearer', async () => {
    const native = vi.fn().mockResolvedValue(jsonResponse({ token: 'bearer-abc' }));
    await freshModule(native);

    await window.fetch(`${CALYX_BASE}${OWNER_SESSION_PATH}`, { method: 'POST' });

    expect(native).toHaveBeenCalledTimes(1);
    expect(native.mock.calls[0][0]).toBe(`${CALYX_BASE}${OWNER_TOKEN_SESSION_PATH}`);
    expect(sessionStorage.getItem(BEARER_STORAGE_KEY)).toBe('bearer-abc');
  });

  it('never stores the literal "cookie" sentinel as a bearer token', async () => {
    const native = vi.fn().mockResolvedValue(jsonResponse({ token: 'cookie' }));
    await freshModule(native);

    await window.fetch(`${CALYX_BASE}${OWNER_SESSION_PATH}`, { method: 'POST' });

    expect(sessionStorage.getItem(BEARER_STORAGE_KEY)).toBeNull();
  });

  it('shows an alert and dispatches oc-owner-auth-failure when login fails', async () => {
    const native = vi.fn().mockResolvedValue(jsonResponse({ detail: 'bad owner password' }, 401));
    await freshModule(native);
    const eventListener = vi.fn();
    window.addEventListener('oc-owner-auth-failure', eventListener);

    await window.fetch(`${CALYX_BASE}${OWNER_SESSION_PATH}`, { method: 'POST' });

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(String(alertSpy.mock.calls[0][0])).toContain('bad owner password');
    expect(eventListener).toHaveBeenCalledTimes(1);

    window.removeEventListener('oc-owner-auth-failure', eventListener);
  });

  it('attaches a stored bearer token to subsequent Calyx requests automatically', async () => {
    const native = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'bearer-xyz' })) // login
      .mockResolvedValueOnce(jsonResponse({ ok: true })); // subsequent owner-tool call
    await freshModule(native);

    await window.fetch(`${CALYX_BASE}${OWNER_SESSION_PATH}`, { method: 'POST' });
    await window.fetch(`${CALYX_BASE}/api/mission-control/some-owner-tool`);

    expect(native).toHaveBeenCalledTimes(2);
    const secondHeaders = new Headers(native.mock.calls[1][1]?.headers);
    expect(secondHeaders.get('Authorization')).toBe('Bearer bearer-xyz');
  });

  it('never overrides an explicitly supplied Authorization header', async () => {
    const native = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'bearer-xyz' }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    await freshModule(native);

    await window.fetch(`${CALYX_BASE}${OWNER_SESSION_PATH}`, { method: 'POST' });
    await window.fetch(`${CALYX_BASE}/api/mission-control/some-owner-tool`, {
      headers: { Authorization: 'Bearer explicit-caller-token' },
    });

    const secondHeaders = new Headers(native.mock.calls[1][1]?.headers);
    expect(secondHeaders.get('Authorization')).toBe('Bearer explicit-caller-token');
  });

  it('recovers a dropped cookie session (Safari cross-site POST) via one refresh-and-retry on a 401', async () => {
    const native = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 401)) // cookie dropped on this request
      .mockResolvedValueOnce(jsonResponse({ token: 'bearer-refreshed' })) // refresh call
      .mockResolvedValueOnce(jsonResponse({ ok: true })); // retried request
    await freshModule(native);

    const response = await window.fetch(`${CALYX_BASE}/api/mission-control/some-owner-tool`);

    expect(native).toHaveBeenCalledTimes(3);
    expect(native.mock.calls[1][0]).toBe(`${CALYX_BASE}${OWNER_TOKEN_REFRESH_PATH}`);
    const retryHeaders = new Headers(native.mock.calls[2][1]?.headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer bearer-refreshed');
    expect(response.ok).toBe(true);
    expect(sessionStorage.getItem(BEARER_STORAGE_KEY)).toBe('bearer-refreshed');
  });

  it('does not retry via cookie refresh when a request already carried its own bearer Authorization header', async () => {
    // A 401 on a request that was already authenticated with a bearer token
    // is a real rejection, not a dropped-cookie situation - the transport
    // must not paper over it with a silent cookie-based retry.
    const native = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'bearer-established' })) // login
      .mockResolvedValueOnce(jsonResponse({}, 401)); // bearer itself was rejected
    await freshModule(native);

    await window.fetch(`${CALYX_BASE}${OWNER_SESSION_PATH}`, { method: 'POST' });
    const response = await window.fetch(`${CALYX_BASE}/api/mission-control/some-owner-tool`);

    expect(native).toHaveBeenCalledTimes(2); // no refresh call attempted
    expect(response.status).toBe(401);
  });

  it('never attempts a recovery retry for the login, logout, or refresh endpoints themselves', async () => {
    const native = vi.fn().mockResolvedValue(jsonResponse({}, 401));
    await freshModule(native);

    await window.fetch(`${CALYX_BASE}${OWNER_TOKEN_REFRESH_PATH}`, { method: 'POST' });
    expect(native).toHaveBeenCalledTimes(1);

    await window.fetch(`${CALYX_BASE}${OWNER_SESSION_PATH}`, { method: 'DELETE' });
    expect(native).toHaveBeenCalledTimes(2);
  });

  it('clears the stored bearer on owner logout', async () => {
    const native = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'bearer-xyz' }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    await freshModule(native);

    await window.fetch(`${CALYX_BASE}${OWNER_SESSION_PATH}`, { method: 'POST' });
    expect(sessionStorage.getItem(BEARER_STORAGE_KEY)).toBe('bearer-xyz');

    await window.fetch(`${CALYX_BASE}${OWNER_SESSION_PATH}`, { method: 'DELETE' });
    expect(sessionStorage.getItem(BEARER_STORAGE_KEY)).toBeNull();
  });

  it('installs exactly once per window: a second install call does not double-wrap fetch', async () => {
    const native = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await freshModule(native);
    const wrappedOnce = window.fetch;

    // Re-import without resetting the install guard: the module's top-level
    // installOwnerSessionTransport() call should be a no-op this time.
    vi.resetModules();
    await import('./backendConfig');

    expect(window.fetch).toBe(wrappedOnce);
  });
});
