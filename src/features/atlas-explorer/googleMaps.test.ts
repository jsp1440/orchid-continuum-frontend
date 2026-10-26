import { beforeEach, describe, expect, it } from 'vitest';
import {
  chooseEngine,
  googleMapTypeFor,
  googleReadiness,
  googleScriptUrl,
  loadGoogleMaps,
  resetGoogleLoaderForTests,
} from './googleMaps';
import { clusterFeatures, clusterRadius, gridFeatures, pointFeatures, recordColor, type OverlayRecord } from './googleOverlays';
import { PALETTE } from './palette';

const KEY = 'AIzaSyA-synthetic_key_0123456789abcd';

describe('google readiness', () => {
  it('is unconfigured, naming the variable, when no key is set', () => {
    const r = googleReadiness({});
    expect(r.state).toBe('unconfigured');
    if (r.state === 'unconfigured') {
      expect(r.missing).toEqual(['VITE_GOOGLE_MAPS_API_KEY']);
      expect(r.message).toContain('VITE_GOOGLE_MAPS_API_KEY');
      expect(r.message).not.toContain(KEY);
    }
  });
  it('rejects malformed keys and whitespace-only values', () => {
    expect(googleReadiness({ VITE_GOOGLE_MAPS_API_KEY: '   ' }).state).toBe('unconfigured');
    expect(googleReadiness({ VITE_GOOGLE_MAPS_API_KEY: 'short' }).state).toBe('unconfigured');
    expect(googleReadiness({ VITE_GOOGLE_MAPS_API_KEY: 'a b c'.repeat(8) }).state).toBe('unconfigured');
  });
  it('is ready with a key; map id is optional and validated', () => {
    const r = googleReadiness({ VITE_GOOGLE_MAPS_API_KEY: KEY });
    expect(r).toEqual({ state: 'ready', config: { apiKey: KEY, mapId: null } });
    const withId = googleReadiness({ VITE_GOOGLE_MAPS_API_KEY: KEY, VITE_GOOGLE_MAPS_MAP_ID: 'abc123DEF456' });
    expect(withId.state === 'ready' && withId.config.mapId).toBe('abc123DEF456');
    const badId = googleReadiness({ VITE_GOOGLE_MAPS_API_KEY: KEY, VITE_GOOGLE_MAPS_MAP_ID: 'bad id!' });
    expect(badId.state === 'ready' && badId.config.mapId).toBeNull();
  });
});

describe('engine and map type selection', () => {
  it('never silently substitutes: explicit choice wins, default follows readiness', () => {
    expect(chooseEngine(null, true)).toBe('google');
    expect(chooseEngine(null, false)).toBe('open');
    expect(chooseEngine('open', true)).toBe('open');
    expect(chooseEngine('google', false)).toBe('google'); // shows the unavailable state, not another provider
    expect(chooseEngine('bogus', true)).toBe('google');
  });
  it('maps basemaps to Google map types', () => {
    expect(googleMapTypeFor('imagery')).toBe('hybrid');
    expect(googleMapTypeFor('streets')).toBe('roadmap');
    expect(googleMapTypeFor('scientific')).toBe('terrain');
  });
  it('builds a Maps JavaScript API URL with async loading', () => {
    const u = new URL(googleScriptUrl({ apiKey: KEY, mapId: null }, 'cb'));
    expect(u.origin + u.pathname).toBe('https://maps.googleapis.com/maps/api/js');
    expect(u.searchParams.get('callback')).toBe('cb');
    expect(u.searchParams.get('loading')).toBe('async');
  });
});

describe('loader', () => {
  beforeEach(() => resetGoogleLoaderForTests());
  function fakeWindow() {
    const appended: { src: string; onerror?: () => void }[] = [];
    const timers: (() => void)[] = [];
    const win = {
      document: {
        createElement: () => ({}) as { src: string; onerror?: () => void },
        head: { appendChild: (el: { src: string; onerror?: () => void }) => appended.push(el) },
      },
      setTimeout: (fn: () => void) => {
        timers.push(fn);
        return timers.length;
      },
      clearTimeout: () => undefined,
    } as unknown as Window & { __ocGoogleMapsReady?: () => void; gm_authFailure?: () => void };
    return { win, appended, timers };
  }
  const cfg = { apiKey: KEY, mapId: null };

  it('resolves loaded when the callback fires', async () => {
    const { win, appended } = fakeWindow();
    const p = loadGoogleMaps(cfg, win);
    expect(appended).toHaveLength(1);
    win.__ocGoogleMapsReady?.();
    expect(await p).toEqual({ kind: 'loaded' });
  });
  it('reports an authentication failure instead of hiding it', async () => {
    const { win } = fakeWindow();
    const p = loadGoogleMaps(cfg, win);
    win.gm_authFailure?.();
    const r = await p;
    expect(r.kind === 'failed' && r.reason).toBe('auth-failure');
  });
  it('reports script errors and timeouts', async () => {
    const a = fakeWindow();
    const p1 = loadGoogleMaps(cfg, a.win);
    a.appended[0].onerror?.();
    expect((await p1).kind).toBe('failed');
    resetGoogleLoaderForTests();
    const b = fakeWindow();
    const p2 = loadGoogleMaps(cfg, b.win);
    b.timers[0]();
    const r = await p2;
    expect(r.kind === 'failed' && r.reason).toBe('timeout');
  });
  it('does not append a second script while one is loading', () => {
    const { win, appended } = fakeWindow();
    void loadGoogleMaps(cfg, win);
    void loadGoogleMaps(cfg, win);
    expect(appended).toHaveLength(1);
  });
});

describe('overlays use only supplied locality-safe coordinates', () => {
  const rec = (over: Partial<OverlayRecord> = {}): OverlayRecord => ({
    occurrenceID: 'o1',
    scientificName: 'Dracula vampira',
    decimalLatitude: -0.1,
    decimalLongitude: -78.5,
    generalised: false,
    year: 1999,
    assessment: 'threatened',
    taxonKey: 't1',
    ...over,
  });
  it('colours by mode and marks generalised records', () => {
    expect(recordColor(rec(), 'default')).toBe(PALETTE.point);
    expect(recordColor(rec({ generalised: true }), 'default')).toBe(PALETTE.generalised);
    expect(recordColor(rec(), 'record-age')).toBe(PALETTE.age['1950-1999']);
    expect(recordColor(rec(), 'conservation-assessment')).toBe(PALETTE.assessment.threatened);
  });
  it('emits [lng, lat] exactly as supplied and no extra location fields', () => {
    const [f] = pointFeatures([rec()], 'default');
    expect((f.geometry as GeoJSON.Point).coordinates).toEqual([-78.5, -0.1]);
    expect(Object.keys(f.properties ?? {}).sort()).toEqual(['color', 'generalised', 'id', 'kind', 'name']);
  });
  it('builds cluster and grid features', () => {
    const c = clusterFeatures([
      { cellId: '1:0:0', latitude: 0.5, longitude: 0.5, count: 9, taxonCount: 2, topGenera: [], yearMin: null, yearMax: null, generalisedCount: 0 },
    ]);
    expect(c[0].properties?.count).toBe(9);
    const g = gridFeatures([{ cellId: 'x', west: 0, south: 0, east: 1, north: 1, records: 4, taxa: 2 }], 'records');
    expect(g[0].properties?.intensity).toBe(1);
    expect(clusterRadius(1)).toBeGreaterThanOrEqual(8);
    expect(clusterRadius(1e9)).toBe(26);
  });
});
