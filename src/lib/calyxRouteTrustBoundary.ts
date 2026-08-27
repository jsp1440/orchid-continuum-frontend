import { ATLAS_NEXT_CALYX_ORIGIN } from '@/features/atlas-next/researchHandoff';
import {
  ATLAS_WORKSPACE_ORIGIN,
  FEATURED_TAXON_ORIGIN,
  RELATIONSHIP_MATRIX_ORIGIN,
} from '@/lib/featuredTaxonNavigation';
import { GENUS_PROFILE_ORIGIN } from '@/lib/genusProfileNavigation';

const NON_EVIDENTIARY_GENUS_ORIGINS = new Set([
  FEATURED_TAXON_ORIGIN,
  ATLAS_WORKSPACE_ORIGIN,
  GENUS_PROFILE_ORIGIN,
  ATLAS_NEXT_CALYX_ORIGIN,
  RELATIONSHIP_MATRIX_ORIGIN,
]);

const RESEARCH_STATION_ORIGIN = 'research-station';
const MAX_CANONICAL_GENUS_CHARACTERS = 120;
const MAX_RESEARCH_TAXON_CHARACTERS = 180;
const SAFE_CANONICAL_GENUS = /^[A-Z][A-Za-z-]+$/;
const SAFE_RESEARCH_TAXON = /^[A-Za-z0-9][A-Za-z0-9 .:_()'×-]*$/;
const SAFE_RESEARCH_BINOMIAL = /^([A-Z][A-Za-z-]+)\s+[a-z][A-Za-z-]+$/;

const FORBIDDEN_GENERIC_GENUS_CONTEXT_KEYS = new Set([
  'latitude',
  'longitude',
  'locality',
  'occurrence_id',
  'record_id',
  'subject_id',
  'project_id',
  'taxon',
  'species',
  'state',
  'evidence',
  'confidence',
  'conclusion',
  'citation',
  'provenance',
]);

function hasBoundedCanonicalGenus(params: URLSearchParams): boolean {
  const genus = params.get('genus')?.trim() ?? '';
  return (
    Boolean(genus) &&
    genus.length <= MAX_CANONICAL_GENUS_CHARACTERS &&
    SAFE_CANONICAL_GENUS.test(genus)
  );
}

function hasForbiddenGenericGenusContext(params: URLSearchParams): boolean {
  for (const key of FORBIDDEN_GENERIC_GENUS_CONTEXT_KEYS) {
    if (params.has(key)) return true;
  }
  return false;
}

function rejectsResearchStationIdentity(params: URLSearchParams, origin: string): boolean {
  if (origin !== RESEARCH_STATION_ORIGIN) return false;

  const hasTaxon = params.has('taxon');
  if (!hasTaxon) return false;

  const taxon = params.get('taxon')?.trim() ?? '';
  if (
    !taxon ||
    taxon.length > MAX_RESEARCH_TAXON_CHARACTERS ||
    !SAFE_RESEARCH_TAXON.test(taxon)
  ) {
    return true;
  }

  if (!params.has('genus')) return false;
  if (!hasBoundedCanonicalGenus(params)) return true;

  const binomial = taxon.match(SAFE_RESEARCH_BINOMIAL);
  if (!binomial) return true;

  return params.get('genus')!.trim() !== binomial[1];
}

export type GovernedCalyxGenusTurnContext = {
  origin: string;
  featured_taxon: {
    rank: 'genus';
    accepted_name: string;
  };
  featured_taxon_is_evidence: false;
};

/**
 * Resolve a generic genus-navigation arrival into the exact bounded context
 * that may enter a Calyx backend turn.
 *
 * `undefined` means this URL does not belong to the generic genus boundary and
 * another dedicated adapter may handle it. `null` means it does belong here but
 * violates the producer contract, so callers must fail closed rather than
 * forwarding a partial genus/origin pair.
 *
 * Generic genus handoffs are identity/context channels only. Evidence-shaped,
 * locality-shaped, or conflicting exact-taxon/project identifiers are rejected
 * instead of silently ignored, preventing a producer regression or crafted URL
 * from smuggling Matrix/Atlas scientific state into a Calyx genus turn.
 *
 * Unknown origins remain available to legacy/dedicated adapters only when any
 * supplied genus is itself a bounded canonical single-token genus. This stops
 * the older generic Calyx parser from promoting lowercase, binomial, or other
 * malformed taxon strings to `rank: genus` merely because an origin is unknown.
 *
 * Research Station is a dedicated adapter, but its exact identity is also
 * guarded here before the generic fallback can run. A supplied `taxon` must be
 * bounded/safe; when Research Station supplies both genus and exact taxon, the
 * taxon must be an unambiguous binomial whose genus exactly matches the carried
 * genus. Invalid or contradictory arrivals fail closed instead of degrading to
 * a genus-only Calyx turn.
 */
export function governedCalyxGenusTurnContext(
  search: string,
): GovernedCalyxGenusTurnContext | null | undefined {
  const params = new URLSearchParams(search);
  const origin = params.get('origin')?.trim() ?? '';

  if (rejectsResearchStationIdentity(params, origin)) return null;

  if (!NON_EVIDENTIARY_GENUS_ORIGINS.has(origin)) {
    if (params.has('genus') && !hasBoundedCanonicalGenus(params)) return null;
    return undefined;
  }

  if (
    !hasBoundedCanonicalGenus(params) ||
    params.get('context_is_evidence') !== 'false' ||
    hasForbiddenGenericGenusContext(params)
  ) {
    return null;
  }

  return {
    origin,
    featured_taxon: {
      rank: 'genus',
      accepted_name: params.get('genus')!.trim(),
    },
    featured_taxon_is_evidence: false,
  };
}

/**
 * True only when a governed generic-genus producer has preserved both its
 * canonical genus identity and the explicit `context_is_evidence=false`
 * declaration all the way to the Calyx route.
 *
 * Callers use this to carry the already-validated boundary into the turn
 * context. Unknown origins never acquire a non-evidence attestation merely by
 * supplying a lookalike query parameter.
 */
export function calyxNavigationContextIsExplicitlyNonEvidentiary(search: string): boolean {
  return Boolean(governedCalyxGenusTurnContext(search));
}

/**
 * Fail closed when a governed genus-navigation origin reaches Calyx without
 * the canonical genus identity and explicit non-evidence declaration promised
 * by its producer, when an unmanaged origin tries to supply a malformed genus,
 * or when a Research Station exact identity is malformed/contradictory.
 *
 * Atlas Next occurrence-evidence routes use a separate question provenance
 * contract, while dossier/classroom arrivals have dedicated adapters. Research
 * remains dedicated as well; this boundary only prevents its malformed exact
 * identity from falling through to the generic Calyx parser.
 */
export function rejectsCalyxNavigationContext(search: string): boolean {
  return governedCalyxGenusTurnContext(search) === null;
}
