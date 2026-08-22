import { describe, expect, it } from 'vitest';

import {
  matrixHrefForLexiconConcept,
  readIdentificationSourceContext,
} from '@/features/calyx-workspace/identificationContext';
import { speciesDossierMatrixHref } from '@/lib/speciesDossierMatrixNavigation';

describe('Matrix inbound source context', () => {
  it('recognizes the governed Phalaenopsis Species Dossier origin without creating an observation/evidence claim', () => {
    const href = speciesDossierMatrixHref('/orchid-identification', {
      taxonId: 'phalaenopsis-amabilis',
      taxonLabel: 'Phalaenopsis amabilis',
    });
    expect(href).not.toBeNull();

    const search = new URL(href!, 'https://orchidcontinuum.org').search;
    expect(readIdentificationSourceContext(search)).toEqual({
      source: 'species-dossier',
      taxonId: 'phalaenopsis-amabilis',
      taxonLabel: 'Phalaenopsis amabilis',
      contextIsObservation: false,
      contextIsEvidence: false,
    });
  });

  it('does not ingest locality or occurrence parameters into the Matrix source context', () => {
    const href = speciesDossierMatrixHref('/orchid-identification', {
      taxonId: 'phalaenopsis-amabilis',
      taxonLabel: 'Phalaenopsis amabilis',
    });
    const url = new URL(href!, 'https://orchidcontinuum.org');
    url.searchParams.set('decimalLatitude', '14.5995');
    url.searchParams.set('decimalLongitude', '120.9842');
    url.searchParams.set('locality', 'exact private grove');
    url.searchParams.set('occurrenceID', 'GBIF:2401991234');
    url.searchParams.set('catalogNumber', 'PH-AMAB-0091');
    url.searchParams.set('elevation', '1834');
    url.searchParams.set('gps', 'GPS-11Q-448');
    url.searchParams.set('grid', '10km-grid');
    url.searchParams.set('site', 'private-site');

    const context = readIdentificationSourceContext(url.search);
    const serialized = JSON.stringify(context);
    for (const protectedValue of [
      '14.5995',
      '120.9842',
      'exact private grove',
      'GBIF:2401991234',
      'PH-AMAB-0091',
      '1834',
      'GPS-11Q-448',
      '10km-grid',
      'private-site',
    ]) {
      expect(serialized).not.toContain(protectedValue);
    }
  });

  it('preserves the existing Lexicon → Matrix context contract', () => {
    const href = matrixHrefForLexiconConcept('labellum', 'Labellum');
    const search = new URL(href, 'https://orchidcontinuum.org').search;
    expect(readIdentificationSourceContext(search)).toEqual({
      concept: 'labellum',
      label: 'Labellum',
    });
  });
});
