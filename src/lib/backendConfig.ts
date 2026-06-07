// ---------------------------------------------------------------------------
// Single source of truth for the Orchid Continuum backend host.
// ---------------------------------------------------------------------------
//
// EVERY file that needs to talk to the backend MUST import `BACKEND_BASE_URL`
// (or one of the derived URLs below) from this module. Do NOT hardcode the
// host as a string literal anywhere else.
//
// To change the backend host in the future, edit the ONE line below. Because
// every fetch resolves against this constant, it is impossible for the app to
// end up half-pointed at a dead URL.
//
// History:
//   - api.orchidcontinuum.org          -> DEAD / unstable during beta.
//   - orchidcontinuum.onrender.com     -> LIVE working production backend.
//   - orchidcontinuumharvester2        -> do NOT use for the homepage frontend;
//                                          it caused image/atlas drift.
// ---------------------------------------------------------------------------

/** The canonical backend origin. Change this single line to re-host the app. */
export const BACKEND_BASE_URL = 'https://orchidcontinuum.onrender.com';

/** Atlas occurrence data endpoint (derived from {@link BACKEND_BASE_URL}). */
export const ATLAS_OCCURRENCES_URL = `${BACKEND_BASE_URL}/atlas/occurrences`;

/** Atlas occurrences probe used by the endpoint audit (limit=1). */
export const ATLAS_OCCURRENCES_PROBE_URL = `${ATLAS_OCCURRENCES_URL}?limit=1`;

/** Ecuador expedition Atlas embed base URL. */
export const ECUADOR_EMBED_BASE_URL = `${BACKEND_BASE_URL}/atlas/ecuador`;

// ---------------------------------------------------------------------------
// Image backend host
// ---------------------------------------------------------------------------
//
// Homepage images must resolve through the Orchid Continuum backend, not a
// separate frontend-only or stale harvester host. This keeps the hero image,
// grid, atlas, species cards, and knowledge graph aligned to the same active
// genus and makes the later Azure migration a one-line backend URL change.
//
// Endpoint expected by the frontend:
//   GET {IMAGES_BACKEND_BASE_URL}/images/genus/{genus}?limit={limit}
//
// No direct GBIF/iNaturalist image calls should be required from the homepage.
// If this endpoint returns too few images, fix the backend query/cache/table —
// do not rebuild the frontend or switch to fabricated imagery.
// ---------------------------------------------------------------------------

/** The canonical image-backend origin. Kept separate as a named export for compatibility. */
export const IMAGES_BACKEND_BASE_URL = BACKEND_BASE_URL;
