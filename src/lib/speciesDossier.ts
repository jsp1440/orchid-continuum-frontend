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
// Atlas envelope presentation (Release-1 journey 7)
// ---------------------------------------------------------------------------

/** Human labels for the layer ids the governed Atlas envelope may name. */
export const ATLAS_LAYER_LABELS: Record<string, string> = {
  occurrences: 'Occurrence points',
  range: 'Range',
  countries: 'Countries',
  elevation: 'Elevation',
  phenology: 'Phenology',
  habitat: 'Habitat',
  climate: 'Climate',
  pollinators: 'Pollinators',
  pollinator_routes: 'Pollinator routes',
  mycorrhizae: 'Mycorrhizae',
  protected_areas: 'Protected areas',
  threats: 'Threats',
  historical_records: 'Historical records',
  all: 'All layers',
};

export function atlasLayerLabel(layerId: string): string {
  return ATLAS_LAYER_LABELS[layerId] ?? layerId.replace(/_/g, ' ');
}

/**
 * The species page shows Atlas layers as counts, evidence states and
 * receipts only. It never draws a coordinate, so a layer that carries points
 * is described by how many were counted, not by where they are.
 */
export const ATLAS_LOCALITY_POLICY =
  'This page never draws coordinates. Layers appear here only as counts, evidence states and receipts from the governed Atlas envelope; sensitive localities are withheld at the source.';

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function atlasLayerMessage(layer: AtlasLayer): string {
  if (layer.state === 'unavailable') {
    return layer.unavailable_reason || 'This layer is not published in the governed Atlas envelope.';
  }
  const counted: string[] = [];
  if (layer.point_count !== null) counted.push(plural(layer.point_count, 'point'));
  if (layer.feature_count !== null) counted.push(plural(layer.feature_count, 'feature'));
  const summary = counted.length > 0 ? `${counted.join(', ')} counted` : 'Published in the governed Atlas envelope';
  return `${summary}. Exact localities are never drawn on this page.`;
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
  // Synonyms the backend itself records for this taxon are part of its identity;
  // nothing else is (no rank stripping, no prefix or "close enough" matching).
  const synonyms = Array.isArray(identity?.synonyms) ? identity.synonyms : [];
  return [
    identity?.accepted_name,
    identity?.display_name,
    identity?.full_scientific_name,
    ...synonyms,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
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

  // The resolver normalises names before matching (it drops forma, subspecies
  // and cultivar qualifiers), so its answer is a lead, not an identity. Every
  // dossier or candidate it leads to is held to the same exact-name check as
  // the route dossier: a species-level record is never shown for an
  // infraspecific or cultivar subject.
  if (resolution.status === 'ambiguous') {
    const candidates = (resolution.candidates ?? []).filter((candidate) =>
      sameScientificName(candidate.accepted_name, subject),
    );
    return candidates.length > 0
      ? { state: 'ambiguous', subjectName: subject, candidates }
      : { state: 'unavailable' };
  }
  if (resolution.status !== 'resolved' || !resolution.taxon_id) {
    return { state: 'unavailable' };
  }
  let dossier: SpeciesDossierEnvelope | null =
    byRoute && byRoute.identity?.taxon_id === resolution.taxon_id ? byRoute : null;
  if (!dossier) {
    try {
      dossier = await deps.fetchDossier(resolution.taxon_id, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      return { state: 'unavailable' };
    }
  }
  return isSubject(dossier, subject)
    ? { state: 'resolved', dossier, via: 'subject_name' }
    : { state: 'unavailable' };
}

export type PageSubject =
  | { state: 'subject'; name: string | null }
  | { state: 'conflict'; linkedName: string; publicName: string };

/**
 * The species a /species/:slug page is about.
 *
 * The link's `?name=` ranks first. It is the name on the record the visitor
 * chose, carried together with the id from that same record. The public detail
 * name is looked up by the route id alone, and the route id may belong to
 * another id space (a Calyx orchid_taxonomy id names a different public-API
 * species), so it is only a fallback. When both are present and disagree, the
 * page cannot know which species it is about and fails closed instead of
 * picking one. A binomial slug is the last resort.
 */
export function pageSubject(params: {
  linkedName: string | null | undefined;
  publicName: string | null | undefined;
  slug: string | null | undefined;
}): PageSubject {
  const linkedName = (params.linkedName ?? '').replace(/\s+/g, ' ').trim();
  const publicName = (params.publicName ?? '').replace(/\s+/g, ' ').trim();
  if (linkedName && publicName && !sameScientificName(linkedName, publicName)) {
    return { state: 'conflict', linkedName, publicName };
  }
  return {
    state: 'subject',
    name: linkedName || publicName || subjectNameFromSlug(params.slug),
  };
}

/**
 * Link to /species/:id from a surface keyed by the public API's taxonomy_id.
 * The name travels with the id so the page can confirm the dossier it shows
 * is this species' and not another taxon's with the same number.
 */
export function speciesPageHref(taxonomyId: string, scientificName?: string | null): string {
  const name = (scientificName ?? '').replace(/\s+/g, ' ').trim();
  const base = `/species/${encodeURIComponent(taxonomyId)}`;
  return name ? `${base}?name=${encodeURIComponent(name)}` : base;
}
