// ---------------------------------------------------------------------------
// Single source of truth for the Orchid Continuum Brain/backend host.
// ---------------------------------------------------------------------------

export const BACKEND_BASE_URL = 'https://orchid-continuum-control-panel.onrender.com';

/**
 * Atlas occurrence data endpoint.
 *
 * This MUST be occurrence data with latitude/longitude rows.
 * Do not point this at featured-gallery; that is an image/gallery endpoint.
 */
export const ATLAS_OCCURRENCES_URL = `${BACKEND_BASE_URL}/atlas/occurrences`;

/** Backend health/status probe. */
export const ATLAS_OCCURRENCES_PROBE_URL = `${BACKEND_BASE_URL}/api/brain/status`;

/** Ecuador expedition Atlas embed base URL. */
export const ECUADOR_EMBED_BASE_URL = `${BACKEND_BASE_URL}/atlas.html`;

/** Image backend host. */
export const IMAGES_BACKEND_BASE_URL = BACKEND_BASE_URL;
