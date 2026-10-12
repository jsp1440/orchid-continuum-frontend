/**
 * featuredGenusProfile — canonical frontend read model for the Calyx
 * featured-genus-profile/v1 and featured-genus-selection/v1 contracts.
 *
 * The backend composes the genus scientific exhibit from canonical taxonomy,
 * the shared approved-media selection, widget habitat evidence, and the
 * scientific Knowledge Graph. This module is the ONLY public entry point for
 * that payload. It fails closed: a malformed payload, an unknown contract
 * version, or an out-of-vocabulary evidence state becomes `unavailable`,
 * never a partially trusted scientific claim.
 *
 * Evidence-state discipline (binding, mirrors the backend):
 *   known       — a canonical source returned linked evidence;
 *   unknown     — the source answered and holds nothing linked yet. A
 *                 knowledge gap, never biological absence, never a zero;
 *   unavailable — the source did not answer. No fallback claim is made.
 */

import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import { normalizeFeaturedTaxonGenus } from '@/lib/featuredTaxonContinuum';

export const FEATURED_GENUS_PROFILE_CONTRACT = 'featured-genus-profile/v1';
export const FEATURED_GENUS_SELECTION_CONTRACT = 'featured-genus-selection/v1';

export type FeaturedGenusEvidenceState = 'known' | 'unknown' | 'unavailable';

const EVIDENCE_STATES: readonly FeaturedGenusEvidenceState[] = ['known', 'unknown', 'unavailable'];

export type FeaturedGenusDomainRecord = {
  state: FeaturedGenusEvidenceState;
  linkedNodes: number | null;
  linkedEdges: number | null;
};

export type FeaturedGenusProfile = {
  requestedGenus: string;
  acceptedGenus: string;
  generatedAt: string | null;
  taxonomy: {
    state: FeaturedGenusEvidenceState;
    recordedSpeciesCount: number | null;
    recordedSpeciesCountScope: string | null;
    representativeNames: string[];
  };
  media: {
    state: FeaturedGenusEvidenceState;
    status: 'ok' | 'no_approved_media' | 'service_error';
    returnedCount: number | null;
  };
  habitat: {
    state: FeaturedGenusEvidenceState;
    climateTag: string | null;
    collectionTag: string | null;
    minElevationM: number | null;
    maxElevationM: number | null;
    source: string | null;
  };
  knowledgeGraph: {
    state: FeaturedGenusEvidenceState;
    nodeCount: number | null;
    edgeCount: number | null;
  };
  domains: Record<string, FeaturedGenusDomainRecord>;
  /** Domains whose state is `unknown` — gaps in linked evidence, not absence. */
  gaps: string[];
  provenance: Record<string, string>;
  notes: string[];
};

export type FeaturedGenusProfileResult =
  | { status: 'ok'; profile: FeaturedGenusProfile }
  | { status: 'invalid_genus' }
  | { status: 'unavailable' };

export type FeaturedGenusSelection = {
  genus: string;
  source: 'editorial_override' | 'deterministic_rotation';
  windowSeconds: number;
  windowIndex: number;
  secondsRemaining: number;
  overrideStatus: string;
};

export type FeaturedGenusSelectionResult =
  | { status: 'ok'; selection: FeaturedGenusSelection }
  | { status: 'unavailable' };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function evidenceState(value: unknown): FeaturedGenusEvidenceState | null {
  return typeof value === 'string' && (EVIDENCE_STATES as readonly string[]).includes(value)
    ? (value as FeaturedGenusEvidenceState)
    : null;
}

function nonNegativeNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

// Elevation may be below sea level; any finite number is a valid reading.
function finiteNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : undefined;
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    out.push(item);
  }
  return out;
}

function normalizeDomainRecord(value: unknown): FeaturedGenusDomainRecord | null {
  if (!isRecord(value)) return null;
  // Both linkage counters must be present (null is a valid, explicit value;
  // a missing key means the producer is off-contract).
  if (!('linked_nodes' in value) || !('linked_edges' in value)) return null;
  const state = evidenceState(value.state);
  const linkedNodes = nonNegativeNumber(value.linked_nodes);
  const linkedEdges = nonNegativeNumber(value.linked_edges);
  if (!state || linkedNodes === undefined || linkedEdges === undefined) return null;
  return { state, linkedNodes, linkedEdges };
}

/**
 * Validate and normalize a featured-genus-profile/v1 payload.
 * Returns null for anything off-contract; callers map null to `unavailable`.
 */
export function normalizeFeaturedGenusProfile(payload: unknown): FeaturedGenusProfile | null {
  if (!isRecord(payload)) return null;
  if (payload.contract !== FEATURED_GENUS_PROFILE_CONTRACT) return null;
  if (payload.status !== 'ok') return null;

  const acceptedGenus = optionalString(payload.accepted_genus);
  const requestedGenus = optionalString(payload.requested_genus);
  if (!acceptedGenus || !requestedGenus) return null;

  const taxonomy = payload.taxonomy;
  const media = payload.media;
  const habitat = payload.habitat;
  const knowledgeGraph = payload.knowledge_graph;
  if (!isRecord(taxonomy) || !isRecord(media) || !isRecord(habitat) || !isRecord(knowledgeGraph)) {
    return null;
  }

  const taxonomyState = evidenceState(taxonomy.state);
  const recordedSpeciesCount = nonNegativeNumber(taxonomy.recorded_species_count);
  const representativeNames = stringList(taxonomy.representative_names);
  if (!taxonomyState || recordedSpeciesCount === undefined || !representativeNames) return null;

  const mediaState = evidenceState(media.state);
  const mediaStatus = media.status;
  const returnedCount = nonNegativeNumber(media.returned_count);
  if (
    !mediaState ||
    (mediaStatus !== 'ok' && mediaStatus !== 'no_approved_media' && mediaStatus !== 'service_error') ||
    returnedCount === undefined
  ) {
    return null;
  }

  const habitatState = evidenceState(habitat.state);
  const minElevationM = finiteNumber(habitat.min_elevation_m);
  const maxElevationM = finiteNumber(habitat.max_elevation_m);
  const climateTag = optionalString(habitat.climate_tag);
  const collectionTag = optionalString(habitat.collection_tag);
  const habitatSource = optionalString(habitat.source);
  if (
    !habitatState ||
    minElevationM === undefined ||
    maxElevationM === undefined ||
    climateTag === undefined ||
    collectionTag === undefined ||
    habitatSource === undefined
  ) {
    return null;
  }

  const graphState = evidenceState(knowledgeGraph.state);
  const nodeCount = nonNegativeNumber(knowledgeGraph.node_count);
  const edgeCount = nonNegativeNumber(knowledgeGraph.edge_count);
  if (!graphState || nodeCount === undefined || edgeCount === undefined) return null;

  const domains: Record<string, FeaturedGenusDomainRecord> = {};
  if (!isRecord(payload.domains)) return null;
  for (const [domain, raw] of Object.entries(payload.domains)) {
    const record = normalizeDomainRecord(raw);
    if (!record) return null;
    domains[domain] = record;
  }

  const gaps = stringList(payload.gaps);
  if (!gaps) return null;

  const provenance: Record<string, string> = {};
  if (isRecord(payload.provenance)) {
    for (const [key, value] of Object.entries(payload.provenance)) {
      if (typeof value === 'string') provenance[key] = value;
    }
  }

  return {
    requestedGenus,
    acceptedGenus,
    generatedAt: optionalString(payload.generated_at) ?? null,
    taxonomy: {
      state: taxonomyState,
      recordedSpeciesCount,
      recordedSpeciesCountScope: optionalString(taxonomy.recorded_species_count_scope) ?? null,
      representativeNames,
    },
    media: { state: mediaState, status: mediaStatus, returnedCount },
    habitat: {
      state: habitatState,
      climateTag,
      collectionTag,
      minElevationM,
      maxElevationM,
      source: habitatSource,
    },
    knowledgeGraph: { state: graphState, nodeCount, edgeCount },
    domains,
    gaps,
    provenance,
    notes: stringList(payload.notes) ?? [],
  };
}

/** Fetch the composed Featured Genus profile through the canonical contract. */
export async function fetchFeaturedGenusProfile(
  genus: string,
  signal?: AbortSignal,
  timeoutMs = 8_000,
): Promise<FeaturedGenusProfileResult> {
  const requested = normalizeFeaturedTaxonGenus(genus);

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${CALYX_BACKEND_BASE_URL}/api/featured-genus/v1/profile/${encodeURIComponent(requested)}`,
      { method: 'GET', signal: controller.signal },
    );
    if (!response.ok) return { status: 'unavailable' };

    const payload: unknown = await response.json();
    if (isRecord(payload) && payload.status === 'invalid_genus') {
      return { status: 'invalid_genus' };
    }
    const profile = normalizeFeaturedGenusProfile(payload);
    return profile ? { status: 'ok', profile } : { status: 'unavailable' };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

/** Validate and normalize a featured-genus-selection/v1 payload. */
export function normalizeFeaturedGenusSelection(payload: unknown): FeaturedGenusSelection | null {
  if (!isRecord(payload)) return null;
  if (payload.contract !== FEATURED_GENUS_SELECTION_CONTRACT) return null;

  const genus = optionalString(payload.genus);
  const source = payload.source;
  if (!genus || (source !== 'editorial_override' && source !== 'deterministic_rotation')) {
    return null;
  }
  try {
    normalizeFeaturedTaxonGenus(genus);
  } catch {
    return null;
  }

  const window = payload.window;
  if (!isRecord(window)) return null;
  const windowSeconds = nonNegativeNumber(window.window_seconds);
  const windowIndex = nonNegativeNumber(window.index);
  const secondsRemaining = nonNegativeNumber(window.seconds_remaining);
  if (
    !windowSeconds || windowSeconds <= 0 ||
    windowIndex === undefined || windowIndex === null ||
    secondsRemaining === undefined || secondsRemaining === null
  ) {
    return null;
  }

  const override = payload.override;
  const overrideStatus = isRecord(override) && typeof override.status === 'string'
    ? override.status
    : 'unknown';

  return {
    genus,
    source,
    windowSeconds,
    windowIndex,
    secondsRemaining,
    overrideStatus,
  };
}

/** Fetch the reproducible Featured Genus selection (featured-genus-selection/v1). */
export async function fetchFeaturedGenusSelection(
  signal?: AbortSignal,
  timeoutMs = 8_000,
): Promise<FeaturedGenusSelectionResult> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${CALYX_BACKEND_BASE_URL}/api/featured-genus/v1/selection`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) return { status: 'unavailable' };
    const selection = normalizeFeaturedGenusSelection(await response.json());
    return selection ? { status: 'ok', selection } : { status: 'unavailable' };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
