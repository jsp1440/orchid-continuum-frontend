/// <reference types="vite/client" />

/**
 * The project reads configuration from `import.meta.env` in several places and
 * had no reference to Vite's client types, so every one of those reads was a
 * type error. Adding the reference here fixes them together rather than each
 * file casting its way around the same missing declaration.
 */

interface ImportMetaEnv {
  /** Canonical public origin of the deployed Calyx backend. */
  readonly VITE_CALYX_API_URL?: string;
  readonly VITE_CALYX_BACKEND_BASE_URL?: string;
  readonly VITE_MISSION_CONTROL_BACKEND_URL?: string;
  readonly VITE_BACKEND_BASE_URL?: string;
  readonly VITE_RELEASE_SHA?: string;
  /** Mapbox PUBLIC access token (pk.*). Never a secret sk.* token. */
  readonly VITE_MAPBOX_TOKEN?: string;
  /** Optional Mapbox style override. */
  readonly VITE_MAPBOX_STYLE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
