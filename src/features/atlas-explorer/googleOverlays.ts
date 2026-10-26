/**
 * Pure builders for the Google map overlays. They consume only the records,
 * clusters and grid cells the Explorer has already passed through the shared
 * locality policy, and add no coordinate of their own.
 */
import { gridSummary, recordAgeClass, type AssessmentClass, type Cluster, type GridCell } from './geo';
import { PALETTE, type ColorMode } from './palette';

export interface OverlayRecord {
  occurrenceID: string;
  scientificName: string;
  decimalLatitude: number;
  decimalLongitude: number;
  generalised: boolean;
  year?: number | null;
  assessment: AssessmentClass;
  taxonKey: string;
}

export function recordColor(r: OverlayRecord, mode: ColorMode): string {
  if (mode === 'record-age') return PALETTE.age[recordAgeClass(r.year)];
  if (mode === 'conservation-assessment') return PALETTE.assessment[r.assessment];
  return r.generalised ? PALETTE.generalised : PALETTE.point;
}

export function pointFeatures(records: readonly OverlayRecord[], mode: ColorMode): GeoJSON.Feature[] {
  return records.map((r) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [r.decimalLongitude, r.decimalLatitude] },
    properties: { kind: 'point', id: r.occurrenceID, name: r.scientificName, generalised: r.generalised, color: recordColor(r, mode) },
  }));
}

export function clusterFeatures(clusters: readonly Cluster[]): GeoJSON.Feature[] {
  return clusters.map((c) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [c.longitude, c.latitude] },
    properties: { kind: 'cluster', id: c.cellId, count: c.count, label: `${c.count} records` },
  }));
}

export function gridFeatures(cells: readonly GridCell[], metric: 'taxa' | 'records'): GeoJSON.Feature[] {
  const max = Math.max(1, ...cells.map((c) => c[metric]));
  return cells.map((c) => ({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[c.west, c.south], [c.east, c.south], [c.east, c.north], [c.west, c.north], [c.west, c.south]]],
    },
    properties: { kind: 'grid', id: c.cellId, value: c[metric], intensity: c[metric] / max },
  }));
}

export function gridForRecords(records: readonly OverlayRecord[], deg: number): GridCell[] {
  return gridSummary(records, deg);
}

/** Cluster marker radius in pixels: grows with the square root of the count, bounded. */
export function clusterRadius(count: number): number {
  return Math.max(8, Math.min(26, 6 + 3.2 * Math.sqrt(Math.max(1, count))));
}
