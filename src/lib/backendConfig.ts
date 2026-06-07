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
//   - api.orchidcontinuum.org   -> DEAD (no live DNS record) — do NOT use.
//   - orchidcontinuum.onrender.com -> LIVE working production backend.
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
// Dedicated image backend host
// ---------------------------------------------------------------------------
//
// The genus image library is served by a SEPARATE host from the main
// taxonomy/search/atlas backend above. Only image requests
// (GET /images/genus/{genus}) target this origin; everything else resolves
// against BACKEND_BASE_URL. To re-host the image library in the future, edit
// the ONE line below.
//
// History:
//   - orchidcontinuumharvester2.onrender.com -> only had a few images per genus.
//   - orchid-continuum-api.onrender.com -> tried, but wrong.
//   - orchidcontinuumharvester2.onrender.com -> CURRENT image host.

/** The canonical image-backend origin. Change this single line to re-host images. */
export const IMAGES_BACKEND_BASE_URL = 'https://orchidcontinuumharvester2.onrender.com';
