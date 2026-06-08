// ---------------------------------------------------------------------------
// Single source of truth for the Orchid Continuum Brain backend host.
// ---------------------------------------------------------------------------
//
// EVERY file that needs to talk to the backend MUST import `BACKEND_BASE_URL`
// (or one of the derived URLs below) from this module. Do NOT hardcode the
// host as a string literal anywhere else.
//
// The original Famous AI homepage predated the Brain built on June 7, 2026.
// It expected older image/genus endpoints. The Brain/control-panel backend now
// exposes compatibility endpoints for those legacy calls while the fuller
// genus-story API is being built.
// ---------------------------------------------------------------------------

/** The canonical Brain/control-panel backend origin. */
export const BACKEND_BASE_URL = 'https://orchid-continuum-control-panel.onrender.com';

/** Atlas occurrence data endpoint (legacy name retained for compatibility). */
export const ATLAS_OCCURRENCES_URL = `${BACKEND_BASE_URL}/api/orchid-widgets/featured-gallery`;

/** Atlas occurrences probe used by endpoint audits. */
export const ATLAS_OCCURRENCES_PROBE_URL = `${BACKEND_BASE_URL}/api/brain/status`;

/** Ecuador expedition Atlas embed base URL. */
export const ECUADOR_EMBED_BASE_URL = `${BACKEND_BASE_URL}/atlas.html`;

// ---------------------------------------------------------------------------
// Image backend host
// ---------------------------------------------------------------------------
//
// Homepage images now resolve through the Brain backend. The Brain exposes:
//   GET {IMAGES_BACKEND_BASE_URL}/images/genus/{genus}?limit={limit}
//   GET {IMAGES_BACKEND_BASE_URL}/api/genus/{genus}/photos?limit={limit}
//
// These compatibility endpoints normalize rows from the active Orchid Continuum
// image tables into the field names the Famous AI homepage already expects.
// ---------------------------------------------------------------------------

/** The canonical image-backend origin. Kept separate as a named export for compatibility. */
export const IMAGES_BACKEND_BASE_URL = BACKEND_BASE_URL;
