/**
 * backendConfig — THE single source of truth for every Orchid Continuum backend
 * origin the frontend talks to.
 *
 * There are three distinct backend hosts in play, each with a different job.
 * They are NOT interchangeable — keep every base URL defined here (env-driven,
 * with a documented default) and import the named constant for the host you
 * actually need. Never hardcode an API host anywhere else in the codebase.
 *
 *   1. BACKEND_BASE_URL        — API / taxonomy backend (api.orchidcontinuum.org)
 *   2. IMAGES_BACKEND_BASE_URL — image harvester       (orchidcontinuumharvester2.onrender.com)
 *   3. LEGACY_ONRENDER_BASE_URL — legacy onrender host  (orchidcontinuum.onrender.com)
 *
 * (ECUADOR_EMBED_BASE_URL is an external <iframe> embed origin, not an API.)
 */

const env = import.meta.env as Record<string, string | undefined>;

/**
 * Canonical Orchid Continuum API / taxonomy backend.
 *
 * Serves the taxonomy, species, genus-photo, campaign and atlas-probe APIs.
 * Host: https://api.orchidcontinuum.org
 */
export const BACKEND_BASE_URL = (
  env.VITE_BACKEND_BASE_URL ||
  env.VITE_API_BASE_URL ||
  'https://orchidcontinuumharvester2.onrender.com'
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

/**
 * Legacy onrender harvester host.
 *
 * Still serves the live genus-daily, species-search, species-detail,
 * mycorrhizal and per-genus knowledge-graph APIs that ocBackend.ts and the
 * Continuum Web consume. Kept as its own named origin (separate from the
 * canonical {@link BACKEND_BASE_URL}) because those endpoints have not been
 * migrated to api.orchidcontinuum.org yet.
 * Host: https://orchidcontinuum.onrender.com
 */
export const LEGACY_ONRENDER_BASE_URL = (
  env.VITE_LEGACY_ONRENDER_BASE_URL ||
  'https://orchidcontinuum.onrender.com'
).replace(/\/$/, '');

/** External Ecuador expedition map/embed origin (an <iframe> embed, not an API). */
export const ECUADOR_EMBED_BASE_URL = (
  env.VITE_ECUADOR_EMBED_BASE_URL ||
  env.VITE_ECUADOR_EXPEDITION_EMBED_URL ||
  'https://orchid-continuum-ecuador-expedition.onrender.com'
).replace(/\/$/, '');

/**
 * Atlas occurrences DATA endpoint (georeferenced points for the map).
 *
 * Served by the image harvester host as a top-level `/atlas/occurrences` route
 * (NOT the `/api/...` path on the canonical backend). Accepts optional
 * `?genus=` / `?limit=` query params.
 */
export const ATLAS_OCCURRENCES_URL = `${IMAGES_BACKEND_BASE_URL}/atlas/occurrences`;

/** Lightweight probe URL for Atlas occurrence health/status checks. */
export const ATLAS_OCCURRENCES_PROBE_URL = `${BACKEND_BASE_URL}/api/atlas/occurrences?limit=1`;
