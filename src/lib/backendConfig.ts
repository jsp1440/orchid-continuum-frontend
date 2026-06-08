/**
 * backendConfig — single source of truth for Orchid Continuum backend origins.
 *
 * Keep backend URLs here so feature modules import stable named exports instead
 * of hardcoding API hosts in multiple places.
 */

const env = import.meta.env as Record<string, string | undefined>;

/** Canonical Orchid Continuum API / taxonomy backend. */
export const BACKEND_BASE_URL = (
  env.VITE_BACKEND_BASE_URL ||
  env.VITE_API_BASE_URL ||
  'https://api.orchidcontinuum.org'
).replace(/\/$/, '');

/** Dedicated image harvester backend used for trusted genus image lookups. */
export const IMAGES_BACKEND_BASE_URL = (
  env.VITE_IMAGES_BACKEND_BASE_URL ||
  env.VITE_IMAGE_BACKEND_BASE_URL ||
  'https://orchid-continuum-api.onrender.com'
).replace(/\/$/, '');

/** Probe URL for Atlas occurrence health/status checks. */
export const ATLAS_OCCURRENCES_PROBE_URL = `${BACKEND_BASE_URL}/api/atlas/occurrences?limit=1`;
