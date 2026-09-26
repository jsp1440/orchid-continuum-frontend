/**
 * Vision-Lexicon concept evidence client, pinned to a real backend payload.
 *
 * `__fixtures__/visionEvidence.realBackend.json` was captured verbatim from
 * jsp1440/orchid-calyx-backend origin/main via FastAPI TestClient (see its
 * `_capture` note). Only `fetch` is mocked; the synthetic bodies below are
 * labelled error-state shapes, never evidence.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import realBackend from './__fixtures__/visionEvidence.realBackend.json';
import {
  fetchVisionEvidence,
  isVisionConceptId,
  parseVisionEvidenceSummary,
  visionEvidenceUrl,
} from './visionEvidence';

function jsonResponse(body: unknown, status = 200, contentType = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => body,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('visionEvidence client', () => {
  it('builds the public evidence route on the Calyx backend origin', () => {
    const url = visionEvidenceUrl(realBackend.populated.concept_id);
    expect(url).toMatch(/\/api\/vision-lexicon\/lexicon\/concepts\/00000000-0000-0000-0000-000000000001\/vision-evidence$/);
  });

  it('does not request anything for a non-UUID concept id (the backend rejects it with 422)', async () => {
    expect(realBackend.invalid_concept_id.status).toBe(422);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(isVisionConceptId('resupination')).toBe(false);
    expect(await fetchVisionEvidence('resupination')).toEqual({ state: 'not_applicable' });
    expect(await fetchVisionEvidence(undefined)).toEqual({ state: 'not_applicable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses the real populated payload and passes values through unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(realBackend.populated.body));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchVisionEvidence(realBackend.populated.concept_id);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('omit');
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') return;
    expect(result.summary).toEqual(realBackend.populated.body);
    expect(result.summary.review_state).toBe('MACHINE_GENERATED');
    expect(result.summary.reference_sets).toHaveLength(1);
    expect(result.summary.reference_images).toHaveLength(1);
    expect(result.summary.visual_assets).toHaveLength(0);
    expect(result.summary.limitations).toEqual(['Uncalibrated image']);
  });

  it('reports the real empty payload as empty, not as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(realBackend.empty.body)));
    const result = await fetchVisionEvidence(realBackend.empty.concept_id);
    expect(result.state).toBe('empty');
  });

  it('treats 5xx and network failures as unavailable, surfacing a backend code verbatim', async () => {
    // Synthetic error-state shape (not evidence).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: { code: 'SYNTHETIC_TEST_CODE' } }, 503)));
    expect(await fetchVisionEvidence(realBackend.empty.concept_id)).toMatchObject({
      state: 'unavailable', status: 503, code: 'SYNTHETIC_TEST_CODE',
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await fetchVisionEvidence(realBackend.empty.concept_id)).toMatchObject({ state: 'unavailable', status: 0 });
  });

  it('fails closed on malformed bodies', async () => {
    const id = realBackend.populated.concept_id;
    const { reference_sets: _dropped, ...missingField } = realBackend.populated.body;
    const cases: unknown[] = [
      missingField,
      { ...realBackend.populated.body, review_state: '' },
      { ...realBackend.populated.body, limitations: [1] },
      { ...realBackend.populated.body, reference_images: 'x' },
      { ...realBackend.populated.body, concept_id: realBackend.empty.concept_id },
      [],
      null,
    ];
    for (const body of cases) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));
      expect((await fetchVisionEvidence(id)).state).toBe('malformed');
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse('<html></html>', 200, 'text/html')));
    expect((await fetchVisionEvidence(id)).state).toBe('malformed');
    expect(parseVisionEvidenceSummary(realBackend.populated.body, id).ok).toBe(true);
  });
});
