import { ATLAS_NEXT_CALYX_ORIGIN } from '@/features/atlas-next/researchHandoff';
import {
  ATLAS_WORKSPACE_ORIGIN,
  FEATURED_TAXON_ORIGIN,
} from '@/lib/featuredTaxonNavigation';
import { GENUS_PROFILE_ORIGIN } from '@/lib/genusProfileNavigation';

const NON_EVIDENTIARY_GENUS_ORIGINS = new Set([
  FEATURED_TAXON_ORIGIN,
  ATLAS_WORKSPACE_ORIGIN,
  GENUS_PROFILE_ORIGIN,
  ATLAS_NEXT_CALYX_ORIGIN,
]);

const MAX_CANONICAL_GENUS_CHARACTERS = 120;
const SAFE_CANONICAL_GENUS = /^[A-Z][A-Za-z-]+$/;

function hasBoundedCanonicalGenus(params: URLSearchParams): boolean {
  const genus = params.get('genus')?.trim() ?? '';
  return (
    Boolean(genus) &&
    genus.length <= MAX_CANONICAL_GENUS_CHARACTERS &&
    SAFE_CANONICAL_GENUS.test(genus)
  );
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
  const params = new URLSearchParams(search);
  const origin = params.get('origin')?.trim() ?? '';
  return (
    NON_EVIDENTIARY_GENUS_ORIGINS.has(origin) &&
    hasBoundedCanonicalGenus(params) &&
    params.get('context_is_evidence') === 'false'
  );
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
  const params = new URLSearchParams(search);
  const origin = params.get('origin')?.trim() ?? '';
  if (!NON_EVIDENTIARY_GENUS_ORIGINS.has(origin)) return false;
  return !calyxNavigationContextIsExplicitlyNonEvidentiary(search);
}
