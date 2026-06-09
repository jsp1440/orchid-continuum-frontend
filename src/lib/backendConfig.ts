/**
 * backendConfig — THE single source of truth for every Orchid Continuum backend
 * origin the frontend talks to.
 *
 * CURRENT PRODUCTION HOSTS
 *
 *   API / Species / Atlas / Images:
 *   https://orchid-continuum-public-api.onrender.com
 *
 * Legacy:
 *   https://orchidcontinuum.onrender.com
 */

const env = import.meta.env as Record<string, string | undefined>;

/**
 * Canonical Orchid Continuum Public API
 *
 * Serves:
 * - species search
 * - species detail
 * - atlas
 * - image endpoints
 * - diagnostics
 * - campaign statistics
 */
export const BACKEND_BASE_URL = (
  env.VITE_BACKEND_BASE_URL ||
  env.VITE_API_BASE_URL ||
  'https://orchid-continuum-public-api.onrender.com'
).replace(/\/$/, '');

/**
 * Image backend
 *
 * Currently uses the same public API host.
 */
export const IMAGES_BACKEND_BASE_URL = (
  env.VITE_IMAGES_BACKEND_BASE_URL ||
  env.VITE_IMAGE_BACKEND_BASE_URL ||
  'https://orchid-continuum-public-api.onrender.com'
).replace(/\/$/, '');

/**
 * Legacy backend
 *
 * Retained only for endpoints that have not yet been migrated.
 */
export const LEGACY_ONRENDER_BASE_URL = (
  env.VITE_LEGACY_ONRENDER_BASE_URL ||
  'https://orchidcontinuum.onrender.com'
).replace(/\/$/, '');

/**
 * Ecuador expedition embedded application.
 */
export const ECUADOR_EMBED_BASE_URL = (
  env.VITE_ECUADOR_EMBED_BASE_URL ||
  env.VITE_ECUADOR_EXPEDITION_EMBED_URL ||
  'https://orchid-continuum-ecuador-expedition.onrender.com'
).replace(/\/$/, '');

/**
 * Atlas occurrences endpoint.
 */
export const ATLAS_OCCURRENCES_URL =
  `${BACKEND_BASE_URL}/atlas/occurrences`;

/**
 * Atlas health probe.
 */
export const ATLAS_OCCURRENCES_PROBE_URL =
  `${BACKEND_BASE_URL}/api/atlas/occurrences?limit=1`;
