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
