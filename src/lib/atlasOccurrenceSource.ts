/**
 * Which relation the Atlas reads occurrence rows from.
 *
 * The base table `atlas_occurrences` returns raw coordinates and free-text
 * locality to anyone holding the public anon key. The owner-applied migration
 * docs/atlas-next/migrations/20260930_atlas_occurrences_locality_protection.sql
 * adds `atlas_occurrences_public`, a view that generalises coordinates by
 * sensitivity tier and withholds locality AT THE SOURCE, and then revokes anon
 * access to the base table.
 *
 * `VITE_ATLAS_OCCURRENCE_SOURCE` selects the read path:
 *
 *   - `auto` (default): read the protected view; only when the view does not
 *     exist yet (migration not applied) fall back to the base table, exactly as
 *     before. Any other view error is retried, never downgraded.
 *   - `view`: protected view only. If it is missing the Atlas fails closed
 *     (no records) rather than reading raw rows. Set after the migration.
 *   - `table`: legacy base table only. Emergency use; it stops working once
 *     the migration revokes anon access.
 *
 * Client-side generalisation (src/lib/atlasLocalitySafety.ts and
 * src/features/atlas-next/sensitivity.ts) still runs on every row either way,
 * as defence in depth.
 */

export const ATLAS_BASE_TABLE = 'atlas_occurrences' as const;
export const ATLAS_PUBLIC_VIEW = 'atlas_occurrences_public' as const;

/**
 * Columns read from the protected view. Same shape as the base-table select,
 * plus what the view publishes to explain its own decision. `lat` / `lng` are
 * already grid-cell centres and `locality` is NULL whenever protection applied.
 */
export const ATLAS_PUBLIC_VIEW_COLUMNS =
  'id, scientific_name, accepted_name, genus, species, lat, lng, elevation_m, country, region, locality, habitat, biome, year, source_dataset, source_record_id, media_url, verified, coordinate_uncertainty_m, pollinator_data, mycorrhizal_data, species_id, published_cell_deg, published_precision_reason, locality_withheld, assessment_resolved';

export type AtlasOccurrenceSourceMode = 'auto' | 'view' | 'table';

/** What the most recent load actually read. */
export type AtlasOccurrenceSource = 'protected-view' | 'legacy-table' | 'unknown';

/** Reasons the view can publish for a row's precision. */
export type PublishedPrecisionReason =
  | 'exact'
  | 'curated-release'
  | 'source-imprecision'
  | 'unresolved-assessment'
  | 'cites-appendix-i'
  | 'threatened'
  | 'curated-sensitive';

const PROTECTIVE_REASONS: ReadonlySet<string> = new Set([
  'unresolved-assessment',
  'cites-appendix-i',
  'threatened',
  'curated-sensitive',
]);

/** True when the source withheld precision (rather than the record being imprecise). */
export function isProtectivePublishedReason(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && PROTECTIVE_REASONS.has(reason);
}

export function resolveAtlasOccurrenceSourceMode(raw: string | undefined | null): AtlasOccurrenceSourceMode {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'view' || value === 'table') return value;
  return 'auto';
}

interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * True only when the error says the relation itself does not exist — the one
 * case where `auto` may fall back. Permission, network and 5xx errors are not
 * "missing" and must never downgrade the Atlas to the raw table.
 */
export function isMissingRelationError(error: PostgrestLikeError | null | undefined, status?: number): boolean {
  if (!error) return false;
  const code = (error.code ?? '').toUpperCase();
  if (code === 'PGRST205' || code === '42P01') return true;
  if (code) return false;
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  const namesView = text.includes(ATLAS_PUBLIC_VIEW);
  if (namesView && (text.includes('could not find') || text.includes('does not exist'))) return true;
  return status === 404 && namesView;
}

let viewMissing = false;
let lastSource: AtlasOccurrenceSource = 'unknown';

/** Relation to query next under `mode`. */
export function atlasRelationFor(mode: AtlasOccurrenceSourceMode): typeof ATLAS_BASE_TABLE | typeof ATLAS_PUBLIC_VIEW {
  if (mode === 'table') return ATLAS_BASE_TABLE;
  if (mode === 'view') return ATLAS_PUBLIC_VIEW;
  return viewMissing ? ATLAS_BASE_TABLE : ATLAS_PUBLIC_VIEW;
}

/** Record that the view is absent so `auto` stops asking for it this session. */
export function markAtlasPublicViewMissing(): void {
  viewMissing = true;
}

export function recordAtlasOccurrenceSource(relation: string): void {
  lastSource = relation === ATLAS_PUBLIC_VIEW ? 'protected-view' : relation === ATLAS_BASE_TABLE ? 'legacy-table' : 'unknown';
}

export function getAtlasOccurrenceSource(): AtlasOccurrenceSource {
  return lastSource;
}

/** Test-only reset of module state. */
export function __resetAtlasOccurrenceSourceForTests(): void {
  viewMissing = false;
  lastSource = 'unknown';
}

/** Visible notice for the current source. Never empty: the Atlas always says how locations are shown. */
export function atlasLocationProtectionNotice(source: AtlasOccurrenceSource): { title: string; body: string } {
  if (source === 'protected-view') {
    return {
      title: 'Precise locations protected',
      body: 'Coordinates arrive already generalised at the source by sensitivity tier; free-text locality is withheld for protected records.',
    };
  }
  return {
    title: 'Locations generalised',
    body: 'Threatened, CITES Appendix I and unassessed taxa are shown at a coarser grid and their free-text locality is withheld.',
  };
}

/** Fields a point carries when it was read from the protected view. */
export interface SourcePublishedPrecision {
  publishedCellDeg?: number;
  publishedPrecisionReason?: string;
  localityWithheldAtSource?: boolean;
}

/** Cell the source already applied; 0 when the row was not generalised there. */
export function sourcePublishedCellDeg(point: SourcePublishedPrecision): number {
  const cell = point.publishedCellDeg;
  return typeof cell === 'number' && Number.isFinite(cell) && cell > 0 ? cell : 0;
}

/** Whether the source withheld precision or locality for this row. */
export function sourceWithheld(point: SourcePublishedPrecision): boolean {
  return point.localityWithheldAtSource === true || isProtectivePublishedReason(point.publishedPrecisionReason);
}

const km = (deg: number) => Math.round(deg * 111);

/**
 * Map the view's reason onto the client's reason vocabulary, with the sentence
 * shown to the viewer. The source's decision can only coarsen a rendering.
 */
export function sourcePrecisionPolicy(
  point: SourcePublishedPrecision & { coordinateUncertaintyM?: number },
): { reason: 'conservation-status' | 'unresolved-assessment' | 'coordinate-uncertainty'; notice: string } | null {
  const cell = sourcePublishedCellDeg(point);
  if (cell <= 0) return null;
  switch (point.publishedPrecisionReason) {
    case 'threatened':
      return {
        reason: 'conservation-status',
        notice: `Location generalised at the source to about ${km(cell)} km because this taxon is assessed as threatened; precise sites are withheld to reduce collection risk.`,
      };
    case 'cites-appendix-i':
      return {
        reason: 'conservation-status',
        notice: `Location generalised at the source to about ${km(cell)} km because this taxon is listed in CITES Appendix I; precise sites are withheld to reduce collection risk.`,
      };
    case 'curated-sensitive':
      return {
        reason: 'conservation-status',
        notice: `Location generalised at the source to about ${km(cell)} km because a curator marked this site as sensitive.`,
      };
    case 'source-imprecision':
      return {
        reason: 'coordinate-uncertainty',
        notice:
          typeof point.coordinateUncertaintyM === 'number'
            ? `Shown as an area of about ${km(cell)} km because the source record states ${Math.round(point.coordinateUncertaintyM)} m coordinate uncertainty.`
            : `Shown as an area of about ${km(cell)} km because the source record is imprecise.`,
      };
    case 'unresolved-assessment':
    default:
      // Unknown or future reasons are treated as the precautionary case.
      return {
        reason: 'unresolved-assessment',
        notice: `Location generalised at the source to about ${km(cell)} km because the Continuum could not resolve a conservation assessment for this name. This precaution is not a claim that the taxon is threatened.`,
      };
  }
}
