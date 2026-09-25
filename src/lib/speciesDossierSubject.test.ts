import { describe, expect, it, vi } from 'vitest';
import {
  resolveDossierForSubject,
  sameScientificName,
  subjectNameFromSlug,
  type FederationResolveResult,
  type SpeciesDossierEnvelope,
} from './speciesDossier';

function envelope(taxonId: string, acceptedName: string): SpeciesDossierEnvelope {
  return {
    identity: {
      taxon_id: taxonId,
      display_name: acceptedName,
      full_scientific_name: acceptedName,
      accepted_name: acceptedName,
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
