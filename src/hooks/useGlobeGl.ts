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

/** Orbit controls, as far as this app drives them. */
export interface GlobeControls {
  autoRotate: boolean;
  autoRotateSpeed: number;
  enableZoom: boolean;
}

/**
 * The globe.gl surface this application actually depends on.
 *
 * Deliberately partial. globe.gl exposes several dozen chainable setters and we
 * do not own the library, so declaring all of them would be inventing a
 * contract. Declaring the fifteen we call documents the real dependency and
 * lets TypeScript check the chain, which a blanket `any` could not.
 *
 * Accessors are typed over `TPoint` rather than `any` so point callbacks are
 * checked against the data actually pushed in.
 */
export interface GlobeInstance<TPoint = unknown> {
  globeImageUrl(url: string): this;
  bumpImageUrl(url: string): this;
  backgroundColor(color: string): this;
  showAtmosphere(enabled: boolean): this;
  atmosphereColor(color: string): this;
  atmosphereAltitude(value: number): this;
  pointsData(data: TPoint[]): this;
  pointLat(accessor: (point: TPoint) => number): this;
  pointLng(accessor: (point: TPoint) => number): this;
  pointColor(accessor: (point: TPoint) => string): this;
  pointLabel(accessor: (point: TPoint) => string): this;
  pointAltitude(value: number | ((point: TPoint) => number)): this;
  pointRadius(value: number | ((point: TPoint) => number)): this;
  pointResolution(segments: number): this;
  pointsTransitionDuration(ms: number): this;
  pointOfView(view: { lat: number; lng: number; altitude: number }, ms?: number): this;
  width(px: number): this;
  height(px: number): this;
  controls(): GlobeControls | null;
  /**
   * Undocumented globe.gl teardown hook. Optional because it is an internal
   * that a future release may drop; the call site already invokes it
   * defensively rather than assuming it exists.
   */
  _destructor?(): void;
}

/**
 * globe.gl's UMD factory is a two-step generator: `Globe(config)` returns a
 * mount function, and calling that with the container element yields the
 * chainable instance. Typing the first step as `unknown` made the documented
 * `Globe()(el)` call site a type error even though it is the library's only
 * supported usage.
 */
type GlobeMount = <TPoint = unknown>(element: HTMLElement) => GlobeInstance<TPoint>;
type GlobeFactory = (config?: { animateIn?: boolean }) => GlobeMount;

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
