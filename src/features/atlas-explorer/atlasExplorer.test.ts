import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import {
  CLUSTER_CELL_LADDER,
  assessmentClass,
  cellDegForZoom,
  clusterPoints,
  gridSummary,
  normaliseViewport,
  recordAgeClass,
  viewportContains,
} from './geo';
import { DRAWABLE_LAYER_IDS, LAYER_CATALOG, MODULE_CAPABILITIES, isDrawable, moduleLinksFor } from './contracts';
import {
  EMPTY_FILTERS,
  ResponseCache,
  attributionOf,
  fromBackendPoint,
  fromCanonicalPoint,
  matchesFilters,
  queryBackend,
  queryUrl,
  type ExplorerOccurrence,
} from './occurrenceProvider';
import { toCsv, toGeoJson } from './exporters';

const point = (over: Partial<AtlasOccurrencePoint> = {}): AtlasOccurrencePoint => ({
  id: 'uuid-1',
  lat: -3.98765,
  lng: -79.20456,
  genus: 'Dracula',
  species: 'vampira',
  canonicalName: 'Dracula vampira',
  country: 'EC',
  countries: ['EC'],
  pollinators: [],
  dataset: 'Synthetic dataset',
  verified: true,
  assessmentResolved: true,
  ...over,
});

describe('geometry', () => {
  it('uses the same cluster ladder as the backend', () => {
    // Mirrors CLUSTER_CELL_LADDER in orchid-calyx-backend app/atlas_intelligence/occurrences.py
    expect([...CLUSTER_CELL_LADDER]).toEqual([20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05]);
    expect(cellDegForZoom(0)).toBe(20);
    expect(cellDegForZoom(4.9)).toBe(1);
    expect(cellDegForZoom(40)).toBe(0.05);
  });

  it('normalises wrapped bounds and handles the antimeridian', () => {
    const wrapped = normaliseViewport({ west: 170, east: 190, south: -30, north: -10, zoom: 4 });
    expect(wrapped.west).toBe(170);
    expect(wrapped.east).toBe(-170);
    expect(viewportContains(wrapped, -20, 175)).toBe(true);
    expect(viewportContains(wrapped, -20, -175)).toBe(true);
    expect(viewportContains(wrapped, -20, 0)).toBe(false);
    expect(normaliseViewport({ west: -400, east: 400, south: -95, north: 95, zoom: 0 })).toEqual({
      west: -180,
      east: 180,
      south: -90,
      north: 90,
      zoom: 0,
    });
  });

  it('clusters and grids on the given coordinates with taxon and generalisation counts', () => {
    const pts = [
      { occurrenceID: 'a', taxonKey: 't1', genus: 'Dracula', year: 1900, decimalLatitude: 1.2, decimalLongitude: 1.2, generalised: true },
      { occurrenceID: 'b', taxonKey: 't2', genus: 'Dracula', year: 2010, decimalLatitude: 1.8, decimalLongitude: 1.9, generalised: false },
      { occurrenceID: 'c', taxonKey: 't2', genus: 'Masdevallia', year: null, decimalLatitude: 12, decimalLongitude: 12, generalised: false },
    ];
    const clusters = clusterPoints(pts, 10);
    expect(clusters).toHaveLength(2);
    const first = clusters.find((c) => c.count === 2)!;
    expect(first).toMatchObject({ taxonCount: 2, topGenera: ['Dracula'], yearMin: 1900, yearMax: 2010, generalisedCount: 1 });
    const grid = gridSummary(pts, 1);
    expect(grid.find((g) => g.records === 2)).toMatchObject({ south: 1, north: 2, west: 1, east: 2, taxa: 2 });
  });

  it('classifies record age and assessment without collapsing unresolved', () => {
    expect(recordAgeClass(1890)).toBe('pre-1950');
    expect(recordAgeClass(1950)).toBe('1950-1999');
    expect(recordAgeClass(2000)).toBe('2000-plus');
    expect(recordAgeClass(null)).toBe('undated');
    expect(assessmentClass({ iucnCategory: 'en' })).toBe('threatened');
    expect(assessmentClass({ assessmentResolved: false })).toBe('unresolved');
    expect(assessmentClass({})).toBe('unresolved');
    expect(assessmentClass({ iucnCategory: 'LC', assessmentResolved: true })).toBe('not-threatened');
  });
});

describe('canonical-store projection (locality safety)', () => {
  it('generalises a threatened record and withholds locality and provider id', () => {
    const o = fromCanonicalPoint(point({ iucnCode: 'CR', locality: 'Ridge trail', sourceRecordId: 'gbif:123' }))!;
    expect([o.decimalLatitude, o.decimalLongitude]).toEqual([-3.5, -79.5]);
    expect(o.generalised).toBe(true);
    expect(o.generalisationReason).toBe('iucn-threatened');
    expect(o.locality).toBeNull();
    expect(o.sourceRecordId).toBeNull();
    expect(o.occurrenceID).toBe('uuid-1');
    expect(o.assessment).toBe('threatened');
  });

  it('keeps a precise, assessed, non-threatened record precise', () => {
    const o = fromCanonicalPoint(point({ locality: 'Botanic garden', sourceRecordId: 'gbif:9' }))!;
    expect([o.decimalLatitude, o.decimalLongitude]).toEqual([-3.98765, -79.20456]);
    expect(o.locality).toBe('Botanic garden');
    expect(o.sourceRecordId).toBe('gbif:9');
  });

  it('applies the unresolved-assessment precaution', () => {
    const o = fromCanonicalPoint(point({ assessmentResolved: false, locality: 'Somewhere' }))!;
    expect(o.generalisationReason).toBe('unresolved-assessment');
    expect(o.locality).toBeNull();
    expect(o.assessment).toBe('unresolved');
  });

  it('drops 0,0 and out-of-range coordinates', () => {
    expect(fromCanonicalPoint(point({ lat: 0, lng: 0 }))).toBeNull();
    expect(fromCanonicalPoint(point({ lat: 95 }))).toBeNull();
  });

  it('matches the backend policy parity vectors shared through contracts', () => {
    const vectors = JSON.parse(
      readFileSync(new URL('../../../contracts/atlas_locality_policy_vectors_v1.json', import.meta.url), 'utf8'),
    ).vectors as { access: string; input: Record<string, unknown>; expected: { lat: number; lng: number } }[];
    for (const v of vectors.filter((x) => x.access === 'public')) {
      const o = fromCanonicalPoint(
        point({
          lat: v.input.lat as number,
          lng: v.input.lng as number,
          iucnCode: v.input.iucnCode as string | undefined,
          conservationStatus: v.input.conservationStatus as string | undefined,
          coordinateUncertaintyM: v.input.coordinateUncertaintyM as number | undefined,
          assessmentResolved: v.input.assessmentResolved as boolean | undefined,
        }),
      )!;
      expect(o.decimalLatitude).toBeCloseTo(v.expected.lat, 9);
      expect(o.decimalLongitude).toBeCloseTo(v.expected.lng, 9);
    }
  });
});

describe('backend provider', () => {
  const view = { west: -80, south: -5, east: -78, north: -1, zoom: 9 };

  it('builds a bounded, filtered query url', () => {
    const url = new URL(
      queryUrl('https://calyx.example/', view, { ...EMPTY_FILTERS, genus: 'Dracula', yearFrom: 1950, months: [3, 4] }),
    );
    expect(url.pathname).toBe('/atlas/occurrences/query');
    expect(url.searchParams.get('bbox')).toBe('-80.0000,-5.0000,-78.0000,-1.0000');
    expect(url.searchParams.get('genus')).toBe('Dracula');
    expect(url.searchParams.get('year_from')).toBe('1950');
    expect(url.searchParams.get('months')).toBe('3,4');
  });

  it('normalises server points and rejects malformed ones', () => {
    expect(fromBackendPoint({ occurrenceID: 'x' })).toBeNull();
    const o = fromBackendPoint({
      occurrenceID: 'x',
      scientificName: 'Dracula vampira',
      taxonID: 't1',
      decimalLatitude: -3.5,
      decimalLongitude: -79.5,
      generalised: true,
      generalisationReason: 'iucn-threatened',
      iucnCategory: 'CR',
    })!;
    expect(o).toMatchObject({ taxonKey: 't1', assessment: 'threatened', provider: 'calyx-viewport' });
  });

  it('distinguishes unconfigured source, unreachable service, and unexpected contracts', async () => {
    const signal = new AbortController().signal;
    const json = (body: unknown, status = 200) =>
      vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    const unconfigured = await queryBackend(view, EMPTY_FILTERS, signal, {
      base: 'https://a.example',
      fetchImpl: json({ contract_version: 'oc-atlas-occurrence-query-v1', source: { state: 'source_not_configured' } }),
    });
    expect(unconfigured.kind).toBe('source-unavailable');
    const down = await queryBackend(view, EMPTY_FILTERS, signal, {
      base: 'https://b.example',
      fetchImpl: vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }) as unknown as typeof fetch,
    });
    expect(down.kind).toBe('unreachable');
    const wrong = await queryBackend(view, EMPTY_FILTERS, signal, { base: 'https://c.example', fetchImpl: json({ hello: 1 }) });
    expect(wrong.kind).toBe('unreachable');
    const error = await queryBackend(view, EMPTY_FILTERS, signal, { base: 'https://d.example', fetchImpl: json({}, 503) });
    expect(error).toEqual({ kind: 'unreachable', detail: 'The Calyx Atlas service answered 503.' });
  });

  it('propagates aborts so superseded viewport requests are cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return new Response('{}');
    }) as unknown as typeof fetch;
    await expect(
      queryBackend(view, EMPTY_FILTERS, controller.signal, { base: 'https://e.example', fetchImpl }),
    ).rejects.toThrow('aborted');
  });

  it('caches successful responses', async () => {
    const body = { contract_version: 'oc-atlas-occurrence-query-v1', source: { state: 'available' }, points: [], clusters: [] };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
    const signal = new AbortController().signal;
    await queryBackend(view, EMPTY_FILTERS, signal, { base: 'https://f.example', fetchImpl });
    const second = await queryBackend(view, EMPTY_FILTERS, signal, { base: 'https://f.example', fetchImpl });
    expect(second).toMatchObject({ kind: 'ok', cached: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('expires and evicts cache entries', () => {
    let now = 0;
    const cache = new ResponseCache<number>(2, 10, () => now);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    now = 11;
    expect(cache.get('c')).toBeUndefined();
  });
});

describe('filters, attribution and exports', () => {
  const rec = (over: Partial<ExplorerOccurrence>): ExplorerOccurrence => ({
    ...fromCanonicalPoint(point())!,
    ...over,
  });

  it('filters by genus, name, years and months', () => {
    const r = rec({ year: 1990, month: 5 });
    expect(matchesFilters(r, { ...EMPTY_FILTERS, genus: 'Dracula' })).toBe(true);
    expect(matchesFilters(r, { ...EMPTY_FILTERS, genus: 'Vanilla' })).toBe(false);
    expect(matchesFilters(r, { ...EMPTY_FILTERS, scientificName: 'dracula VAMPIRA' })).toBe(true);
    expect(matchesFilters(r, { ...EMPTY_FILTERS, yearFrom: 2000 })).toBe(false);
    expect(matchesFilters(r, { ...EMPTY_FILTERS, months: [6] })).toBe(false);
    expect(matchesFilters(rec({ year: null }), { ...EMPTY_FILTERS, yearTo: 2000 })).toBe(false);
  });

  it('attributes datasets with licences', () => {
    const out = attributionOf([rec({ license: 'CC-BY-4.0' }), rec({}), rec({ datasetName: null })]);
    expect(out[0]).toEqual({ dataset: 'Synthetic dataset', count: 2, licenses: ['CC-BY-4.0'] });
    expect(out[1].dataset).toBe('Unattributed source');
  });

  it('exports only the locality-safe projection and neutralises formulas', () => {
    const protectedRecord = fromCanonicalPoint(point({ iucnCode: 'CR', locality: 'Ridge trail' }))!;
    const formula = rec({ scientificName: '=HYPERLINK("x")', decimalLatitude: 10, decimalLongitude: 10 });
    const ctx = { provider: 'canonical-store' as const, generatedAt: new Date('2026-10-11T00:00:00Z'), bbox: 'world', filters: '' };
    const csv = toCsv([protectedRecord, formula], ctx);
    expect(csv).not.toContain('-3.98765');
    expect(csv).not.toContain('Ridge trail');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    const geo = JSON.parse(toGeoJson([protectedRecord], ctx));
    expect(geo.features[0].geometry.coordinates).toEqual([-79.5, -3.5]);
    expect(geo.features[0].properties.generalisationReason).toBe('iucn-threatened');
  });
});

describe('contracts', () => {
  it('only draws operational layers, and every non-operational layer states its blocker', () => {
    for (const layer of LAYER_CATALOG.layers) {
      if (isDrawable(layer)) expect(['operational', 'operational_external']).toContain(layer.status);
      if (layer.status === 'planned' || layer.status === 'blocked') expect(layer.blocker).toBeTruthy();
    }
    const catalogIds = new Set(LAYER_CATALOG.layers.map((l) => l.layer_id));
    for (const id of DRAWABLE_LAYER_IDS) expect(catalogIds.has(id)).toBe(true);
  });

  it('builds module links from bounded canonical names only', () => {
    const links = moduleLinksFor({ genus: 'Dracula', scientificName: 'Dracula vampira' });
    const hrefs = links.map((l) => l.href);
    expect(hrefs).toContain('/genus/Dracula');
    expect(hrefs).toContain('/calyx?genus=Dracula&origin=atlas-next&context_is_evidence=false');
    expect(hrefs).toContain('/species?q=Dracula%20vampira');
    const forbidden = /^(lat|lng|lon|latitude|longitude|occurrence.*|locality|coordinates?|site)$/i;
    for (const href of hrefs) {
      const keys = [...new URL(href, 'https://oc.example').searchParams.keys()];
      expect(keys.filter((k) => forbidden.test(k))).toEqual([]);
    }
    // Unsafe or missing subjects never widen into a route.
    const unsafe = moduleLinksFor({ genus: 'dracula"><script>', scientificName: null });
    expect(unsafe.some((l) => l.href.includes('{') || l.href.includes('script'))).toBe(false);
    expect(unsafe.some((l) => l.href.startsWith('/genus/'))).toBe(false);
  });

  it('every workflow step names a declared capability', () => {
    const ids = new Set(MODULE_CAPABILITIES.capabilities.map((c) => c.capability_id));
    for (const wf of MODULE_CAPABILITIES.workflows) for (const step of wf.steps) expect(ids.has(step)).toBe(true);
  });

  it('bundled contract mirrors carry the canonical Atlas schema identifiers', () => {
    for (const name of ['atlas_layer_catalog_v1', 'atlas_module_capabilities_v1']) {
      const raw = JSON.parse(readFileSync(new URL(`../../../contracts/${name}.json`, import.meta.url), 'utf8'));
      expect(raw.schema).toMatch(/^oc\.atlas-/);
    }
  });
});

describe('canonical-store view builder', () => {
  it('filters to the viewport and subject, and switches between points and clusters', async () => {
    const { viewFromRecords } = await import('./useExplorerData');
    const base = fromCanonicalPoint(point())!;
    const many = Array.from({ length: 300 }, (_, i) => ({ ...base, occurrenceID: `r${i}`, decimalLatitude: -2 + i * 0.001 }));
    const far = { ...base, occurrenceID: 'far', decimalLatitude: 40, decimalLongitude: 10, genus: 'Ophrys' };
    const world = { west: -180, south: -90, east: 180, north: 90, zoom: 2 };
    const clustered = viewFromRecords([...many, far], world, EMPTY_FILTERS);
    expect(clustered.mode).toBe('clusters');
    expect(clustered.clusters.reduce((s, c) => s + c.count, 0)).toBe(301);
    const ophrys = viewFromRecords([...many, far], world, { ...EMPTY_FILTERS, genus: 'Ophrys' });
    expect(ophrys.mode).toBe('points');
    expect(ophrys.records.map((r) => r.occurrenceID)).toEqual(['far']);
    const andes = viewFromRecords([...many, far], { west: -81, south: -5, east: -75, north: 2, zoom: 9 }, EMPTY_FILTERS);
    expect(andes.mode).toBe('points');
    expect(andes.totalInView).toBe(300);
  });
});
