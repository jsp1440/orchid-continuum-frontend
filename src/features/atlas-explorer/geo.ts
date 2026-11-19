/**
 * Atlas Explorer — viewport geometry and clustering.
 *
 * Mirrors `app/atlas_intelligence/occurrences.py` in orchid-calyx-backend so a
 * view clusters the same way whether the records came from the backend query
 * or from the canonical store fallback. Clustering always runs on
 * locality-safe (already generalised) coordinates; a one-record cluster can
 * therefore never sit on a protected site.
 */

export interface Viewport {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
}

/** Same ladder as the backend: coarse rungs are whole degrees that nest every policy cell. */
export const CLUSTER_CELL_LADDER = [20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05] as const;
export const POINT_MODE_MIN_ZOOM = 7;
/** Same as the backend: a view this small is drawn as records at any zoom (points are already locality-safe). */
export const SMALL_VIEW_POINTS = 250;
export const MAX_POINTS_DRAWN = 2000;

export function cellDegForZoom(zoom: number): number {
  const index = Math.max(0, Math.min(CLUSTER_CELL_LADDER.length - 1, Math.floor(zoom)));
  return CLUSTER_CELL_LADDER[index];
}

export function crossesAntimeridian(view: Pick<Viewport, 'west' | 'east'>): boolean {
  return view.west > view.east;
}

/** Normalise a MapLibre bounds (which can run past ±180 on a wrapped map) to WGS84. */
export function normaliseViewport(raw: Viewport): Viewport {
  const span = raw.east - raw.west;
  const clampLat = (v: number) => Math.max(-90, Math.min(90, v));
  if (span >= 360) {
    return { west: -180, east: 180, south: clampLat(raw.south), north: clampLat(raw.north), zoom: raw.zoom };
  }
  const wrap = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;
  let west = wrap(raw.west);
  let east = wrap(raw.east);
  if (west === east) {
    west = -180;
    east = 180;
  }
  return { west, east, south: clampLat(raw.south), north: clampLat(raw.north), zoom: raw.zoom };
}

export function viewportContains(view: Viewport, lat: number, lng: number): boolean {
  if (lat < view.south || lat > view.north) return false;
  if (crossesAntimeridian(view)) return lng >= view.west || lng <= view.east;
  return lng >= view.west && lng <= view.east;
}

export function bboxParam(view: Viewport): string {
  const f = (v: number) => v.toFixed(4);
  return `${f(view.west)},${f(view.south)},${f(view.east)},${f(view.north)}`;
}

export interface Clusterable {
  occurrenceID: string;
  taxonKey: string;
  genus?: string | null;
  year?: number | null;
  decimalLatitude: number;
  decimalLongitude: number;
  generalised: boolean;
}

export interface Cluster {
  cellId: string;
  latitude: number;
  longitude: number;
  count: number;
  taxonCount: number;
  topGenera: string[];
  yearMin: number | null;
  yearMax: number | null;
  generalisedCount: number;
}

function topThree(values: Iterable<string>): string[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([k]) => k);
}

export function clusterPoints<T extends Clusterable>(points: readonly T[], cellDeg: number): Cluster[] {
  const bins = new Map<string, T[]>();
  for (const p of points) {
    const key = `${Math.floor(p.decimalLatitude / cellDeg)}:${Math.floor(p.decimalLongitude / cellDeg)}`;
    const bin = bins.get(key);
    if (bin) bin.push(p);
    else bins.set(key, [p]);
  }
  const out: Cluster[] = [];
  for (const [key, members] of bins) {
    const years = members.map((m) => m.year).filter((y): y is number => typeof y === 'number');
    out.push({
      cellId: `${cellDeg}:${key}`,
      latitude: members.reduce((s, m) => s + m.decimalLatitude, 0) / members.length,
      longitude: members.reduce((s, m) => s + m.decimalLongitude, 0) / members.length,
      count: members.length,
      taxonCount: new Set(members.map((m) => m.taxonKey)).size,
      topGenera: topThree(members.map((m) => m.genus).filter((g): g is string => !!g)),
      yearMin: years.length ? Math.min(...years) : null,
      yearMax: years.length ? Math.max(...years) : null,
      generalisedCount: members.filter((m) => m.generalised).length,
    });
  }
  return out.sort((a, b) => a.cellId.localeCompare(b.cellId));
}

export interface GridCell {
  cellId: string;
  west: number;
  south: number;
  east: number;
  north: number;
  records: number;
  taxa: number;
}

/**
 * Per-cell record and distinct-taxon counts, for the sampling-effort and
 * observed-richness layers. Observed richness is a lower bound and strongly
 * sampling-biased; the UI must say so wherever it is drawn.
 */
export function gridSummary<T extends Clusterable>(points: readonly T[], cellDeg: number): GridCell[] {
  const cells = new Map<string, { i: number; j: number; records: number; taxa: Set<string> }>();
  for (const p of points) {
    const i = Math.floor(p.decimalLatitude / cellDeg);
    const j = Math.floor(p.decimalLongitude / cellDeg);
    const key = `${i}:${j}`;
    const cell = cells.get(key) ?? { i, j, records: 0, taxa: new Set<string>() };
    cell.records += 1;
    cell.taxa.add(p.taxonKey);
    cells.set(key, cell);
  }
  return [...cells.entries()].map(([key, c]) => ({
    cellId: `${cellDeg}:${key}`,
    south: Math.max(-90, c.i * cellDeg),
    north: Math.min(90, (c.i + 1) * cellDeg),
    west: Math.max(-180, c.j * cellDeg),
    east: Math.min(180, (c.j + 1) * cellDeg),
    records: c.records,
    taxa: c.taxa.size,
  }));
}

/** A grid one rung finer than the cluster ladder reads better as a choropleth. */
export function gridDegForZoom(zoom: number): number {
  return cellDegForZoom(zoom + 1);
}

export type RecordAgeClass = 'pre-1950' | '1950-1999' | '2000-plus' | 'undated';

export function recordAgeClass(year: number | null | undefined): RecordAgeClass {
  if (typeof year !== 'number' || !Number.isFinite(year)) return 'undated';
  if (year < 1950) return 'pre-1950';
  if (year < 2000) return '1950-1999';
  return '2000-plus';
}

export type AssessmentClass = 'threatened' | 'not-threatened' | 'unresolved';

export function assessmentClass(record: {
  iucnCategory?: string | null;
  assessmentResolved?: boolean | null;
}): AssessmentClass {
  const code = (record.iucnCategory ?? '').trim().toUpperCase();
  if (code === 'CR' || code === 'EN' || code === 'VU') return 'threatened';
  if (record.assessmentResolved === false) return 'unresolved';
  if (record.assessmentResolved === true || code) return 'not-threatened';
  return 'unresolved';
}
