import { describe, expect, it } from 'vitest';

import {
  SPECIES_DOSSIER_CALYX_ORIGIN,
  parseSpeciesDossierCalyxContext,
  speciesDossierCalyxHref,
  speciesDossierCalyxTurnRouteContext,
} from '@/lib/speciesDossierCalyxNavigation';

describe('Species Dossier → Calyx navigation', () => {
  it('carries exact species identity as explicitly non-evidentiary navigation context', () => {
    const href = speciesDossierCalyxHref({
      genus: 'Phalaenopsis',
      taxon: 'Phalaenopsis amabilis',
    });

    expect(href).not.toBeNull();
    const url = new URL(href!, 'https://orchidcontinuum.org');
    expect(url.pathname).toBe('/calyx');
    expect(url.searchParams.get('genus')).toBe('Phalaenopsis');
    expect(url.searchParams.get('taxon')).toBe('Phalaenopsis amabilis');
    expect(url.searchParams.get('origin')).toBe(SPECIES_DOSSIER_CALYX_ORIGIN);
    expect(url.searchParams.get('context_is_evidence')).toBe('false');

    expect(parseSpeciesDossierCalyxContext(url.search)).toEqual({
      origin: SPECIES_DOSSIER_CALYX_ORIGIN,
      genus: 'Phalaenopsis',
      taxon: 'Phalaenopsis amabilis',
      contextIsEvidence: false,
    });
  });

  it('maps a validated dossier subject into the exact non-evidentiary Calyx turn shape', () => {
    const href = speciesDossierCalyxHref({
      genus: 'Phalaenopsis',
      taxon: 'Phalaenopsis amabilis',
    });
    const url = new URL(href!, 'https://orchidcontinuum.org');

    expect(speciesDossierCalyxTurnRouteContext(url.search)).toEqual({
      origin: SPECIES_DOSSIER_CALYX_ORIGIN,
      featured_taxon: { rank: 'genus', accepted_name: 'Phalaenopsis' },
      taxon: 'Phalaenopsis amabilis',
      taxon_source: SPECIES_DOSSIER_CALYX_ORIGIN,
      taxon_is_evidence: false,
    });
  });

  it('exposes only the bounded subject-context keys', () => {
    const href = speciesDossierCalyxHref({
      genus: 'Phalaenopsis',
      taxon: 'Phalaenopsis amabilis',
    });
    const url = new URL(href!, 'https://orchidcontinuum.org');

    expect([...url.searchParams.keys()].sort()).toEqual(
      ['context_is_evidence', 'genus', 'origin', 'taxon'].sort(),
    );
    for (const forbidden of [
      'lat',
      'lng',
      'latitude',
      'longitude',
      'locality',
      'occurrence_id',
      'collector',
      'catalogue_number',
      'site',
      'grid',
      'gps',
      'elevation',
      'evidence',
      'confidence',
    ]) {
      expect(url.searchParams.has(forbidden)).toBe(false);
    }
  });

  it('ignores hostile appended detail instead of admitting it to accepted Calyx context', () => {
    const search =
      '?genus=Phalaenopsis&taxon=Phalaenopsis%20amabilis&origin=species-dossier-calyx&context_is_evidence=false&latitude=-12.4&longitude=-77.1&locality=protected&occurrence_id=secret-1&collector=private&evidence=promote-me';
    const parsed = parseSpeciesDossierCalyxContext(search);

    expect(parsed).toEqual({
      origin: SPECIES_DOSSIER_CALYX_ORIGIN,
      genus: 'Phalaenopsis',
      taxon: 'Phalaenopsis amabilis',
      contextIsEvidence: false,
    });
    expect(Object.keys(parsed ?? {}).sort()).toEqual(
      ['contextIsEvidence', 'genus', 'origin', 'taxon'].sort(),
    );
    expect(speciesDossierCalyxTurnRouteContext(search)).toEqual({
      origin: SPECIES_DOSSIER_CALYX_ORIGIN,
      featured_taxon: { rank: 'genus', accepted_name: 'Phalaenopsis' },
      taxon: 'Phalaenopsis amabilis',
      taxon_source: SPECIES_DOSSIER_CALYX_ORIGIN,
      taxon_is_evidence: false,
    });
  });

  it('fails closed unless the dedicated origin explicitly declares non-evidence context', () => {
    for (const search of [
      '?genus=Phalaenopsis&taxon=Phalaenopsis%20amabilis&origin=species-dossier-calyx',
      '?genus=Phalaenopsis&taxon=Phalaenopsis%20amabilis&origin=species-dossier-calyx&context_is_evidence=true',
      '?genus=Phalaenopsis&taxon=Phalaenopsis%20amabilis&origin=research-station&context_is_evidence=false',
    ]) {
      expect(parseSpeciesDossierCalyxContext(search)).toBeNull();
      expect(speciesDossierCalyxTurnRouteContext(search)).toBeNull();
    }
  });

  it('fails closed on malformed or mismatched species identity', () => {
    expect(
      speciesDossierCalyxHref({ genus: 'Phalaenopsis', taxon: 'Cattleya labiata' }),
    ).toBeNull();
    expect(
      speciesDossierCalyxHref({ genus: 'Phalaenopsis', taxon: '<script>' }),
    ).toBeNull();
    expect(
      speciesDossierCalyxHref({ genus: 'Phalaenopsis amabilis', taxon: 'Phalaenopsis amabilis' }),
    ).toBeNull();
    expect(speciesDossierCalyxHref({ genus: 'Phalaenopsis', taxon: null })).toBeNull();

    const mismatched =
      '?genus=Phalaenopsis&taxon=Cattleya%20labiata&origin=species-dossier-calyx&context_is_evidence=false';
    expect(parseSpeciesDossierCalyxContext(mismatched)).toBeNull();
    expect(speciesDossierCalyxTurnRouteContext(mismatched)).toBeNull();
  });
});
