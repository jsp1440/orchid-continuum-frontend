// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Member read access: the Supabase access token goes to the Calyx origin, on
 * in-scope GETs, and nowhere else.
 *
 * Owner decision (2026-09-26): "Allow member reads: accept Supabase member
 * sessions on the product endpoints." Writes, Speak, Relationship Matrix build
 * and Matrix identification sessions stay owner-only, so the token must never
 * ride on them — nor on any other origin.
 *
 * The session below is a synthetic test shape; no real token is used.
 */

const MEMBER_TOKEN = 'synthetic-member-access-token';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import {
  errorCodeOf,
  isMemberAuthNotConfigured,
  isMemberReadRequest,
  memberReadRefusal,
  withMemberReadAuth,
} from '@/lib/memberReadAuth';
import { fetchLiteratureIndex } from '@/lib/literatureIndex';
import { fetchLiteraturePaper } from '@/lib/literaturePaper';
import { fetchLedgerRevision } from '@/lib/reasoningLedger';
import { fetchResearchTraits } from '@/lib/researchTraits';
import { listResearchProjects, researchRequest } from '@/lib/researchStation';
import { fetchCandidateKnowledge, fetchEvidenceAggregate } from '@/lib/researchEvidenceChain';

const OWNER_BEARER_KEY = 'calyx_owner_session_bearer_v1';
const base = CALYX_BACKEND_BASE_URL;

function signedIn() {
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: MEMBER_TOKEN } }, error: null });
}
function signedOut() {
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
}

function authorizationOf(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get('Authorization');
}

beforeEach(() => {
  signedOut();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mocks.getSession.mockReset();
  sessionStorage.clear();
});

describe('isMemberReadRequest: which requests are in scope', () => {
  it.each([
    '/api/research/traits?genus=Cattleya',
    '/api/candidate-knowledge/candidates/c-1',
    '/api/candidate-knowledge/conflicts?limit=50&offset=0',
    '/api/evidence-aggregation/aggregates/a-1',
    '/api/literature-extraction/papers?limit=25&offset=0',
    '/api/literature-extraction/papers/p-1/source-binding',
    '/api/reasoning-ledgers/l-1/revisions/2',
    '/api/reasoning-ledgers/l-1',
    '/api/research/projects/p-1/reasoning-ledgers',
  ])('accepts GET %s on the Calyx origin', (path) => {
    expect(isMemberReadRequest(`${base}${path}`, 'GET')).toBe(true);
    // Method omitted means GET, as in fetch.
    expect(isMemberReadRequest(`${base}${path}`)).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'post'])('never accepts a %s, even on an in-scope path', (method) => {
    expect(isMemberReadRequest(`${base}/api/candidate-knowledge/candidates/c-1`, method)).toBe(false);
    expect(isMemberReadRequest(`${base}/api/literature-extraction/papers`, method)).toBe(false);
  });

  it.each([
    '/api/calyx/speak',
    '/api/research/projects',
    '/api/research/projects/p-1',
    '/api/research/projects/p-1/evidence',
    '/api/research/traitsx',
    '/api/relationship-matrix/build',
    '/api/matrix/identification/sessions',
    '/api/mission-control/owner/session',
    '/api/reasoning-ledgers/eligible-for-publication',
    '/api/reasoning-ledgers/l-1/publications',
    '/api/research/traits/../projects',
    '/api/research/traits/%2e%2e/projects',
  ])('rejects out-of-scope GET %s', (path) => {
    expect(isMemberReadRequest(`${base}${path}`, 'GET')).toBe(false);
  });

  it('rejects every other origin, including lookalikes and scheme changes', () => {
    const calyx = new URL(base);
    const lookalike = `${calyx.protocol}//${calyx.host}.attacker.test/api/research/traits`;
    const otherScheme = `${calyx.protocol === 'https:' ? 'http:' : 'https:'}//${calyx.host}/api/research/traits`;
    for (const url of [
      'https://api.inaturalist.org/api/research/traits',
      'https://orchid-continuum-public-api.onrender.com/api/research/traits',
      lookalike,
      otherScheme,
      '/api/research/traits',
      `${calyx.protocol}//user:pass@${calyx.host}/api/research/traits`,
    ]) {
      expect(isMemberReadRequest(url, 'GET'), url).toBe(false);
    }
  });
});

describe('withMemberReadAuth: attaching the member token', () => {
  it('attaches the member bearer to an in-scope GET and keeps credentials and headers', async () => {
    signedIn();
    const init = await withMemberReadAuth(`${base}/api/research/traits?genus=Cattleya`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    expect(authorizationOf(init)).toBe(`Bearer ${MEMBER_TOKEN}`);
    expect(new Headers(init.headers).get('Accept')).toBe('application/json');
    expect(init.credentials).toBe('include');
  });

  it('attaches nothing when signed out', async () => {
    signedOut();
    const input: RequestInit = { method: 'GET', credentials: 'include' };
    const init = await withMemberReadAuth(`${base}/api/research/traits?genus=Cattleya`, input);
    expect(init).toBe(input);
    expect(authorizationOf(init)).toBeNull();
  });

  it('attaches nothing to a write, and does not even read the session', async () => {
    signedIn();
    const init = await withMemberReadAuth(`${base}/api/candidate-knowledge/candidates/c-1/review`, {
      method: 'POST',
      credentials: 'include',
      body: '{}',
    });
    expect(authorizationOf(init)).toBeNull();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('attaches nothing to another origin or to an out-of-scope Calyx path', async () => {
    signedIn();
    for (const url of [
      'https://api.inaturalist.org/v1/observations',
      `${base}/api/calyx/speak`,
      `${base}/api/research/projects?limit=25`,
    ]) {
      expect(authorizationOf(await withMemberReadAuth(url, { method: 'GET' })), url).toBeNull();
    }
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('never replaces a caller-supplied Authorization header', async () => {
    signedIn();
    const init = await withMemberReadAuth(`${base}/api/research/traits?genus=Cattleya`, {
      headers: { Authorization: 'Bearer caller-owned' },
    });
    expect(authorizationOf(init)).toBe('Bearer caller-owned');
  });

  it('defers to an owner bearer session held by this tab', async () => {
    signedIn();
    sessionStorage.setItem(OWNER_BEARER_KEY, 'owner-bearer');
    const init = await withMemberReadAuth(`${base}/api/research/traits?genus=Cattleya`, { method: 'GET' });
    expect(authorizationOf(init)).toBeNull();
  });

  it('treats unavailable identity as no member session, never a thrown read', async () => {
    mocks.getSession.mockRejectedValue(new Error('identity down'));
    const init = await withMemberReadAuth(`${base}/api/research/traits?genus=Cattleya`, { method: 'GET' });
    expect(authorizationOf(init)).toBeNull();
  });

  it('never logs or persists the token', async () => {
    signedIn();
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    await withMemberReadAuth(`${base}/api/literature-extraction/papers`, { method: 'GET' });
    for (const spy of spies) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(MEMBER_TOKEN);
    }
    const stored = [
      ...Object.keys(localStorage).map((key) => localStorage.getItem(key)),
      ...Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key)),
    ].join('|');
    expect(stored).not.toContain(MEMBER_TOKEN);
  });
});

describe('the product clients send the member token only where in scope', () => {
  function stubFetch(body: unknown = {}, status = 200) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }
  const callsTo = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), init: init as RequestInit }));

  it('literature index and paper reads carry the member token and credentials', async () => {
    signedIn();
    const fetchMock = stubFetch({ papers: [], total: 0, limit: 25, offset: 0, unreadable_count: 0 });
    await fetchLiteratureIndex();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ paper_id: 'p-1' }), { status: 200 }));
    await fetchLiteraturePaper('p-1');
    const calls = callsTo(fetchMock);
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/api/literature-extraction/papers',
      '/api/literature-extraction/papers/p-1',
      '/api/literature-extraction/papers/p-1/source-binding',
    ]);
    for (const call of calls) {
      expect(authorizationOf(call.init)).toBe(`Bearer ${MEMBER_TOKEN}`);
      expect(call.init.credentials).toBe('include');
    }
  });

  it('trait, candidate, aggregate and ledger reads carry the member token', async () => {
    signedIn();
    const fetchMock = stubFetch({});
    await fetchResearchTraits({ rank: 'genus', name: 'Cattleya' }).catch(() => undefined);
    await fetchCandidateKnowledge('c-1').catch(() => undefined);
    await fetchEvidenceAggregate('a-1').catch(() => undefined);
    await fetchLedgerRevision('l-1', 1).catch(() => undefined);
    const calls = callsTo(fetchMock);
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(authorizationOf(call.init), call.url).toBe(`Bearer ${MEMBER_TOKEN}`);
      expect(call.init.credentials).toBe('include');
    }
  });

  it('research project reads and writes through the same client carry no member token', async () => {
    signedIn();
    const fetchMock = stubFetch({ items: [] });
    await listResearchProjects();
    await researchRequest('/api/research/traits?genus=Cattleya', { method: 'POST', body: '{}' });
    for (const call of callsTo(fetchMock)) {
      expect(authorizationOf(call.init), call.url).toBeNull();
      expect(call.init.credentials).toBe('include');
    }
  });

  it('signed out, no client read carries any Authorization header', async () => {
    signedOut();
    const fetchMock = stubFetch({ papers: [], total: 0, limit: 25, offset: 0, unreadable_count: 0 });
    await fetchLiteratureIndex();
    await fetchResearchTraits({ rank: 'genus', name: 'Cattleya' }).catch(() => undefined);
    for (const call of callsTo(fetchMock)) expect(authorizationOf(call.init)).toBeNull();
  });
});

describe('refusal classification', () => {
  it('maps 401, 403 and a member-auth-not-configured 503 to distinct states', () => {
    expect(memberReadRefusal(401)).toBe('session_unverified');
    expect(memberReadRefusal(403)).toBe('forbidden');
    expect(memberReadRefusal(503, 'member_auth_not_configured')).toBe('member_access_unconfigured');
    expect(memberReadRefusal(503, 'MEMBER_AUTH_NOT_CONFIGURED')).toBe('member_access_unconfigured');
    expect(memberReadRefusal(503, 'Member authentication is not configured')).toBe('member_access_unconfigured');
  });

  it('keeps an ordinary 503, or an owner-side configuration error, an outage', () => {
    expect(memberReadRefusal(503)).toBeNull();
    expect(memberReadRefusal(503, 'UNAVAILABLE')).toBeNull();
    expect(memberReadRefusal(503, 'Owner session signing is not configured')).toBeNull();
    expect(isMemberAuthNotConfigured('Owner access is not configured')).toBe(false);
    expect(memberReadRefusal(500, 'member_auth_not_configured')).toBeNull();
    expect(memberReadRefusal(200)).toBeNull();
  });

  it('reads the code from a string detail, an object detail, or a top-level code', () => {
    expect(errorCodeOf({ detail: 'x' })).toBe('x');
    expect(errorCodeOf({ detail: { code: 'y' } })).toBe('y');
    expect(errorCodeOf({ code: 'z' })).toBe('z');
    expect(errorCodeOf(null)).toBeNull();
    expect(errorCodeOf('nope')).toBeNull();
  });

  it('research clients surface the not-configured 503 as its own message, not an outage', async () => {
    signedIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: { code: 'member_auth_not_configured' } }), { status: 503 })),
    );
    await expect(fetchResearchTraits({ rank: 'genus', name: 'Cattleya' })).rejects.toMatchObject({
      status: 503,
      code: 'member_auth_not_configured',
      message: 'Member access is not yet configured on the server.',
    });
    await expect(fetchLiteratureIndex()).rejects.toMatchObject({ kind: 'member_access_unconfigured', retryable: false });
    await expect(fetchLiteraturePaper('p-1')).rejects.toMatchObject({ kind: 'member_access_unconfigured', retryable: false });
  });
});
