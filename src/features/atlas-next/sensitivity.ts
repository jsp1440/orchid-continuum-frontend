/**
 * ATLAS-NEXT — sensitive locality protection.
 *
 * Publishing a precise coordinate for a rare orchid is a collection and
 * poaching risk. This module is the single place that decides how precisely a
 * record may be drawn, and every rendering path in the Atlas goes through it.
 *
 * Design decisions worth stating, because they are easy to get wrong:
 *
 *   - Generalisation SNAPS TO A GRID CELL CENTRE. It never jitters. Jitter
 *     produces a plausible-looking coordinate that is simply false; a grid
 *     centre honestly means "somewhere in this cell".
 *   - The record's own `coordinate_uncertainty_m` is respected even when the
 *     species is not sensitive. Drawing a 30 km-uncertain record as a pin is a
 *     precision claim the source never made.
 *   - Locality TEXT is suppressed alongside the coordinate. A free-text
 *     locality ("2 km N of the village, on the ridge") defeats coordinate
 *     generalisation completely.
 *   - Access level is a parameter, not an ambient assumption. Slice 1 always
 *     passes `public`; nothing may expose more detail without being handed a
 *     higher level explicitly.
 */

import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import type { AtlasAccessLevel } from './types';

/**
 * Whether a conservation assessment could be reached for this record at all.
 *
 * The distinction between "assessed, and not threatened" and "we could not find
 * out" is the whole of Slice 2's safety work. The live store makes it urgent:
 * the conservation reference table holds NINE species, against 2,611 distinct
 * names among 31,073 occurrences. 94.5% of sampled records resolve to nothing.
 * Treating those as not-threatened publishes precise sites for taxa nobody has
 * assessed — which is exactly how a rare orchid ends up on a map.
 */
export type SensitivityResolution =
  /** A row was found and it is assessed CR / EN / VU. */
  | 'assessed-threatened'
  /** A row was found and it is assessed, but not as threatened. */
  | 'assessed-not-threatened'
  /** No assessment could be reached. Fail closed. */
  | 'unresolved';

/**
 * Precautionary cell applied when no assessment can be reached.
 *
 * 0.05 degrees is roughly 5.5 km — coarse enough that it does not lead anyone
 * to a plant, fine enough that a country or landscape view still reads. It is a
 * POLICY CONSTANT, not a scientific one: it is the one number to change if the
 * owner wants the public Atlas more or less cautious, and changing it changes
 * nothing else.
 */
export const UNRESOLVED_FLOOR_DEG = 0.05;

/** IUCN threat codes that trigger locality protection. */
const THREATENED_CODES = new Set(['CR', 'EN', 'VU']);

/** Cell size in degrees applied per threat tier. ~111 km per degree of latitude. */
const TIER_CELL_DEG: Record<string, number> = {
  CR: 1,
  EN: 0.5,
  VU: 0.25,
};

export type SensitivityReason =
  | 'iucn-threatened'
  | 'conservation-status'
  /** The record's own stated uncertainty. Nothing is being withheld. */
  | 'coordinate-uncertainty'
  /** No assessment could be reached, so precision is withheld precautionarily. */
  | 'unresolved-assessment'
  | 'none';

export interface LocalityPolicy {
  /** Whether the coordinate has been coarsened from what the record holds. */
  generalised: boolean;
  /** Grid cell size in degrees; 0 when the exact coordinate is used. */
  cellDeg: number;
  reason: SensitivityReason;
  /** Whether free-text locality may be shown. */
  localityTextAllowed: boolean;
  /** Sentence shown to the viewer. Empty when nothing was withheld. */
  notice: string;
}

export interface DisplayedLocation {
  lat: number;
  lng: number;
  policy: LocalityPolicy;
}

const iucnOf = (p: Pick<AtlasOccurrencePoint, 'iucnCode' | 'conservationStatus'>): string | null => {
  const code = (p.iucnCode ?? '').trim().toUpperCase();
  if (THREATENED_CODES.has(code)) return code;

  // Some rows carry a spelled-out status instead of a code.
  const status = (p.conservationStatus ?? '').trim().toLowerCase();
  if (!status) return null;
  if (status.includes('critically endangered')) return 'CR';
  if (status.includes('endangered')) return 'EN';
  if (status.includes('vulnerable')) return 'VU';
  return null;
};

/**
 * Convert a record's stated coordinate uncertainty into the grid size that
 * honestly represents it. A record uncertain to 25 km must not be drawn as a
 * point; it is drawn as the cell that contains it.
 */
export function uncertaintyToCellDeg(uncertaintyM: number | undefined): number {
  if (typeof uncertaintyM !== 'number' || !Number.isFinite(uncertaintyM) || uncertaintyM <= 0) {
    return 0;
  }
  const deg = uncertaintyM / 111_320; // metres per degree of latitude
  if (deg <= 0.02) return 0; // ~2 km or better: the point is the honest rendering
  if (deg <= 0.1) return 0.1;
  if (deg <= 0.25) return 0.25;
  if (deg <= 0.5) return 0.5;
  return 1;
}

/** Snap to the centre of the grid cell containing the coordinate. */
export function snapToCell(lat: number, lng: number, cellDeg: number): { lat: number; lng: number } {
  if (cellDeg <= 0) return { lat, lng };
  const snap = (v: number) => (Math.floor(v / cellDeg) + 0.5) * cellDeg;
  return {
    lat: Math.max(-90, Math.min(90, snap(lat))),
    lng: ((snap(lng) + 180) % 360 + 360) % 360 - 180,
  };
}

const km = (deg: number) => Math.round(deg * 111);

/**
 * Decide how a single record may be drawn.
 *
 * `floorCellDeg` lets the current scale impose its own coarseness (an Earth
 * view aggregates everything anyway). Protection can only ever make the
 * rendering coarser, never finer.
 */
export function resolveLocation(
  point: Pick<
    AtlasOccurrencePoint,
    'lat' | 'lng' | 'iucnCode' | 'conservationStatus' | 'coordinateUncertaintyM'
  > & { assessmentResolved?: boolean },
  access: AtlasAccessLevel = 'public',
  floorCellDeg = 0,
): DisplayedLocation {
  const tier = iucnOf(point);
  const uncertaintyCell = uncertaintyToCellDeg(point.coordinateUncertaintyM);

  // Fail closed. `assessmentResolved === false` means the pipeline looked and
  // found nothing; undefined means the caller did not tell us, and legacy
  // callers must not be silently downgraded, so only an explicit false triggers
  // the precaution.
  const unresolved = point.assessmentResolved === false && !tier;
  const precautionCell = unresolved && access !== 'research' ? UNRESOLVED_FLOOR_DEG : 0;

  // Research access may see through threat-based protection, because that
  // protection exists to guard against collection rather than to describe the
  // record. It may NOT see through coordinate uncertainty: that is a property
  // of the observation itself and no authorisation makes it more precise.
  const threatCell = tier && access !== 'research' ? TIER_CELL_DEG[tier] : 0;

  const cellDeg = Math.max(threatCell, uncertaintyCell, precautionCell, floorCellDeg);
  const { lat, lng } = snapToCell(point.lat, point.lng, cellDeg);

  // Reasons are ranked by which one actually decided the rendering, so the
  // notice always explains the constraint in force rather than a weaker one.
  let reason: SensitivityReason = 'none';
  let notice = '';
  if (threatCell > 0 && threatCell >= uncertaintyCell && threatCell >= precautionCell) {
    reason = point.iucnCode ? 'iucn-threatened' : 'conservation-status';
    notice = `Location generalised to about ${km(threatCell)} km. This species is assessed as threatened (${tier}), and precise sites are withheld to reduce collection risk.`;
  } else if (uncertaintyCell > 0 && uncertaintyCell >= precautionCell) {
    reason = 'coordinate-uncertainty';
    notice = `Shown as an area of about ${km(uncertaintyCell)} km, because the source record states a coordinate uncertainty of ${Math.round(point.coordinateUncertaintyM as number)} m. Nothing is being withheld — the record was never more precise than this.`;
  } else if (precautionCell > 0) {
    reason = 'unresolved-assessment';
    notice = `Location generalised to about ${km(precautionCell)} km. The Continuum holds no conservation assessment for this name, so the Atlas does not publish a precise site. This is a precaution about what we do not know — it is not a statement that the species is threatened.`;
  }

  return {
    lat,
    lng,
    policy: {
      generalised: cellDeg > 0,
      cellDeg,
      reason,
      // Free-text locality is withheld whenever a PROTECTION decision coarsened
      // the coordinate — threat-based or precautionary. A locality string
      // defeats generalisation, so it has to follow the same rule. Source
      // imprecision is different: nothing is being withheld there.
      localityTextAllowed: threatCell === 0 && precautionCell === 0,
      notice,
    },
  };
}

/** True when a record's precise site must not be published at this access level. */
export function isSensitive(
  point: Pick<AtlasOccurrencePoint, 'iucnCode' | 'conservationStatus'> & {
    assessmentResolved?: boolean;
  },
  access: AtlasAccessLevel = 'public',
): boolean {
  if (access === 'research') return false;
  if (iucnOf(point) !== null) return true;
  return point.assessmentResolved === false;
}

/** Which of the three outcomes applies, for reporting and for Calyx. */
export function sensitivityResolution(
  point: Pick<AtlasOccurrencePoint, 'iucnCode' | 'conservationStatus'> & {
    assessmentResolved?: boolean;
  },
): SensitivityResolution {
  if (iucnOf(point) !== null) return 'assessed-threatened';
  if (point.assessmentResolved === false) return 'unresolved';
  return 'assessed-not-threatened';
}
