/**
 * useLeaflet — runtime loader for Leaflet GL.
 *
 * We intentionally do NOT add Leaflet to package.json (the Famous build
 * pipeline ships with a fixed dependency set). Instead we inject the
 * Leaflet CSS + JS from unpkg at runtime, then expose `window.L` once
 * ready. This keeps the Atlas renderer pluggable — the same hook can
 * later be swapped for MapLibre GL or deck.gl without touching the
 * page-level component.
 */

import { useEffect, useState } from 'react';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    L?: any;
  }
}

const LEAFLET_VERSION = '1.9.4';
const CSS_HREF = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const JS_SRC = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

let loadingPromise: Promise<void> | null = null;

function ensureCss() {
  if (document.querySelector(`link[data-leaflet="${LEAFLET_VERSION}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_HREF;
  link.setAttribute('data-leaflet', LEAFLET_VERSION);
  document.head.appendChild(link);
}

function ensureScript(): Promise<void> {
  if (window.L) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-leaflet="${LEAFLET_VERSION}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Leaflet load error')));
      return;
    }
    const s = document.createElement('script');
    s.src = JS_SRC;
    s.async = true;
    s.setAttribute('data-leaflet', LEAFLET_VERSION);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Leaflet load error'));
    document.head.appendChild(s);
  });
  return loadingPromise;
}

export interface UseLeafletState {
  ready: boolean;
  error: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L: any | null;
}

export function useLeaflet(): UseLeafletState {
  const [state, setState] = useState<UseLeafletState>({
    ready: Boolean(window.L),
    error: null,
    L: window.L ?? null,
  });

  useEffect(() => {
    let cancelled = false;
    ensureCss();
    ensureScript()
      .then(() => {
        if (cancelled) return;
        setState({ ready: true, error: null, L: window.L });
      })
      .catch(err => {
        if (cancelled) return;
        setState({ ready: false, error: err?.message ?? 'Leaflet failed to load', L: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
