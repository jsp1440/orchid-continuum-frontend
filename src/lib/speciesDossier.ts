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

export type SectionExcerpt = {
  /** Human label for the kind of evidence, from the backend's evidence_type. */
  label: string;
  text: string;
  truncated: boolean;
  /** The item's own evidence state, only when it differs from the section's. */
  evidenceState: string | null;
};

/** The backend's own truncation marker; the page adds a single, readable one. */
const BACKEND_TRUNCATION_MARKER = /\s*\[\.\.\.\]$/;

/**
 * Evidence text a section carries in its `items`, in backend order.
 *
 * Only string excerpts are shown; an item without one is provenance-only and
 * is represented by its receipt. Nothing is inferred or summarised here, and
 * the section's own state (e.g. provisional) is rendered alongside, so an
 * excerpt is never presented as verified.
 */
export function sectionExcerpts(section: DossierSection): SectionExcerpt[] {
  const out: SectionExcerpt[] = [];
  for (const item of section.items ?? []) {
    const truncated = item.excerpt_truncated === true;
    const raw = typeof item.excerpt === 'string' ? item.excerpt.trim() : '';
    const text = truncated ? raw.replace(BACKEND_TRUNCATION_MARKER, '') : raw;
    if (!text) continue;
    const kind = typeof item.evidence_type === 'string' ? item.evidence_type : '';
    const label = kind ? kind.replace(/_/g, ' ') : 'evidence';
    const itemState = typeof item.evidence_state === 'string' ? item.evidence_state.trim().toLowerCase() : '';
    out.push({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      text,
      truncated,
      evidenceState: itemState && itemState !== section.state ? itemState : null,
    });
  }
  return out;
}

export function sectionMessage(section: DossierSection): string {
  if (section.state === 'unavailable') {
    return section.unavailable_reason || 'Evidence is not currently available.';
  }
  return section.summary || 'Evidence is available in the linked records.';
}

// ---------------------------------------------------------------------------
// Which canonical dossier belongs to the species this page is about?
// ---------------------------------------------------------------------------
//
// The /species/:slug route is reached with identifiers from different id
// spaces: Calyx links carry `public.orchid_taxonomy` ids (the dossier's own
// canonical_dossier_url), while the public species search links carry the
// public API's taxonomy_id. The two overlap numerically and name different
// species: public "Cattleya labiata" is 6056, while Calyx 6056 is
// "Caladenia x suffusa". Fetching the dossier by the raw route id therefore
// shows another species' evidence. A dossier is only shown when its identity
// is the page's subject; otherwise the subject name is resolved through the
// canonical federation resolver, and an ambiguous name is left for a human.

export type DossierSubjectResolution =
  | { state: 'resolved'; dossier: SpeciesDossierEnvelope; via: 'route_id' | 'subject_name' }
  | {
      state: 'ambiguous';
      subjectName: string;
      candidates: FederationResolveResult['candidates'];
    }
  | { state: 'unavailable' };

export type DossierSubjectDeps = {
  fetchDossier: (taxonId: string, signal?: AbortSignal) => Promise<SpeciesDossierEnvelope>;
  resolveSpecies: (
    params: { name?: string; taxonId?: string },
    signal?: AbortSignal,
  ) => Promise<FederationResolveResult>;
};

function comparableName(value: string | null | undefined): string {
  return (value ?? '').replace(/×/g, 'x').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Exact scientific-name equality, ignoring case, spacing and the hybrid sign. */
export function sameScientificName(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = comparableName(a);
  return left.length > 0 && left === comparableName(b);
}

function dossierNames(dossier: SpeciesDossierEnvelope): string[] {
  const identity = dossier.identity;
  return [identity?.accepted_name, identity?.display_name, identity?.full_scientific_name].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
}

function isSubject(dossier: SpeciesDossierEnvelope, subjectName: string): boolean {
  return dossierNames(dossier).some((name) => sameScientificName(name, subjectName));
}

/**
 * The name a route slug carries, when it is a name rather than an opaque id.
 * `cattleya-labiata` and `Cattleya%20labiata` are names; `6056` is not.
 */
export function subjectNameFromSlug(slug: string | null | undefined): string | null {
  let decoded = '';
  try {
    decoded = decodeURIComponent(slug ?? '');
  } catch {
    decoded = slug ?? '';
  }
  const name = decoded.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name || /\d/.test(name) || !/\s/.test(name)) return null;
  return name;
}

export async function resolveDossierForSubject(
  routeId: string,
  subjectName: string | null,
  deps: DossierSubjectDeps,
  signal?: AbortSignal,
): Promise<DossierSubjectResolution> {
  let byRoute: SpeciesDossierEnvelope | null = null;
  try {
    byRoute = await deps.fetchDossier(routeId, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    byRoute = null;
  }

  const subject = subjectName && subjectName.trim() ? subjectName.trim() : null;
  if (byRoute && (!subject || isSubject(byRoute, subject))) {
    return { state: 'resolved', dossier: byRoute, via: 'route_id' };
  }
  if (!subject) return { state: 'unavailable' };

  let resolution: FederationResolveResult;
  try {
    resolution = await deps.resolveSpecies({ name: subject }, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    return { state: 'unavailable' };
  }

  if (resolution.status === 'ambiguous') {
    return { state: 'ambiguous', subjectName: subject, candidates: resolution.candidates ?? [] };
  }
  if (resolution.status !== 'resolved' || !resolution.taxon_id) {
    return { state: 'unavailable' };
  }
  if (byRoute && byRoute.identity?.taxon_id === resolution.taxon_id) {
    // The resolver maps the subject (e.g. a synonym) to the dossier the route named.
    return { state: 'resolved', dossier: byRoute, via: 'subject_name' };
  }
  try {
    const dossier = await deps.fetchDossier(resolution.taxon_id, signal);
    return { state: 'resolved', dossier, via: 'subject_name' };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { state: 'unavailable' };
  }
}
