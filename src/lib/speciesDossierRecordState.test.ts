import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRouteMissBody, lookupSpeciesById } from './ocBackend';
import {
  CANONICAL_TAXON_NOT_FOUND_DETAIL,
  CalyxRequestError,
  dossierRecordState,
  fetchSpeciesDossier,
  isCanonicalTaxonNotFound,
  requestedTaxonLabel,
  resolveDossierForSubject,
  type FederationResolveResult,
} from './speciesDossier';

// Error bodies: the dossier handler's exact 404 detail (orchid-calyx-backend
// app/species_dossier/routes.py `species_dossier`, verified at
// oc-autonomous-integration), its 503 detail, and synthetic shapes of
// framework / proxy route misses.
const NO_CANONICAL_RECORD = JSON.stringify({ detail: CANONICAL_TAXON_NOT_FOUND_DETAIL });
const SERVICE_UNAVAILABLE = JSON.stringify({ detail: 'Species dossier service is unavailable.' });
const OTHER_404_BODIES = [
  JSON.stringify({ detail: 'Not Found' }),
  JSON.stringify({ detail: 'Not found' }),
  JSON.stringify({ message: 'Not Found' }),
  JSON.stringify({ detail: 'No canonical taxon record exists' }),
  JSON.stringify({ detail: `${CANONICAL_TAXON_NOT_FOUND_DETAIL} ` }),
  JSON.stringify([{ detail: CANONICAL_TAXON_NOT_FOUND_DETAIL }]),
  '{}',
  'null',
  '',
  '<html><body>404 Not Found</body></html>',
];

function resolverAnswer(overrides: Partial<FederationResolveResult> = {}): FederationResolveResult {
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
    explanation: 'No canonical accepted name or synonym match is currently available.',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CANONICAL_TAXON_NOT_FOUND_DETAIL', () => {
  it('is the dossier handler’s exact detail string', () => {
    expect(CANONICAL_TAXON_NOT_FOUND_DETAIL).toBe('No canonical taxon record exists for this identifier.');
  });
});

describe('isCanonicalTaxonNotFound', () => {
  it('is true only for a 404 carrying the handler’s exact detail', () => {
    expect(isCanonicalTaxonNotFound(new CalyxRequestError(404, NO_CANONICAL_RECORD))).toBe(true);
  });

  it('is false for every other 404 shape', () => {
    for (const body of OTHER_404_BODIES) {
      expect(isCanonicalTaxonNotFound(new CalyxRequestError(404, body)), body).toBe(false);
    }
  });

  it('is false for other statuses and non-HTTP failures', () => {
    expect(isCanonicalTaxonNotFound(new CalyxRequestError(503, SERVICE_UNAVAILABLE))).toBe(false);
    expect(isCanonicalTaxonNotFound(new CalyxRequestError(410, NO_CANONICAL_RECORD))).toBe(false);
    expect(isCanonicalTaxonNotFound(new Error('404'))).toBe(false);
    expect(isCanonicalTaxonNotFound(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('is what fetchSpeciesDossier throws for the handler’s 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(NO_CANONICAL_RECORD, { status: 404 })));
    const error = await fetchSpeciesDossier('Notagenus fakeus').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CalyxRequestError);
    expect(isCanonicalTaxonNotFound(error)).toBe(true);
  });
});

describe('resolveDossierForSubject: positive evidence of absence', () => {
  const noRecord = () => new CalyxRequestError(404, NO_CANONICAL_RECORD);

  it('is not found for a name the handler and the resolver both hold no record for', async () => {
    const deps = {
      fetchDossier: vi.fn().mockRejectedValue(noRecord()),
      resolveSpecies: vi.fn().mockResolvedValue(resolverAnswer()),
    };
    expect(await resolveDossierForSubject('Notagenus fakeus', 'Notagenus fakeus', deps)).toEqual({
      state: 'not_found',
    });
  });

  it('is not found when the resolver is ambiguous but no candidate carries the exact name', async () => {
    const deps = {
      fetchDossier: vi.fn().mockRejectedValue(noRecord()),
      resolveSpecies: vi.fn().mockResolvedValue(
        resolverAnswer({
          status: 'ambiguous',
          candidates: [
            { taxon_id: '7904', accepted_name: 'Cattleya labiata', match_state: 'accepted_name' },
            { taxon_id: '34325', accepted_name: 'Cattleya labiata', match_state: 'accepted_name' },
          ],
        }),
      ),
    };
    expect(await resolveDossierForSubject('x', 'Cattleya labiata fo. fakeus', deps)).toEqual({
      state: 'not_found',
    });
  });

  it('never concludes not found for a bare id with no name, even on the handler’s 404', async () => {
    const deps = {
      fetchDossier: vi.fn().mockRejectedValue(noRecord()),
      resolveSpecies: vi.fn(),
    };
    expect(await resolveDossierForSubject('987654321', null, deps)).toEqual({ state: 'unavailable' });
    expect(deps.resolveSpecies).not.toHaveBeenCalled();
  });

  it('is unavailable when the route lookup gave anything but the handler’s exact 404', async () => {
    const failures = [
      new CalyxRequestError(503, SERVICE_UNAVAILABLE),
      ...OTHER_404_BODIES.map((body) => new CalyxRequestError(404, body)),
      new TypeError('Failed to fetch'),
    ];
    for (const failure of failures) {
      const deps = {
        fetchDossier: vi.fn().mockRejectedValue(failure),
        resolveSpecies: vi.fn().mockResolvedValue(resolverAnswer()),
      };
      expect(await resolveDossierForSubject('Notagenus fakeus', 'Notagenus fakeus', deps)).toEqual({
        state: 'unavailable',
      });
    }
  });

  it('is unavailable when the route id is another taxon’s dossier (an id-space collision)', async () => {
    const other = {
      identity: { taxon_id: '6056', accepted_name: 'Caladenia x suffusa', display_name: 'Caladenia x suffusa', full_scientific_name: 'Caladenia x suffusa', synonyms: [] },
    };
    const deps = {
      fetchDossier: vi.fn().mockResolvedValue(other),
      resolveSpecies: vi.fn().mockResolvedValue(resolverAnswer()),
    };
    expect(await resolveDossierForSubject('6056', 'Notagenus fakeus', deps as never)).toEqual({
      state: 'unavailable',
    });
  });

  it('is unavailable when the resolver did not answer or answered invalid', async () => {
    for (const resolveSpecies of [
      vi.fn().mockRejectedValue(new CalyxRequestError(503, SERVICE_UNAVAILABLE)),
      vi.fn().mockResolvedValue(resolverAnswer({ status: 'invalid' })),
    ]) {
      const deps = { fetchDossier: vi.fn().mockRejectedValue(noRecord()), resolveSpecies };
      expect(await resolveDossierForSubject('Notagenus fakeus', 'Notagenus fakeus', deps)).toEqual({
        state: 'unavailable',
      });
    }
  });
});

describe('dossierRecordState', () => {
  it('is found when any source holds a record', () => {
    expect(dossierRecordState({ species: 'found', dossier: null })).toBe('found');
    expect(dossierRecordState({ species: 'found', dossier: 'not_found' })).toBe('found');
    expect(dossierRecordState({ species: 'unavailable', dossier: 'resolved' })).toBe('found');
    expect(dossierRecordState({ species: 'reported_absent', dossier: 'ambiguous' })).toBe('found');
    expect(dossierRecordState({ species: 'found', dossier: 'conflict' })).toBe('found');
  });

  it('is not found only on the Calyx sources’ positive evidence; the public 404 is never evidence', () => {
    expect(dossierRecordState({ species: 'reported_absent', dossier: 'not_found' })).toBe('not_found');
    expect(dossierRecordState({ species: 'reported_absent', dossier: 'unavailable' })).toBe('unavailable');
    expect(dossierRecordState({ species: 'unavailable', dossier: 'unavailable' })).toBe('unavailable');
  });

  it('never concludes not found while a source that could still find the taxon did not answer', () => {
    // A public source that is down may hold the record; the Calyx evidence
    // alone must not turn a real taxon into "no record" during an outage.
    expect(dossierRecordState({ species: 'unavailable', dossier: 'not_found' })).toBe('unavailable');
  });

  it('matches the documented truth table for every combination', () => {
    const species = [null, 'found', 'reported_absent', 'unavailable'] as const;
    const dossier = [null, 'resolved', 'ambiguous', 'conflict', 'not_found', 'unavailable'] as const;
    for (const s of species) {
      for (const d of dossier) {
        const expected =
          s === 'found' || d === 'resolved' || d === 'ambiguous' || d === 'conflict'
            ? 'found'
            : s === null || d === null
              ? 'loading'
              : s === 'reported_absent' && d === 'not_found'
                ? 'not_found'
                : 'unavailable';
        expect(dossierRecordState({ species: s, dossier: d }), `${s} × ${d}`).toBe(expected);
      }
    }
  });

  it('waits while a source that could still find the taxon is pending', () => {
    expect(dossierRecordState({ species: null, dossier: 'not_found' })).toBe('loading');
    expect(dossierRecordState({ species: 'reported_absent', dossier: null })).toBe('loading');
  });
});

describe('requestedTaxonLabel', () => {
  it('repeats the request as given: link name first, else the decoded slug', () => {
    expect(requestedTaxonLabel(null, 'Notagenus%20fakeus')).toBe('Notagenus fakeus');
    expect(requestedTaxonLabel('  Notagenus   fakeus ', '987654321')).toBe('Notagenus fakeus');
    expect(requestedTaxonLabel(null, '987654321')).toBe('987654321');
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

  it('is reported_absent (never proof of absence) for the service’s own 404/410 body', async () => {
    for (const status of [404, 410]) {
      respond(new Response(JSON.stringify({ detail: 'Species not found.' }), { status }));
      expect(await lookupSpeciesById('987654321')).toEqual({ state: 'reported_absent', httpStatus: status });
    }
  });

  it('is unavailable for a route-miss or proxy 404 and for any other failure', async () => {
    for (const body of ['{"detail":"Not Found"}', '{"message":"Not Found"}', '{"detail":"Not found"}', '{}', 'null', '', '<html>404</html>']) {
      respond(new Response(body, { status: 404 }));
      expect(await lookupSpeciesById('42'), body).toEqual({ state: 'unavailable', httpStatus: 404 });
    }
    for (const status of [422, 500, 502, 503, 401, 403, 429]) {
      respond(new Response('{"detail":"x"}', { status }));
      expect(await lookupSpeciesById('42')).toEqual({ state: 'unavailable', httpStatus: status });
    }
    respond(new TypeError('Failed to fetch'));
    expect(await lookupSpeciesById('42')).toEqual({ state: 'unavailable', httpStatus: 0 });
    respond(new Response('[]', { status: 200 }));
    expect(await lookupSpeciesById('42')).toEqual({ state: 'unavailable', httpStatus: 200 });
    respond(new Response('not json', { status: 200 }));
    expect(await lookupSpeciesById('42')).toEqual({ state: 'unavailable', httpStatus: 200 });
  });

  it('isRouteMissBody recognises framework and proxy misses only', () => {
    expect(isRouteMissBody('{"detail":"Not Found"}')).toBe(true);
    expect(isRouteMissBody('<html></html>')).toBe(true);
    expect(isRouteMissBody('')).toBe(true);
    expect(isRouteMissBody('{"detail":"Species not found."}')).toBe(false);
  });
});
