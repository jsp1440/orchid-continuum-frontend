/**
 * Atlas read path against the locality-protected view.
 *
 * The view payload is the SYNTHETIC capture in
 * __fixtures__/atlasOccurrencesPublic.syntheticLocalPg16.json: what an anon
 * session read from `atlas_occurrences_public` after the owner-applied
 * migration ran on a disposable local Postgres 16 (scripts/test-atlas-rls.sh
 * --capture). Invented taxa, open-ocean points; not orchid data.
 *
 * Assertions compare coordinates without printing them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import captured from './__fixtures__/atlasOccurrencesPublic.syntheticLocalPg16.json';

type Row = Record<string, unknown>;
type Behaviour = { data?: Row[]; error?: { code?: string; message: string }; status?: number };

const calls: Array<{ relation: string; columns: string }> = [];
let behaviour: Record<string, Behaviour> = {};

function result(relation: string, from = 0, to = Number.POSITIVE_INFINITY) {
  const b = behaviour[relation] ?? { data: [] };
  if (b.error) return Promise.resolve({ data: null, error: b.error, status: b.status ?? 400 });
  return Promise.resolve({ data: (b.data ?? []).slice(from, to + 1), error: null, status: 200 });
}

vi.mock('./supabase', () => ({
  supabase: {
    from(relation: string) {
      return {
        select(columns: string) {
          calls.push({ relation, columns });
          const chain = {
            order: () => chain,
            range: (from: number, to: number) => result(relation, from, to),
            limit: (n: number) => result(relation, 0, n - 1),
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              result(relation).then(resolve, reject),
          };
          return chain;
        },
      };
    },
  },
}));

const viewRows = (captured as { rows: Row[] }).rows;
const PERMISSION_DENIED = { code: '42501', message: 'permission denied for table atlas_occurrences' };
const VIEW_MISSING = {
  code: 'PGRST205',
  message: "Could not find the table 'public.atlas_occurrences_public' in the schema cache",
};

async function load() {
  vi.resetModules();
  const lib = await import('./orchidContinuum');
  const source = await import('./atlasOccurrenceSource');
  const safety = await import('./atlasLocalitySafety');
  const next = await import('@/features/atlas-next/sensitivity');
  return { lib, source, safety, next };
}

beforeEach(() => {
  calls.length = 0;
  behaviour = {};
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const atlasCalls = () => calls.filter((c) => c.relation.startsWith('atlas_occurrences'));

describe('Atlas reads after the migration (view present, raw table revoked)', () => {
  beforeEach(() => {
    behaviour = {
      atlas_occurrences_public: { data: viewRows },
      atlas_occurrences: { error: PERMISSION_DENIED, status: 401 },
    };
  });

  it('reads only the protected view, with the view column set, by default', async () => {
    const { lib, source } = await load();
    const points = await lib.fetchAtlasOccurrencePoints();

    expect(atlasCalls().every((c) => c.relation === 'atlas_occurrences_public')).toBe(true);
    expect(atlasCalls()[0].columns).toBe(source.ATLAS_PUBLIC_VIEW_COLUMNS);
    expect(points).toHaveLength(viewRows.length);
    expect(lib.didAtlasLoadFail()).toBe(false);
    expect(source.getAtlasOccurrenceSource()).toBe('protected-view');
  });

  it('carries the source decision and withholds locality for protected rows', async () => {
    const { lib } = await load();
    const points = await lib.fetchAtlasOccurrencePoints();
    const byId = new Map(points.map((p) => [p.id, p]));

    let protectedRows = 0;
    for (const row of viewRows) {
      const p = byId.get(row.id as string)!;
      expect(p.publishedCellDeg).toBe(row.published_cell_deg);
      expect(p.publishedPrecisionReason).toBe(row.published_precision_reason);
      if (row.locality_withheld) {
        protectedRows += 1;
        expect(p.locality).toBeUndefined();
        expect(p.localityWithheldAtSource).toBe(true);
      }
    }
    expect(protectedRows).toBeGreaterThanOrEqual(8);
  });

  it('never renders a view row finer than the source, on either renderer', async () => {
    const { lib, safety, next } = await load();
    const points = await lib.fetchAtlasOccurrencePoints();

    let unchanged = 0;
    for (const p of points) {
      const cell = p.publishedCellDeg ?? 0;
      for (const displayed of [safety.resolveAtlasLocation(p, 'public'), next.resolveLocation(p, 'public')]) {
        expect(displayed.policy.cellDeg).toBeGreaterThanOrEqual(cell);
        if (cell > 0) {
          expect(displayed.policy.generalised).toBe(true);
          // Within the source cell, and a no-op when the client cell equals it.
          expect(Math.abs(displayed.lat - p.lat) <= cell / 2 + 1e-9).toBe(true);
          expect(Math.abs(displayed.lng - p.lng) <= cell / 2 + 1e-9).toBe(true);
          if (displayed.policy.cellDeg === cell) {
            expect(Math.abs(displayed.lat - p.lat) < 1e-9 && Math.abs(displayed.lng - p.lng) < 1e-9).toBe(true);
            unchanged += 1;
          }
        }
        if (p.localityWithheldAtSource) expect(displayed.policy.localityTextAllowed).toBe(false);
      }
      // Research access still cannot see through the source.
      expect(safety.resolveAtlasLocation(p, 'research').policy.cellDeg).toBeGreaterThanOrEqual(cell);
    }
    expect(unchanged).toBeGreaterThan(0);

    const projected = points.map(safety.toPublicAtlasOccurrence);
    expect(projected.filter((p) => p.localityWithheldAtSource && p.locality !== undefined)).toHaveLength(0);
  });

  it('explains source-side protection in the viewer notice', async () => {
    const { lib, safety } = await load();
    const points = await lib.fetchAtlasOccurrencePoints();
    const cites = points.find((p) => p.publishedPrecisionReason === 'cites-appendix-i')!;
    const unresolved = points.find((p) => p.publishedPrecisionReason === 'unresolved-assessment')!;
    expect(safety.resolveAtlasLocation(cites).policy.notice).toMatch(/CITES Appendix I/);
    expect(safety.resolveAtlasLocation(unresolved).policy.reason).toBe('unresolved-assessment');
    expect(safety.resolveAtlasLocation(unresolved).policy.notice).toMatch(/not a claim that the taxon is threatened/);
  });

  it('serves the lazy first paint from the view too', async () => {
    const { lib } = await load();
    const { initial } = await lib.fetchAtlasOccurrencePointsLazy(5);
    expect(initial).toHaveLength(5);
    expect(atlasCalls()[0].relation).toBe('atlas_occurrences_public');
  });
});

describe('Atlas reads before the migration (view missing)', () => {
  const legacyRows = viewRows.map((r) => {
    const {
      published_cell_deg: _c,
      published_precision_reason: _r,
      locality_withheld: _w,
      assessment_resolved: _a,
      ingested_at: _i,
      ...rest
    } = r;
    return rest;
  });

  it('auto falls back to the base table once, as before, and reports the legacy source', async () => {
    behaviour = {
      atlas_occurrences_public: { error: VIEW_MISSING, status: 404 },
      atlas_occurrences: { data: legacyRows },
    };
    const { lib, source } = await load();
    const points = await lib.fetchAtlasOccurrencePoints();

    expect(points).toHaveLength(legacyRows.length);
    expect(source.getAtlasOccurrenceSource()).toBe('legacy-table');
    expect(atlasCalls().filter((c) => c.relation === 'atlas_occurrences_public')).toHaveLength(1);
    const base = atlasCalls().filter((c) => c.relation === 'atlas_occurrences');
    expect(base.length).toBeGreaterThan(0);
    expect(base[0].columns).not.toMatch(/published_cell_deg/);
    expect(points.every((p) => p.publishedCellDeg === undefined)).toBe(true);
  });

  it('a pinned view mode fails closed instead of reading raw rows', async () => {
    vi.stubEnv('VITE_ATLAS_OCCURRENCE_SOURCE', 'view');
    behaviour = {
      atlas_occurrences_public: { error: VIEW_MISSING, status: 404 },
      atlas_occurrences: { data: legacyRows },
    };
    const { lib, source } = await load();
    const points = await lib.fetchAtlasOccurrencePoints();

    expect(points).toHaveLength(0);
    expect(lib.didAtlasLoadFail()).toBe(true);
    expect(atlasCalls().some((c) => c.relation === 'atlas_occurrences')).toBe(false);
    expect(source.getAtlasOccurrenceSource()).toBe('unknown');
  });

  it('a transient or permission error on the view is retried, never downgraded to the raw table', async () => {
    behaviour = {
      atlas_occurrences_public: { error: { code: '', message: 'Bad gateway' }, status: 502 },
      atlas_occurrences: { data: legacyRows },
    };
    const { lib } = await load();
    const points = await lib.fetchAtlasOccurrencePoints();

    expect(points).toHaveLength(0);
    expect(lib.didAtlasLoadFail()).toBe(true);
    expect(atlasCalls().some((c) => c.relation === 'atlas_occurrences')).toBe(false);
    expect(atlasCalls().length).toBe(3);
  });

  it('client-side generalisation still protects legacy rows (defence in depth)', async () => {
    behaviour = {
      atlas_occurrences_public: { error: VIEW_MISSING, status: 404 },
      atlas_occurrences: { data: legacyRows },
    };
    const { lib, safety } = await load();
    const points = await lib.fetchAtlasOccurrencePoints();
    // No species rows are mocked, so nothing is assessed and every row fails
    // closed; CITES Appendix I rows get the stronger 0.1 degree floor.
    for (const p of points.map((pt) => ({ pt, d: safety.resolveAtlasLocation(pt, 'public') }))) {
      expect(p.d.policy.generalised).toBe(true);
      expect(p.d.policy.cellDeg).toBeGreaterThanOrEqual(0.05);
      if (p.pt.genus === 'Paphiopedilum') expect(p.d.policy.cellDeg).toBeGreaterThanOrEqual(0.1);
      expect(p.d.policy.localityTextAllowed).toBe(false);
    }
  });
});
