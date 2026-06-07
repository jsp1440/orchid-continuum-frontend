/**
 * OACS — Orchid Adaptive Conservation / Cultivation Sensors module.
 * ----------------------------------------------------------------
 * Typed API contracts for greenhouse environmental monitoring.
 *
 * The frontend never reads a sensor stream directly. Greenhouse
 * controllers (SensorPush, Govee, custom PAR meters, etc.) publish
 * to the Continuum backend, which exposes curated, rate-limited
 * endpoints to the public frontend.
 *
 * Future endpoints:
 *   GET  /api/oacs/sites                        → SiteSummary[]
 *   GET  /api/oacs/sites/{site_id}              → SiteDetail
 *   GET  /api/oacs/sites/{site_id}/snapshot     → SnapshotReading
 *   GET  /api/oacs/sites/{site_id}/series?metric=temp_c&window=24h
 *   GET  /api/oacs/compare?taxonomy_id={id}     → GrowConditionComparison
 */

import { apiRequest, type ApiResult } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OacsMetric =
  | 'temp_c'
  | 'rh_pct'
  | 'par_umol'
  | 'vpd_kpa'
  | 'co2_ppm'
  | 'lux';

export interface SiteSummary {
  site_id: string;
  name: string;
  location?: string;
  greenhouse_type?: 'cool' | 'intermediate' | 'warm' | 'mixed';
  sensors?: number;
  last_reading_at?: string;
  status?: 'online' | 'stale' | 'offline';
}

export interface SnapshotReading {
  site_id: string;
  observed_at: string;
  temp_c?: number;
  rh_pct?: number;
  par_umol?: number; // photosynthetically active radiation
  vpd_kpa?: number;  // vapor pressure deficit
  co2_ppm?: number;
  lux?: number;
}

export interface SitePolicy {
  /** Target envelope curators want to maintain. */
  temp_c?: { min?: number; max?: number };
  rh_pct?: { min?: number; max?: number };
  vpd_kpa?: { min?: number; max?: number };
  par_umol?: { min?: number; max?: number };
}

export interface SiteDetail extends SiteSummary {
  description?: string;
  policy?: SitePolicy;
  notes?: string;
  hardware?: string[];
}

export interface GrowConditionComparison {
  taxonomy_id: string;
  canonical_name?: string;
  habitat_envelope?: SitePolicy;
  greenhouse_envelope?: SitePolicy;
  fit_score?: number; // 0..1 — how close the greenhouse matches habitat
  recommendations?: string[];
  data_needed?: boolean;
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export const oacsApi = {
  sites(signal?: AbortSignal): Promise<ApiResult<SiteSummary[]>> {
    return apiRequest<SiteSummary[]>('/api/oacs/sites', { signal });
  },

  site(siteId: string, signal?: AbortSignal): Promise<ApiResult<SiteDetail>> {
    return apiRequest<SiteDetail>(
      `/api/oacs/sites/${encodeURIComponent(siteId)}`,
      { signal },
    );
  },

  snapshot(
    siteId: string,
    signal?: AbortSignal,
  ): Promise<ApiResult<SnapshotReading>> {
    return apiRequest<SnapshotReading>(
      `/api/oacs/sites/${encodeURIComponent(siteId)}/snapshot`,
      { signal },
    );
  },

  compare(
    taxonomyId: string,
    signal?: AbortSignal,
  ): Promise<ApiResult<GrowConditionComparison>> {
    return apiRequest<GrowConditionComparison>('/api/oacs/compare', {
      query: { taxonomy_id: taxonomyId },
      signal,
    });
  },
};

// ---------------------------------------------------------------------------
// UI helpers — clearly demo / placeholder data, never marked as live.
// ---------------------------------------------------------------------------

export const OACS_PLACEHOLDER_MESSAGE =
  'OACS sensor pipeline coming online — values shown are demo placeholders.';

export const OACS_DEMO_SITES: SiteSummary[] = [
  {
    site_id: 'demo-cool-house',
    name: 'Cloud-forest Cool House',
    location: 'Demo · Coastal mesophyte',
    greenhouse_type: 'cool',
    sensors: 6,
    status: 'online',
  },
  {
    site_id: 'demo-intermediate-house',
    name: 'Intermediate House',
    location: 'Demo · Andean mid-elevation',
    greenhouse_type: 'intermediate',
    sensors: 8,
    status: 'online',
  },
  {
    site_id: 'demo-warm-house',
    name: 'Warm Lowland House',
    location: 'Demo · Tropical lowland',
    greenhouse_type: 'warm',
    sensors: 5,
    status: 'stale',
  },
];

export const OACS_DEMO_SNAPSHOTS: Record<string, SnapshotReading> = {
  'demo-cool-house': {
    site_id: 'demo-cool-house',
    observed_at: new Date().toISOString(),
    temp_c: 17.4,
    rh_pct: 82,
    par_umol: 240,
    vpd_kpa: 0.42,
    co2_ppm: 480,
  },
  'demo-intermediate-house': {
    site_id: 'demo-intermediate-house',
    observed_at: new Date().toISOString(),
    temp_c: 22.1,
    rh_pct: 74,
    par_umol: 380,
    vpd_kpa: 0.71,
    co2_ppm: 510,
  },
  'demo-warm-house': {
    site_id: 'demo-warm-house',
    observed_at: new Date().toISOString(),
    temp_c: 27.6,
    rh_pct: 68,
    par_umol: 520,
    vpd_kpa: 1.18,
    co2_ppm: 540,
  },
};

export const METRIC_META: Record<
  OacsMetric,
  { label: string; unit: string; help: string }
> = {
  temp_c: {
    label: 'Temperature',
    unit: '°C',
    help: 'Air temperature inside the canopy zone.',
  },
  rh_pct: {
    label: 'Relative Humidity',
    unit: '%',
    help: 'Air RH — drives stomatal behavior and Velamen radicum hydration.',
  },
  par_umol: {
    label: 'PAR',
    unit: 'µmol·m⁻²·s⁻¹',
    help: 'Photosynthetically Active Radiation, 400–700 nm.',
  },
  vpd_kpa: {
    label: 'VPD',
    unit: 'kPa',
    help: 'Vapor Pressure Deficit — the actual evaporative demand on the leaf.',
  },
  co2_ppm: {
    label: 'CO₂',
    unit: 'ppm',
    help: 'Carbon dioxide concentration in the canopy air.',
  },
  lux: { label: 'Illuminance', unit: 'lux', help: 'Visible-light proxy for PAR.' },
};
