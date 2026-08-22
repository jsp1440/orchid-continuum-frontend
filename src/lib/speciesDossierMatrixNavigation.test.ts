import { describe, expect, it } from 'vitest';

import {
  SPECIES_DOSSIER_MATRIX_ORIGIN,
  parseSpeciesDossierMatrixContext,
  speciesDossierMatrixHref,
} from '@/lib/speciesDossierMatrixNavigation';

const PROTECTED = [
  '14.5995',
  '120.9842',
  'Sitio Malabon ridge, exact grove',
  'GBIF:2401991234',
  'PH-AMAB-0091',
  '1834',
  'GPS-11Q-448',
];

describe('Species Dossier → Matrix governed navigation', () => {
  it('round-trips Phalaenopsis identity as non-observation, non-evidence context', () => {
    const href = speciesDossierMatrixHref('/orchid-identification', {
      taxonId: 'phalaenopsis-amabilis',
      taxonLabel: 'Phalaenopsis amabilis',
    });

    expect(href).not.toBeNull();
    const url = new URL(href!, 'https://orchidcontinuum.org');
    expect([...url.searchParams.keys()].sort()).toEqual([
      'context_is_evidence',
      'context_is_observation',
      'origin',
      'taxon_id',
      'taxon_label',
    ]);
    expect(parseSpeciesDossierMatrixContext(url.search)).toEqual({
      origin: SPECIES_DOSSIER_MATRIX_ORIGIN,
      taxonId: 'phalaenopsis-amabilis',
      taxonLabel: 'Phalaenopsis amabilis',
      contextIsObservation: false,
      contextIsEvidence: false,
    });
  });

  it('uses matrix_url only as a canonical destination and strips backend query/fragment material', () => {
    const href = speciesDossierMatrixHref(
      '/orchid-identification?decimalLatitude=14.5995&locality=secret#occurrence-1',
      { taxonId: 'phalaenopsis-amabilis', taxonLabel: 'Phalaenopsis amabilis' },
    );

    expect(href).not.toBeNull();
    for (const protectedValue of PROTECTED) {
      expect(href).not.toContain(protectedValue);
    }
  });

  it('rejects external, protocol-relative, and non-Matrix destinations', () => {
    for (const matrixUrl of [
      'https://example.org/orchid-identification',
      '//example.org/orchid-identification',
      '/atlas',
      '/orchid-identification/other',
      '',
    ]) {
      expect(
        speciesDossierMatrixHref(matrixUrl, {
          taxonId: 'phalaenopsis-amabilis',
          taxonLabel: 'Phalaenopsis amabilis',
        }),
      ).toBeNull();
    }
  });

  it('ignores hostile locality and occurrence material appended to the final route', () => {
    const href = speciesDossierMatrixHref('/orchid-identification', {
      taxonId: 'phalaenopsis-amabilis',
      taxonLabel: 'Phalaenopsis amabilis',
    });
    expect(href).not.toBeNull();

    const url = new URL(href!, 'https://orchidcontinuum.org');
    url.searchParams.set('decimalLatitude', PROTECTED[0]);
    url.searchParams.set('decimalLongitude', PROTECTED[1]);
    url.searchParams.set('locality', PROTECTED[2]);
    url.searchParams.set('occurrenceID', PROTECTED[3]);
    url.searchParams.set('catalogNumber', PROTECTED[4]);
    url.searchParams.set('elevation', PROTECTED[5]);
    url.searchParams.set('gps', PROTECTED[6]);
    url.searchParams.set('grid', '10km-grid');
    url.searchParams.set('site', 'private-site');

    const context = parseSpeciesDossierMatrixContext(url.search);
    expect(context).toEqual({
      origin: SPECIES_DOSSIER_MATRIX_ORIGIN,
      taxonId: 'phalaenopsis-amabilis',
      taxonLabel: 'Phalaenopsis amabilis',
      contextIsObservation: false,
      contextIsEvidence: false,
    });
    const serialized = JSON.stringify(context);
    for (const protectedValue of PROTECTED) {
      expect(serialized).not.toContain(protectedValue);
    }
  });

  it('fails closed if navigation context attempts to become evidence or an observation', () => {
    const base = speciesDossierMatrixHref('/orchid-identification', {
      taxonId: 'phalaenopsis-amabilis',
      taxonLabel: 'Phalaenopsis amabilis',
    });
    expect(base).not.toBeNull();

    const evidence = new URL(base!, 'https://orchidcontinuum.org');
    evidence.searchParams.set('context_is_evidence', 'true');
    expect(parseSpeciesDossierMatrixContext(evidence.search)).toBeNull();

    const observation = new URL(base!, 'https://orchidcontinuum.org');
    observation.searchParams.set('context_is_observation', 'true');
    expect(parseSpeciesDossierMatrixContext(observation.search)).toBeNull();
  });
});
