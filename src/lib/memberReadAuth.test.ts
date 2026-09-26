// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Member read access: the Supabase access token goes to the Calyx origin, on
 * in-scope GETs, and nowhere else.
 *
 * Owner decision (2026-09-26), narrowed by the owner in backend #1643 @
 * b0c1acbcd: only four GETs are member-readable — /api/research/traits,
 * /api/literature-extraction/papers (the list), /api/evidence-aggregation/health
 * and /api/evidence-aggregation/registry. The frontend calls only the first
 * two, so only those two may carry the member token. Every other path —
 * candidate knowledge, all other evidence aggregation, source bindings, paper
 * full text, coverage audit, reasoning ledgers, writes, Speak, Matrix — and
 * every other origin, never does.
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
  isMemberReadRequest,
  isRetryableRefusal,
  memberReadRefusal,
  withMemberReadAuth,
} from '@/lib/memberReadAuth';
import { fetchLiteratureIndex } from '@/lib/literatureIndex';
import { fetchLiteraturePaper } from '@/lib/literaturePaper';
import { fetchLedgerRevision } from '@/lib/reasoningLedger';
import { fetchResearchTraits } from '@/lib/researchTraits';
import { listResearchProjects, researchRequest } from '@/lib/researchStation';
import {
  fetchCandidateKnowledge,
  fetchEvidenceAggregate,
  listCandidateConflicts,
  listProjectReasoningLedgers,
} from '@/lib/researchEvidenceChain';

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

/** The only member-readable paths this frontend calls. */
const MEMBER_READABLE_CALLED = ['/api/research/traits', '/api/literature-extraction/papers'];

/**
 * Paths the frontend reads, or that exist on the Calyx routers, which must NOT
 * carry the member token. Not exhaustive of the backend, but it covers every
 * route family the frontend calls plus the two member-readable routes it does
 * not call.
 */
const NEVER_MEMBER_TOKEN = [
  // Member-readable on the backend but never called by this frontend.
  '/api/evidence-aggregation/health',
  '/api/evidence-aggregation/registry',
  // Owner-only for members on backend #1643 @ b0c1acbcd.
  '/api/candidate-knowledge/runs',
  '/api/candidate-knowledge/runs/7',
  '/api/candidate-knowledge/runs/7/items',
  '/api/candidate-knowledge/candidates',
  '/api/candidate-knowledge/candidates/c-1',
  '/api/candidate-knowledge/reviews',
  '/api/candidate-knowledge/duplicates',
  '/api/candidate-knowledge/conflicts',
  '/api/candidate-knowledge/tombstones',
  '/api/candidate-knowledge/health',
  '/api/evidence-aggregation/runs',
  '/api/evidence-aggregation/runs/3/items',
  '/api/evidence-aggregation/clusters/4',
  '/api/evidence-aggregation/aggregates',
  '/api/evidence-aggregation/aggregates/a-1',
  '/api/evidence-aggregation/aggregates/a-1/summary',
  '/api/evidence-aggregation/conflicts',
  '/api/evidence-aggregation/reviews',
  '/api/evidence-aggregation/export',
  '/api/evidence-aggregation/tombstones',
  '/api/literature-extraction/papers/p-1',
  '/api/literature-extraction/papers/p-1/source-binding',
  '/api/literature-extraction/coverage-audit',
  '/api/reasoning-ledgers/l-1',
  '/api/reasoning-ledgers/l-1/history',
  '/api/reasoning-ledgers/l-1/revisions/2',
  '/api/reasoning-ledgers/eligible-for-publication',
  '/api/research/projects',
  '/api/research/projects/p-1',
  '/api/research/projects/p-1/evidence',
  '/api/research/projects/p-1/reasoning-ledgers',
  '/api/research/projects/p-1/epistemic-memory',
  // Other routers and owner tools.
  '/api/calyx/speak',
  '/api/relationship-matrix/build',
  '/api/matrix/identification/sessions',
  '/api/mission-control/owner/session',
  // Near misses and traversal.
  '/api/research/traitsx',
  '/api/research/traits/x',
  '/api/literature-extraction/papers/',
  '/api/literature-extraction',
  '/api/research/traits/../projects',
  '/api/research/traits/%2e%2e/projects',
];

describe('isMemberReadRequest: which requests are in scope', () => {
  it.each([
    '/api/research/traits?genus=Cattleya',
    '/api/research/traits?species=Cattleya+purpurata',
    '/api/literature-extraction/papers?limit=25&offset=0',
    '/api/literature-extraction/papers',
  ])('accepts GET %s on the Calyx origin', (path) => {
    expect(isMemberReadRequest(`${base}${path}`, 'GET')).toBe(true);
    // Method omitted means GET, as in fetch.
    expect(isMemberReadRequest(`${base}${path}`)).toBe(true);
  });

  it.each(NEVER_MEMBER_TOKEN)('rejects GET %s', (path) => {
    expect(isMemberReadRequest(`${base}${path}`, 'GET')).toBe(false);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'post'])('never accepts a %s, even on an in-scope path', (method) => {
    for (const path of MEMBER_READABLE_CALLED) {
      expect(isMemberReadRequest(`${base}${path}`, method)).toBe(false);
    }
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

  it('attaches nothing to another origin or to any Calyx path outside the two member reads', async () => {
    signedIn();
    for (const url of [
      'https://api.inaturalist.org/v1/observations',
      ...NEVER_MEMBER_TOKEN.map((path) => `${base}${path}`),
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

  it('the literature index carries the member token; full paper text and its source binding do not', async () => {
    signedIn();
    const fetchMock = stubFetch({ papers: [], total: 0, limit: 25, offset: 0, unreadable_count: 0 });
    await fetchLiteratureIndex();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ paper_id: 'p-1' }), { status: 200 }));
    await fetchLiteraturePaper('p-1');
    const calls = callsTo(fetchMock).map((call) => ({
      path: new URL(call.url).pathname,
      authorization: authorizationOf(call.init),
      credentials: call.init.credentials,
    }));
    expect(calls).toEqual([
      { path: '/api/literature-extraction/papers', authorization: `Bearer ${MEMBER_TOKEN}`, credentials: 'include' },
      // Owner-only for members: no member token, owner cookie still offered.
      { path: '/api/literature-extraction/papers/p-1', authorization: null, credentials: 'include' },
      { path: '/api/literature-extraction/papers/p-1/source-binding', authorization: null, credentials: 'include' },
    ]);
  });

  it('the trait read carries the member token', async () => {
    signedIn();
    const fetchMock = stubFetch({});
    await fetchResearchTraits({ rank: 'genus', name: 'Cattleya' }).catch(() => undefined);
    const calls = callsTo(fetchMock);
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe('/api/research/traits');
    expect(authorizationOf(calls[0].init)).toBe(`Bearer ${MEMBER_TOKEN}`);
    expect(calls[0].init.credentials).toBe('include');
  });

  it('evidence-chain reads (candidate detail, conflicts, aggregate detail, ledgers) carry no member token', async () => {
    signedIn();
    const fetchMock = stubFetch({ items: [] });
    await fetchCandidateKnowledge('c-1').catch(() => undefined);
    await listCandidateConflicts().catch(() => undefined);
    await fetchEvidenceAggregate('a-1').catch(() => undefined);
    await fetchLedgerRevision('l-1', 1).catch(() => undefined);
    await listProjectReasoningLedgers('p-1').catch(() => undefined);
    const calls = callsTo(fetchMock);
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/api/candidate-knowledge/candidates/c-1',
      '/api/candidate-knowledge/conflicts',
      '/api/evidence-aggregation/aggregates/a-1',
      '/api/reasoning-ledgers/l-1/revisions/1',
      '/api/research/projects/p-1/reasoning-ledgers',
    ]);
    for (const call of calls) {
      expect(authorizationOf(call.init), call.url).toBeNull();
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

describe('refusal classification against the backend #1643 codes', () => {
  it('maps exact codes to distinct states', () => {
    expect(memberReadRefusal(401)).toBe('session_unverified');
    expect(memberReadRefusal(401, 'INVALID_MEMBER_TOKEN')).toBe('session_unverified');
    expect(memberReadRefusal(403)).toBe('forbidden');
    expect(memberReadRefusal(403, 'OWNER_ACCESS_REQUIRED')).toBe('owner_only');
    expect(memberReadRefusal(503, 'MEMBER_AUTH_NOT_CONFIGURED')).toBe('member_access_unconfigured');
    expect(memberReadRefusal(503, 'MEMBER_AUTH_UNAVAILABLE')).toBe('member_auth_unavailable');
  });

  it('reads any 401/403 on an owner-only-for-members view as owner-only, never as "sign in again"', () => {
    expect(memberReadRefusal(401, null, { memberScoped: false })).toBe('owner_only');
    expect(memberReadRefusal(401, 'Owner session or API key is required', { memberScoped: false })).toBe('owner_only');
    expect(memberReadRefusal(403, 'OWNER_ACCESS_REQUIRED', { memberScoped: false })).toBe('owner_only');
  });

  it('only member verification being unavailable is retryable', () => {
    expect(isRetryableRefusal('member_auth_unavailable')).toBe(true);
    for (const other of ['session_unverified', 'forbidden', 'owner_only', 'member_access_unconfigured'] as const) {
      expect(isRetryableRefusal(other)).toBe(false);
    }
  });

  it('keeps an ordinary 503, a near-miss code, or an owner-side configuration error an outage', () => {
    expect(memberReadRefusal(503)).toBeNull();
    expect(memberReadRefusal(503, 'UNAVAILABLE')).toBeNull();
    expect(memberReadRefusal(503, 'Owner session signing is not configured')).toBeNull();
    expect(memberReadRefusal(503, 'member_auth_not_configured')).toBeNull();
    expect(memberReadRefusal(503, 'MEMBER_AUTH_INVALID_RESPONSE')).toBeNull();
    expect(memberReadRefusal(500, 'MEMBER_AUTH_NOT_CONFIGURED')).toBeNull();
    expect(memberReadRefusal(200)).toBeNull();
  });

  it('reads the code from a string detail, an object detail, or a top-level code', () => {
    expect(errorCodeOf({ detail: 'x' })).toBe('x');
    expect(errorCodeOf({ detail: { code: 'y', message: 'm' } })).toBe('y');
    expect(errorCodeOf({ code: 'z' })).toBe('z');
    expect(errorCodeOf(null)).toBeNull();
    expect(errorCodeOf('nope')).toBeNull();
  });

  it('clients surface MEMBER_AUTH_NOT_CONFIGURED as its own non-retryable state', async () => {
    signedIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: { code: 'MEMBER_AUTH_NOT_CONFIGURED', message: 'synthetic' } }), { status: 503 })),
    );
    await expect(fetchResearchTraits({ rank: 'genus', name: 'Cattleya' })).rejects.toMatchObject({
      status: 503,
      code: 'MEMBER_AUTH_NOT_CONFIGURED',
      message: 'Member access is not yet configured on the server.',
    });
    await expect(fetchLiteratureIndex()).rejects.toMatchObject({ kind: 'member_access_unconfigured', retryable: false });
  });

  it('clients surface MEMBER_AUTH_UNAVAILABLE as a retryable state', async () => {
    signedIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: { code: 'MEMBER_AUTH_UNAVAILABLE', message: 'synthetic' } }), { status: 503 })),
    );
    await expect(fetchResearchTraits({ rank: 'genus', name: 'Cattleya' })).rejects.toMatchObject({
      status: 503,
      code: 'MEMBER_AUTH_UNAVAILABLE',
      message: 'Member verification is temporarily unavailable — try again.',
    });
    await expect(fetchLiteratureIndex()).rejects.toMatchObject({ kind: 'member_auth_unavailable', retryable: true });
  });

  it('the paper client keeps the OWNER_ACCESS_REQUIRED code on a 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: { code: 'OWNER_ACCESS_REQUIRED', message: 'synthetic' } }), { status: 403 })),
    );
    await expect(fetchLiteraturePaper('p-1')).rejects.toMatchObject({
      kind: 'unauthorized',
      status: 403,
      code: 'OWNER_ACCESS_REQUIRED',
      retryable: false,
    });
  });
});
