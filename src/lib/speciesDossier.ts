import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export type EvidenceState =
  | 'available'
  | 'provisional'
  | 'conflicting'
  | 'modeled'
  | 'inferred'
  | 'unavailable';

export type EvidenceReceipt = {
  source_id: string;
  source_name: string;
  source_url: string | null;
  record_id: string | null;
  retrieved_at: string | null;
  license: string | null;
  attribution: string | null;
  evidence_state: EvidenceState;
  confidence: number | null;
  notes: string | null;
};

export type DossierSection = {
  state: EvidenceState;
  summary: string | null;
  items: Record<string, unknown>[];
  receipts: EvidenceReceipt[];
  unavailable_reason: string | null;
};

export type SpeciesIdentity = {
  taxon_id: string;
  display_name: string;
  full_scientific_name: string;
  accepted_name: string;
  authorship: string | null;
  rank: string;
  genus: string;
  specific_epithet: string | null;
  taxonomic_status: string | null;
  synonyms: string[];
};

export type AtlasPoint = {
  occurrence_id: string;
  latitude: number;
  longitude: number;
  coordinate_uncertainty_m: number | null;
  event_date: string | null;
  country_code: string | null;
  elevation_m: number | null;
  evidence_state: EvidenceState;
  receipt: EvidenceReceipt;
};

export type AtlasLayer = {
  layer_id:
    | 'occurrences'
    | 'countries'
    | 'elevation'
    | 'phenology'
    | 'habitat'
    | 'climate'
    | 'pollinators'
    | 'pollinator_routes'
    | 'mycorrhizae'
    | 'protected_areas'
    | 'threats'
    | 'historical_records';
  label: string;
  state: EvidenceState;
  point_count: number | null;
  feature_count: number | null;
  points: AtlasPoint[];
  features: Record<string, unknown>[];
  receipts: EvidenceReceipt[];
  unavailable_reason: string | null;
};

export type SpeciesAtlasEnvelope = {
  contract_version: 'oc-species-atlas-v1';
  taxon_id: string;
  generated_at: string;
  layers: AtlasLayer[];
  unavailable_layers: string[];
  provenance: EvidenceReceipt[];
};

export type PartnerReference = {
  partner_id: string;
  partner_name: string;
  source_url: string;
  attribution_text: string;
  permissions: {
    linking: boolean;
    indexing: boolean;
    quotation: boolean;
    images: boolean;
    trait_extraction: boolean;
    api_access: boolean;
  };
  match_state: 'accepted_name' | 'synonym' | 'manual' | 'unresolved';
  last_verified_at: string | null;
};

export type SpeciesDossierEnvelope = {
  contract_version: 'oc-species-dossier-v1';
  generated_at: string;
  identity: SpeciesIdentity;
  nomenclature: DossierSection;
  protologue: DossierSection;
  type_material: DossierSection;
  historical_media: DossierSection;
  living_media: DossierSection;
  morphology: DossierSection;
  distribution: DossierSection;
  ecology: DossierSection;
  phenology: DossierSection;
  pollinators: DossierSection;
  mycorrhizae: DossierSection;
  conservation: DossierSection;
  literature: DossierSection;
  cultivation: DossierSection;
  knowledge_graph: DossierSection;
  calyx_narrative: DossierSection;
  research_gaps: DossierSection;
  atlas: SpeciesAtlasEnvelope;
  related_species: Record<string, unknown>[];
  matrix_url: string;
  partner_references: PartnerReference[];
  provenance: EvidenceReceipt[];
};

export type FederationResolveResult = {
  status: 'resolved' | 'ambiguous' | 'unresolved' | 'invalid';
  incoming_name: string | null;
  matched_name: string | null;
  match_state: 'taxon_id' | 'accepted_name' | 'synonym' | 'partner_slug' | 'none';
  taxon_id: string | null;
  canonical_dossier_url: string | null;
  candidates: Array<{ taxon_id: string; accepted_name: string; match_state: string }>;
  partner_slug: string | null;
  reciprocal_source_url: string | null;
  explanation: string;
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Calyx request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchSpeciesDossier(
  taxonId: string,
  signal?: AbortSignal,
): Promise<SpeciesDossierEnvelope> {
  const response = await fetch(
    `${CALYX_BACKEND_BASE_URL}/api/platform/species/${encodeURIComponent(taxonId)}/dossier`,
    { signal },
  );
  return readJson<SpeciesDossierEnvelope>(response);
}

export async function fetchSpeciesAtlas(
  taxonId: string,
  signal?: AbortSignal,
): Promise<SpeciesAtlasEnvelope> {
  const response = await fetch(
    `${CALYX_BACKEND_BASE_URL}/api/platform/species/${encodeURIComponent(taxonId)}/atlas`,
    { signal },
  );
  return readJson<SpeciesAtlasEnvelope>(response);
}

export async function resolveFederatedSpecies(
  params: {
    name?: string;
    taxonId?: string;
    sourceUrl?: string;
    partnerSlug?: string;
    partnerSpeciesSlug?: string;
  },
  signal?: AbortSignal,
): Promise<FederationResolveResult> {
  const query = new URLSearchParams();
  if (params.name) query.set('name', params.name);
  if (params.taxonId) query.set('taxon_id', params.taxonId);
  if (params.sourceUrl) query.set('source_url', params.sourceUrl);
  if (params.partnerSlug) query.set('partner_slug', params.partnerSlug);
  if (params.partnerSpeciesSlug) query.set('partner_species_slug', params.partnerSpeciesSlug);
  const response = await fetch(
    `${CALYX_BACKEND_BASE_URL}/api/platform/federation/resolve-species?${query.toString()}`,
    { signal },
  );
  return readJson<FederationResolveResult>(response);
}

/**
 * Accept only a bounded same-origin Matrix handoff supplied by the governed
 * dossier contract. External URLs, protocol-relative URLs, and unrelated local
 * routes fail closed so a backend field can never become an arbitrary link.
 */
export function safeSpeciesMatrixHref(matrixUrl: string | null | undefined): string | null {
  const value = matrixUrl?.trim();
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;

  try {
    const base = 'https://orchidcontinuum.invalid';
    const parsed = new URL(value, base);
    if (parsed.origin !== new URL(base).origin) return null;
    if (parsed.pathname !== '/orchid-identification') return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function sectionMessage(section: DossierSection): string {
  if (section.state === 'unavailable') {
    return section.unavailable_reason || 'Evidence is not currently available.';
  }
  return section.summary || 'Evidence is available in the linked records.';
}
