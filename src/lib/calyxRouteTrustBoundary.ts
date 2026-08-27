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

const MAX_CANONICAL_GENUS_CHARACTERS = 120;
const SAFE_CANONICAL_GENUS = /^[A-Z][A-Za-z-]+$/;

const FORBIDDEN_GENERIC_GENUS_CONTEXT_KEYS = new Set([
  'latitude',
  'longitude',
  'locality',
  'occurrence_id',
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
 * Generic genus handoffs are identity/context channels only. Evidence-shaped
 * or locality-shaped URL parameters are rejected instead of silently ignored,
 * preventing a producer regression or crafted URL from smuggling Matrix/Atlas
 * scientific state into a Calyx genus turn.
 */
export function governedCalyxGenusTurnContext(
  search: string,
): GovernedCalyxGenusTurnContext | null | undefined {
  const params = new URLSearchParams(search);
  const origin = params.get('origin')?.trim() ?? '';
  if (!NON_EVIDENTIARY_GENUS_ORIGINS.has(origin)) return undefined;
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
 * by its producer.
 *
 * This is deliberately narrow. Atlas Next occurrence-evidence routes use a
 * separate question provenance contract, while dossier/classroom/research
 * arrivals have dedicated adapters. Only the generic genus origins that emit
 * `context_is_evidence=false` are enforced here.
 */
export function rejectsCalyxNavigationContext(search: string): boolean {
  return governedCalyxGenusTurnContext(search) === null;
}
