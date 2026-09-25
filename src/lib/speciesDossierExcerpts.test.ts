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
      { label: 'Morphology', text: 'Epiphytic herb with 3–5 leaves.', truncated: false, evidenceState: null },
      { label: 'Fruit capsule', text: 'Capsule ellipsoid, ribbed', truncated: true, evidenceState: null },
    ]);
  });

  it("drops the backend's own [...] marker so a shortened excerpt is marked once", () => {
    const section: DossierSection = {
      ...provisionalMorphology,
      items: [{ evidence_type: 'morphology', excerpt: 'Leaves oblong, fleshy [...]', excerpt_truncated: true }],
    };
    expect(sectionExcerpts(section)[0]).toMatchObject({ text: 'Leaves oblong, fleshy', truncated: true });
    // An untruncated excerpt keeps its text verbatim.
    const verbatim = { ...section, items: [{ evidence_type: 'morphology', excerpt: 'Ends [...]' }] };
    expect(sectionExcerpts(verbatim)[0].text).toBe('Ends [...]');
  });

  it("names an item's evidence state only when it differs from the section's", () => {
    const section: DossierSection = {
      ...provisionalMorphology,
      state: 'available',
      items: [
        { evidence_type: 'morphology', excerpt: 'A.', evidence_state: 'provisional' },
        { evidence_type: 'phenology', excerpt: 'B.', evidence_state: 'available' },
      ],
    };
    expect(sectionExcerpts(section).map((e) => e.evidenceState)).toEqual(['provisional', null]);
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
