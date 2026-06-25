/**
 * FRONTEND-R1 release API facade.
 *
 * This module is the release-facing integration layer for the v0.1 Preview
 * Release pages. It intentionally reuses the existing Orchid Continuum clients
 * instead of creating a competing fetch stack.
 *
 * Existing live wrappers remain in:
 * - src/lib/ocBackend.ts
 * - src/lib/api.ts
 * - src/lib/backendConfig.ts
 *
 * This facade gives homepage, atlas, species, and research-station components a
 * stable, typed place to import release-critical data calls as the API surface
 * is consolidated.
 */

import { BACKEND_BASE_URL } from './backendConfig';
import {
  fetchAtlasOccurrences,
  fetchGenusOfDay,
  fetchGeneraCount,
  fetchMycorrhizal,
  fetchMycorrhizalStats,
  fetchSpeciesById,
  searchSpecies,
  type GenusDaily,
  type MycorrhizalPartner,
  type OccurrencePoint,
  type SpeciesDossierData,
  type SpeciesSearchResult,
} from './ocBackend';

const RELEASE_TIMEOUT_MS = 12_000;

export type ReleaseApiStatus = 'available' | 'empty' | 'error' | 'unconfirmed';

export interface ReleaseApiResult<T> {
  status: ReleaseApiStatus;
  data: T | null;
  endpoint: string;
  error?: string;
}

export interface AtlasStats {
  species_count?: number;
  genera_count?: number;
  genus_count?: number;
  occurrence_count?: number;
  occurrences_count?: number;
  countries_count?: number;
  image_count?: number;
  last_updated?: string;
}

export interface LiteratureStats {
  literature_count?: number;
  article_count?: number;
  reference_count?: number;
  claim_count?: number;
  extraction_count?: number;
  last_updated?: string;
}

export interface RunnerSummary {
  status?: string;
  last_run_at?: string;
  active_jobs?: number;
  completed_jobs?: number;
  failed_jobs?: number;
  message?: string;
}

export interface ReleaseHomepageData {
  dailyGenus: GenusDaily | null;
  atlasStats: AtlasStats | null;
  literatureStats: LiteratureStats | null;
  mycorrhizalAssociations: number | null;
  researchSummary: RunnerSummary | null;
}

async function releaseFetch<T>(endpoint: string, signal?: AbortSignal): Promise<ReleaseApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELEASE_TIMEOUT_MS);

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(`${BACKEND_BASE_URL}${endpoint}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return {
        status: res.status === 404 ? 'unconfirmed' : 'error',
        data: null,
        endpoint,
        error: `HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as T;
    return {
      status: data == null ? 'empty' : 'available',
      data,
      endpoint,
    };
  } catch (error: any) {
    return {
      status: error?.name === 'AbortError' ? 'error' : 'error',
      data: null,
      endpoint,
      error: error?.message || 'Network error',
    };
  } finally {
    clearTimeout(timer);
  }
}

function unwrap<T>(result: ReleaseApiResult<T>): T | null {
  return result.status === 'available' ? result.data : null;
}

export const releaseApi = {
  dailyGenus: fetchGenusOfDay,
  genusCount: fetchGeneraCount,
  atlasOccurrences: fetchAtlasOccurrences,
  speciesSearch: searchSpecies,
  speciesById: fetchSpeciesById,
  mycorrhizal: fetchMycorrhizal,
  mycorrhizalStats: fetchMycorrhizalStats,

  atlasStats: (signal?: AbortSignal) =>
    releaseFetch<AtlasStats>('/api/atlas/stats', signal),

  literatureStats: (signal?: AbortSignal) =>
    releaseFetch<LiteratureStats>('/api/literature/stats', signal),

  runnerSummary: (signal?: AbortSignal) =>
    releaseFetch<RunnerSummary>('/api/runner/summary', signal),

  speciesLiterature: (taxonomyId: string, signal?: AbortSignal) =>
    releaseFetch<LiteratureStats>(
      `/api/species/${encodeURIComponent(taxonomyId)}/literature`,
      signal,
    ),

  speciesOccurrences: (taxonomyId: string, signal?: AbortSignal) =>
    releaseFetch<{ occurrences?: OccurrencePoint[]; count?: number }>(
      `/api/species/${encodeURIComponent(taxonomyId)}/occurrences`,
      signal,
    ),
};

export async function fetchReleaseHomepageData(signal?: AbortSignal): Promise<ReleaseHomepageData> {
  const [dailyGenus, atlasStats, literatureStats, mycorrhizalAssociations, researchSummary] =
    await Promise.all([
      releaseApi.dailyGenus(signal),
      releaseApi.atlasStats(signal).then(unwrap),
      releaseApi.literatureStats(signal).then(unwrap),
      releaseApi.mycorrhizalStats(signal).catch(() => null),
      releaseApi.runnerSummary(signal).then(unwrap),
    ]);

  return {
    dailyGenus,
    atlasStats,
    literatureStats,
    mycorrhizalAssociations,
    researchSummary,
  };
}

export type {
  GenusDaily,
  MycorrhizalPartner,
  OccurrencePoint,
  SpeciesDossierData,
  SpeciesSearchResult,
};
