// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Member evidence feedback (Release 1 ledger: "Members submit, owner reviews").
 *
 * Response bodies come from `__fixtures__/evidenceFeedbackMember.realBackend.json`:
 * REAL responses from the Calyx backend running LOCALLY (FastAPI TestClient,
 * file store; only the Supabase user lookup was stubbed; SYNTHETIC inputs; see
 * its `_meta`). The member session below is a synthetic test shape; no real
 * token is used.
 */

const MEMBER_TOKEN = 'synthetic-member-access-token';
const OWNER_BEARER_KEY = 'calyx_owner_session_bearer_v1';

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: mocks.getSession } } }));

import captured from './__fixtures__/evidenceFeedbackMember.realBackend.json';
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import {
  EVIDENCE_FEEDBACK_API_BASE,
  EVIDENCE_FEEDBACK_CODES,
  EvidenceFeedbackApiError,
  MEMBER_ALREADY_REPORTED,
  fetchEvidenceFeedbackStatus,
  parseFeedbackSubmission,
  submitEvidenceFeedback,
} from './evidenceFeedback';
import { isMemberFeedbackRequest, memberScopeOf } from './memberReadAuth';

type Captured = { status: number; body: Record<string, unknown>; retry_after?: string };
const C = captured as unknown as { _meta: Record<string, string>; responses: Record<string, Captured> };
const R = C.responses;
const base = CALYX_BACKEND_BASE_URL;
const F = '/api/evidence-feedback';
const OWN_CASE = String(R.member_submit_created.body.case_id);

function signedIn() {
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: MEMBER_TOKEN } }, error: null });
}

function respond(entry: Captured): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (entry.retry_after) headers.set('Retry-After', entry.retry_after);
  return new Response(JSON.stringify(entry.body), { status: entry.status, headers });
}

function stubFetch(...entries: Captured[]) {
  const fetchMock = vi.fn();
  for (const entry of entries) fetchMock.mockResolvedValueOnce(respond(entry));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const authorizationOf = (init: unknown) => new Headers((init as RequestInit | undefined)?.headers).get('Authorization');

const INPUT = {
  objectId: 'lexicon:SYNTHETIC-labellum',
  objectType: 'lexicon' as const,
  objectPayload: { preferred_term: 'Labellum (SYNTHETIC)' },
  pageContext: '/lexicon/SYNTHETIC-labellum',
  feedbackClass: 'suggest_correction' as const,
  statement: 'SYNTHETIC: petal is misspelled.',
};

beforeEach(() => {
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mocks.getSession.mockReset();
  sessionStorage.clear();
});

describe('the captured backend contract', () => {
  it('is a real local capture, never production, with no member identity in it', () => {
    expect(C._meta.what).toMatch(/LOCALLY/);
    expect(C._meta.backend_sha).toMatch(/^[0-9a-f]{40}$/);
    const text = JSON.stringify(R);
    for (const identity of ['aaaaaaaa-aaaa', 'bbbbbbbb-bbbb', 'member:', 'submitter_id']) {
      expect(text.includes(identity), identity).toBe(false);
    }
  });
});

describe('which requests carry the member token', () => {
  it.each([
    ['POST', `${F}/objects`],
    ['POST', `${F}/cases`],
    ['GET', `${F}/cases/${OWN_CASE}`],
    ['post', `${F}/cases`],
  ])('accepts %s %s as a member feedback pair', (method, path) => {
    expect(memberScopeOf(`${base}${path}`, method)).toBe('feedback');
    expect(isMemberFeedbackRequest(`${base}${path}`, method)).toBe(true);
  });

  it.each([
    ['GET', `${F}/objects`],
    ['GET', `${F}/cases`],
    ['POST', `${F}/cases/${OWN_CASE}`],
    ['POST', `${F}/cases/${OWN_CASE}/accept-trivial`],
    ['GET', `${F}/cases/${OWN_CASE}/accept-trivial`],
    ['GET', `${F}/cases/efc-123`],
    ['GET', `${F}/cases/${OWN_CASE.toUpperCase()}`],
    ['GET', `${F}/cases/ef_case_1`],
    ['GET', `${F}/cases/${OWN_CASE}%2F..%2Freview`],
    ['GET', `${F}/cases/${OWN_CASE}/`],
    ['GET', `${F}/review/cases`],
    ['GET', `${F}/review/cases/${OWN_CASE}`],
    ['POST', `${F}/review/cases/${OWN_CASE}/decision`],
    ['POST', `${F}/objects/`],
    ['POST', '/evidence-feedback/cases'],
    ['PUT', `${F}/cases`],
  ])('rejects %s %s', (method, path) => {
    expect(memberScopeOf(`${base}${path}`, method)).toBeNull();
  });

  it('rejects every other origin for a feedback pair', () => {
    const calyx = new URL(base);
    for (const url of [
      `${calyx.protocol}//${calyx.host}.attacker.test${F}/cases`,
      `${calyx.protocol}//user:pass@${calyx.host}${F}/cases`,
      `${F}/cases`,
      'https://api.inaturalist.org/api/evidence-feedback/cases',
    ]) {
      expect(memberScopeOf(url, 'POST'), url).toBeNull();
    }
  });
});

describe('member submission', () => {
  it('sends the member bearer on registration and submission and returns the receipt', async () => {
    signedIn();
    const fetchMock = stubFetch(R.member_register_object, R.member_submit_created);
    const result = await submitEvidenceFeedback(INPUT);

    expect(result).toEqual({ kind: 'receipt', created: true, case_id: OWN_CASE, status: 'pending_review' });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `${EVIDENCE_FEEDBACK_API_BASE}/objects`,
      `${EVIDENCE_FEEDBACK_API_BASE}/cases`,
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(authorizationOf(init)).toBe(`Bearer ${MEMBER_TOKEN}`);
      expect((init as RequestInit).credentials).toBe('include');
    }
    const sent = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(sent.object_version_hash).toBe(R.member_register_object.body.version_hash);
  });

  it('a duplicate of someone else\'s report yields no case id and nothing else', async () => {
    signedIn();
    stubFetch(R.member_b_register_object, R.member_b_submit_duplicate_of_a);
    const result = await submitEvidenceFeedback(INPUT);
    expect(result).toEqual({ kind: 'receipt', created: false, case_id: null, status: MEMBER_ALREADY_REPORTED });
    expect(JSON.stringify(result)).not.toContain('efc-');
  });

  it('a member resubmitting their own text gets their own case back', async () => {
    signedIn();
    stubFetch(R.member_register_object, R.member_submit_own_duplicate);
    expect(await submitEvidenceFeedback(INPUT)).toEqual({
      kind: 'receipt',
      created: false,
      case_id: OWN_CASE,
      status: 'pending_review',
    });
  });

  it('keeps only the three receipt fields, whatever else a response carries', () => {
    const parsed = parseFeedbackSubmission({
      created: false,
      case_id: null,
      status: MEMBER_ALREADY_REPORTED,
      submitter_id: 'SYNTHETIC-other-member',
      statement: 'SYNTHETIC other text',
    });
    expect(parsed).toEqual({ kind: 'receipt', created: false, case_id: null, status: MEMBER_ALREADY_REPORTED });
  });

  it.each([
    [{ created: true, case_id: null, status: 'pending_review' }],
    [{ created: true, case_id: null, status: MEMBER_ALREADY_REPORTED }],
    [{ created: false, case_id: 'efc-x', status: 'published' }],
    [{ case_id: 'efc-x', status: 'pending_review' }],
    [{ created: true, case: { status: 'pending_review' } }],
    [null],
  ])('fails closed on a malformed submission response %#', (body) => {
    expect(() => parseFeedbackSubmission(body)).toThrowError(EvidenceFeedbackApiError);
    expect(() => parseFeedbackSubmission(body)).toThrowError('INVALID_RESPONSE');
  });

  it('refuses to submit against a registration without a real version hash', async () => {
    signedIn();
    const fetchMock = stubFetch({ status: 201, body: { object_id: 'x', object_type: 'lexicon', version_hash: 'not-a-hash' } });
    await expect(submitEvidenceFeedback(INPUT)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads the member\'s own status with the member bearer', async () => {
    signedIn();
    const fetchMock = stubFetch(R.member_status_own_case);
    await expect(fetchEvidenceFeedbackStatus(OWN_CASE)).resolves.toMatchObject({ case_id: OWN_CASE, status: 'pending_review' });
    expect(authorizationOf(fetchMock.mock.calls[0][1])).toBe(`Bearer ${MEMBER_TOKEN}`);
  });

  it('defers to an owner bearer session held by this tab (owner flow unchanged)', async () => {
    signedIn();
    sessionStorage.setItem(OWNER_BEARER_KEY, 'owner-bearer');
    const fetchMock = stubFetch(R.member_register_object, R.member_submit_created);
    await submitEvidenceFeedback(INPUT);
    for (const [, init] of fetchMock.mock.calls) {
      expect(authorizationOf(init)).toBeNull();
      expect((init as RequestInit).credentials).toBe('include');
    }
  });

  it('signed out, sends no Authorization header and keeps the cookie path', async () => {
    const fetchMock = stubFetch(R.member_register_object, R.anonymous_submit);
    await expect(submitEvidenceFeedback(INPUT)).rejects.toMatchObject({ status: 401 });
    for (const [, init] of fetchMock.mock.calls) {
      expect(authorizationOf(init)).toBeNull();
      expect((init as RequestInit).credentials).toBe('include');
    }
  });
});

describe('member refusal states', () => {
  it('surfaces the kill switch as MEMBER_FEEDBACK_DISABLED', async () => {
    signedIn();
    stubFetch(R.member_register_object, R.member_submit_feature_disabled);
    await expect(submitEvidenceFeedback(INPUT)).rejects.toMatchObject({
      status: 403,
      code: EVIDENCE_FEEDBACK_CODES.memberFeedbackDisabled,
    });
  });

  it('surfaces the rate limit with the backend Retry-After', async () => {
    signedIn();
    stubFetch(R.member_register_object, R.member_submit_rate_limited);
    const error = await submitEvidenceFeedback(INPUT).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(EvidenceFeedbackApiError);
    expect(error).toMatchObject({ status: 429, code: EVIDENCE_FEEDBACK_CODES.memberRateLimited });
    expect((error as EvidenceFeedbackApiError).retryAfterSeconds).toBe(Number(R.member_submit_rate_limited.retry_after));
  });

  it('another member\'s case reads as not found', async () => {
    signedIn();
    stubFetch(R.member_b_status_of_a_case);
    await expect(fetchEvidenceFeedbackStatus(OWN_CASE)).rejects.toMatchObject({ status: 404, code: 'CASE_NOT_FOUND' });
  });

  it('ignores a Retry-After that is not a positive integer', async () => {
    signedIn();
    stubFetch(R.member_register_object, { ...R.member_submit_rate_limited, retry_after: 'soon' });
    const error = (await submitEvidenceFeedback(INPUT).catch((reason: unknown) => reason)) as EvidenceFeedbackApiError;
    expect(error.retryAfterSeconds).toBeNull();
  });
});

describe('owner review: who registered the snapshot', () => {
  it('parses registered_by_role from the real review detail and labels it plainly', async () => {
    const { createEvidenceFeedbackReviewClient, registeredByText } = await import('./evidenceFeedbackReview');
    stubFetch(R.owner_review_detail_registered_by);
    const detail = await createEvidenceFeedbackReviewClient().getCase(OWN_CASE);
    expect(detail.object_version?.registered_by_role).toBe('member');
    expect(registeredByText('member')).toMatch(/member session .*not verified content/);
    expect(registeredByText('owner_session')).toBe('The owner session');
    expect(registeredByText('api_key')).toBe('The backend API key');
    expect(registeredByText(null)).toBe('Not recorded');
    expect(registeredByText('SYNTHETIC-unknown')).toBe('Not recorded');
  });
});
