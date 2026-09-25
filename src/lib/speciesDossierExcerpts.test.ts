import { describe, expect, it } from 'vitest';

import { sectionExcerpts, type DossierSection } from './speciesDossier';

/**
 * Item shape emitted by backend app/species_dossier/repository.py for
 * federated (Gary Yong Gee) evidence — see backend PR #1618.
 */
const provisionalMorphology: DossierSection = {
  state: 'provisional',
  summary: 'Compiled by Gary Yong Gee; not independently verified by Orchid Continuum.',
  items: [
    {
      evidence_type: 'morphology',
      excerpt: 'Epiphytic herb with 3–5 leaves.',
      excerpt_truncated: false,
      evidence_class: 'compiled_specialist_source',
      evidence_state: 'provisional',
      compiler: 'Gary Yong Gee',
    },
    {
      evidence_type: 'fruit_capsule',
      excerpt: 'Capsule ellipsoid, ribbed',
      excerpt_truncated: true,
    },
    { evidence_type: 'scent', excerpt: '   ' },
    { evidence_type: 'diagnostic_comparison' },
  ],
  receipts: [],
  unavailable_reason: null,
};

describe('sectionExcerpts', () => {
  it('shows the evidence text a section carries, labelled by evidence type', () => {
    expect(sectionExcerpts(provisionalMorphology)).toEqual([
      { label: 'Morphology', text: 'Epiphytic herb with 3–5 leaves.', truncated: false },
      { label: 'Fruit capsule', text: 'Capsule ellipsoid, ribbed', truncated: true },
    ]);
  });

  it('skips items with no excerpt rather than inventing text', () => {
    const labels = sectionExcerpts(provisionalMorphology).map((e) => e.label);
    expect(labels).not.toContain('Scent');
    expect(labels).not.toContain('Diagnostic comparison');
  });

  it('returns nothing for an unavailable section', () => {
    expect(
      sectionExcerpts({
        state: 'unavailable',
        summary: null,
        items: [],
        receipts: [],
        unavailable_reason: 'Not yet assembled.',
      }),
    ).toEqual([]);
  });
});
