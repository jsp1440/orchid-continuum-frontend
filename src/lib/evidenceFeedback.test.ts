import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EVIDENCE_FEEDBACK_API_BASE,
  fetchEvidenceFeedbackStatus,
  submitEvidenceFeedback,
} from './evidenceFeedback';

const VERSION_HASH = 'a'.repeat(64);

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('evidence feedback client', () => {
  it('binds a submission to the exact object version returned by registration', async () => {
    const feedbackCase = {
      case_id: 'ef_case_1',
      object_id: 'lexicon:flower',
      object_version_hash: VERSION_HASH,
      object_type: 'lexicon',
      page_context: '/lexicon/flower',
      feedback_class: 'report_problem',
      statement: 'The definition needs a source.',
      disposition: 'needs_scientific_review',
      status: 'pending_review',
      review_lane: 'scientific',
      created_at: '2026-09-26T00:00:00Z',
      updated_at: '2026-09-26T00:00:00Z',
      proposed_replacement: null,
      citation: null,
      resolution: null,
      resulting_version_hash: null,
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        object_id: 'lexicon:flower',
        object_type: 'lexicon',
        version_hash: VERSION_HASH,
        payload: { preferred_term: 'Flower' },
        created_at: '2026-09-26T00:00:00Z',
        previous_version_hash: null,
      }, 201))
      .mockResolvedValueOnce(jsonResponse({ created: true, duplicate_of: null, case: feedbackCase }, 201));

    const result = await submitEvidenceFeedback({
      objectId: 'lexicon:flower',
      objectType: 'lexicon',
      objectPayload: { preferred_term: 'Flower' },
      pageContext: '/lexicon/flower',
      feedbackClass: 'report_problem',
      statement: 'The definition needs a source.',
    });

    expect(result.case.case_id).toBe('ef_case_1');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(`${EVIDENCE_FEEDBACK_API_BASE}/objects`);
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(`${EVIDENCE_FEEDBACK_API_BASE}/cases`);
    const registerInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const submitInit = fetchSpy.mock.calls[1]?.[1] as RequestInit;
    expect(registerInit.credentials).toBe('include');
    expect(JSON.parse(String(registerInit.body))).toEqual({
      object_id: 'lexicon:flower',
      object_type: 'lexicon',
      payload: { preferred_term: 'Flower' },
    });
    expect(JSON.parse(String(submitInit.body))).toMatchObject({
      object_id: 'lexicon:flower',
      object_version_hash: VERSION_HASH,
      statement: 'The definition needs a source.',
      proposed_replacement: null,
      citation: null,
    });
  });

  it('accepts the intentionally limited submitter status response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      case_id: 'ef_case_1',
      status: 'resolved',
      disposition: 'correction_accepted',
      resolution: 'Accepted after review.',
      resulting_version_hash: 'b'.repeat(64),
    }));

    await expect(fetchEvidenceFeedbackStatus('ef_case_1')).resolves.toMatchObject({
      status: 'resolved',
      resolution: 'Accepted after review.',
    });
  });

  it('preserves structured backend error codes without exposing response bodies', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      detail: { code: 'AUTHENTICATED_SUBJECT_REQUIRED' },
    }, 401));

    await expect(fetchEvidenceFeedbackStatus('ef_case_1')).rejects.toEqual(
      expect.objectContaining({
        status: 401,
        code: 'AUTHENTICATED_SUBJECT_REQUIRED',
      }),
    );
  });
});
