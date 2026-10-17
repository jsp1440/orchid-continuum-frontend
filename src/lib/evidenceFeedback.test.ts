import { afterEach, describe, expect, it, vi } from 'vitest';

import defectKindCapture from './__fixtures__/evidenceFeedbackDefectKind.realBackend.json';
import {
  EVIDENCE_FEEDBACK_API_BASE,
  TRIVIAL_DEFECT_KINDS,
  defectKindApplies,
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

    expect(result.kind).toBe('case');
    if (result.kind !== 'case') throw new Error('expected the owner case response');
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

/*
 * Defect kinds, checked against REAL responses captured from the Calyx backend
 * running LOCALLY (`__fixtures__/evidenceFeedbackDefectKind.realBackend.json`,
 * SYNTHETIC inputs; see its `_meta`).
 */
type Captured = { status: number; body: Record<string, unknown> };
const D = defectKindCapture as unknown as {
  requests: Record<string, Record<string, unknown>>;
  responses: Record<string, Captured>;
};
const caseOf = (key: string) => D.responses[key].body.case as Record<string, unknown>;

describe('trivial defect kinds (backend contract)', () => {
  it('offers exactly the kinds the backend triages as auto-correctable, as short printable labels', () => {
    expect([...TRIVIAL_DEFECT_KINDS]).toEqual(['typo', 'format']);
    for (const kind of TRIVIAL_DEFECT_KINDS) {
      expect(kind.length).toBeLessThanOrEqual(100);
      expect(kind).toMatch(/^[\x20-\x7e]+$/);
    }
    expect(caseOf('submit_lexicon_typo')).toMatchObject({ defect_kind: 'typo', disposition: 'auto_correctable', review_lane: 'deterministic' });
    expect(caseOf('submit_lexicon_format')).toMatchObject({ defect_kind: 'format', disposition: 'auto_correctable', review_lane: 'deterministic' });
    // "Other / not sure" (no defect kind) and any scientific object stay with review.
    expect(caseOf('submit_lexicon_not_sure')).toMatchObject({ defect_kind: null, disposition: 'insufficient_evidence', review_lane: 'scientific' });
    expect(caseOf('submit_matrix_typo_label')).toMatchObject({ disposition: 'needs_scientific_review', review_lane: 'scientific' });
    // The backend refuses a label that is not printable.
    expect(D.responses.submit_lexicon_control_char).toMatchObject({ status: 422, body: { detail: { code: 'DEFECT_KIND_INVALID_CHARACTERS' } } });
  });

  it('applies only to lexicon corrections', () => {
    expect(defectKindApplies('lexicon', 'suggest_correction')).toBe(true);
    expect(defectKindApplies('lexicon', 'report_problem')).toBe(false);
    expect(defectKindApplies('lexicon', 'challenge')).toBe(false);
    expect(defectKindApplies('matrix_identification', 'suggest_correction')).toBe(false);
    expect(defectKindApplies('taxonomy', 'suggest_correction')).toBe(false);
  });

  it('sends the defect kind in the same body the backend accepted', async () => {
    const sent = D.requests.lexicon_typo;
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(D.responses.register_lexicon_typo.body, 201))
      .mockResolvedValueOnce(jsonResponse(D.responses.submit_lexicon_typo.body, 201));

    const result = await submitEvidenceFeedback({
      objectId: String(sent.object_id),
      objectType: 'lexicon',
      objectPayload: (D.responses.register_lexicon_typo.body.payload as Record<string, unknown>),
      pageContext: String(sent.page_context),
      feedbackClass: 'suggest_correction',
      statement: String(sent.statement),
      proposedReplacement: String(sent.proposed_replacement),
      defectKind: 'typo',
    });

    expect(JSON.parse(String((fetchSpy.mock.calls[1]?.[1] as RequestInit).body))).toEqual(sent);
    expect(result.kind).toBe('case');
    if (result.kind !== 'case') throw new Error('expected the owner case response');
    expect(result.case).toMatchObject({ disposition: 'auto_correctable', status: 'pending_review' });
  });
});
