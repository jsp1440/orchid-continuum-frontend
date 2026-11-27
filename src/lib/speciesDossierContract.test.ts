import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SPECIES_DOSSIER_RENDERED_SECTIONS,
  SpeciesDossierRequestError,
  dossierFailureReason,
  fetchSpeciesDossier,
  parseSpeciesDossierEnvelope,
} from './speciesDossier';

/**
 * Boundary contract of the species dossier client.
 *
 * The fixture is synthetic ("Exemplum fictum" is not a taxon). Its keys follow the backend's
 * SpeciesDossierEnvelope, DossierSection and EvidenceReceipt models (app/species_dossier/models.py),
 * including the fields this client's type does not declare, and the error bodies follow the
 * dossier route's 404 / 409 / 503 answers (app/species_dossier/routes.py).
 */

function section(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    state: 'unavailable',
    summary: null,
    items: [],
    receipts: [],
    unavailable_reason: 'Synthetic fixture: no evidence linked.',
    ...overrides,
  };
}

function backendEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contract_version: 'oc-species-dossier-v1',
    generated_at: '2026-01-01T00:00:00Z',
    taxon_id: 'synthetic-1',
    display_name: 'Exemplum fictum',
    full_scientific_name: 'Exemplum fictum Auct.',
    accepted_name: 'Exemplum fictum',
    identity: {
      taxon_id: 'synthetic-1',
      display_name: 'Exemplum fictum',
      full_scientific_name: 'Exemplum fictum Auct.',
      accepted_name: 'Exemplum fictum',
      authorship: 'Auct.',
      rank: 'species',
      genus: 'Exemplum',
      specific_epithet: 'fictum',
      taxonomic_status: null,
      synonyms: [],
    },
    nomenclature: section({
      state: 'provisional',
      summary: 'Synthetic summary.',
      unavailable_reason: null,
      items: [{ evidence_type: 'synthetic_note', excerpt: 'Synthetic excerpt.' }],
      receipts: [
        {
          source_id: 'synthetic-source',
          source_name: 'Synthetic source',
          source_url: null,
          record_id: null,
          retrieved_at: null,
          license: null,
          attribution: null,
          evidence_state: 'provisional',
          confidence: null,
          notes: null,
        },
      ],
    }),
    protologue: section(),
    type_material: section(),
    historical_media: section(),
    living_media: section(),
    morphology: section(),
    distribution: section(),
    ecology: section(),
    phenology: section(),
    pollinators: section(),
    mycorrhizae: section(),
    conservation: section(),
    literature: section(),
    cultivation: section(),
    knowledge_graph: section(),
    calyx_narrative: section(),
    research_gaps: section(),
    atlas: {
      contract_version: 'oc-species-atlas-v1',
      taxon_id: 'synthetic-1',
      generated_at: '2026-01-01T00:00:00Z',
      layers: [],
      unavailable_layers: [],
      provenance: [],
    },
    atlas_summary: section(),
    identification_matrix: section(),
    freshness: { state: 'unknown', as_of: null, source: null },
    unavailable_sections: ['protologue'],
    related_species: [],
    matrix_url: '/orchid-identification',
    partner_references: [],
    provenance: [],
    graph_identity: null,
    evidence_links: null,
    ...overrides,
  };
}

describe('parseSpeciesDossierEnvelope', () => {
  it('accepts a backend-shaped envelope unchanged, extra backend fields included', () => {
    const payload = backendEnvelope();
    const before = JSON.parse(JSON.stringify(payload));
    const parsed = parseSpeciesDossierEnvelope(payload);
    expect(parsed).toBe(payload);
    expect(parsed).toEqual(before);
    for (const key of ['freshness', 'unavailable_sections', 'atlas_summary', 'identification_matrix', 'evidence_links']) {
      expect(parsed as unknown as Record<string, unknown>).toHaveProperty(key);
    }
  });

  it('accepts an unknown additive key', () => {
    expect(parseSpeciesDossierEnvelope(backendEnvelope({ some_future_field: { a: 1 } }))).not.toBeNull();
  });

  it.each(['available', 'provisional', 'conflicting', 'modeled', 'inferred', 'unavailable'])(
    'accepts the section state %s',
    (state) => {
      expect(parseSpeciesDossierEnvelope(backendEnvelope({ ecology: section({ state }) }))).not.toBeNull();
    },
  );

  it('rejects a body that is not an object', () => {
    for (const payload of [null, undefined, 'dossier', 7, [], [backendEnvelope()]]) {
      expect(parseSpeciesDossierEnvelope(payload)).toBeNull();
    }
  });

  it('rejects a wrong or missing contract_version', () => {
    expect(parseSpeciesDossierEnvelope(backendEnvelope({ contract_version: 'oc-species-dossier-v2' }))).toBeNull();
    expect(parseSpeciesDossierEnvelope(backendEnvelope({ contract_version: 'oc-species-atlas-v1' }))).toBeNull();
    const missing = backendEnvelope();
    delete missing.contract_version;
    expect(parseSpeciesDossierEnvelope(missing)).toBeNull();
  });

  it('rejects an identity without a taxon_id or accepted_name', () => {
    const identity = backendEnvelope().identity as Record<string, unknown>;
    expect(parseSpeciesDossierEnvelope(backendEnvelope({ identity: null }))).toBeNull();
    expect(parseSpeciesDossierEnvelope(backendEnvelope({ identity: { ...identity, taxon_id: '' } }))).toBeNull();
    expect(parseSpeciesDossierEnvelope(backendEnvelope({ identity: { ...identity, taxon_id: 7 } }))).toBeNull();
    expect(parseSpeciesDossierEnvelope(backendEnvelope({ identity: { ...identity, accepted_name: '  ' } }))).toBeNull();
  });

  it.each([...SPECIES_DOSSIER_RENDERED_SECTIONS])('rejects an envelope whose %s section is missing', (key) => {
    const payload = backendEnvelope();
    delete payload[key];
    expect(parseSpeciesDossierEnvelope(payload)).toBeNull();
    expect(parseSpeciesDossierEnvelope(backendEnvelope({ [key]: null }))).toBeNull();
  });

  it('rejects a section state outside the contract enum instead of relabelling it', () => {
    for (const state of ['verified', 'Available', '', null, undefined, 1]) {
      expect(parseSpeciesDossierEnvelope(backendEnvelope({ morphology: section({ state }) }))).toBeNull();
    }
  });

  it('rejects a section whose items or receipts are not arrays of objects', () => {
    for (const bad of [null, undefined, {}, 'none', [null], ['text']]) {
      expect(parseSpeciesDossierEnvelope(backendEnvelope({ literature: section({ receipts: bad }) }))).toBeNull();
      expect(parseSpeciesDossierEnvelope(backendEnvelope({ literature: section({ items: bad }) }))).toBeNull();
    }
  });

  it('rejects partner_references that the page could not read', () => {
    expect(parseSpeciesDossierEnvelope(backendEnvelope({ partner_references: null }))).toBeNull();
    expect(parseSpeciesDossierEnvelope(backendEnvelope({ partner_references: [null] }))).toBeNull();
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function failure(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the request to fail');
}

describe('fetchSpeciesDossier', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a valid envelope as the backend sent it', async () => {
    const body = backendEnvelope();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, body));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchSpeciesDossier('synthetic-1')).toEqual(body);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/platform\/species\/synthetic-1\/dossier$/);
  });

  it('carries 404 as not_found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(404, { detail: 'No canonical taxon record exists for this identifier.' }),
      ),
    );
    const error = await failure(() => fetchSpeciesDossier('synthetic-404'));
    expect(error).toBeInstanceOf(SpeciesDossierRequestError);
    expect(error).toMatchObject({ status: 404, invalidContract: false, errorCode: null });
    expect(dossierFailureReason(error)).toBe('not_found');
  });

  it('carries a foreign-id-space 404 as not_found with the backend error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(404, { detail: { error: 'foreign_id_space', id_space: 'synthetic', explanation: 'synthetic' } }),
      ),
    );
    const error = await failure(() => fetchSpeciesDossier('other:1'));
    expect(error).toMatchObject({ status: 404, errorCode: 'foreign_id_space' });
    expect(dossierFailureReason(error)).toBe('not_found');
  });

  it('carries a 409 identity_mismatch as identity_mismatch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(409, {
          detail: {
            error: 'identity_mismatch',
            id_space: 'synthetic',
            taxon_id: 'synthetic-1',
            requested_name: 'Exemplum alterum',
            requested_name_is_plain_taxon_name: true,
            record_name: 'Exemplum fictum',
            explanation: 'synthetic',
          },
        }),
      ),
    );
    const error = await failure(() => fetchSpeciesDossier('synthetic-1'));
    expect(error).toMatchObject({ status: 409, errorCode: 'identity_mismatch', invalidContract: false });
    expect(dossierFailureReason(error)).toBe('identity_mismatch');
  });

  it('does not read a 409 without the identity_mismatch code as a mismatch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(409, { detail: 'conflict' })));
    expect(dossierFailureReason(await failure(() => fetchSpeciesDossier('synthetic-1')))).toBe(
      'service_unavailable',
    );
  });

  it('carries 503 and a rejected fetch as service_unavailable, never as absence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(503, { detail: 'synthetic service unavailable' })),
    );
    const unavailable = await failure(() => fetchSpeciesDossier('synthetic-1'));
    expect(unavailable).toMatchObject({ status: 503, invalidContract: false });
    expect(dossierFailureReason(unavailable)).toBe('service_unavailable');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const network = await failure(() => fetchSpeciesDossier('synthetic-1'));
    expect(network).toBeInstanceOf(TypeError);
    expect(dossierFailureReason(network)).toBe('service_unavailable');
  });

  it('rejects a malformed 200 as invalid_contract', async () => {
    const broken = backendEnvelope();
    delete broken.ecology;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, broken)));
    const error = await failure(() => fetchSpeciesDossier('synthetic-1'));
    expect(error).toBeInstanceOf(SpeciesDossierRequestError);
    expect(error).toMatchObject({ status: 200, invalidContract: true });
    expect(dossierFailureReason(error)).toBe('invalid_contract');
  });

  it('rejects a 200 that is not JSON as invalid_contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>synthetic gateway page</html>', { status: 200 })),
    );
    const error = await failure(() => fetchSpeciesDossier('synthetic-1'));
    expect(error).toMatchObject({ status: 200, invalidContract: true });
    expect(dossierFailureReason(error)).toBe('invalid_contract');
  });

  it('keeps a fully received 200 whose body is empty or truncated JSON as invalid_contract', async () => {
    for (const body of ['', '{"contract_version":"oc-species-dossier-v1","identity":']) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
      const error = await failure(() => fetchSpeciesDossier('synthetic-1'));
      expect(error).toMatchObject({ status: 200, invalidContract: true });
      expect(dossierFailureReason(error)).toBe('invalid_contract');
    }
  });

  it('reads a 200 whose body read fails mid-stream as service_unavailable, not invalid_contract', async () => {
    // The status line arrived but the body did not: nothing was received that could be judged
    // against the contract, so this is a transport failure, not a contract violation.
    const readFailure = new TypeError('synthetic: connection lost while reading the body');
    const brokenBody = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"contract_version":"oc-species-dossier-v1",'));
        },
        pull(controller) {
          controller.error(readFailure);
        },
      });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () =>
        new Response(brokenBody(), { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    );
    const error = await failure(() => fetchSpeciesDossier('synthetic-1'));
    expect(error).toBe(readFailure);
    expect(error).not.toBeInstanceOf(SpeciesDossierRequestError);
    expect(dossierFailureReason(error)).toBe('service_unavailable');
  });
});
