import React, { createContext, useContext, useMemo, useState } from 'react';
import { useHomepageFeatured } from '@/lib/homepageFeaturedContext';

export type RelationshipScope = 'species' | 'genus';
export type RelationshipAvailability = 'available' | 'unavailable' | 'unknown';

export interface HomepageRelationship {
  id: 'habitat' | 'pollinator' | 'fungi' | 'geography' | 'neighbors' | 'conservation';
  label: string;
  value: string | null;
  availability: RelationshipAvailability;
  scope: RelationshipScope;
  evidenceState: 'curated_profile' | 'backend_gap' | 'not_exposed';
  provenance: string[];
  caveat: string | null;
}

export interface HomepageRelationshipContextValue {
  subject: string;
  genus: string;
  activeSpecies: string | null;
  relationships: HomepageRelationship[];
  selectedRelationshipId: HomepageRelationship['id'] | null;
  selectRelationship: (id: HomepageRelationship['id'] | null) => void;
}

const Context = createContext<HomepageRelationshipContextValue | null>(null);

export const HomepageRelationshipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const featured = useHomepageFeatured();
  const [selectedRelationshipId, selectRelationship] = useState<HomepageRelationship['id'] | null>(null);

  const relationships = useMemo<HomepageRelationship[]>(() => [
    {
      id: 'habitat', label: 'Habitat', value: featured.habitatSummary,
      availability: featured.habitatSummary ? 'available' : 'unknown', scope: 'genus',
      evidenceState: featured.habitatSummary ? 'curated_profile' : 'not_exposed',
      provenance: featured.habitatSummary ? ['Orchid Continuum curated genus profile'] : [],
      caveat: featured.activeSpecies ? 'This homepage evidence is genus-level and must not be read as a species-specific habitat record.' : null,
    },
    {
      id: 'pollinator', label: 'Pollinators', value: null,
      availability: featured.relationshipAvailability === 'available' ? 'unknown' : featured.relationshipAvailability,
      scope: 'genus', evidenceState: 'backend_gap', provenance: [],
      caveat: 'The homepage contract does not yet expose a verified taxon-linked pollinator relationship record for the active species.',
    },
    {
      id: 'fungi', label: 'Mycorrhizal fungi', value: null,
      availability: featured.relationshipAvailability === 'available' ? 'unknown' : featured.relationshipAvailability,
      scope: 'genus', evidenceState: 'backend_gap', provenance: [],
      caveat: 'The homepage contract does not yet expose a verified taxon-linked mycorrhizal relationship record for the active species.',
    },
    {
      id: 'geography', label: 'Geography', value: featured.regionSummary,
      availability: featured.regionSummary ? 'available' : 'unknown', scope: 'genus',
      evidenceState: featured.regionSummary ? 'curated_profile' : 'not_exposed',
      provenance: featured.regionSummary ? ['Orchid Continuum curated genus profile'] : [],
      caveat: featured.activeSpecies ? 'This is genus-level geographic context; use the Atlas for occurrence evidence for the active species.' : null,
    },
    {
      id: 'neighbors', label: 'Neighboring orchids', value: null,
      availability: 'unknown', scope: 'genus', evidenceState: 'backend_gap', provenance: [],
      caveat: 'A canonical homepage co-occurrence contract has not yet been verified.',
    },
    {
      id: 'conservation', label: 'Conservation context', value: null,
      availability: 'unknown', scope: 'genus', evidenceState: 'not_exposed', provenance: [],
      caveat: 'Conservation relationships are not exposed through the current homepage relationship contract.',
    },
  ], [featured]);

  const value = useMemo(() => ({
    subject: featured.activeSpecies || featured.genus,
    genus: featured.genus,
    activeSpecies: featured.activeSpecies,
    relationships,
    selectedRelationshipId,
    selectRelationship,
  }), [featured.genus, featured.activeSpecies, relationships, selectedRelationshipId]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export function useHomepageRelationships(): HomepageRelationshipContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('useHomepageRelationships must be used inside HomepageRelationshipProvider');
  return value;
}
