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

// Exact-origin gate for the owner bearer. A string-prefix check
// (`url.startsWith(CALYX_BASE)`) handed the owner bearer, `credentials:
// 'include'` and the cookie-recovery retry to lookalike URLs. The URLs below
// are synthetic attacker shapes; no real token is used.
describe('owner bearer is attached only to the exact Calyx origin (backendConfig.ts)', () => {
  const HOST = 'orchid-calyx-backend.onrender.com';
  const OWNER_BEARER = 'synthetic-owner-bearer';

  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  async function withStoredBearer(native: ReturnType<typeof vi.fn>) {
    await freshModule(native);
    sessionStorage.setItem(BEARER_STORAGE_KEY, OWNER_BEARER);
  }

  function authorizationOf(init: RequestInit | undefined): string | null {
    return new Headers(init?.headers).get('Authorization');
  }

  it.each([
    ['lookalike host suffix', `https://${HOST}.evil.test/api/mission-control/some-owner-tool`],
    ['lookalike host suffix without a dot-separated TLD', `https://${HOST}.evil/api/x`],
    ['host@evil (Calyx host as userinfo)', `https://${HOST}@evil.test/api/x`],
    ['host:pass@evil', `https://${HOST}:x@evil.test/api/x`],
    ['userinfo on the real Calyx host', `https://user:pass@${HOST}/api/x`],
    ['backslash lookalike host', `https://${HOST}.evil.test\\api\\x`],
    ['different port', `https://${HOST}:8443/api/x`],
    ['http instead of https', `http://${HOST}/api/x`],
    ['relative URL', '/api/mission-control/some-owner-tool'],
  ])('does not attach the owner bearer or credentials to a %s', async (_label, url) => {
    const native = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await withStoredBearer(native);

    await window.fetch(url);

    expect(native).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = native.mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(authorizationOf(init)).toBeNull();
    expect(init?.credentials).toBe('same-origin');
  });

  it('does not attach the owner bearer to a lookalike passed as a Request or URL object', async () => {
    const native = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await withStoredBearer(native);

    await window.fetch(new Request(`https://${HOST}.evil.test/api/x`));
    await window.fetch(new URL(`https://${HOST}.evil.test/api/x`));

    expect(native).toHaveBeenCalledTimes(2);
    expect(authorizationOf(native.mock.calls[0][1])).toBeNull();
    expect(authorizationOf(native.mock.calls[1][1])).toBeNull();
  });

  it('never runs the cookie-recovery refresh-and-retry for a lookalike 401', async () => {
    const native = vi.fn().mockResolvedValue(jsonResponse({}, 401));
    await freshModule(native);

    const response = await window.fetch(`https://${HOST}.evil.test/api/mission-control/some-owner-tool`);

    expect(response.status).toBe(401);
    expect(native).toHaveBeenCalledTimes(1); // no refresh call, no retry
    expect(String(native.mock.calls[0][0])).not.toContain(OWNER_TOKEN_REFRESH_PATH);
  });

  it('sends a lookalike owner-session POST without the stored owner bearer', async () => {
    // Fails on the pre-fix prefix check: the lookalike counted as Calyx, and a
    // non-login Calyx request carries the stored bearer.
    const native = vi.fn().mockResolvedValue(jsonResponse({ token: 'attacker-token' }));
    await withStoredBearer(native);

    const url = `https://${HOST}.evil.test${OWNER_SESSION_PATH}`;
    await window.fetch(url, { method: 'POST' });

    expect(native).toHaveBeenCalledTimes(1);
    expect(authorizationOf(native.mock.calls[0][1])).toBeNull();
    expect(native.mock.calls[0][1]?.credentials).toBe('same-origin');
  });

  it('regression guard: a lookalike owner-login POST is not rewritten and its token is not stored', async () => {
    // The pre-fix code also got this right (the path slice never matched), so
    // this guards against a future regression rather than the original defect.
    const native = vi.fn().mockResolvedValue(jsonResponse({ token: 'attacker-token' }));
    await freshModule(native);

    const url = `https://${HOST}.evil.test${OWNER_SESSION_PATH}`;
    await window.fetch(url, { method: 'POST' });

    expect(native.mock.calls[0][0]).toBe(url);
    expect(sessionStorage.getItem(BEARER_STORAGE_KEY)).toBeNull();
  });

  it('still attaches the owner bearer to a legitimate Calyx URL with a query and fragment', async () => {
    const native = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await withStoredBearer(native);

    await window.fetch(`${CALYX_BASE}/api/mission-control/some-owner-tool?limit=5#section`);

    const [, init] = native.mock.calls[0];
    expect(authorizationOf(init)).toBe(`Bearer ${OWNER_BEARER}`);
    expect(init?.credentials).toBe('include');
  });

  it('still attaches the owner bearer to a legitimate Calyx Request object and URL object', async () => {
    const native = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await withStoredBearer(native);

    await window.fetch(new Request(`${CALYX_BASE}/api/mission-control/some-owner-tool?x=1`));
    await window.fetch(new URL(`${CALYX_BASE}/api/mission-control/some-owner-tool`));

    expect(authorizationOf(native.mock.calls[0][1])).toBe(`Bearer ${OWNER_BEARER}`);
    expect(authorizationOf(native.mock.calls[1][1])).toBe(`Bearer ${OWNER_BEARER}`);
  });

  it('still recognises the owner-login POST when the Calyx URL carries a query string', async () => {
    const native = vi.fn().mockResolvedValue(jsonResponse({ token: 'bearer-q' }));
    await freshModule(native);

    await window.fetch(`${CALYX_BASE}${OWNER_SESSION_PATH}?next=%2Fmission-control`, { method: 'POST' });

    expect(native.mock.calls[0][0]).toBe(`${CALYX_BASE}${OWNER_TOKEN_SESSION_PATH}`);
    expect(sessionStorage.getItem(BEARER_STORAGE_KEY)).toBe('bearer-q');
  });

  it('matches a configured base path on a segment boundary only', async () => {
    vi.stubEnv('VITE_CALYX_API_URL', 'https://calyx.example.test/calyx');
    const native = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await withStoredBearer(native);

    await window.fetch('https://calyx.example.test/calyx/api/mission-control/some-owner-tool');
    await window.fetch('https://calyx.example.test/calyxx/api/mission-control/some-owner-tool');
    await window.fetch('https://calyx.example.test/api/mission-control/some-owner-tool');

    expect(authorizationOf(native.mock.calls[0][1])).toBe(`Bearer ${OWNER_BEARER}`);
    expect(authorizationOf(native.mock.calls[1][1])).toBeNull();
    expect(authorizationOf(native.mock.calls[2][1])).toBeNull();
  });

  it('fails closed when the configured Calyx base is relative', async () => {
    vi.stubEnv('VITE_CALYX_API_URL', '/calyx');
    const native = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await withStoredBearer(native);

    await window.fetch('/calyx/api/mission-control/some-owner-tool');

    expect(authorizationOf(native.mock.calls[0][1])).toBeNull();
    expect(native.mock.calls[0][1]?.credentials).toBe('same-origin');
  });

  describe('inputs fetch resolves against the page base', () => {
    let baseElement: HTMLBaseElement | null = null;

    function setPageBase(href: string) {
      baseElement = document.createElement('base');
      baseElement.href = href;
      document.head.appendChild(baseElement);
    }

    afterEach(() => {
      baseElement?.remove();
      baseElement = null;
    });

    it.each([
      ['https:<host>/p', `https:${HOST}/api/mission-control/some-owner-tool`],
      ['https:/<host>/p', `https:/${HOST}/api/mission-control/some-owner-tool`],
    ])('an https page sends %s to its own origin, so no bearer, credentials or retry', async (_label, url) => {
      setPageBase('https://frontend.example.test/app/');
      expect(document.baseURI).toBe('https://frontend.example.test/app/');
      const native = vi.fn().mockResolvedValue(jsonResponse({}, 401));
      await withStoredBearer(native);

      const response = await window.fetch(url);

      expect(response.status).toBe(401);
      expect(native).toHaveBeenCalledTimes(1); // no cookie-recovery refresh/retry
      expect(authorizationOf(native.mock.calls[0][1])).toBeNull();
      expect(native.mock.calls[0][1]?.credentials).toBe('same-origin');
    });

    it('an http page sends http:<host>:port/p to its own origin, so no bearer', async () => {
      // jsdom's default page is http://localhost:3000/, the same scheme as this
      // Calyx base, which is the checker's Chromium reproduction.
      expect(new URL(document.baseURI).protocol).toBe('http:');
      vi.stubEnv('VITE_CALYX_API_URL', 'http://127.0.0.1:8893');
      const native = vi.fn().mockResolvedValue(jsonResponse({}, 401));
      await withStoredBearer(native);

      await window.fetch('http:127.0.0.1:8893/zzprobe/nosl');

      expect(native).toHaveBeenCalledTimes(1);
      expect(authorizationOf(native.mock.calls[0][1])).toBeNull();
      expect(native.mock.calls[0][1]?.credentials).toBe('same-origin');
    });

    it('control: the absolute Calyx URL on the same https page still gets the bearer', async () => {
      setPageBase('https://frontend.example.test/app/');
      const native = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
      await withStoredBearer(native);

      await window.fetch(`${CALYX_BASE}/api/mission-control/some-owner-tool`);

      expect(authorizationOf(native.mock.calls[0][1])).toBe(`Bearer ${OWNER_BEARER}`);
    });
  });

  describe('the checked URL is the sent URL', () => {
    it('sends the validated string, not an object whose toString changes after the check', async () => {
      const native = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
      await withStoredBearer(native);
      let reads = 0;
      const shifty = {
        toString() {
          reads += 1;
          return reads === 1 ? `${CALYX_BASE}/api/mission-control/some-owner-tool` : 'https://evil.test/steal';
        },
      };

      await window.fetch(shifty as unknown as string);

      expect(native).toHaveBeenCalledTimes(1);
      const [sent, init] = native.mock.calls[0];
      expect(typeof sent).toBe('string');
      expect(String(sent)).toBe(`${CALYX_BASE}/api/mission-control/some-owner-tool`);
      expect(authorizationOf(init)).toBe(`Bearer ${OWNER_BEARER}`);
    });

    it('retries the validated string when a URL object is mutated during the recovery await', async () => {
      const target = new URL(`${CALYX_BASE}/api/mission-control/some-owner-tool`);
      const native = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({}, 401)) // cookie dropped
        .mockImplementationOnce(async () => {
          target.host = 'evil.test'; // mutated while the refresh is awaited
          return jsonResponse({ token: 'bearer-refreshed' });
        })
        .mockResolvedValueOnce(jsonResponse({ ok: true })); // retry
      await freshModule(native);

      await window.fetch(target);

      expect(native).toHaveBeenCalledTimes(3);
      expect(String(native.mock.calls[0][0])).toBe(`${CALYX_BASE}/api/mission-control/some-owner-tool`);
      expect(String(native.mock.calls[1][0])).toBe(`${CALYX_BASE}${OWNER_TOKEN_REFRESH_PATH}`);
      expect(String(native.mock.calls[2][0])).toBe(`${CALYX_BASE}/api/mission-control/some-owner-tool`);
      expect(authorizationOf(native.mock.calls[2][1])).toBe('Bearer bearer-refreshed');
      for (const [sent] of native.mock.calls) expect(String(sent)).not.toContain('evil.test');
    });

    it('checks a Request by its immutable URL and sends the Request itself', async () => {
      const native = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
      await withStoredBearer(native);
      const request = new Request(`${CALYX_BASE}/api/mission-control/some-owner-tool`);

      await window.fetch(request);

      expect(native.mock.calls[0][0]).toBe(request);
      expect(authorizationOf(native.mock.calls[0][1])).toBe(`Bearer ${OWNER_BEARER}`);
    });
  });
});
