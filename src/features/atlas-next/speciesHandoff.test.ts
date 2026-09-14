import { describe, expect, it } from 'vitest';

import {
  atlasNextContinuumActions,
  atlasNextSpeciesHref,
} from './researchHandoff';

describe('Atlas Next → Species handoff', () => {
  it('preserves the exact canonical genus with no extra route material', () => {
    const href = atlasNextSpeciesHref({ genus: 'Phalaenopsis' });
    expect(href).toBe('/species?genus=Phalaenopsis');

    const params = new URL(href!, 'https://orchidcontinuum.org').searchParams;
    expect(Array.from(params.keys())).toEqual(['genus']);
    expect(params.get('genus')).toBe('Phalaenopsis');
  });

  it('fails closed on malformed, noncanonical, or widened genus context', () => {
    expect(atlasNextSpeciesHref({ genus: '' })).toBeNull();
    expect(atlasNextSpeciesHref({ genus: 'phalaenopsis' })).toBeNull();
    expect(atlasNextSpeciesHref({ genus: 'Phalaenopsis amabilis' })).toBeNull();
    expect(atlasNextSpeciesHref({ genus: 'Phalaenopsis?lat=34.1' })).toBeNull();
    expect(atlasNextSpeciesHref({ genus: `P${'x'.repeat(120)}` })).toBeNull();
  });

  it('adds Species to the same governed Atlas Next fan-out without leaking project or evidence state', () => {
    const actions = atlasNextContinuumActions({
      genus: 'Phalaenopsis',
      projectId: 'naocc-phalaenopsis',
    });

    expect(actions.map((action) => action.id)).toEqual(['research', 'calyx', 'species']);
    const species = actions.find((action) => action.id === 'species');
    expect(species?.href).toBe('/species?genus=Phalaenopsis');

    const keys = Array.from(
      new URL(species!.href, 'https://orchidcontinuum.org').searchParams.keys(),
    );
    expect(keys).toEqual(['genus']);
    expect(keys).not.toContain('project');
    expect(keys).not.toContain('origin');
    expect(keys).not.toContain('context_is_evidence');
  });

  it('keeps locality, occurrence, collector, and evidence material out of the Species route', () => {
    const href = atlasNextSpeciesHref({ genus: 'Phalaenopsis' })!;
    const params = new URL(href, 'https://orchidcontinuum.org').searchParams;

    for (const forbidden of [
      'lat',
      'lng',
      'latitude',
      'longitude',
      'locality',
      'location',
      'occurrence',
      'record',
      'collector',
      'catalog',
      'site',
      'grid',
      'gps',
      'elevation',
      'project',
      'evidence',
      'confidence',
      'conclusion',
    ]) {
      expect(params.has(forbidden)).toBe(false);
    }
  });
});
