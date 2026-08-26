import { describe, expect, it } from 'vitest';
import { atlasNextContinuumActions } from './researchHandoff';

const FORBIDDEN_KEYS = [
  'lat',
  'latitude',
  'lng',
  'lon',
  'longitude',
  'locality',
  'location',
  'occurrence',
  'occurrence_id',
  'record',
  'record_id',
  'collector',
  'catalogue',
  'catalog_number',
  'evidence',
  'confidence',
  'conclusion',
];

describe('Atlas Next cross-Continuum actions', () => {
  it('emits governed Research, Calyx, and Species continuations for one canonical genus', () => {
    const actions = atlasNextContinuumActions({ genus: 'Phalaenopsis', projectId: 'naocc-demo' });

    expect(actions).toEqual([
      {
        id: 'research',
        label: 'Continue in Research Station',
        href: '/research?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=false&project=naocc-demo',
      },
      {
        id: 'calyx',
        label: 'Ask Calyx about this genus',
        href: '/calyx?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=false',
      },
      {
        id: 'species',
        label: 'Browse this genus in Species',
        href: '/species?genus=Phalaenopsis',
      },
    ]);

    const research = new URL(actions.find((action) => action.id === 'research')!.href, 'https://orchid.test');
    const calyx = new URL(actions.find((action) => action.id === 'calyx')!.href, 'https://orchid.test');
    const species = new URL(actions.find((action) => action.id === 'species')!.href, 'https://orchid.test');

    expect([...research.searchParams.keys()].sort()).toEqual(
      ['context_is_evidence', 'genus', 'origin', 'project'].sort(),
    );
    expect([...calyx.searchParams.keys()].sort()).toEqual(
      ['context_is_evidence', 'genus', 'origin'].sort(),
    );
    expect([...species.searchParams.keys()]).toEqual(['genus']);

    for (const key of FORBIDDEN_KEYS) {
      expect(research.searchParams.has(key)).toBe(false);
      expect(calyx.searchParams.has(key)).toBe(false);
      expect(species.searchParams.has(key)).toBe(false);
    }
  });

  it.each([
    '',
    'phalaenopsis',
    'Phalaenopsis amabilis',
    '../Phalaenopsis',
    '35.1,-120.7',
    'P'.repeat(121),
  ])('fails the whole continuation surface closed for malformed genus %j', (genus) => {
    expect(atlasNextContinuumActions({ genus })).toEqual([]);
  });

  it('never carries Research project identity into Calyx or Species', () => {
    const actions = atlasNextContinuumActions({ genus: 'Phalaenopsis', projectId: 'project-123' });
    const calyx = new URL(actions.find((action) => action.id === 'calyx')!.href, 'https://orchid.test');
    const species = new URL(actions.find((action) => action.id === 'species')!.href, 'https://orchid.test');

    expect(calyx.searchParams.has('project')).toBe(false);
    expect(species.searchParams.has('project')).toBe(false);
  });
});
