import { describe, expect, it, vi } from 'vitest';
import {
  pageSubject,
  resolveDossierForSubject,
  resolveDossierForSubjectWithReason,
  sameScientificName,
  subjectNameFromSlug,
  SpeciesDossierRequestError,
  type FederationResolveResult,
  type SpeciesDossierEnvelope,
} from './speciesDossier';

function envelope(
  taxonId: string,
  acceptedName: string,
  synonyms: string[] = [],
): SpeciesDossierEnvelope {
  return {
    identity: {
      taxon_id: taxonId,
      display_name: acceptedName,
      full_scientific_name: acceptedName,
      accepted_name: acceptedName,
      synonyms,
    },
  } as unknown as SpeciesDossierEnvelope;
}

function resolution(overrides: Partial<FederationResolveResult>): FederationResolveResult {
  return {
    status: 'unresolved',
    incoming_name: null,
    matched_name: null,
    match_state: 'none',
    taxon_id: null,
    canonical_dossier_url: null,
    candidates: [],
    partner_slug: null,
    reciprocal_source_url: null,
    explanation: '',
    ...overrides,
  };
}

describe('subjectNameFromSlug', () => {
  it('reads a binomial slug and refuses an opaque id', () => {
    expect(subjectNameFromSlug('cattleya-labiata')).toBe('cattleya labiata');
    expect(subjectNameFromSlug('Cattleya%20labiata')).toBe('Cattleya labiata');
    expect(subjectNameFromSlug('6056')).toBeNull();
    expect(subjectNameFromSlug('oc-tax-123')).toBeNull();
    expect(subjectNameFromSlug('Cattleya')).toBeNull();
    expect(subjectNameFromSlug('')).toBeNull();
  });
});

describe('sameScientificName', () => {
  it('ignores case, spacing and the hybrid sign, and nothing else', () => {
    expect(sameScientificName('Cattleya  labiata', 'cattleya labiata')).toBe(true);
    expect(sameScientificName('Caladenia × suffusa', 'Caladenia x suffusa')).toBe(true);
    expect(sameScientificName('Cattleya labiata', 'Cattleya percivaliana')).toBe(false);
    expect(sameScientificName('', '')).toBe(false);
  });
});

describe('resolveDossierForSubject', () => {
  it('keeps the route dossier when its identity is the subject', async () => {
    const deps = {
      fetchDossier: vi.fn().mockResolvedValue(envelope('7904', 'Cattleya labiata')),
      resolveSpecies: vi.fn(),
    };
    const result = await resolveDossierForSubject('7904', 'Cattleya labiata', deps);
    expect(result).toMatchObject({ state: 'resolved', via: 'route_id' });
    expect(deps.resolveSpecies).not.toHaveBeenCalled();
  });

  it('re-resolves by name when the route id is another species', async () => {
    const deps = {
      fetchDossier: vi.fn(async (id: string) =>
        id === '6056' ? envelope('6056', 'Caladenia x suffusa') : envelope('7904', 'Cattleya labiata'),
      ),
      resolveSpecies: vi.fn().mockResolvedValue(resolution({ status: 'resolved', taxon_id: '7904' })),
    };
    const result = await resolveDossierForSubject('6056', 'Cattleya labiata', deps);
    expect(result.state).toBe('resolved');
    if (result.state === 'resolved') {
      expect(result.via).toBe('subject_name');
      expect(result.dossier.identity.taxon_id).toBe('7904');
    }
    expect(deps.resolveSpecies).toHaveBeenCalledWith({ name: 'Cattleya labiata' }, undefined);
  });

  it('reports ambiguity instead of choosing a candidate', async () => {
    const candidates = [
      { taxon_id: '7904', accepted_name: 'Cattleya labiata', match_state: 'accepted_name' },
      { taxon_id: '34325', accepted_name: 'Cattleya labiata', match_state: 'accepted_name' },
    ];
    const deps = {
      fetchDossier: vi.fn().mockRejectedValue(new Error('404')),
      resolveSpecies: vi.fn().mockResolvedValue(resolution({ status: 'ambiguous', candidates })),
    };
    const result = await resolveDossierForSubject('cattleya-labiata', 'cattleya labiata', deps);
    expect(result).toEqual({ state: 'ambiguous', subjectName: 'cattleya labiata', candidates });
    expect(deps.fetchDossier).toHaveBeenCalledTimes(1);
  });

  it('is unavailable when nothing identifies the subject and the route id has no dossier', async () => {
    const deps = {
      fetchDossier: vi.fn().mockRejectedValue(new Error('404')),
      resolveSpecies: vi.fn(),
    };
    expect(await resolveDossierForSubject('6056', null, deps)).toEqual({ state: 'unavailable' });
    expect(deps.resolveSpecies).not.toHaveBeenCalled();
  });

  it('is unavailable when the subject name resolves to nothing', async () => {
    const deps = {
      fetchDossier: vi.fn().mockResolvedValue(envelope('6056', 'Caladenia x suffusa')),
      resolveSpecies: vi.fn().mockResolvedValue(resolution({ status: 'unresolved' })),
    };
    expect(await resolveDossierForSubject('6056', 'Cattleya labiata', deps)).toEqual({
      state: 'unavailable',
    });
  });
});

describe('speciesPageHref', () => {
  it('carries the name with a public-API id and omits an empty one', async () => {
    const { speciesPageHref } = await import('./speciesDossier');
    expect(speciesPageHref('6056', 'Cattleya labiata')).toBe('/species/6056?name=Cattleya%20labiata');
    expect(speciesPageHref('6056', '  ')).toBe('/species/6056');
    expect(speciesPageHref('6056', null)).toBe('/species/6056');
  });
});

describe('resolver-path dossiers are held to the subject identity', () => {
  it('never shows the species dossier for a forma subject (checker probe)', async () => {
    // The backend resolver normalises "Cattleya labiata fo. alba" to the
    // species and resolves it; the species dossier is not this subject.
    const deps = {
      fetchDossier: vi.fn(async (id: string) =>
        id === '7904' ? envelope('7904', 'Cattleya labiata') : envelope('6056', 'Caladenia x suffusa'),
      ),
      resolveSpecies: vi.fn().mockResolvedValue(
        resolution({ status: 'resolved', taxon_id: '7904', matched_name: 'Cattleya labiata' }),
      ),
    };
    expect(await resolveDossierForSubject('6056', 'Cattleya labiata fo. alba', deps)).toEqual({
      state: 'unavailable',
    });
  });

  it('never shows the species dossier for a cultivar subject', async () => {
    const deps = {
      fetchDossier: vi.fn().mockResolvedValue(envelope('7904', 'Cattleya labiata')),
      resolveSpecies: vi.fn().mockResolvedValue(resolution({ status: 'resolved', taxon_id: '7904' })),
    };
    expect(
      await resolveDossierForSubject('cattleya-labiata', "Cattleya labiata 'Alba'", deps),
    ).toEqual({ state: 'unavailable' });
  });

  it('holds the route dossier to the same check when the resolver names its taxon', async () => {
    const deps = {
      fetchDossier: vi.fn().mockResolvedValue(envelope('7904', 'Cattleya labiata')),
      resolveSpecies: vi.fn().mockResolvedValue(resolution({ status: 'resolved', taxon_id: '7904' })),
    };
    expect(await resolveDossierForSubject('7904', 'Cattleya labiata ssp. vera', deps)).toEqual({
      state: 'unavailable',
    });
    expect(deps.fetchDossier).toHaveBeenCalledTimes(1);
  });

  it('accepts a resolver hit whose dossier records the subject as a synonym', async () => {
    const deps = {
      fetchDossier: vi.fn(async (id: string) =>
        id === '7904'
          ? envelope('7904', 'Cattleya labiata', ['Epidendrum labiatum'])
          : envelope('6056', 'Caladenia x suffusa'),
      ),
      resolveSpecies: vi.fn().mockResolvedValue(resolution({ status: 'resolved', taxon_id: '7904' })),
    };
    const result = await resolveDossierForSubject('6056', 'Epidendrum labiatum', deps);
    expect(result).toMatchObject({ state: 'resolved', via: 'subject_name' });
  });

  it('keeps only candidates that carry the subject name, else fails closed', async () => {
    const species = [
      { taxon_id: '7904', accepted_name: 'Cattleya labiata', match_state: 'accepted_name' },
      { taxon_id: '34325', accepted_name: 'Cattleya labiata', match_state: 'accepted_name' },
    ];
    const deps = {
      fetchDossier: vi.fn().mockRejectedValue(new Error('404')),
      resolveSpecies: vi.fn().mockResolvedValue(resolution({ status: 'ambiguous', candidates: species })),
    };
    expect(await resolveDossierForSubject('x', 'Cattleya labiata fo. alba', deps)).toEqual({
      state: 'unavailable',
    });
  });
});

describe('pageSubject', () => {
  it('ranks the link name above the id-keyed public detail name', () => {
    expect(
      pageSubject({ linkedName: 'Cattleya labiata', publicName: 'cattleya  labiata', slug: '6056' }),
    ).toEqual({ state: 'subject', name: 'Cattleya labiata' });
    expect(pageSubject({ linkedName: null, publicName: 'Cattleya labiata', slug: '6056' })).toEqual({
      state: 'subject',
      name: 'Cattleya labiata',
    });
    expect(pageSubject({ linkedName: '', publicName: null, slug: 'cattleya-labiata' })).toEqual({
      state: 'subject',
      name: 'cattleya labiata',
    });
    expect(pageSubject({ linkedName: null, publicName: null, slug: '6056' })).toEqual({
      state: 'subject',
      name: null,
    });
  });

  it('fails closed when the link and the public detail name different species', () => {
    expect(
      pageSubject({
        linkedName: 'Cattleya labiata',
        publicName: 'Cattleya percivaliana',
        slug: '6056',
      }),
    ).toEqual({
      state: 'conflict',
      linkedName: 'Cattleya labiata',
      publicName: 'Cattleya percivaliana',
    });
  });
});

describe('resolveDossierForSubjectWithReason', () => {
  const notFound = () => new SpeciesDossierRequestError('synthetic 404', { status: 404 });
  const unavailable = () => new SpeciesDossierRequestError('synthetic 503', { status: 503 });
  const mismatch = () =>
    new SpeciesDossierRequestError('synthetic 409', { status: 409, errorCode: 'identity_mismatch' });
  const invalid = () =>
    new SpeciesDossierRequestError('synthetic malformed 200', { status: 200, invalidContract: true });

  it('resolves exactly as resolveDossierForSubject does', async () => {
    const deps = {
      fetchDossier: vi.fn().mockResolvedValue(envelope('7904', 'Cattleya labiata')),
      resolveSpecies: vi.fn(),
    };
    expect(await resolveDossierForSubjectWithReason('7904', 'Cattleya labiata', deps)).toEqual(
      await resolveDossierForSubject('7904', 'Cattleya labiata', deps),
    );
  });

  it.each([
    ['not_found', notFound],
    ['service_unavailable', unavailable],
    ['identity_mismatch', mismatch],
    ['invalid_contract', invalid],
    ['service_unavailable', () => new TypeError('Failed to fetch')],
  ] as const)('says %s when the route dossier fails that way and no name is known', async (reason, make) => {
    const deps = { fetchDossier: vi.fn().mockRejectedValue(make()), resolveSpecies: vi.fn() };
    expect(await resolveDossierForSubjectWithReason('6056', null, deps)).toEqual({
      state: 'unavailable',
      reason,
    });
    expect(deps.resolveSpecies).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', notFound],
    ['service_unavailable', unavailable],
    ['invalid_contract', invalid],
  ] as const)(
    'keeps %s from the route dossier when the subject name resolves to nothing',
    async (reason, make) => {
      const deps = {
        fetchDossier: vi.fn().mockRejectedValue(make()),
        resolveSpecies: vi.fn().mockResolvedValue(resolution({ status: 'unresolved' })),
      };
      expect(await resolveDossierForSubjectWithReason('6056', 'Cattleya labiata', deps)).toEqual({
        state: 'unavailable',
        reason,
      });
    },
  );

  it('says no_subject when there is neither a route id nor a name', async () => {
    const deps = { fetchDossier: vi.fn().mockRejectedValue(notFound()), resolveSpecies: vi.fn() };
    expect(await resolveDossierForSubjectWithReason('  ', null, deps)).toEqual({
      state: 'unavailable',
      reason: 'no_subject',
    });
  });

  it('says identity_mismatch when the route record is another species and the name resolves to nothing', async () => {
    const deps = {
      fetchDossier: vi.fn().mockResolvedValue(envelope('6056', 'Caladenia x suffusa')),
      resolveSpecies: vi.fn().mockResolvedValue(resolution({ status: 'unresolved' })),
    };
    expect(await resolveDossierForSubjectWithReason('6056', 'Cattleya labiata', deps)).toEqual({
      state: 'unavailable',
      reason: 'identity_mismatch',
    });
  });

  it('says identity_mismatch when the resolved dossier is not the subject', async () => {
    const deps = {
      fetchDossier: vi.fn(async (id: string) =>
        id === '6056' ? envelope('6056', 'Caladenia x suffusa') : envelope('7904', 'Cattleya labiata'),
      ),
      resolveSpecies: vi.fn().mockResolvedValue(resolution({ status: 'resolved', taxon_id: '7904' })),
    };
    expect(
      await resolveDossierForSubjectWithReason('6056', 'Cattleya labiata fo. alba', deps),
    ).toEqual({ state: 'unavailable', reason: 'identity_mismatch' });
  });

  it('says service_unavailable when the name resolver cannot be reached', async () => {
    const deps = {
      fetchDossier: vi.fn().mockRejectedValue(notFound()),
      resolveSpecies: vi.fn().mockRejectedValue(unavailable()),
    };
    expect(await resolveDossierForSubjectWithReason('6056', 'Cattleya labiata', deps)).toEqual({
      state: 'unavailable',
      reason: 'service_unavailable',
    });
  });

  it('carries the reason of the dossier the name resolved to', async () => {
    const deps = {
      fetchDossier: vi.fn(async (id: string) => {
        throw id === '6056' ? notFound() : invalid();
      }),
      resolveSpecies: vi.fn().mockResolvedValue(resolution({ status: 'resolved', taxon_id: '7904' })),
    };
    expect(await resolveDossierForSubjectWithReason('6056', 'Cattleya labiata', deps)).toEqual({
      state: 'unavailable',
      reason: 'invalid_contract',
    });
  });

  it('still lists exact-name candidates for an ambiguous name', async () => {
    const candidates = [
      { taxon_id: '1', accepted_name: 'Cattleya labiata', match_state: 'accepted_name' },
      { taxon_id: '2', accepted_name: 'Cattleya labiata', match_state: 'accepted_name' },
    ];
    const deps = {
      fetchDossier: vi.fn().mockRejectedValue(notFound()),
      resolveSpecies: vi.fn().mockResolvedValue(resolution({ status: 'ambiguous', candidates })),
    };
    expect(await resolveDossierForSubjectWithReason('6056', 'Cattleya labiata', deps)).toEqual({
      state: 'ambiguous',
      subjectName: 'Cattleya labiata',
      candidates,
    });
  });

  it('rethrows when the request was aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const deps = { fetchDossier: vi.fn().mockRejectedValue(notFound()), resolveSpecies: vi.fn() };
    await expect(
      resolveDossierForSubjectWithReason('6056', null, deps, ctrl.signal),
    ).rejects.toBeInstanceOf(SpeciesDossierRequestError);
  });
});

describe('resolveDossierForSubject', () => {
  it('keeps its bare unavailable result', async () => {
    const deps = {
      fetchDossier: vi
        .fn()
        .mockRejectedValue(new SpeciesDossierRequestError('synthetic 404', { status: 404 })),
      resolveSpecies: vi.fn(),
    };
    expect(await resolveDossierForSubject('6056', null, deps)).toStrictEqual({ state: 'unavailable' });
  });
});
