/**
 * Orchid Continuum API Client
 *
 * Typed fetch wrappers for the Orchid Continuum biodiversity intelligence API.
 * The frontend NEVER touches the database directly — all data flows through
 * this client. The base URL is configured via Vite env var:
 *
 *   VITE_API_BASE_URL=https://api.orchidcontinuum.org
 *
 * (We also accept NEXT_PUBLIC_API_BASE_URL for portability with Next.js
 * style configuration, in case the build pipeline injects it.)
 *
 * Architectural notes
 * -------------------
 * - Every call is timeout-safe (default 12s) so the UI never hangs.
 * - Errors are typed (ApiError) and never thrown into render trees —
 *   callers receive a typed result and can render scientifically honest
 *   empty states ("Metrics currently refreshing", "Interaction
 *   intelligence coming online", etc.).
 * - The client is the only place that knows about the backend shape;
 *   feature modules (species, atlas, zoo, interactions) consume it.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const env =
  (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};

export const API_BASE_URL: string =
  env.VITE_API_BASE_URL ||
  env.NEXT_PUBLIC_API_BASE_URL ||
  '';

export const API_CONFIGURED = Boolean(API_BASE_URL);

const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * Feature-flag envelope. The platform reads boolean Vite env vars so each
 * deployment can enable / disable modules without code changes. Flags
 * default to `true` so a fresh deployment shows the full Continuum.
 *
 *   VITE_ENABLE_DEMO_MODE   — render labelled mock fallbacks when API is down
 *   VITE_ENABLE_ATLAS       — show the geospatial Atlas module
 *   VITE_ENABLE_ORCHID_ZOO  — show the citizen-science reviewer workflow
 *   VITE_ENABLE_OACS        — show the greenhouse telemetry module
 */
const flag = (raw: unknown, fallback: boolean): boolean => {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const v = String(raw).toLowerCase().trim();
  return !(v === 'false' || v === '0' || v === 'no' || v === 'off');
};

export const FEATURES = {
  demoMode: flag(env.VITE_ENABLE_DEMO_MODE, true),
  atlas: flag(env.VITE_ENABLE_ATLAS, true),
  orchidZoo: flag(env.VITE_ENABLE_ORCHID_ZOO, true),
  oacs: flag(env.VITE_ENABLE_OACS, true),
} as const;

export type FeatureKey = keyof typeof FEATURES;

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export type ApiHealth = 'unconfigured' | 'checking' | 'online' | 'offline';

export interface HealthReport {
  status: ApiHealth;
  base: string;
  checkedAt: string;
  latencyMs?: number;
  message?: string;
}

/**
 * Lightweight health probe — pings `/health` (FastAPI convention) with a
 * short timeout and reports back. Never throws. Useful for the global
 * "API online" indicator and demo-mode banners.
 */
export async function checkApiHealth(
  timeoutMs = 4_000,
): Promise<HealthReport> {
  const checkedAt = new Date().toISOString();
  if (!API_CONFIGURED) {
    return {
      status: 'unconfigured',
      base: '',
      checkedAt,
      message: 'VITE_API_BASE_URL is not set for this deployment.',
    };
  }
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(buildUrl('/health'), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const latencyMs = Math.round(performance.now() - start);
    return {
      status: res.ok ? 'online' : 'offline',
      base: API_BASE_URL,
      checkedAt,
      latencyMs,
      message: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e: any) {
    return {
      status: 'offline',
      base: API_BASE_URL,
      checkedAt,
      message: e?.message || 'Network error',
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  endpoint: string;
  constructor(message: string, status: number, endpoint: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

export interface ApiResult<T> {
  data: T | null;
  error: ApiError | null;
  /** True if the API base URL is not configured for this deployment. */
  unconfigured: boolean;
}

// ---------------------------------------------------------------------------
// Core request
// ---------------------------------------------------------------------------

interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  query?: Record<string, string | number | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = API_BASE_URL.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${cleanPath}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  if (!API_CONFIGURED) {
    return { data: null, error: null, unconfigured: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  // chain user-provided signal
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    options.signal.addEventListener('abort', () => controller.abort());
  }

  const url = buildUrl(path, options.query);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const message = `Request failed (${res.status}) — ${path}`;
      return {
        data: null,
        error: new ApiError(message, res.status, path),
        unconfigured: false,
      };
    }
    const data = (await res.json()) as T;
    return { data, error: null, unconfigured: false };
  } catch (e: any) {
    const status = e?.name === 'AbortError' ? 408 : 0;
    const message =
      e?.name === 'AbortError'
        ? `Request timed out — ${path}`
        : (e?.message || 'Network error');
    return {
      data: null,
      error: new ApiError(message, status, path),
      unconfigured: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Species API surface
// ---------------------------------------------------------------------------

/**
 * Canonical species record returned by the Orchid Continuum API.
 * Fields are intentionally optional so the UI can render transparent
 * empty states when data is incomplete.
 */
export interface ApiSpecies {
  taxonomy_id: string;
  canonical_name?: string;
  genus?: string;
  specific_epithet?: string;
  authority?: string;
  common_name?: string | null;
  family?: string;
  subfamily?: string | null;
  tribe?: string | null;
  habitat?: string | null;
  growth_form?: string | null;
  region?: string | null;
  countries?: string[];
  conservation_status?: string | null;
  iucn_code?: string | null;
  description?: string | null;
  ecology?: string | null;
  hero_image_url?: string | null;
  representative_image_url?: string | null;
  occurrence_summary?: {
    total?: number;
    countries?: number;
    first_year?: number;
    last_year?: number;
  };
  ecology_summary?: string | null;
  environmental?: {
    elevation_min_m?: number;
    elevation_max_m?: number;
    temperature_c?: { min?: number; max?: number };
    precipitation_mm?: { min?: number; max?: number };
    biomes?: string[];
  };
  traits?: Record<string, unknown>;
  provenance?: {
    sources?: string[];
    last_synced?: string;
    license?: string;
  };
  completeness?: {
    score?: number; // 0..1
    label?: string; // e.g. "high", "partial"
    missing_fields?: string[];
  };
  confidence?: {
    score?: number;
    label?: string;
  };
  references?: { title: string; url?: string }[];
}

export interface ApiSpeciesSummary {
  taxonomy_id: string;
  canonical_name: string;
  genus?: string;
  specific_epithet?: string;
  common_name?: string | null;
  family?: string;
  representative_image_url?: string | null;
  region?: string | null;
  habitat?: string | null;
  conservation_status?: string | null;
  knowledge_label?: string | null;
  confidence_label?: string | null;
}

export interface ApiMetrics {
  species_count?: number;
  genera_count?: number;
  occurrence_count?: number;
  countries_count?: number;
  image_count?: number;
  microscopy_count?: number;
  pollinator_records?: number;
  last_updated?: string;
}

export interface ApiGap {
  taxonomy_id?: string;
  canonical_name?: string;
  field: string;
  severity?: 'low' | 'medium' | 'high';
}

export const speciesApi = {
  featured: (signal?: AbortSignal) =>
    apiRequest<ApiSpeciesSummary[]>('/api/species/featured', { signal }),

  search: (q: string, signal?: AbortSignal) =>
    apiRequest<ApiSpeciesSummary[]>('/api/species/search', {
      query: { q },
      signal,
    }),

  byId: (taxonomyId: string, signal?: AbortSignal) =>
    apiRequest<ApiSpecies>(
      `/api/species/${encodeURIComponent(taxonomyId)}`,
      { signal },
    ),

  byName: (canonicalName: string, signal?: AbortSignal) =>
    apiRequest<ApiSpecies>(
      `/api/species/by-name/${encodeURIComponent(canonicalName)}`,
      { signal },
    ),

  metrics: (signal?: AbortSignal) =>
    apiRequest<ApiMetrics>('/api/species/metrics', { signal }),

  gaps: (signal?: AbortSignal) =>
    apiRequest<ApiGap[]>('/api/species/gaps', { signal }),
};
