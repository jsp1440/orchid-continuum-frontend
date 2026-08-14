import type { HomepageFeaturedContextValue } from '@/lib/homepageFeaturedContext';
import type { HomepageRelationshipContextValue } from '@/lib/homepageRelationshipContext';
import type { HomepageAtlasContextValue } from '@/lib/homepageAtlasContext';

export const HOMEPAGE_CALYX_CONTEXT_KEY = 'orchid-continuum:homepage-calyx-context:v1';

export interface HomepageCalyxContextPayload {
  surface: 'homepage';
  active_genus: string;
  active_species: string | null;
  taxon_id: string | null;
  active_media: {
    scientific_name: string;
    source: string | null;
    attribution: string | null;
    license: string | null;
  } | null;
  atlas: {
    theme: HomepageAtlasContextValue['activeTheme'];
    data_status: HomepageAtlasContextValue['dataStatus'];
    interpretation: string | null;
  };
  relationships: Array<{
    id: string;
    label: string;
    availability: string;
    scope: string;
    evidence_state: string;
    value: string | null;
    caveat: string | null;
    provenance: string[];
  }>;
  selected_relationship: string | null;
  caveats: string[];
}

export function buildHomepageCalyxContext(
  featured: HomepageFeaturedContextValue,
  relationships: HomepageRelationshipContextValue,
  atlas: HomepageAtlasContextValue,
): HomepageCalyxContextPayload {
  const caveats = relationships.relationships
    .map((item) => item.caveat)
    .filter((value): value is string => Boolean(value));

  return {
    surface: 'homepage',
    active_genus: featured.genus,
    active_species: featured.activeSpecies,
    taxon_id: featured.activeTaxonId,
    active_media: featured.activeMedia
      ? {
          scientific_name: featured.activeMedia.scientific_name,
          source: featured.mediaSource,
          attribution: featured.attribution,
          license: featured.license,
        }
      : null,
    atlas: {
      theme: atlas.activeTheme,
      data_status: atlas.dataStatus,
      interpretation: atlas.interpretation,
    },
    relationships: relationships.relationships.map((item) => ({
      id: item.id,
      label: item.label,
      availability: item.availability,
      scope: item.scope,
      evidence_state: item.evidenceState,
      value: item.value,
      caveat: item.caveat,
      provenance: item.provenance,
    })),
    selected_relationship: relationships.selectedRelationshipId,
    caveats,
  };
}

export function storeHomepageCalyxContext(payload: HomepageCalyxContextPayload): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(HOMEPAGE_CALYX_CONTEXT_KEY, JSON.stringify(payload));
  } catch {
    // fail soft: contextual handoff is optional; conversation still works without it
  }
}

export function readHomepageCalyxContext(): HomepageCalyxContextPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(HOMEPAGE_CALYX_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HomepageCalyxContextPayload>;
    if (parsed.surface !== 'homepage' || typeof parsed.active_genus !== 'string') return null;
    return parsed as HomepageCalyxContextPayload;
  } catch {
    return null;
  }
}
