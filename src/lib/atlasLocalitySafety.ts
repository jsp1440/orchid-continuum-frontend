/**
 * Shared Atlas locality-safety policy.
 *
 * This is intentionally independent of the Atlas Next UI so current and future
 * map renderers can use the same fail-closed rule. It never jitters records:
 * protected/imprecise coordinates snap to a grid-cell centre so the display
 * communicates an area rather than inventing a plausible false point.
 */

import type { AtlasOccurrencePoint } from './orchidContinuum';

export type AtlasAccessLevel = 'public' | 'research';
export type SensitivityResolution =
  | 'assessed-threatened'
  | 'assessed-not-threatened'
  | 'unresolved';

export const UNRESOLVED_FLOOR_DEG = 0.05;

const THREATENED_CODES = new Set(['CR', 'EN', 'VU']);
const TIER_CELL_DEG: Record<string, number> = { CR: 1, EN: 0.5, VU: 0.25 };

export type SensitivityReason =
  | 'iucn-threatened'
  | 'conservation-status'
  | 'coordinate-uncertainty'
  | 'unresolved-assessment'
  | 'none';

export interface LocalityPolicy {
  generalised: boolean;
  cellDeg: number;
  reason: SensitivityReason;
  localityTextAllowed: boolean;
  notice: string;
}

export interface DisplayedLocation {
  lat: number;
  lng: number;
  policy: LocalityPolicy;
}

function threatTier(
  point: Pick<AtlasOccurrencePoint, 'iucnCode' | 'conservationStatus'>,
): string | null {
  const code = (point.iucnCode ?? '').trim().toUpperCase();
  if (THREATENED_CODES.has(code)) return code;

  const status = (point.conservationStatus ?? '').trim().toLowerCase();
  if (!status) return null;
  if (status.includes('critically endangered')) return 'CR';
  if (status.includes('endangered')) return 'EN';
  if (status.includes('vulnerable')) return 'VU';
  return null;
}

export function uncertaintyToCellDeg(uncertaintyM: number | undefined): number {
  if (typeof uncertaintyM !== 'number' || !Number.isFinite(uncertaintyM) || uncertaintyM <= 0) {
    return 0;
  }
  const deg = uncertaintyM / 111_320;
  if (deg <= 0.02) return 0;
  if (deg <= 0.1) return 0.1;
  if (deg <= 0.25) return 0.25;
  if (deg <= 0.5) return 0.5;
  return 1;
}

export function snapToCell(lat: number, lng: number, cellDeg: number): { lat: number; lng: number } {
  if (cellDeg <= 0) return { lat, lng };
  const snap = (value: number) => (Math.floor(value / cellDeg) + 0.5) * cellDeg;
  return {
    lat: Math.max(-90, Math.min(90, snap(lat))),
    lng: ((snap(lng) + 180) % 360 + 360) % 360 - 180,
  };
}

const km = (deg: number) => Math.round(deg * 111);

export function resolveAtlasLocation(
  point: Pick<
    AtlasOccurrencePoint,
    'lat' | 'lng' | 'iucnCode' | 'conservationStatus' | 'coordinateUncertaintyM' | 'assessmentResolved'
  >,
  access: AtlasAccessLevel = 'public',
  floorCellDeg = 0,
): DisplayedLocation {
  const tier = threatTier(point);
  const uncertaintyCell = uncertaintyToCellDeg(point.coordinateUncertaintyM);
  const unresolved = point.assessmentResolved === false && !tier;
  const precautionCell = unresolved && access !== 'research' ? UNRESOLVED_FLOOR_DEG : 0;
  const threatCell = tier && access !== 'research' ? TIER_CELL_DEG[tier] : 0;

  const cellDeg = Math.max(threatCell, uncertaintyCell, precautionCell, floorCellDeg);
  const location = snapToCell(point.lat, point.lng, cellDeg);

  let reason: SensitivityReason = 'none';
  let notice = '';
  if (threatCell > 0 && threatCell >= uncertaintyCell && threatCell >= precautionCell) {
    reason = point.iucnCode ? 'iucn-threatened' : 'conservation-status';
    notice = `Location generalised to about ${km(threatCell)} km because this taxon is assessed as threatened (${tier}); precise sites are withheld to reduce collection risk.`;
  } else if (uncertaintyCell > 0 && uncertaintyCell >= precautionCell) {
    reason = 'coordinate-uncertainty';
    notice = `Shown as an area of about ${km(uncertaintyCell)} km because the source record states ${Math.round(point.coordinateUncertaintyM as number)} m coordinate uncertainty.`;
  } else if (precautionCell > 0) {
    reason = 'unresolved-assessment';
    notice = `Location generalised to about ${km(precautionCell)} km because the Continuum could not resolve a conservation assessment for this name. This precaution is not a claim that the taxon is threatened.`;
  }

  return {
    ...location,
    policy: {
      generalised: cellDeg > 0,
      cellDeg,
      reason,
      localityTextAllowed: threatCell === 0 && precautionCell === 0,
      notice,
    },
  };
}

/**
 * Canonical public projection for an Atlas occurrence.
 *
 * Public UI consumers should pass occurrence objects through this helper before
 * displaying or handing them to another public surface. It preserves the
 * scientific record identity and evidence fields while replacing precise
 * coordinates with the locality-safe display coordinates and withholding free
 * text locality whenever the policy requires it.
 */
export function toPublicAtlasOccurrence(point: AtlasOccurrencePoint): AtlasOccurrencePoint {
  const displayed = resolveAtlasLocation(point, 'public');
  return {
    ...point,
    lat: displayed.lat,
    lng: displayed.lng,
    locality: displayed.policy.localityTextAllowed ? point.locality : undefined,
  };
}

export function isAtlasLocationSensitive(
  point: Pick<AtlasOccurrencePoint, 'iucnCode' | 'conservationStatus' | 'assessmentResolved'>,
  access: AtlasAccessLevel = 'public',
): boolean {
  if (access === 'research') return false;
  if (threatTier(point) !== null) return true;
  return point.assessmentResolved === false;
}

export function atlasSensitivityResolution(
  point: Pick<AtlasOccurrencePoint, 'iucnCode' | 'conservationStatus' | 'assessmentResolved'>,
): SensitivityResolution {
  if (threatTier(point) !== null) return 'assessed-threatened';
  if (point.assessmentResolved === false) return 'unresolved';
  return 'assessed-not-threatened';
}

/**
 * Only a recognised IUCN assessment counts. Anything else (none, NE, DD, "not yet
 * assessed", a CITES appendix, free text) leaves the point unresolved, so it gets
 * the precaution cell rather than precise coordinates: the rule fails closed.
 */
const IUCN_CODES = /\b(LC|NT|VU|EN|CR|EX|EW|LR\/(lc|nt|cd)|CR\(PE\)|CR\(PEW\))\b/;
const IUCN_CATEGORY_NAMES = [
  'least concern', 'near threatened', 'vulnerable', 'endangered', 'critically endangered',
  'extinct in the wild', 'extinct', 'lower risk', 'conservation dependent',
];
const NOT_AN_ASSESSMENT = /data[\s_-]*deficient|not[\s_-]*(yet[\s_-]*)?(evaluated|assessed)|\b(NE|DD)\b/i;

function isRecognisedAssessment(value?: string | null): boolean {
  const text = (value ?? '').trim();
  if (!text || NOT_AN_ASSESSMENT.test(text)) return false;
  if (IUCN_CODES.test(text)) return true;
  const lower = text.toLowerCase();
  return IUCN_CATEGORY_NAMES.some((name) => lower.includes(name));
}

export function hasThreatAssessment(iucnCode?: string | null, conservationStatus?: string | null): boolean {
  return isRecognisedAssessment(iucnCode) || isRecognisedAssessment(conservationStatus);
}

/**
 * Keys whose values a diagnostics surface may print verbatim: names, ranks,
 * counts and status fields. Every other value is replaced by its type, because
 * no blocklist of key names or coordinate formats can be complete (coordinates
 * and place text also arrive as prose, JSON strings and nested number pairs).
 */
const DIAGNOSTIC_VALUE_KEYS = new Set([
  'scientific_name', 'scientificName', 'canonical_name', 'canonicalName', 'species', 'genus', 'family',
  'subfamily', 'tribe', 'rank', 'taxon_rank', 'taxonRank', 'common_name',
  'count', 'total', 'limit', 'offset', 'page', 'species_count', 'status', 'ok', 'source',
  'license', 'rights', 'basis_of_record', 'basisOfRecord', 'year', 'month', 'country', 'country_code',
  'iucn_code', 'conservation_status', 'is_demo', 'error', 'message', 'detail',
]);

/**
 * A printable sample of an API payload for diagnostics: the full key structure
 * and array lengths, values only for DIAGNOSTIC_VALUE_KEYS (and only when they
 * are short scalars), and `<type>` placeholders for everything else.
 */
export function describePayloadShape(value: unknown, key?: string, depth = 0): unknown {
  if (depth > 8) return '<depth limit>';
  if (Array.isArray(value)) {
    return value.length === 0 ? [] : [...value.slice(0, 3).map((item) => describePayloadShape(item, key, depth + 1)),
      ...(value.length > 3 ? [`<${value.length - 3} more>`] : [])];
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, inner] of Object.entries(value as Record<string, unknown>)) {
      out[k] = describePayloadShape(inner, k, depth + 1);
    }
    return out;
  }
  if (value === null || value === undefined) return value ?? null;
  const shown = key !== undefined && DIAGNOSTIC_VALUE_KEYS.has(key)
    && (typeof value !== 'string' || (value.length <= 80 && !/\d{2}/.test(value)));
  return shown ? value : `<${typeof value}>`;
}
