import { useEffect, useState } from 'react';

/**
 * useGlobeGl — lazily injects the globe.gl UMD bundle (which embeds three.js)
 * from a CDN and resolves the global `Globe` factory once it is available.
 *
 * We deliberately load from a CDN <script> rather than an npm dependency so no
 * build-config / package.json change is required; the bundle exposes
 * `window.Globe`. The loader is idempotent across mounts.
 */

const GLOBE_SRC = 'https://unpkg.com/globe.gl@2.32.0/dist/globe.gl.min.js';

type GlobeFactory = (config?: { animateIn?: boolean }) => unknown;

declare global {
  interface Window {
    Globe?: GlobeFactory;
  }
}

let loadPromise: Promise<GlobeFactory | null> | null = null;

function loadGlobeScript(): Promise<GlobeFactory | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.Globe) return Promise.resolve(window.Globe);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<GlobeFactory | null>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-globe-gl="true"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Globe ?? null));
      existing.addEventListener('error', () => resolve(null));
      if (window.Globe) resolve(window.Globe);
      return;
    }
    const s = document.createElement('script');
    s.src = GLOBE_SRC;
    s.async = true;
    s.dataset.globeGl = 'true';
    s.addEventListener('load', () => resolve(window.Globe ?? null));
    s.addEventListener('error', () => {
      loadPromise = null;
      resolve(null);
    });
    document.head.appendChild(s);
  });
  return loadPromise;
}

export interface GlobeGlState {
  Globe: GlobeFactory | null;
  ready: boolean;
  failed: boolean;
}

export default function useGlobeGl(enabled: boolean): GlobeGlState {
  const [state, setState] = useState<GlobeGlState>({
    Globe: typeof window !== 'undefined' && window.Globe ? window.Globe : null,
    ready: typeof window !== 'undefined' && !!window.Globe,
    failed: false,
  });

  useEffect(() => {
    if (!enabled || state.ready) return;
    let alive = true;
    loadGlobeScript().then((factory) => {
      if (!alive) return;
      if (factory) setState({ Globe: factory, ready: true, failed: false });
      else setState({ Globe: null, ready: false, failed: true });
    });
    return () => {
      alive = false;
    };
  }, [enabled, state.ready]);

  return state;
}
