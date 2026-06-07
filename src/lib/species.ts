/**
 * Species data layer for the Orchid Continuum frontend.
 *
 * IMPORTANT ARCHITECTURE NOTE
 * ---------------------------
 * The frontend NEVER talks to a database directly. All species data
 * flows through the Orchid Continuum API (see ./api). This module
 * exposes a small, UI-friendly view over `ApiSpecies` so existing
 * components keep working with minimal changes, while the underlying
 * fetch path is now fully API-driven.
 */

import {
  speciesApi,
  type ApiSpecies,
  type ApiSpeciesSummary,
  type ApiResult,
} from './api';

export type Occurrence = {
  lat: number;
  lng: number;
  locality?: string;
  year?: number;
};

export type Pollinator = {
  name: string;
  taxon?: string;
  mechanism?: string;
};

export type Reference = {
  title: string;
  url?: string;
};

/**
 * UI-friendly species view used by the existing components.
 * `id` is the API's `taxonomy_id`; `slug` is also taxonomy_id so the
 * existing `/species/:slug` route keeps working.
 */
export type Species = {
  id: string;
  slug: string;
  taxonomy_id: string;
  genus: string;
  epithet: string;
  common_name: string | null;
  authority: string | null;
  family: string | null;
  subfamily: string | null;
  tribe: string | null;
  habitat: string;
  growth_form: string | null;
  region: string;
  countries: string[];
  conservation_status: string;
  iucn_code: string | null;
  description: string | null;
  ecology: string | null;
  image_url: string | null;
  occurrences: Occurrence[];
  pollinators: Pollinator[];
  traits: Record<string, unknown>;
  references_list: Reference[];
  knowledge_label?: string | null;
  confidence_label?: string | null;
  completeness_score?: number | null;
  missing_fields?: string[];
  provenance?: { sources?: string[]; last_synced?: string; license?: string };
  occurrence_summary?: ApiSpecies['occurrence_summary'];
  environmental?: ApiSpecies['environmental'];
};

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

function adaptSummary(s: ApiSpeciesSummary): Species {
  const genus = s.genus || (s.canonical_name?.split(' ')[0] ?? '');
  const epithet =
    s.specific_epithet || (s.canonical_name?.split(' ').slice(1).join(' ') ?? '');
  return {
    id: s.taxonomy_id,
    slug: s.taxonomy_id,
    taxonomy_id: s.taxonomy_id,
    genus,
    epithet,
    common_name: s.common_name ?? null,
    authority: null,
    family: s.family ?? null,
    subfamily: null,
    tribe: null,
    habitat: s.habitat || 'Unknown',
    growth_form: null,
    region: s.region || '',
    countries: [],
    conservation_status: s.conservation_status || 'Not assessed',
    iucn_code: null,
    description: null,
    ecology: null,
    image_url: s.representative_image_url ?? null,
    occurrences: [],
    pollinators: [],
    traits: {},
    references_list: [],
    knowledge_label: s.knowledge_label ?? null,
    confidence_label: s.confidence_label ?? null,
  };
}

function adaptFull(s: ApiSpecies): Species {
  const genus = s.genus || (s.canonical_name?.split(' ')[0] ?? '');
  const epithet =
    s.specific_epithet || (s.canonical_name?.split(' ').slice(1).join(' ') ?? '');
  return {
    id: s.taxonomy_id,
    slug: s.taxonomy_id,
    taxonomy_id: s.taxonomy_id,
    genus,
    epithet,
    common_name: s.common_name ?? null,
    authority: s.authority ?? null,
    family: s.family ?? null,
    subfamily: s.subfamily ?? null,
    tribe: s.tribe ?? null,
    habitat: s.habitat || 'Unknown',
    growth_form: s.growth_form ?? null,
    region: s.region || '',
    countries: s.countries ?? [],
    conservation_status: s.conservation_status || 'Not assessed',
    iucn_code: s.iucn_code ?? null,
    description: s.description ?? null,
    ecology: s.ecology ?? s.ecology_summary ?? null,
    image_url: s.hero_image_url ?? s.representative_image_url ?? null,
    occurrences: [],
    pollinators: [],
    traits: s.traits ?? {},
    references_list: s.references ?? [],
    knowledge_label: s.completeness?.label ?? null,
    confidence_label: s.confidence?.label ?? null,
    completeness_score: s.completeness?.score ?? null,
    missing_fields: s.completeness?.missing_fields ?? [],
    provenance: s.provenance,
    occurrence_summary: s.occurrence_summary,
    environmental: s.environmental,
  };
}

// ---------------------------------------------------------------------------
// Public API used by components
// ---------------------------------------------------------------------------

export interface SpeciesListResult {
  data: Species[];
  error: string | null;
  unconfigured: boolean;
}

export interface SpeciesDetailResult {
  data: Species | null;
  error: string | null;
  unconfigured: boolean;
}

export async function fetchFeaturedSpecies(
  signal?: AbortSignal,
): Promise<SpeciesListResult> {
  const r: ApiResult<ApiSpeciesSummary[]> = await speciesApi.featured(signal);
  return {
    data: (r.data ?? []).map(adaptSummary),
    error: r.error ? r.error.message : null,
    unconfigured: r.unconfigured,
  };
}

export async function searchSpecies(
  q: string,
  signal?: AbortSignal,
): Promise<SpeciesListResult> {
  const r = await speciesApi.search(q, signal);
  return {
    data: (r.data ?? []).map(adaptSummary),
    error: r.error ? r.error.message : null,
    unconfigured: r.unconfigured,
  };
}

export async function fetchSpeciesById(
  taxonomyId: string,
  signal?: AbortSignal,
): Promise<SpeciesDetailResult> {
  const r = await speciesApi.byId(taxonomyId, signal);
  if (r.unconfigured) return { data: null, error: null, unconfigured: true };
  if (r.error || !r.data) {
    // Try by-name as a fallback (handles slug-style canonical names)
    const r2 = await speciesApi.byName(taxonomyId, signal);
    if (r2.data) return { data: adaptFull(r2.data), error: null, unconfigured: false };
    return {
      data: null,
      error: (r.error || r2.error)?.message ?? 'Species not found.',
      unconfigured: false,
    };
  }
  return { data: adaptFull(r.data), error: null, unconfigured: false };
}

// ---------------------------------------------------------------------------
// Backwards-compatible exports (existing components import these names).
// ---------------------------------------------------------------------------

/** @deprecated Use fetchFeaturedSpecies / searchSpecies. */
export async function fetchSpecies(): Promise<Species[]> {
  const r = await fetchFeaturedSpecies();
  return r.data;
}

/** @deprecated Use fetchSpeciesById. */
export async function fetchSpeciesBySlug(
  slug: string,
): Promise<Species | null> {
  const r = await fetchSpeciesById(slug);
  return r.data;
}
