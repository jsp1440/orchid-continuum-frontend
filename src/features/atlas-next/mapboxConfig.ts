/**
 * ATLAS-NEXT — Mapbox configuration contract.
 *
 * The globe owns the top of the scale ladder; a tiled map owns the bottom. This
 * module is the boundary between "the Atlas would like to descend" and "the
 * deployment is configured to let it".
 *
 * No token is read from anywhere but the environment, and no token is written
 * down here. If none is configured the Atlas says exactly which variable is
 * missing and stays on the globe — it never degrades to a broken map, and it
 * never pretends the regional scales do not exist.
 */

const env = import.meta.env as Record<string, string | undefined>;

/** The one variable a deployment sets. Named in the UI when it is absent. */
export const MAPBOX_TOKEN_ENV_VAR = 'VITE_MAPBOX_TOKEN';

/**
 * One shape rather than a discriminated union: this project compiles with
 * `strict: false`, where narrowing on a boolean discriminant is unreliable, and
 * a configuration check is not the place to find that out.
 */
export interface MapboxConfigState {
  configured: boolean;
  /** Present only when configured. Never logged, never rendered. */
  token: string | null;
  /** The variable a deployment sets. Always populated, so the UI can name it. */
  envVar: string;
  /** Why it is unusable, when it is. Empty when configured. */
  reason: string;
}

export function mapboxConfig(): MapboxConfigState {
  const raw = (env[MAPBOX_TOKEN_ENV_VAR] ?? '').trim();
  const base = { configured: false, token: null, envVar: MAPBOX_TOKEN_ENV_VAR };

  if (!raw) {
    return { ...base, reason: `${MAPBOX_TOKEN_ENV_VAR} is not set in this deployment.` };
  }
  // A public token is the only kind that belongs in a browser bundle. A secret
  // token here would be a credential leak, so refuse it rather than use it.
  if (!raw.startsWith('pk.')) {
    return {
      ...base,
      reason: `${MAPBOX_TOKEN_ENV_VAR} is set but is not a public token. Browser bundles are public, so only a pk.* token may be used here — a secret sk.* token must never be shipped to a client.`,
    };
  }
  return { configured: true, token: raw, envVar: MAPBOX_TOKEN_ENV_VAR, reason: '' };
}

export const isMapboxConfigured = (): boolean => mapboxConfig().configured;

/**
 * Dark cartographic style, chosen to sit continuously beside the globe rather
 * than to look like a different product. Overridable so a deployment can point
 * at a Studio style without a code change.
 */
export const MAPBOX_STYLE_URL =
  (env.VITE_MAPBOX_STYLE_URL ?? '').trim() || 'mapbox://styles/mapbox/dark-v11';

/**
 * Extension points the regional map is built to carry, and what each still
 * needs. Declared here so the capability matrix and the interface read from one
 * list instead of drifting apart.
 */
export type RegionalLayerId =
  | 'terrain'
  | 'hillshade'
  | 'hydrology'
  | 'geology'
  | 'soils'
  | 'landcover'
  | 'temperature'
  | 'precipitation'
  | 'humidity'
  | 'climate'
  | 'weather'
  | 'fire'
  | 'disturbance'
  | 'protected-areas'
  | 'land-use-change';

export type LayerReadiness =
  | 'ready-now'
  | 'partial'
  | 'external-data-required'
  | 'backend-contract-required'
  | 'scientific-model-required'
  | 'not-currently-supportable';

export interface RegionalLayerSpec {
  id: RegionalLayerId;
  label: string;
  readiness: LayerReadiness;
  /** Concrete source that would supply it, when one is obvious. */
  candidateSource: string | null;
  note: string;
}

export const REGIONAL_LAYERS: RegionalLayerSpec[] = [
  {
    id: 'terrain',
    label: 'Terrain / elevation',
    readiness: 'ready-now',
    candidateSource: 'mapbox-dem (Mapbox Terrain-DEM v1)',
    note: 'Ships with the Mapbox account. The strongest single argument for the regional engine, and the one environmental variable the Continuum already holds per record.',
  },
  {
    id: 'hillshade',
    label: 'Hillshade',
    readiness: 'ready-now',
    candidateSource: 'mapbox-terrain-rgb',
    note: 'Same source as terrain. Makes a cordillera legible without asserting anything about what grows on it.',
  },
  {
    id: 'hydrology',
    label: 'Hydrology',
    readiness: 'external-data-required',
    candidateSource: 'HydroSHEDS / HydroRIVERS',
    note: 'Free, well-documented, and heavy. Worth it only once a question needs it.',
  },
  {
    id: 'geology',
    label: 'Geology / lithology',
    readiness: 'external-data-required',
    candidateSource: 'GLiM, or national surveys',
    note: 'Global lithology is far coarser than the substrate an orchid actually sits on.',
  },
  {
    id: 'soils',
    label: 'Soils',
    readiness: 'external-data-required',
    candidateSource: 'SoilGrids 250m',
    note: 'An epiphyte never touches soil. Relevant to terrestrial taxa only, and the Atlas cannot yet tell them apart.',
  },
  {
    id: 'landcover',
    label: 'Habitat / land cover',
    readiness: 'backend-contract-required',
    candidateSource: 'ESA WorldCover, plus a controlled habitat vocabulary',
    note: 'The blocker is ours, not theirs: habitat is free text and biome is populated on zero records.',
  },
  {
    id: 'temperature',
    label: 'Temperature',
    readiness: 'external-data-required',
    candidateSource: 'WorldClim 2.1 / CHELSA',
    note: 'Long-term normals, not weather. Useful for describing a range; never for describing a day.',
  },
  {
    id: 'precipitation',
    label: 'Precipitation',
    readiness: 'external-data-required',
    candidateSource: 'WorldClim 2.1 / CHELSA',
    note: 'Same source and same caveat as temperature: a thirty-year normal, not the rainfall any particular record experienced.',
  },
  {
    id: 'humidity',
    label: 'Humidity',
    readiness: 'not-currently-supportable',
    candidateSource: null,
    note: 'Gridded humidity is free-air at coarse resolution. What governs an epiphyte is canopy microclimate. Drawing one as the other would be a fabrication with a respectable source.',
  },
  {
    id: 'climate',
    label: 'Climate envelope',
    readiness: 'scientific-model-required',
    candidateSource: null,
    note: 'Anything derived from the rasters above is modelled, and must be presented as a hypothesis with its own validation.',
  },
  {
    id: 'weather',
    label: 'Current weather',
    readiness: 'external-data-required',
    candidateSource: 'any forecast API',
    note: 'Technically trivial, scientifically empty: today’s weather at the coordinate of a 1975 herbarium sheet says nothing about the record.',
  },
  {
    id: 'fire',
    label: 'Fire history',
    readiness: 'external-data-required',
    candidateSource: 'MODIS / VIIRS active fire, via Earth Engine',
    note: 'The clearest case for a backend Earth Engine pipeline.',
  },
  {
    id: 'disturbance',
    label: 'Disturbance',
    readiness: 'external-data-required',
    candidateSource: 'Hansen Global Forest Change',
    note: 'Same pipeline as fire and land-use change.',
  },
  {
    id: 'protected-areas',
    label: 'Protected areas',
    readiness: 'external-data-required',
    candidateSource: 'WDPA',
    note: 'Redistribution terms need checking before any tiles are served.',
  },
  {
    id: 'land-use-change',
    label: 'Land-use change',
    readiness: 'external-data-required',
    candidateSource: 'Hansen / ESA CCI',
    note: 'Derived, time-series, and the most easily misread as ecological change.',
  },
];
