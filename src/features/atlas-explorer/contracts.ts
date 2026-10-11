/**
 * Atlas Explorer — typed access to the canonical Atlas contracts.
 *
 * The JSON files are verbatim mirrors of Orchid-Continuum-Brain/contracts and
 * orchid-calyx-backend/contracts. The backend serves the same documents with
 * live availability added; these bundled copies are what the interface falls
 * back to when the backend cannot be reached, and are labelled as declared
 * rather than live-checked.
 */

import layerCatalogJson from '../../../contracts/atlas_layer_catalog_v1.json';
import capabilitiesJson from '../../../contracts/atlas_module_capabilities_v1.json';

export type LayerStatus = 'operational' | 'operational_external' | 'planned' | 'blocked';

export interface CatalogLayer {
  layer_id: string;
  title: string;
  group: string;
  status: LayerStatus;
  geometry: string;
  derivation?: string;
  source: string;
  license?: string;
  caveats?: string[];
  blocker?: string;
}

export interface ModuleCapability {
  module_id: string;
  capability_id: string;
  title: string;
  declared_status: string;
  output_contract: string;
  backend_endpoint: string | null;
  frontend_route: string | null;
  required_permissions: string[];
  canonical_identifiers: string[];
  provenance: string;
  error_behavior: string;
  fallback: string;
  interaction: string[];
  availability?: { state: string; probed: boolean; note?: string };
}

export interface ModuleWorkflow {
  workflow_id: string;
  title: string;
  steps: string[];
}

export const LAYER_CATALOG = layerCatalogJson as { schema: string; layers: CatalogLayer[] };
export const MODULE_CAPABILITIES = capabilitiesJson as {
  schema: string;
  api_version: string;
  capabilities: ModuleCapability[];
  workflows: ModuleWorkflow[];
};

/** Layers the Explorer actually knows how to draw. A catalog entry outside this set is listed, never drawn. */
export const DRAWABLE_LAYER_IDS = [
  'occurrences',
  'occurrence-density',
  'observed-richness',
  'sampling-gaps',
  'record-age',
  'conservation-assessment',
  'terrain',
] as const;
export type DrawableLayerId = (typeof DRAWABLE_LAYER_IDS)[number];

export function isDrawable(layer: CatalogLayer): layer is CatalogLayer & { layer_id: DrawableLayerId } {
  return (
    (layer.status === 'operational' || layer.status === 'operational_external') &&
    (DRAWABLE_LAYER_IDS as readonly string[]).includes(layer.layer_id)
  );
}

const SAFE_GENUS = /^[A-Z][a-z]+(?:-[a-z]+)?$/;
const SAFE_NAME = /^[A-Z][A-Za-z .×'()-]{1,119}$/;

export interface ModuleSubject {
  genus?: string | null;
  scientificName?: string | null;
}

export interface ModuleLink {
  capabilityId: string;
  moduleId: string;
  title: string;
  href: string;
  declaredStatus: string;
  availability?: ModuleCapability['availability'];
  provenance: string;
}

/**
 * Resolve the capability contracts into concrete links for a subject.
 *
 * Only `{genus}` and `{scientific_name}` placeholders are filled, and only
 * from bounded canonical names. A template needing a value the subject does
 * not safely provide yields no link rather than a widened or malformed route.
 * No coordinate, locality, or occurrence identifier can reach another module
 * through this function: the subject type has no field for them.
 */
export function moduleLinksFor(
  subject: ModuleSubject,
  capabilities: readonly ModuleCapability[] = MODULE_CAPABILITIES.capabilities,
): ModuleLink[] {
  const genus = subject.genus && SAFE_GENUS.test(subject.genus) ? subject.genus : null;
  const name =
    subject.scientificName && SAFE_NAME.test(subject.scientificName.trim())
      ? subject.scientificName.trim()
      : null;
  const links: ModuleLink[] = [];
  const seen = new Set<string>();
  for (const cap of capabilities) {
    const template = cap.frontend_route;
    if (!template || cap.module_id === 'atlas') continue;
    if (template.includes('{genus}') && !genus) continue;
    if (template.includes('{scientific_name}') && !name) continue;
    const href = template
      .replace('{genus}', encodeURIComponent(genus ?? ''))
      .replace('{scientific_name}', encodeURIComponent(name ?? ''));
    if (seen.has(href)) continue;
    seen.add(href);
    links.push({
      capabilityId: cap.capability_id,
      moduleId: cap.module_id,
      title: cap.title,
      href,
      declaredStatus: cap.declared_status,
      availability: cap.availability,
      provenance: cap.provenance,
    });
  }
  return links;
}
