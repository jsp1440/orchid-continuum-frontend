/**
 * Helpers of the Atlas world overview (count cells from `/atlas/public/cells`).
 * Pure functions, shared by the Atlas page and its map.
 */
import type { AtlasCell, AtlasFilterState } from './orchidContinuum';

/** Zoom level from which the map switches from count cells to individual records. */
export const ATLAS_RECORDS_ZOOM = 5;
/** Cell size for the overview at a zoom level (coarser for the whole world). */
export const cellResolutionForZoom = (zoom: number): 2 | 1 => (zoom <= 2 ? 2 : 1);

/** True when any Atlas filter narrows the records. */
export function hasActiveAtlasFilters(filters: AtlasFilterState): boolean {
  return Object.values(filters).some((value) => (Array.isArray(value) ? value.length > 0 : !!value));
}

/** Fill colour of a cell: light for few records, deep gold for many (log scale). */
export function cellFill(count: number, maxCount: number): { color: string; opacity: number } {
  const t = maxCount > 1 ? Math.log(count) / Math.log(maxCount) : 1;
  const clamped = Math.max(0, Math.min(1, t));
  return { color: clamped > 0.66 ? '#f0b429' : clamped > 0.33 ? '#c9a24a' : '#7dd3a8', opacity: 0.25 + 0.55 * clamped };
}

/** Tooltip text of a cell: counts and the cell size, nothing record-level. */
export function cellLabel(cell: AtlasCell): string {
  const records = `${cell.count.toLocaleString()} record${cell.count === 1 ? '' : 's'}`;
  const taxa = `${cell.taxa.toLocaleString()} ${cell.taxa === 1 ? 'taxon' : 'taxa'}`;
  return `${records} · ${taxa} · area of about ${cell.cellKm.toLocaleString()} km`;
}
