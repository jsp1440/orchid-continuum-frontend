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
  /**
   * Additive block of the backend dossier route (identity_bridge.for_page): the graph node of this page
   * taxon, linked only by exact accepted name with exactly one active node. `canonical_key` is
   * `taxon:<public.taxonomy_species.id>` (or `taxon:implied:<genus>_<epithet>`); `older_id` is this
   * page's own public.orchid_taxonomy id. Absent from older backends.
   */
  graph_identity?: DossierGraphIdentity | null;
};

export type DossierGraphIdentity = {
  status: 'available' | 'not_enabled' | 'unavailable' | string;
  link_state: 'linked' | 'no_graph_node' | 'no_page_taxon' | 'ambiguous' | 'not_found' | string | null;
  older_id?: string | null;
  kg_node_id?: number | null;
  canonical_key?: string | null;
  canonical_key_kind?: 'backbone_row' | 'implied_species_concept' | 'other' | string | null;
  backbone_id?: string | null;
  accepted_name?: string | null;
};

/**
 * The World Plants backbone taxon id of a dossier (the `<id>` of its graph key `taxon:<id>`), or null.
 * Only a one-to-one `linked` identity names one; an ambiguous, unlinked or unavailable identity names
 * none, and the route id (another id space) is never used in its place.
 */
export function dossierBackboneTaxonId(dossier: SpeciesDossierEnvelope | null | undefined): string | null {
  const identity = dossier?.graph_identity;
  if (!identity || identity.status !== 'available' || identity.link_state !== 'linked') return null;
  if (identity.canonical_key_kind !== 'backbone_row' && identity.canonical_key_kind !== 'implied_species_concept') {
    return null;
  }
  const key = (identity.canonical_key ?? '').trim();
  const id = key.startsWith('taxon:') ? key.slice('taxon:'.length) : '';
  return /^(?:[0-9]{1,12}|implied:[a-z][a-z0-9_-]{0,160})$/.test(id) ? id : null;
}

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

/**
 * A failed Calyx species request. `status` is the HTTP status the backend answered with (null when
 * no answer arrived or the answer was not a contract body), `errorCode` is the backend's own
 * `detail.error` when it names one (e.g. `identity_mismatch`), and `invalidContract` marks a 200
 * whose body is not the published contract.
 */
export class SpeciesDossierRequestError extends Error {
  readonly status: number | null;
  readonly errorCode: string | null;
  readonly invalidContract: boolean;

  constructor(
    message: string,
    options: { status?: number | null; errorCode?: string | null; invalidContract?: boolean } = {},
  ) {
    super(message);
    this.name = 'SpeciesDossierRequestError';
    this.status = options.status ?? null;
    this.errorCode = options.errorCode ?? null;
    this.invalidContract = options.invalidContract === true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function backendErrorCode(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    const detail = isRecord(parsed) ? parsed.detail : null;
    return isRecord(detail) && typeof detail.error === 'string' && detail.error ? detail.error : null;
  } catch {
    return null;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new SpeciesDossierRequestError(body || `Calyx request failed with ${response.status}`, {
      status: response.status,
      errorCode: backendErrorCode(body),
    });
  }
  return (await response.json()) as T;
}

const EVIDENCE_STATES: readonly string[] = [
  'available',
  'provisional',
  'conflicting',
  'modeled',
  'inferred',
  'unavailable',
];

/**
 * The dossier sections the species page renders. `mycorrhizae` is in the envelope but is not
 * rendered from it (the page has its own mycorrhizal block), so it is not validated here.
 */
export const SPECIES_DOSSIER_RENDERED_SECTIONS = [
  'nomenclature',
  'protologue',
  'type_material',
  'historical_media',
  'living_media',
  'morphology',
  'distribution',
  'ecology',
  'phenology',
  'pollinators',
  'conservation',
  'literature',
  'cultivation',
  'knowledge_graph',
  'calyx_narrative',
  'research_gaps',
] as const satisfies ReadonlyArray<keyof SpeciesDossierEnvelope>;

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecordArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(isRecord);
}

function isDossierSection(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.state === 'string' &&
    EVIDENCE_STATES.includes(value.state) &&
    isRecordArray(value.items) &&
    isRecordArray(value.receipts)
  );
}

/**
 * Boundary check for an `oc-species-dossier-v1` body. Returns the payload itself, untouched, when
 * the fields the species page reads have the contract's shape, and null otherwise. Nothing is
 * repaired, defaulted or dropped: a body that fails is not a dossier. Keys this client does not
 * know are allowed, so an additive backend field never hides a real dossier.
 */
export function parseSpeciesDossierEnvelope(payload: unknown): SpeciesDossierEnvelope | null {
  if (!isRecord(payload)) return null;
  if (payload.contract_version !== 'oc-species-dossier-v1') return null;
  const identity = payload.identity;
  if (!isRecord(identity)) return null;
  if (!nonEmptyString(identity.taxon_id) || !nonEmptyString(identity.accepted_name)) return null;
  for (const key of SPECIES_DOSSIER_RENDERED_SECTIONS) {
    if (!isDossierSection(payload[key])) return null;
  }
  if (!isRecordArray(payload.partner_references)) return null;
  return payload as unknown as SpeciesDossierEnvelope;
}

const INVALID_DOSSIER_CONTRACT =
  'The species dossier response did not match the oc-species-dossier-v1 contract.';

export async function fetchSpeciesDossier(
  taxonId: string,
  signal?: AbortSignal,
): Promise<SpeciesDossierEnvelope> {
  const response = await fetch(
    `${CALYX_BACKEND_BASE_URL}/api/platform/species/${encodeURIComponent(taxonId)}/dossier`,
    { signal },
  );
  let payload: unknown;
  try {
    payload = await readJson<unknown>(response);
  } catch (error) {
    if (error instanceof SpeciesDossierRequestError || signal?.aborted) throw error;
    // Only a parse failure says the body is not JSON. Any other failure means the body never
    // fully arrived (the read broke mid-stream), which is a transport failure: nothing was
    // received that could be judged against the contract. Rethrown as-is, it is read as
    // `service_unavailable` like a failed fetch.
    if (!(error instanceof SyntaxError)) throw error;
    // A 200 whose body is not JSON at all.
    throw new SpeciesDossierRequestError(INVALID_DOSSIER_CONTRACT, {
      status: response.status,
      invalidContract: true,
    });
  }
  const dossier = parseSpeciesDossierEnvelope(payload);
  if (!dossier) {
    throw new SpeciesDossierRequestError(INVALID_DOSSIER_CONTRACT, {
      status: response.status,
      invalidContract: true,
    });
  }
  return dossier;
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

/**
 * Why no dossier is shown. These are different facts and are kept apart:
 * - `not_found`: the backend answered that no canonical record exists;
 * - `identity_mismatch`: a canonical record was found but it is a different taxon than the page's
 *   subject (by the exact-name rule below, or by the backend's own 409), so it is withheld;
 * - `service_unavailable`: the backend could not be reached or could not answer, so whether a
 *   dossier exists is not known;
 * - `invalid_contract`: the backend answered 200 with a body that is not the dossier contract;
 * - `no_subject`: neither a route id nor a subject name was given to look up.
 */
export type DossierUnavailableReason =
  | 'not_found'
  | 'identity_mismatch'
  | 'service_unavailable'
  | 'invalid_contract'
  | 'no_subject';

export type DossierSubjectResolution =
  | { state: 'resolved'; dossier: SpeciesDossierEnvelope; via: 'route_id' | 'subject_name' }
  | {
      state: 'ambiguous';
      subjectName: string;
      candidates: FederationResolveResult['candidates'];
    }
  | { state: 'unavailable'; reason?: DossierUnavailableReason };

/** `DossierSubjectResolution` whose `unavailable` member always says why. */
export type DossierSubjectResolutionWithReason =
  | Exclude<DossierSubjectResolution, { state: 'unavailable' }>
  | { state: 'unavailable'; reason: DossierUnavailableReason };

/** The reason a failed dossier request stands for. An unrecognised failure is never read as absence. */
export function dossierFailureReason(error: unknown): DossierUnavailableReason {
  if (error instanceof SpeciesDossierRequestError) {
    if (error.invalidContract) return 'invalid_contract';
    if (error.status === 404) return 'not_found';
    if (error.status === 409 && error.errorCode === 'identity_mismatch') return 'identity_mismatch';
  }
  return 'service_unavailable';
}

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

/**
 * `resolveDossierForSubject`, with the reason kept when no dossier is shown. The identity rules are
 * the same; only the `unavailable` result differs, by naming its cause.
 */
export async function resolveDossierForSubjectWithReason(
  routeId: string,
  subjectName: string | null,
  deps: DossierSubjectDeps,
  signal?: AbortSignal,
): Promise<DossierSubjectResolutionWithReason> {
  const unavailable = (reason: DossierUnavailableReason): DossierSubjectResolutionWithReason => ({
    state: 'unavailable',
    reason,
  });
  let byRoute: SpeciesDossierEnvelope | null = null;
  // Set exactly when the route dossier could not be had.
  let routeReason: DossierUnavailableReason = 'service_unavailable';
  try {
    byRoute = await deps.fetchDossier(routeId, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    byRoute = null;
    routeReason = dossierFailureReason(error);
  }

  const subject = subjectName && subjectName.trim() ? subjectName.trim() : null;
  if (byRoute && (!subject || isSubject(byRoute, subject))) {
    return { state: 'resolved', dossier: byRoute, via: 'route_id' };
  }
  if (!subject) return unavailable(routeId.trim() ? routeReason : 'no_subject');

  // No dossier by name: a route record that exists but is another taxon is withheld as a mismatch;
  // otherwise the route failure itself is the reason.
  const withoutNameMatch = (): DossierSubjectResolutionWithReason =>
    unavailable(byRoute ? 'identity_mismatch' : routeReason);

  let resolution: FederationResolveResult;
  try {
    resolution = await deps.resolveSpecies({ name: subject }, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    return unavailable('service_unavailable');
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
      : withoutNameMatch();
  }
  if (resolution.status !== 'resolved' || !resolution.taxon_id) {
    return withoutNameMatch();
  }
  let dossier: SpeciesDossierEnvelope | null =
    byRoute && byRoute.identity?.taxon_id === resolution.taxon_id ? byRoute : null;
  if (!dossier) {
    try {
      dossier = await deps.fetchDossier(resolution.taxon_id, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      return unavailable(dossierFailureReason(error));
    }
  }
  return isSubject(dossier, subject)
    ? { state: 'resolved', dossier, via: 'subject_name' }
    : unavailable('identity_mismatch');
}

/**
 * The dossier for the species a page is about, or why none is shown as a bare `unavailable`.
 * Callers that tell the visitor why use `resolveDossierForSubjectWithReason`.
 */
export async function resolveDossierForSubject(
  routeId: string,
  subjectName: string | null,
  deps: DossierSubjectDeps,
  signal?: AbortSignal,
): Promise<DossierSubjectResolution> {
  const resolution = await resolveDossierForSubjectWithReason(routeId, subjectName, deps, signal);
  return resolution.state === 'unavailable' ? { state: 'unavailable' } : resolution;
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
