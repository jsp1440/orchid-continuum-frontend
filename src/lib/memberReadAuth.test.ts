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
  isMemberMatrixRequest,
  isMemberReadRequest,
  isMemberScopedRequest,
  isRetryableRefusal,
  memberReadRefusal,
  memberScopeOf,
  withMemberAuth,
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
  // Matrix identification GET routes that are owner-only for members
  // (backend #1647: everything without `@matrix_member_route`).
  '/api/matrix-identification/contract',
  '/api/matrix-identification/persistence-readiness',
  '/api/matrix-identification/registry/persistence-status',
  '/api/matrix-identification/registry/persistence-preflight',
  '/api/matrix-identification/registry/r1-synthetic-member-matrix/1/concept-mapping-status',
  '/api/matrix-identification/sessions',
  '/api/matrix-identification/sessions/persistence-status',
  '/api/matrix-identification/sessions/persistence-preflight',
  `/api/matrix-identification/sessions/${'5b1c1c1e-9d8a-4b43-9d59-0a6f4c2b8e11'}/reports`,
  `/api/matrix-identification/sessions/${'5b1c1c1e-9d8a-4b43-9d59-0a6f4c2b8e11'}/reports/r-1`,
  `/api/matrix-identification/sessions/${'5b1c1c1e-9d8a-4b43-9d59-0a6f4c2b8e11'}/vision/suggestions`,
  `/api/matrix-identification/sessions/${'5b1c1c1e-9d8a-4b43-9d59-0a6f4c2b8e11'}/vision/suggestions/s-1/region`,
  `/api/matrix-identification/sessions/${'5b1c1c1e-9d8a-4b43-9d59-0a6f4c2b8e11'}/vision/images/i-1/analyses`,
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

describe('member token and inputs fetch resolves against the page base', () => {
  // fetch resolves its input against the page base: on an https page,
  // `https:<host>/p` is relative and goes to the frontend origin, so the member
  // token must not ride along.
  const host = new URL(base).host;
  let baseElement: HTMLBaseElement | null = null;

  afterEach(() => {
    baseElement?.remove();
    baseElement = null;
  });

  function setPageBase(href: string) {
    baseElement = document.createElement('base');
    baseElement.href = href;
    document.head.appendChild(baseElement);
  }

  it.each([
    ['https:<host>/p', `https:${host}/api/research/traits`],
    ['https:/<host>/p', `https:/${host}/api/research/traits`],
  ])('does not attach the member token to %s on an https page', async (_label, url) => {
    setPageBase('https://frontend.example.test/app/');
    signedIn();
    expect(isMemberReadRequest(url, 'GET')).toBe(false);
    expect(authorizationOf(await withMemberReadAuth(url))).toBeNull();
  });

  it('does not treat http:<host>:port/p as a member read on an http page', async () => {
    expect(new URL(document.baseURI).protocol).toBe('http:');
    expect(
      isMemberReadRequest('http:127.0.0.1:8893/api/research/traits', 'GET', 'http://127.0.0.1:8893'),
    ).toBe(false);
    expect(
      isMemberReadRequest('http://127.0.0.1:8893/api/research/traits', 'GET', 'http://127.0.0.1:8893'),
    ).toBe(true);
  });

  it('control: the absolute in-scope URL on the same https page still gets the member token', async () => {
    setPageBase('https://frontend.example.test/app/');
    signedIn();
    expect(authorizationOf(await withMemberReadAuth(`${base}/api/research/traits`))).toBe(`Bearer ${MEMBER_TOKEN}`);
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

/* ------------------------------------------------------------------------ */
/* Matrix identification (R1 J4, backend #1647)                             */
/* ------------------------------------------------------------------------ */

const SESSION = '5b1c1c1e-9d8a-4b43-9d59-0a6f4c2b8e11';
const M = '/api/matrix-identification';

/** Exactly the member Matrix pairs: the token rides on these and nothing else. */
const MEMBER_MATRIX_PAIRS: Array<[string, string]> = [
  ['GET', `${M}/registry`],
  ['GET', `${M}/registry/r1-synthetic-member-matrix/1`],
  ['GET', `${M}/registry/reference-orchid-matrix/fixture-v1`],
  // encodeURIComponent output for an id with spaces / parentheses / a colon.
  ['GET', `${M}/registry/${encodeURIComponent("Fixture matrix (draft):A")}/${encodeURIComponent('v1.0+b')}`],
  ['POST', `${M}/sessions`],
  ['GET', `${M}/sessions/${SESSION}`],
  ['GET', `${M}/sessions/${SESSION.toUpperCase()}`],
  ['POST', `${M}/sessions/${SESSION}/observations`],
  ['POST', `${M}/sessions/${SESSION}/evaluate`],
  ['POST', `${M}/sessions/${SESSION}/explain`],
];

/**
 * Every owner-only Matrix route from the backend (vision x5, reports x3,
 * persistence, /contract, stateless /evaluate, registry create / derive /
 * concept-mapping-status / evaluate), each with its real method.
 */
const OWNER_ONLY_MATRIX_PAIRS: Array<[string, string]> = [
  ['GET', `${M}/sessions/${SESSION}/vision/images/img-1/analyses`],
  ['POST', `${M}/sessions/${SESSION}/vision/analyses/an-1/suggestions`],
  ['GET', `${M}/sessions/${SESSION}/vision/suggestions`],
  ['GET', `${M}/sessions/${SESSION}/vision/suggestions/sg-1/region`],
  ['POST', `${M}/sessions/${SESSION}/vision/suggestions/sg-1/review`],
  ['POST', `${M}/sessions/${SESSION}/reports`],
  ['GET', `${M}/sessions/${SESSION}/reports`],
  ['GET', `${M}/sessions/${SESSION}/reports/rep-1`],
  ['GET', `${M}/sessions/persistence-status`],
  ['GET', `${M}/sessions/persistence-preflight`],
  ['GET', `${M}/registry/persistence-status`],
  ['GET', `${M}/registry/persistence-preflight`],
  ['GET', `${M}/persistence-readiness`],
  ['GET', `${M}/contract`],
  ['POST', `${M}/evaluate`],
  ['POST', `${M}/registry`],
  ['POST', `${M}/registry/r1-synthetic-member-matrix/1/derive-concept-mappings`],
  ['GET', `${M}/registry/r1-synthetic-member-matrix/1/concept-mapping-status`],
  ['POST', `${M}/registry/evaluate`],
];

/** The right path with the wrong method gets nothing. */
const METHOD_MISMATCH: Array<[string, string]> = [
  ['POST', `${M}/registry`],
  ['PUT', `${M}/registry`],
  ['POST', `${M}/registry/r1-synthetic-member-matrix/1`],
  ['DELETE', `${M}/registry/r1-synthetic-member-matrix/1`],
  ['GET', `${M}/sessions`],
  ['PUT', `${M}/sessions`],
  ['POST', `${M}/sessions/${SESSION}`],
  ['DELETE', `${M}/sessions/${SESSION}`],
  ['PATCH', `${M}/sessions/${SESSION}`],
  ['GET', `${M}/sessions/${SESSION}/observations`],
  ['GET', `${M}/sessions/${SESSION}/evaluate`],
  ['GET', `${M}/sessions/${SESSION}/explain`],
  ['PUT', `${M}/sessions/${SESSION}/observations`],
  ['HEAD', `${M}/registry`],
  ['OPTIONS', `${M}/sessions`],
];

/** Identifier traversal, encoded separators and near misses. */
const MATRIX_TRAVERSAL: Array<[string, string]> = [
  ['GET', `${M}/registry/a/b/c`],
  ['GET', `${M}/registry/a`],
  ['GET', `${M}/registry/a/`],
  ['GET', `${M}/registry//b`],
  ['GET', `${M}/registry/a%2Fb/1`],
  ['GET', `${M}/registry/a%2fb/1`],
  ['GET', `${M}/registry/a%5Cb/1`],
  ['GET', `${M}/registry/%2e%2e/1`],
  ['GET', `${M}/registry/.%2e/1`],
  ['GET', `${M}/registry/a%252Fb/1`],
  ['GET', `${M}/registry/a%00/1`],
  ['GET', `${M}/registry/r/1%2F..%2Fconcept-mapping-status`],
  ['GET', `${M}/registry/r/1/../../contract`],
  ['GET', `${M}/sessions/../contract`],
  ['GET', `${M}/sessions/${SESSION}/../persistence-status`],
  ['GET', `${M}/sessions/not-a-uuid`],
  ['GET', `${M}/sessions/${SESSION}x`],
  ['GET', `${M}/sessions/${SESSION.replaceAll('-', '')}`],
  ['GET', `${M}/sessions/{${SESSION}}`],
  ['GET', `${M}/sessions/${SESSION}%2Freports`],
  ['POST', `${M}/sessions/${SESSION}%2Fevaluate`],
  ['POST', `${M}/sessions/${SESSION}/evaluate/`],
  ['POST', `${M}/sessions/${SESSION}/evaluatex`],
  ['POST', `${M}/sessions/${SESSION}/explain/extra`],
  ['POST', `${M}/sessions/`],
  ['GET', `${M}/registry/`],
  ['GET', `${M}/registryx`],
  ['GET', '/api/matrix-identification-other/registry'],
  ['GET', `/x${M}/registry`],
  ['POST', `/api/matrix/identification/sessions`],
];

describe('member Matrix identification pairs (R1 J4)', () => {
  it.each(MEMBER_MATRIX_PAIRS)('accepts %s %s on the Calyx origin, as a Matrix pair only', (method, path) => {
    expect(isMemberMatrixRequest(`${base}${path}`, method)).toBe(true);
    expect(isMemberScopedRequest(`${base}${path}`, method)).toBe(true);
    expect(memberScopeOf(`${base}${path}`, method)).toBe('matrix');
    // The #858 read decision is unchanged: a Matrix pair is not a "read".
    expect(isMemberReadRequest(`${base}${path}`, method)).toBe(false);
  });

  it('keeps the two #858 read paths exactly as they were', () => {
    expect(memberScopeOf(`${base}/api/research/traits?genus=Cattleya`, 'GET')).toBe('read');
    expect(memberScopeOf(`${base}/api/literature-extraction/papers`, 'GET')).toBe('read');
    expect(memberScopeOf(`${base}/api/research/traits`, 'POST')).toBeNull();
  });

  it.each(OWNER_ONLY_MATRIX_PAIRS)('rejects the owner-only route %s %s', (method, path) => {
    expect(isMemberScopedRequest(`${base}${path}`, method)).toBe(false);
    // ...and with the other method too, unless that pair is itself a member
    // route (POST /registry is owner-only; GET /registry is the member list).
    for (const other of ['GET', 'POST']) {
      if (MEMBER_MATRIX_PAIRS.some(([m, p]) => m === other && p === path)) continue;
      expect(isMemberScopedRequest(`${base}${path}`, other), `${other} ${path}`).toBe(false);
    }
  });

  it.each(METHOD_MISMATCH)('rejects a method mismatch: %s %s', (method, path) => {
    expect(isMemberScopedRequest(`${base}${path}`, method)).toBe(false);
  });

  it.each(MATRIX_TRAVERSAL)('rejects identifier traversal / near miss: %s %s', (method, path) => {
    expect(isMemberScopedRequest(`${base}${path}`, method)).toBe(false);
  });

  it('matches the method case-insensitively, as fetch normalises it', () => {
    expect(isMemberMatrixRequest(`${base}${M}/sessions`, 'post')).toBe(true);
    expect(isMemberMatrixRequest(`${base}${M}/registry`)).toBe(true);
    expect(isMemberMatrixRequest(`${base}${M}/sessions`)).toBe(false);
  });

  it('rejects every other origin for a Matrix pair, including lookalikes', () => {
    const calyx = new URL(base);
    const other = calyx.protocol === 'https:' ? 'http:' : 'https:';
    for (const url of [
      `${calyx.protocol}//${calyx.host}.attacker.test${M}/sessions`,
      `${calyx.protocol}//attacker.test/${calyx.host}${M}/sessions`,
      `${calyx.protocol}//${calyx.hostname}:1${M}/sessions`,
      `${other}//${calyx.host}${M}/sessions`,
      `${calyx.protocol}//user:pass@${calyx.host}${M}/sessions`,
      `${calyx.protocol}//${calyx.host}@attacker.test${M}/sessions`,
      `${M}/sessions`,
      `//attacker.test${M}/sessions`,
      'https://api.inaturalist.org/api/matrix-identification/sessions',
    ]) {
      expect(isMemberScopedRequest(url, 'POST'), url).toBe(false);
    }
  });

  it('attaches the member bearer to each Matrix pair and keeps the caller\'s other headers', async () => {
    signedIn();
    for (const [method, path] of MEMBER_MATRIX_PAIRS) {
      const init = await withMemberAuth(`${base}${path}`, {
        method,
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: method === 'POST' ? '{}' : undefined,
      });
      expect(authorizationOf(init), `${method} ${path}`).toBe(`Bearer ${MEMBER_TOKEN}`);
      expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
      expect(init.credentials).toBe('include');
      expect(init.method).toBe(method);
    }
  });

  it('never attaches the member bearer to an owner-only route, a method mismatch or a traversal, and does not read the session', async () => {
    signedIn();
    for (const [method, path] of [...OWNER_ONLY_MATRIX_PAIRS, ...METHOD_MISMATCH, ...MATRIX_TRAVERSAL]) {
      const input: RequestInit = { method, body: method === 'POST' ? '{}' : undefined };
      const init = await withMemberAuth(`${base}${path}`, input);
      expect(init, `${method} ${path}`).toBe(input);
      expect(authorizationOf(init), `${method} ${path}`).toBeNull();
    }
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('never overrides a caller Authorization on a Matrix pair', async () => {
    signedIn();
    const init = await withMemberAuth(`${base}${M}/sessions`, { method: 'POST', headers: { Authorization: 'Bearer caller-owned' } });
    expect(authorizationOf(init)).toBe('Bearer caller-owned');
  });

  it('defers to an owner bearer session on a Matrix pair', async () => {
    signedIn();
    sessionStorage.setItem(OWNER_BEARER_KEY, 'owner-bearer');
    const input: RequestInit = { method: 'POST', body: '{}' };
    expect(await withMemberAuth(`${base}${M}/sessions/${SESSION}/evaluate`, input)).toBe(input);
  });

  it('attaches nothing to a Matrix pair when signed out or when identity is unavailable', async () => {
    signedOut();
    expect(authorizationOf(await withMemberAuth(`${base}${M}/registry`))).toBeNull();
    mocks.getSession.mockRejectedValue(new Error('identity down'));
    expect(authorizationOf(await withMemberAuth(`${base}${M}/registry`))).toBeNull();
  });

  it('withMemberReadAuth is the same single decision (no second, wider path)', () => {
    expect(withMemberReadAuth).toBe(withMemberAuth);
  });
});
