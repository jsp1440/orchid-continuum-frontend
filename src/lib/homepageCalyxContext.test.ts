import { describe, expect, it } from 'vitest';
import { buildHomepageCalyxContext } from './homepageCalyxContext';
import type { HomepageFeaturedContextValue } from './homepageFeaturedContext';
import type { HomepageRelationshipContextValue } from './homepageRelationshipContext';
import type { HomepageAtlasContextValue } from './homepageAtlasContext';

describe('homepage Calyx context', () => {
  it('preserves genus/species, Atlas semantics, and relationship scope without inventing evidence', () => {
    const featured = {
      genus: 'Dracula', activeSpecies: 'Dracula vampira', activeTaxonId: 't1', activeMedia: null, media: [], attribution: null, license: null, mediaSource: null,
      regionSummary: 'Andes', habitatSummary: 'Cloud forest', elevationSummary: '1800–2500 m', climateSummary: null,
      occurrenceAvailability: 'unknown', relationshipAvailability: 'unknown', provenanceState: 'local_profile_only', availability: 'ready', errorMessage: null, selectSpecies: () => undefined,
    } as HomepageFeaturedContextValue;
    const relationships = {
      subject: 'Dracula vampira', genus: 'Dracula', activeSpecies: 'Dracula vampira', selectedRelationshipId: 'habitat', selectRelationship: () => undefined,
      relationships: [{ id: 'habitat', label: 'Habitat', value: 'Cloud forest', availability: 'available', scope: 'genus', evidenceState: 'curated_profile', provenance: ['profile'], caveat: 'Genus-level only.' }],
    } as HomepageRelationshipContextValue;
    const atlas = { activeTheme: 'distribution', setActiveTheme: () => undefined, dataStatus: 'ok', setDataStatus: () => undefined, interpretation: 'Occurrence evidence.', setInterpretation: () => undefined } as HomepageAtlasContextValue;

    const value = buildHomepageCalyxContext(featured, relationships, atlas);
    expect(value.active_species).toBe('Dracula vampira');
    expect(value.atlas.theme).toBe('distribution');
    expect(value.relationships[0]).toMatchObject({ scope: 'genus', evidence_state: 'curated_profile' });
    expect(value.caveats).toContain('Genus-level only.');
  });
});
