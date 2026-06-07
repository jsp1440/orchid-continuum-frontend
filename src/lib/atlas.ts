/**
 * Atlas API contracts (placeholder layer)
 * ---------------------------------------
 * The Atlas is the geospatial intelligence layer of the Orchid Continuum.
 * It is intentionally NOT hard-coded as a static page. Instead, this
 * module declares the typed contracts and consumer hooks that the
 * frontend will use once the Atlas API endpoints come online.
 *
 * Future endpoints (server side) — to be implemented and consumed via
 * `apiRequest` from `./api`:
 *
 *   GET /api/atlas/occurrences            — global occurrence point cloud
 *   GET /api/atlas/genus/{genus}/map      — genus-level map
 *   GET /api/atlas/species/{id}/map       — species-level map
 *   GET /api/atlas/overlays/pollination   — pollination interaction overlay
 *   GET /api/atlas/overlays/mycorrhizal   — fungal association overlay
 *   GET /api/atlas/overlays/pollinator-range
 *   GET /api/atlas/overlays/co-occurrence
 *   GET /api/atlas/overlays/topographic
 *   GET /api/atlas/overlays/climate
 *   GET /api/atlas/temporal?from=&to=     — temporal slider data
 *   GET /api/atlas/historical?year=
 *
 * Filter contract (for any of the above):
 *   genus, species, country, elevation_min/max, interaction_type,
 *   pollinator, fungal_partner, year_from, year_to, biome
 *
 * Renderer contract:
 *   Atlas components are designed to plug into Leaflet, MapLibre, or
 *   deck.gl. None of them ship with hard-coded coordinates — the
 *   placeholder UI shows "Atlas intelligence layer coming online"
 *   until the API is reachable.
 */

import { apiRequest, type ApiResult } from './api';
import { ATLAS_OCCURRENCES_URL } from './backendConfig';

// ---------------------------------------------------------------------------
// Filter & layer types
// ---------------------------------------------------------------------------

export type AtlasLayerKind =
  | 'occurrence'
  | 'genus'
  | 'species'
  | 'pollination'
  | 'mycorrhizal'
  | 'pollinator-range'
  | 'co-occurrence'
  | 'topographic'
  | 'climate'
  | 'temporal'
  | 'historical';

export interface AtlasFilters {
  genus?: string;
  species?: string;
  country?: string;
  elevation_min?: number;
  elevation_max?: number;
  interaction_type?: string;
  pollinator?: string;
  fungal_partner?: string;
  year_from?: number;
  year_to?: number;
  biome?: string;
}

export interface AtlasFeature {
  id: string;
  kind: AtlasLayerKind;
  lat: number;
  lng: number;
  properties?: Record<string, unknown>;
}

export interface AtlasLayer {
  kind: AtlasLayerKind;
  features: AtlasFeature[];
  meta?: { count?: number; generated_at?: string };
}

// ---------------------------------------------------------------------------
// Placeholder hooks
//
// Each hook calls a documented future endpoint. Until the backend is
// online, these will return `unconfigured: true` (no API base) or a
// transparent error — the UI is responsible for showing "Atlas
// intelligence layer coming online".
// ---------------------------------------------------------------------------

export const atlasApi = {
  occurrences(
    filters: AtlasFilters = {},
    signal?: AbortSignal,
  ): Promise<ApiResult<AtlasLayer>> {
    return apiRequest<AtlasLayer>(ATLAS_OCCURRENCES_URL, {
      query: filters as Record<string, string | number | undefined>,
      signal,
    });
  },

  genusMap(
    genus: string,
    signal?: AbortSignal,
  ): Promise<ApiResult<AtlasLayer>> {
    return apiRequest<AtlasLayer>(
      `/api/atlas/genus/${encodeURIComponent(genus)}/map`,
      { signal },
    );
  },

  speciesMap(
    taxonomyId: string,
    signal?: AbortSignal,
  ): Promise<ApiResult<AtlasLayer>> {
    return apiRequest<AtlasLayer>(
      `/api/atlas/species/${encodeURIComponent(taxonomyId)}/map`,
      { signal },
    );
  },

  overlay(
    kind: Exclude<AtlasLayerKind, 'genus' | 'species' | 'occurrence'>,
    filters: AtlasFilters = {},
    signal?: AbortSignal,
  ): Promise<ApiResult<AtlasLayer>> {
    return apiRequest<AtlasLayer>(`/api/atlas/overlays/${kind}`, {
      query: filters as Record<string, string | number | undefined>,
      signal,
    });
  },

  temporal(
    filters: AtlasFilters = {},
    signal?: AbortSignal,
  ): Promise<ApiResult<AtlasLayer>> {
    return apiRequest<AtlasLayer>('/api/atlas/temporal', {
      query: filters as Record<string, string | number | undefined>,
      signal,
    });
  },

  historical(
    year: number,
    filters: AtlasFilters = {},
    signal?: AbortSignal,
  ): Promise<ApiResult<AtlasLayer>> {
    return apiRequest<AtlasLayer>('/api/atlas/historical', {
      query: { year, ...filters } as Record<string, string | number | undefined>,
      signal,
    });
  },
};

/** Status string consumed by placeholder UI components. */
export const ATLAS_PLACEHOLDER_MESSAGE =
  'Atlas intelligence layer coming online.';
