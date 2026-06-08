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

/**
 * Dedicated image harvester backend used for trusted genus image lookups.
 *
 * Verified live endpoint: GET /images/genus/{genus}?limit=N
 * Returns: { genus, count, images: [{ id, image_url, image_source, taxonomy_id, genus, species }] }
 *
 * NOTE: orchid-continuum-api.onrender.com returns 404 on all paths — the
 * correct host is orchidcontinuumharvester2.onrender.com.
 */
export const IMAGES_BACKEND_BASE_URL = (
  env.VITE_IMAGES_BACKEND_BASE_URL ||
  env.VITE_IMAGE_BACKEND_BASE_URL ||
  'https://orchidcontinuumharvester2.onrender.com'
).replace(/\/$/, '');

/** External Ecuador expedition map/embed origin. */
export const ECUADOR_EMBED_BASE_URL = (
  env.VITE_ECUADOR_EMBED_BASE_URL ||
  env.VITE_ECUADOR_EXPEDITION_EMBED_URL ||
  'https://orchid-continuum-ecuador-expedition.onrender.com'
).replace(/\/$/, '');

/** Probe URL for Atlas occurrence health/status checks. */
export const ATLAS_OCCURRENCES_PROBE_URL = `${BACKEND_BASE_URL}/api/atlas/occurrences?limit=1`;
