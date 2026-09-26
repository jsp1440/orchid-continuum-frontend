import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupSpeciesById } from './ocBackend';
import {
  CalyxRequestError,
  dossierRecordState,
  fetchSpeciesDossier,
  isCanonicalTaxonNotFound,
  requestedTaxonLabel,
  resolveDossierForSubject,
  type FederationResolveResult,
} from './speciesDossier';

// Error bodies are the shapes orchid-calyx-backend app/species_dossier/routes.py
// raises (404 "No canonical taxon record ...", 503 "... unavailable.") and the
// framework's bare route-miss body; they are synthetic error-state shapes.
const NO_CANONICAL_RECORD = JSON.stringify({
  detail: 'No canonical taxon record exists for this identifier.',
});
const SERVICE_UNAVAILABLE = JSON.stringify({ detail: 'Species dossier service is unavailable.' });
const ROUTE_MISS = JSON.stringify({ detail: 'Not Found' });

function unresolved(): FederationResolveResult {
  return {
    status: 'unresolved',
    incoming_name: 'Notagenus fakeus',
    matched_name: null,
    match_state: 'none',
    taxon_id: null,
    canonical_dossier_url: null,
    candidates: [],
    partner_slug: null,
    reciprocal_source_url: null,
    explanation: 'No canonical taxon matches the supplied identifier.',
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isCanonicalTaxonNotFound', () => {
  it('is true only for the dossier handler’s own 404', () => {
    expect(isCanonicalTaxonNotFound(new CalyxRequestError(404, NO_CANONICAL_RECORD))).toBe(true);
    // A route the server does not have says nothing about the taxon.
    expect(isCanonicalTaxonNotFound(new CalyxRequestError(404, ROUTE_MISS))).toBe(false);
    expect(isCanonicalTaxonNotFound(new CalyxRequestError(404, '<html>404</html>'))).toBe(false);
    expect(isCanonicalTaxonNotFound(new CalyxRequestError(503, SERVICE_UNAVAILABLE))).toBe(false);
    expect(isCanonicalTaxonNotFound(new Error('404'))).toBe(false);
    expect(isCanonicalTaxonNotFound(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('is what fetchSpeciesDossier throws for a 404 from the dossier route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(NO_CANONICAL_RECORD, { status: 404 })),
    );
    const error = await fetchSpeciesDossier('Notagenus fakeus').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CalyxRequestError);
    expect((error as CalyxRequestError).status).toBe(404);
    expect(isCanonicalTaxonNotFound(error)).toBe(true);
  });
});

describe('resolveDossierForSubject: not found vs unavailable', () => {
  it('is not found for an opaque id the dossier route has no record for', async () => {
    const deps = {
      fetchDossier: vi.fn().mockRejectedValue(new CalyxRequestError(404, NO_CANONICAL_RECORD)),
      resolveSpecies: vi.fn(),
    };
    expect(await resolveDossierForSubject('987654321', null, deps)).toEqual({ state: 'not_found' });
    expect(deps.resolveSpecies).not.toHaveBeenCalled();
  });

  it('is not found for a name neither the route id nor the resolver knows', async () => {
    const deps = {
      fetchDossier: vi.fn().mockRejectedValue(new CalyxRequestError(404, NO_CANONICAL_RECORD)),
      resolveSpecies: vi.fn().mockResolvedValue(unresolved()),
    };
    expect(await resolveDossierForSubject('Notagenus fakeus', 'Notagenus fakeus', deps)).toEqual({
      state: 'not_found',
    });
  });

  it('is unavailable, never not found, when the route lookup did not answer', async () => {
    for (const failure of [
      new CalyxRequestError(503, SERVICE_UNAVAILABLE),
      new CalyxRequestError(404, ROUTE_MISS),
      new TypeError('Failed to fetch'),
    ]) {
      const deps = {
        fetchDossier: vi.fn().mockRejectedValue(failure),
        resolveSpecies: vi.fn().mockResolvedValue(unresolved()),
      };
      expect(await resolveDossierForSubject('Notagenus fakeus', 'Notagenus fakeus', deps)).toEqual({
        state: 'unavailable',
      });
      expect(await resolveDossierForSubject('987654321', null, deps)).toEqual({ state: 'unavailable' });
    }
  });

  it('is unavailable when the resolver did not answer', async () => {
    const deps = {
      fetchDossier: vi.fn().mockRejectedValue(new CalyxRequestError(404, NO_CANONICAL_RECORD)),
      resolveSpecies: vi.fn().mockRejectedValue(new CalyxRequestError(503, SERVICE_UNAVAILABLE)),
    };
    expect(await resolveDossierForSubject('Notagenus fakeus', 'Notagenus fakeus', deps)).toEqual({
      state: 'unavailable',
    });
  });
});

describe('dossierRecordState', () => {
  it('is found when any source holds a record', () => {
    expect(dossierRecordState({ species: 'found', dossier: null })).toBe('found');
    expect(dossierRecordState({ species: 'found', dossier: 'not_found' })).toBe('found');
    expect(dossierRecordState({ species: 'unavailable', dossier: 'resolved' })).toBe('found');
    expect(dossierRecordState({ species: 'not_found', dossier: 'ambiguous' })).toBe('found');
    expect(dossierRecordState({ species: 'found', dossier: 'conflict' })).toBe('found');
  });

  it('is not found only when every source answered that it has none', () => {
    expect(dossierRecordState({ species: 'not_found', dossier: 'not_found' })).toBe('not_found');
    expect(dossierRecordState({ species: 'unavailable', dossier: 'not_found' })).toBe('unavailable');
    expect(dossierRecordState({ species: 'not_found', dossier: 'unavailable' })).toBe('unavailable');
    expect(dossierRecordState({ species: 'unavailable', dossier: 'unavailable' })).toBe('unavailable');
  });

  it('waits while a source that could still find the taxon is pending', () => {
    expect(dossierRecordState({ species: null, dossier: 'not_found' })).toBe('loading');
    expect(dossierRecordState({ species: 'not_found', dossier: null })).toBe('loading');
  });
});

describe('requestedTaxonLabel', () => {
  it('repeats the request as given: link name first, else the decoded slug', () => {
    expect(requestedTaxonLabel(null, 'Notagenus%20fakeus')).toBe('Notagenus fakeus');
    expect(requestedTaxonLabel('  Notagenus   fakeus ', '987654321')).toBe('Notagenus fakeus');
    expect(requestedTaxonLabel(null, '987654321')).toBe('987654321');
    // A malformed escape is shown raw instead of throwing.
    expect(requestedTaxonLabel(null, 'bad%E0name')).toBe('bad%E0name');
  });
});

describe('lookupSpeciesById', () => {
  function respond(response: Response | Error) {
    vi.stubGlobal(
      'fetch',
      response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue(response),
    );
  }

  it('is found for a 2xx record', async () => {
    respond(new Response(JSON.stringify({ taxonomy_id: '42', canonical_name: 'Cattleya labiata' }), { status: 200 }));
    expect(await lookupSpeciesById('42')).toMatchObject({ state: 'found', data: { canonical_name: 'Cattleya labiata' } });
  });

  it('is not found when the service says no record lives under the identifier', async () => {
    for (const status of [404, 410, 422]) {
      respond(new Response('{"detail":"not found"}', { status }));
      expect(await lookupSpeciesById('987654321')).toEqual({ state: 'not_found', httpStatus: status });
    }
  });

  it('is unavailable when the service did not answer the question', async () => {
    for (const status of [500, 502, 503, 401, 403, 429]) {
      respond(new Response('{}', { status }));
      expect(await lookupSpeciesById('42')).toEqual({ state: 'unavailable', httpStatus: status });
    }
    respond(new TypeError('Failed to fetch'));
    expect(await lookupSpeciesById('42')).toEqual({ state: 'unavailable', httpStatus: 0 });
    respond(new Response('[]', { status: 200 }));
    expect(await lookupSpeciesById('42')).toEqual({ state: 'unavailable', httpStatus: 200 });
    respond(new Response('null', { status: 200 }));
    expect(await lookupSpeciesById('42')).toEqual({ state: 'unavailable', httpStatus: 200 });
  });
});
