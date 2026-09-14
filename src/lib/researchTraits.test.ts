import { afterEach, describe, expect, it, vi } from 'vitest';
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import { CalyxApiError } from '@/lib/calyxWorkspace';
import { fetchResearchTraits, parseTraitSubject, ResearchTraitsContractError } from './researchTraits';

const subject = { rank: 'species' as const, name: 'Cattleya purpurata' };
// Transport fixture only: not a source of production scientific data.
function payload() {
  return {
    contract_version: 'oc-research-traits-v1',
    subject,
    state: 'AVAILABLE',
    distributions: [{
      trait_id: 'growth-form', label: 'Growth form', evidence_state: 'PROVISIONAL',
      buckets: [{ value: 'test-category', count: 0 }, { value: null, count: null }],
      receipts: [{ source_id: 'test-source', record_id: 'test-record', source_url: 'https://example.org/record' }],
    }],
  };
}

function respond(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('read-only Research Station trait client', () => {
  it('sends only the selected species through the canonical authenticated research client', async () => {
    const fetch = respond(payload());
    const signal = new AbortController().signal;
    const result = await fetchResearchTraits(subject, signal);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe(`${CALYX_BACKEND_BASE_URL}/api/research/traits?species=Cattleya+purpurata`);
    expect(options).toMatchObject({ credentials: 'include', signal, headers: { Accept: 'application/json' } });
    expect(options.method).toBeUndefined();
    expect(options.body).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.distributions[0]).toMatchObject({
      confidence: null, sample_size: null, unit: null,
      buckets: [{ count: 0 }, { value: null, count: null }],
    });
  });

  it('supports a genus without broadening a species query', async () => {
    const genus = { rank: 'genus' as const, name: 'Cattleya' };
    const fetch = respond({ ...payload(), subject: genus });
    await fetchResearchTraits(genus);
    expect(fetch.mock.calls[0][0]).toBe(`${CALYX_BACKEND_BASE_URL}/api/research/traits?genus=Cattleya`);
  });

  it.each(['UNKNOWN', 'UNAVAILABLE', 'WITHHELD', 'ABSENT'])('preserves %s instead of fabricating a distribution', async (state) => {
    respond({ ...payload(), state, distributions: [] });
    expect(await fetchResearchTraits(subject)).toMatchObject({ state, distributions: [] });
  });

  it.each(['AVAILABLE', 'PROVISIONAL', 'VERIFIED', 'CONTRADICTORY', 'REJECTED', 'SUPERSEDED'])('preserves source evidence state %s', async (state) => {
    const data = payload();
    data.distributions[0].evidence_state = state;
    respond(data);
    expect((await fetchResearchTraits(subject)).distributions[0].evidence_state).toBe(state);
  });

  it.each([
    { rank: 'genus', name: 'Cattleya' },
    { rank: 'species', name: 'Cattleya labiata' },
  ])('rejects a response for another scientific scope: %j', async (wrongSubject) => {
    respond({ ...payload(), subject: wrongSubject });
    await expect(fetchResearchTraits(subject)).rejects.toBeInstanceOf(ResearchTraitsContractError);
  });

  it.each([{}, null, { ...payload(), contract_version: 'unknown-version' }, { ...payload(), state: 'invented' }])('fails closed on incompatible envelopes', async (body) => {
    respond(body);
    await expect(fetchResearchTraits(subject)).rejects.toBeInstanceOf(ResearchTraitsContractError);
  });

  it.each([-1, 1.5, '12'])('rejects invalid counts without coercion: %s', async (count) => {
    const data = payload();
    respond({ ...data, distributions: [{ ...data.distributions[0], buckets: [{ value: 'test', count }] }] });
    await expect(fetchResearchTraits(subject)).rejects.toBeInstanceOf(ResearchTraitsContractError);
  });

  it.each(['javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.org/'])('rejects unsafe provenance links', async (source_url) => {
    const data = payload();
    data.distributions[0].receipts[0].source_url = source_url;
    respond(data);
    await expect(fetchResearchTraits(subject)).rejects.toBeInstanceOf(ResearchTraitsContractError);
  });

  it('does not accept withheld values, duplicate traits or unattested verified records', async () => {
    const data = payload();
    for (const body of [
      { ...data, state: 'WITHHELD' },
      { ...data, distributions: [{ ...data.distributions[0], evidence_state: 'WITHHELD' }] },
      { ...data, distributions: [data.distributions[0], data.distributions[0]] },
      { ...data, distributions: [{ ...data.distributions[0], evidence_state: 'VERIFIED', receipts: [] }] },
    ]) {
      respond(body);
      await expect(fetchResearchTraits(subject)).rejects.toBeInstanceOf(ResearchTraitsContractError);
    }
  });

  it.each([[401, 'authentication_required'], [403, 'authentication_required'], [404, 'route_unavailable'], [503, 'server_error']])('preserves HTTP %s as an error with no fallback request', async (status, kind) => {
    const fetch = respond({}, status as number);
    await expect(fetchResearchTraits(subject)).rejects.toMatchObject({ name: 'CalyxApiError', kind });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps cancellation and network failure distinct', async () => {
    const controller = new AbortController();
    const abort = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    controller.abort();
    await expect(fetchResearchTraits(subject, controller.signal)).rejects.toBe(abort);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Offline')));
    await expect(fetchResearchTraits(subject)).rejects.toBeInstanceOf(CalyxApiError);
  });

  it('validates the entered scope before making a request', () => {
    expect(parseTraitSubject('genus', ' Cattleya ')).toEqual({ rank: 'genus', name: 'Cattleya' });
    expect(parseTraitSubject('genus', subject.name)).toBeNull();
    expect(parseTraitSubject('species', 'Cattleya')).toBeNull();
    expect(parseTraitSubject('species', 'Cattleya purpurata?locality=private')).toBeNull();
  });
});
