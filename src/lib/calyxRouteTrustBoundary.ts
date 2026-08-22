import {
  ATLAS_WORKSPACE_ORIGIN,
  FEATURED_TAXON_ORIGIN,
} from '@/lib/featuredTaxonNavigation';

const NON_EVIDENTIARY_GENUS_ORIGINS = new Set([
  FEATURED_TAXON_ORIGIN,
  ATLAS_WORKSPACE_ORIGIN,
]);

/**
 * Fail closed when a governed genus-navigation origin reaches Calyx without
 * the explicit non-evidence declaration its producer promises.
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
  return params.get('context_is_evidence') !== 'false';
}
