/**
 * backendConfig — THE single source of truth for every Orchid Continuum backend
 * origin the frontend talks to.
 *
 * CURRENT PRODUCTION HOSTS
 *
 *   API / Species / Atlas:
 *   https://orchid-continuum-public-api.onrender.com
 *
 *   Calyx Backend / Mission Control:
 *   https://orchid-calyx-backend.onrender.com
 *
 *   Images:
 *   https://orchidcontinuumharvester2.onrender.com
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
 * - diagnostics
 * - campaign statistics
 */
export const BACKEND_BASE_URL = (
  env.VITE_BACKEND_BASE_URL ||
  env.VITE_API_BASE_URL ||
  'https://orchid-continuum-public-api.onrender.com'
).replace(/\/$/, '');

/**
 * Calyx backend
 *
 * Serves:
 * - runner health
 * - connector health
 * - runtime summary
 * - mission-control operational telemetry
 */
export const CALYX_BACKEND_BASE_URL = (
  env.VITE_CALYX_BACKEND_BASE_URL ||
  env.VITE_MISSION_CONTROL_BACKEND_URL ||
  'https://orchid-calyx-backend.onrender.com'
).replace(/\/$/, '');

/**
 * Image backend
 *
 * Genus images are currently served by the harvester image backend:
 *   GET /images/genus/{genus}
 *
 * Do not point this at the public API unless that endpoint has been migrated.
 */
export const IMAGES_BACKEND_BASE_URL = (
  env.VITE_IMAGES_BACKEND_BASE_URL ||
  env.VITE_IMAGE_BACKEND_BASE_URL ||
  'https://orchidcontinuumharvester2.onrender.com'
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
