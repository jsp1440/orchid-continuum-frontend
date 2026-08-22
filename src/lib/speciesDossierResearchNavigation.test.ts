import { describe, expect, it } from 'vitest';

import {
  SPECIES_DOSSIER_RESEARCH_ORIGIN,
  speciesDossierResearchHref,
} from '@/lib/speciesDossierResearchNavigation';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';

describe('Species Dossier → Research navigation', () => {
  it('round-trips the exact species identity as non-evidentiary context', () => {
    const href = speciesDossierResearchHref('Phalaenopsis amabilis');
    expect(href).not.toBeNull();

    const search = href!.slice(href!.indexOf('?'));
    expect(parseResearchRouteContext(search)).toEqual({
      origin: SPECIES_DOSSIER_RESEARCH_ORIGIN,
      genus: 'Phalaenopsis',
      taxon: 'Phalaenopsis amabilis',
      projectId: null,
      contextIsEvidence: false,
    });
  });

  it('emits only the bounded subject and evidence-boundary keys', () => {
    const href = speciesDossierResearchHref('Phalaenopsis amabilis')!;
    const params = new URLSearchParams(href.slice(href.indexOf('?')));
    expect([...params.keys()].sort()).toEqual(
      ['context_is_evidence', 'genus', 'origin', 'taxon'].sort(),
    );
    expect(params.get('context_is_evidence')).toBe('false');
  });

  it('ignores appended locality and record material at the Research boundary', () => {
    const href = speciesDossierResearchHref('Phalaenopsis amabilis')!;
    const search = `${href.slice(href.indexOf('?'))}&lat=34.1&lng=-120.4&locality=secret&occurrence_id=123&collector=someone&catalogue_number=ABC`;

    const parsed = parseResearchRouteContext(search);
    expect(parsed).toEqual({
      origin: SPECIES_DOSSIER_RESEARCH_ORIGIN,
      genus: 'Phalaenopsis',
      taxon: 'Phalaenopsis amabilis',
      projectId: null,
      contextIsEvidence: false,
    });
    expect(Object.keys(parsed ?? {}).sort()).toEqual(
      ['contextIsEvidence', 'genus', 'origin', 'projectId', 'taxon'].sort(),
    );
  });

  it('fails closed on evidence promotion, malformed taxon, or genus mismatch', () => {
    expect(
      parseResearchRouteContext(
        '?origin=species-dossier&genus=Phalaenopsis&taxon=Phalaenopsis%20amabilis&context_is_evidence=true',
      ),
    ).toBeNull();
    expect(speciesDossierResearchHref('<script>')).toBeNull();
    expect(
      parseResearchRouteContext(
        '?origin=species-dossier&genus=Cattleya&taxon=Phalaenopsis%20amabilis&context_is_evidence=false',
      ),
    ).toBeNull();
  });
});
