import { describe, expect, it } from 'vitest';
import {
  buildPublicCalyxGuideModel,
  buildPublicCalyxPrompts,
  evidenceStatusLabel,
  relationshipStatusLabel,
} from './publicCalyxContext';
import type { FeaturedTaxonContinuum } from './featuredTaxonContinuum';

function continuum(overrides: Partial<FeaturedTaxonContinuum> = {}): FeaturedTaxonContinuum {
  return {
    genus: 'Cattleya',
    media: {} as FeaturedTaxonContinuum['media'],
    graph: { status: 'ok', evidence: { domains: [] } } as FeaturedTaxonContinuum['graph'],
    relationships: {
      genus: 'Cattleya',
      speciesCount: 12,
      description: 'canonical',
      isFallback: false,
      pollinators: { count: 2, summary: '2 linked', items: ['bee'], hasData: true },
      fungi: { count: 0, summary: 'No data yet', items: [], hasData: false },
      geography: { count: null, summary: 'linked', items: [], hasData: true },
      climate: { count: null, summary: 'No data yet', items: [], hasData: false },
      conservation: { count: null, summary: 'No data yet', items: [], hasData: false },
      cultivation: { count: null, summary: 'No data yet', items: [], hasData: false },
      knowledge: { count: null, summary: 'No data yet', items: [], hasData: false },
    },
    domains: [
      { domain: 'taxonomy', state: 'known', nodes: 1, edges: 1 },
      { domain: 'occurrences', state: 'unknown', nodes: 0, edges: 0 },
    ],
    conservation: { state: 'unknown', nodes: 0, edges: 0, relationship: null },
    gaps: ['occurrences'],
    ...overrides,
  };
}

describe('Public Calyx page context', () => {
  it('keeps loading context free of scientific claims', () => {
    const model = buildPublicCalyxGuideModel({ genus: 'Cattleya', continuum: null, continuumStatus: 'loading' });

    expect(model.provenance).toBe('not-available');
    expect(model.atlasTheme.label).toBe('No theme selected on homepage');
    expect(model.relationships.every((relationship) => relationship.state === 'loading')).toBe(true);
    expect(evidenceStatusLabel(model)).toBe('Loading canonical graph state');
    expect(buildPublicCalyxPrompts(model)[0].question).toContain('currently known');
  });

  it('shows documented relationships and explicit graph gaps from the canonical read model', () => {
    const model = buildPublicCalyxGuideModel({ genus: 'Cattleya', continuum: continuum(), continuumStatus: 'ready' });

    expect(model.provenance).toBe('canonical-continuum');
    expect(model.relationships).toEqual([
      { id: 'pollinators', label: 'Pollinators', state: 'documented', count: 2 },
      { id: 'fungi', label: 'Fungi', state: 'unknown', count: null },
      { id: 'geography', label: 'Place', state: 'documented', count: null },
    ]);
    expect(model.evidence.knownDomains).toEqual(['taxonomy']);
    expect(model.evidence.gapDomains).toEqual(['occurrence geography']);
    expect(evidenceStatusLabel(model)).toBe('1 canonical domain linked');
    expect(relationshipStatusLabel(model.relationships[0])).toBe('2 linked records');
    expect(relationshipStatusLabel(model.relationships[1])).toBe('No linked evidence in this traversal');
    expect(buildPublicCalyxPrompts(model)[1].question).toContain('would researchers need');
  });

  it('preserves unavailable state and never echoes backend summaries or items', () => {
    const model = buildPublicCalyxGuideModel({
      genus: 'Cattleya',
      continuum: null,
      continuumStatus: 'unavailable',
    });

    expect(model.relationships.every((relationship) => relationship.state === 'unavailable')).toBe(true);
    expect(model.evidence.state).toBe('unavailable');
    expect(JSON.stringify(model)).not.toContain('No data yet');
    expect(JSON.stringify(model)).not.toContain('bee');
    expect(relationshipStatusLabel(model.relationships[0])).toBe('Unavailable; no claim made');
    expect(buildPublicCalyxPrompts(model)[3].question).toContain('sources support');
  });
});
