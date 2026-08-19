/**
 * ATLAS-NEXT — the scale ladder.
 *
 * The Atlas is one spatial system seen from different distances. Descending a
 * level changes the camera, how records are drawn, and how precisely a
 * coordinate may be published — nothing else. There is no second map.
 *
 * Which levels exist is resolved at RUNTIME from the canonical data. A level
 * organised by a field the graph does not carry is reported as unavailable
 * with the reason stated, rather than being faked from a coordinate heuristic.
 * (The Globe prototype guessed continents from longitude bands; that invents
 * geography and is not reused.)
 */

import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import type { AtlasAccessLevel, ScaleLevel } from './types';
import { SCALE_ORDER, SCALES } from './types';
import { resolveLocation } from './sensitivity';

export interface ScaleAvailability {
  level: ScaleLevel;
  available: boolean;
  /** Number of distinct values of the organising field found in the data. */
  distinctValues: number;
  reason: string;
}

/** Which rungs of the ladder the current dataset can actually support. */
export function resolveScaleAvailability(points: AtlasOccurrencePoint[]): ScaleAvailability[] {
  const regions = new Set<string>();
  const countries = new Set<string>();
  const localities = new Set<string>();
  for (const p of points) {
    if (p.region?.trim()) regions.add(p.region.trim());
    if (p.country?.trim() && p.country !== 'Unknown') countries.add(p.country.trim());
    if (p.locality?.trim()) localities.add(p.locality.trim());
  }

  return SCALE_ORDER.map((level) => {
    const d = SCALES[level];
    if (d.organisedBy === 'none') {
      return { level, available: true, distinctValues: 0, reason: '' };
    }
    const set =
      d.organisedBy === 'region' ? regions : d.organisedBy === 'country' ? countries : localities;
    const available = set.size > 0;
    return {
      level,
      available,
      distinctValues: set.size,
      reason: available
        ? ''
        : `No occurrence in the current selection records a ${d.organisedBy}, so this scale has nothing to organise.`,
    };
  });
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------
//
// An aggregate cell is a COUNT OF RECORDS in a square of the graticule. It is
// not an occurrence, it is not a range, and it is not a density estimate. It
// is drawn and labelled as a tally so it cannot be mistaken for one.

export interface AggregateCell {
  id: string;
  /** Centre of the graticule cell, not a mean of the points inside it. */
  lat: number;
  lng: number;
  cellDeg: number;
  recordCount: number;
  speciesCount: number;
  /** Countries recorded among the records in this cell. */
  countries: string[];
  /** True when any record in this cell was coarsened by locality protection. */
  containsProtected: boolean;
}

export function aggregate(
  points: AtlasOccurrencePoint[],
  cellDeg: number,
  access: AtlasAccessLevel = 'public',
): AggregateCell[] {
  const cells = new Map<
    string,
    { lat: number; lng: number; species: Set<string>; countries: Set<string>; n: number; protectedHit: boolean }
  >();

  for (const p of points) {
    const loc = resolveLocation(p, access, cellDeg);
    const key = `${loc.lat.toFixed(4)}:${loc.lng.toFixed(4)}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        lat: loc.lat,
        lng: loc.lng,
        species: new Set(),
        countries: new Set(),
        n: 0,
        protectedHit: false,
      };
      cells.set(key, cell);
    }
    cell.n += 1;
    if (p.canonicalName) cell.species.add(p.canonicalName);
    if (p.country && p.country !== 'Unknown') cell.countries.add(p.country);
    if (loc.policy.reason === 'iucn-threatened' || loc.policy.reason === 'conservation-status') {
      cell.protectedHit = true;
    }
  }

  return Array.from(cells.entries()).map(([id, c]) => ({
    id,
    lat: c.lat,
    lng: c.lng,
    cellDeg,
    recordCount: c.n,
    speciesCount: c.species.size,
    countries: Array.from(c.countries).sort(),
    containsProtected: c.protectedHit,
  }));
}

// ---------------------------------------------------------------------------
// Focus
// ---------------------------------------------------------------------------

export interface Focus {
  lat: number;
  lng: number;
  distance: number;
}

/**
 * Where to point the camera for a set of records. Uses the median coordinate,
 * not the mean: a single outlying record must not drag the view to open ocean.
 */
export function focusFor(points: AtlasOccurrencePoint[], level: ScaleLevel): Focus | null {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.lat).sort((a, b) => a - b);
  const lngs = points.map((p) => p.lng).sort((a, b) => a - b);
  const mid = <T,>(xs: T[]): T => xs[Math.floor(xs.length / 2)];
  return { lat: mid(lats), lng: mid(lngs), distance: SCALES[level].cameraDistance };
}

export const descend = (level: ScaleLevel): ScaleLevel =>
  SCALE_ORDER[Math.min(SCALE_ORDER.length - 1, SCALE_ORDER.indexOf(level) + 1)];

export const ascend = (level: ScaleLevel): ScaleLevel =>
  SCALE_ORDER[Math.max(0, SCALE_ORDER.indexOf(level) - 1)];
