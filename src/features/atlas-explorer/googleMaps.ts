/**
 * Atlas Explorer — Google Maps Platform adapter (configuration and loader).
 *
 * Provider: Google Maps JavaScript API (satellite, hybrid, terrain, roadmap and
 * 45-degree imagery where Google offers it). This is NOT Earth Engine (a
 * server-side analysis product) and NOT Photorealistic 3D Tiles, which need
 * the separate Map Tiles API and a WebGL overlay and are not implemented here.
 *
 * Nothing is loaded and no request is made unless a browser key is configured
 * at build time. A missing key is reported as an explicit unavailable state;
 * it never falls back silently to another provider.
 *
 * Deployment configuration (names only; values belong in the host's settings):
 *   VITE_GOOGLE_MAPS_API_KEY  browser key, restricted by HTTP referrer to the
 *                             Render site origins and to the Maps JavaScript API
 *   VITE_GOOGLE_MAPS_MAP_ID   optional cloud-based Map ID (vector map, tilt/heading)
 * Google Cloud prerequisites: a project with billing enabled and the Maps
 * JavaScript API turned on. Enabling billing is an owner decision.
 */

import type { BasemapId } from './basemaps';

export const GOOGLE_KEY_ENV = 'VITE_GOOGLE_MAPS_API_KEY';
export const GOOGLE_MAP_ID_ENV = 'VITE_GOOGLE_MAPS_MAP_ID';

export interface GoogleMapsConfig {
  apiKey: string;
  mapId: string | null;
}

export type GoogleReadiness =
  | { state: 'ready'; config: GoogleMapsConfig }
  | { state: 'unconfigured'; missing: string[]; message: string };

const KEY_SHAPE = /^[A-Za-z0-9_-]{20,128}$/;
const MAP_ID_SHAPE = /^[A-Za-z0-9]{6,64}$/;

type EnvLike = Record<string, string | undefined>;

export function googleReadiness(env: EnvLike = import.meta.env as EnvLike): GoogleReadiness {
  const key = (env[GOOGLE_KEY_ENV] ?? '').trim();
  if (!key || !KEY_SHAPE.test(key)) {
    return {
      state: 'unconfigured',
      missing: [GOOGLE_KEY_ENV],
      message:
        `Google Maps is not configured for this deployment. Set ${GOOGLE_KEY_ENV} (a referrer-restricted Maps JavaScript API ` +
        'browser key from a Google Cloud project with billing enabled) and rebuild.',
    };
  }
  const mapId = (env[GOOGLE_MAP_ID_ENV] ?? '').trim();
  return { state: 'ready', config: { apiKey: key, mapId: MAP_ID_SHAPE.test(mapId) ? mapId : null } };
}

export type GoogleMapTypeId = 'terrain' | 'roadmap' | 'hybrid';

/** Scientific -> terrain, Topographic -> roadmap, Satellite -> hybrid (imagery with place labels). */
export function googleMapTypeFor(basemap: BasemapId): GoogleMapTypeId {
  if (basemap === 'imagery') return 'hybrid';
  if (basemap === 'streets') return 'roadmap';
  return 'terrain';
}

export function googleScriptUrl(config: GoogleMapsConfig, callbackName: string): string {
  const q = new URLSearchParams({
    key: config.apiKey,
    v: 'weekly',
    loading: 'async',
    callback: callbackName,
  });
  return `https://maps.googleapis.com/maps/api/js?${q.toString()}`;
}

export type MapEngineId = 'google' | 'open';

/** `?engine=google|open` wins; otherwise Google when a key is configured, else the open MapLibre map. */
export function chooseEngine(requested: string | null, googleReady: boolean): MapEngineId {
  if (requested === 'open') return 'open';
  if (requested === 'google') return 'google';
  return googleReady ? 'google' : 'open';
}

declare global {
  interface Window {
    gm_authFailure?: () => void;
    __ocGoogleMapsReady?: () => void;
  }
}

export type GoogleLoadResult =
  | { kind: 'loaded' }
  | { kind: 'failed'; reason: 'script-error' | 'auth-failure' | 'timeout'; detail: string };

let inflight: Promise<GoogleLoadResult> | null = null;

/** Load the Maps JavaScript API once. Auth failures (bad key, referrer, API not enabled, billing) are reported, not hidden. */
export function loadGoogleMaps(config: GoogleMapsConfig, win: Window = window, timeoutMs = 15000): Promise<GoogleLoadResult> {
  if ((win as unknown as { google?: { maps?: unknown } }).google?.maps) return Promise.resolve({ kind: 'loaded' });
  if (inflight) return inflight;
  inflight = new Promise<GoogleLoadResult>((resolve) => {
    const doc = win.document;
    let settled = false;
    const done = (r: GoogleLoadResult) => {
      if (settled) return;
      settled = true;
      win.clearTimeout(timer);
      if (r.kind === 'failed') inflight = null;
      resolve(r);
    };
    const timer = win.setTimeout(
      () => done({ kind: 'failed', reason: 'timeout', detail: 'Google Maps did not respond in time.' }),
      timeoutMs,
    );
    win.gm_authFailure = () =>
      done({
        kind: 'failed',
        reason: 'auth-failure',
        detail:
          'Google rejected the browser key (check the referrer restriction, that the Maps JavaScript API is enabled, and that billing is active).',
      });
    win.__ocGoogleMapsReady = () => done({ kind: 'loaded' });
    const script = doc.createElement('script');
    script.src = googleScriptUrl(config, '__ocGoogleMapsReady');
    script.async = true;
    script.onerror = () => done({ kind: 'failed', reason: 'script-error', detail: 'The Google Maps script could not be loaded.' });
    doc.head.appendChild(script);
  });
  return inflight;
}

/** Test seam. */
export function resetGoogleLoaderForTests(): void {
  inflight = null;
}
