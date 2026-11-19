import { describe, expect, it } from 'vitest';
import { speciesDossierContinuumActions } from './speciesDossierContinuumNavigation';

describe('speciesDossierContinuumActions', () => {
  it('uses one exact canonical subject across Atlas, Research, and Calyx', () => {
    const actions = speciesDossierContinuumActions({
      acceptedName: 'Phalaenopsis amabilis',
      canonicalName: 'Phalaenopsis aphrodite',
    });

    expect(actions).not.toBeNull();
    expect(actions?.atlas).toBe('/atlas?species=Phalaenopsis+amabilis');

    const research = new URL(actions!.research, 'https://continuum.test');
    expect(research.pathname).toBe('/research');
    expect(Object.fromEntries(research.searchParams)).toEqual({
      genus: 'Phalaenopsis',
      origin: 'species-dossier-research',
      taxon: 'Phalaenopsis amabilis',
      context_is_evidence: 'false',
    });

    const calyx = new URL(actions!.calyx, 'https://continuum.test');
    expect(calyx.pathname).toBe('/calyx');
    expect(Object.fromEntries(calyx.searchParams)).toEqual({
      genus: 'Phalaenopsis',
      taxon: 'Phalaenopsis amabilis',
      origin: 'species-dossier-calyx',
      context_is_evidence: 'false',
    });
  });

  it('falls through only when a higher-priority identity field is absent', () => {
    expect(
      speciesDossierContinuumActions({ canonicalName: 'Cattleya labiata' })?.atlas,
    ).toBe('/atlas?species=Cattleya+labiata');
  });

  it.each([
    { acceptedName: 'Phalaenopsis', canonicalName: 'Cattleya labiata' },
    { acceptedName: 'phalaenopsis amabilis', canonicalName: 'Cattleya labiata' },
    { acceptedName: '/species/123', canonicalName: 'Cattleya labiata' },
    { acceptedName: '35.2,-120.7', canonicalName: 'Cattleya labiata' },
    { acceptedName: 'Phalaenopsis amabilis extra', canonicalName: 'Cattleya labiata' },
  ])('fails the entire fan-out closed for malformed authoritative identity %#', (identity) => {
    expect(speciesDossierContinuumActions(identity)).toBeNull();
  });

  it('has no route channel for locality, occurrence, project, evidence, or conclusions', () => {
    const actions = speciesDossierContinuumActions({ acceptedName: 'Dracula lotax' });
    expect(actions).not.toBeNull();

    for (const href of Object.values(actions!)) {
      const params = new URL(href, 'https://continuum.test').searchParams;
      for (const forbidden of [
        'lat',
        'lng',
        'latitude',
        'longitude',
        'locality',
        'occurrence',
        'occurrence_id',
        'record_id',
        'project',
        'evidence',
        'confidence',
        'conclusion',
      ]) {
        expect(params.has(forbidden)).toBe(false);
      }
    }
  });
});

describe('infraspecific and hybrid dossier subjects (backend #1481/#1483 name shapes)', () => {
  it('carries a variety and a hybrid into Atlas, Research, and Calyx as the same exact subject', async () => {
    const { speciesDossierContinuumActions } = await import('@/lib/speciesDossierContinuumNavigation');
    for (const acceptedName of ['Dendrobium nobile var. alba', 'Phalaenopsis × intermedia']) {
      const actions = speciesDossierContinuumActions({ acceptedName, fullScientificName: `${acceptedName} Lindl.` });
      expect(actions).not.toBeNull();
      const encoded = encodeURIComponent(acceptedName).replace(/%20/g, '+');
      expect(actions?.atlas).toBe(`/atlas?species=${encoded}`);
      expect(actions?.research).toContain(encoded);
      expect(actions?.calyx).toContain(encoded);
    }
  });

  it('still fails closed when the first supplied identity carries authorship or a bare rank marker', async () => {
    const { speciesDossierContinuumActions } = await import('@/lib/speciesDossierContinuumNavigation');
    expect(speciesDossierContinuumActions({ acceptedName: 'Dendrobium nobile var. alba Rolfe' })).toBeNull();
    expect(speciesDossierContinuumActions({ acceptedName: 'Dendrobium nobile var.' })).toBeNull();
  });
});
