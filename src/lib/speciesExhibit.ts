import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export type SpeciesExhibitMedia = {
  id: string | number | null;
  url: string;
  source: string | null;
  license: string | null;
  rights_holder: string | null;
  observer_name: string | null;
  gbif_occurrence_key: string | number | null;
  identification_state: 'source_record_not_independently_verified' | string;
};

export type SpeciesExhibitConfidence = {
  state: 'available' | 'unavailable';
  score: number | null;
  label: string | null;
  basis: string;
};

export type SpeciesExhibitProvenance = {
  kind: string;
  source: string | null;
  record_id: string | number | null;
  license?: string | null;
};

export type SpeciesExhibitCard = {
  taxon_id: string;
  display_name: string;
  full_scientific_name: string;
  authorship: string | null;
  accepted_name_status: string;
  genus: string;
  image_count: number;
  representative_media: SpeciesExhibitMedia | null;
  caption: string | null;
  distinguishing_fact: string | null;
  evidence_state: 'available' | 'provisional' | 'unavailable' | string;
  confidence: SpeciesExhibitConfidence;
  provenance: SpeciesExhibitProvenance[];
  unavailable_domains: string[];
  contradictions: Array<Record<string, unknown>>;
  caveats: string[];
  links: {
    species?: string;
    graph?: string;
    evidence?: string;
  };
  evidence_receipt?: {
    algorithm?: string;
    digest?: string;
    contents_included?: boolean;
  };
};

export type SpeciesExhibitResponse = {
  contract: 'calyx-species-exhibit-v1';
  generated_at: string;
  requested_genus: string;
  accepted_genus: string;
  count: number;
  requested_limit: number;
  distinct_taxa: number;
  items: SpeciesExhibitCard[];
  publication_authority: false;
  graph_mutation: false;
};

export type SpeciesExhibitFetchResult = {
  status: 'ok' | 'unavailable' | 'invalid_genus' | 'service_error';
  response: SpeciesExhibitResponse | null;
  items: SpeciesExhibitCard[];
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function isCard(value: unknown): value is SpeciesExhibitCard {
  if (!value || typeof value !== 'object') return false;
  const card = value as Partial<SpeciesExhibitCard>;
  return (
    typeof card.taxon_id === 'string' &&
    card.taxon_id.length > 0 &&
    typeof card.display_name === 'string' &&
    card.display_name.trim().length > 0 &&
    typeof card.full_scientific_name === 'string' &&
    card.full_scientific_name.trim().length > 0 &&
    typeof card.genus === 'string' &&
    !!card.confidence &&
    Array.isArray(card.unavailable_domains) &&
    Array.isArray(card.provenance) &&
    Array.isArray(card.caveats)
  );
}

/**
 * Fail closed on duplicate scientific identities, representative images, or
 * server-owned captions. The consumer never manufactures replacement science.
 */
export function sanitizeSpeciesExhibitCards(items: unknown[]): SpeciesExhibitCard[] {
  const seenTaxa = new Set<string>();
  const seenNames = new Set<string>();
  const seenMedia = new Set<string>();
  const seenCaptions = new Set<string>();
  const accepted: SpeciesExhibitCard[] = [];

  for (const value of items) {
    if (!isCard(value)) continue;
    const normalizedName = normalizeName(value.display_name);
    const mediaUrl = value.representative_media?.url;
    const normalizedCaption = value.caption?.trim().toLowerCase() || null;

    if (seenTaxa.has(value.taxon_id) || seenNames.has(normalizedName)) continue;
    if (mediaUrl && (!isHttpUrl(mediaUrl) || seenMedia.has(mediaUrl))) continue;
    if (normalizedCaption && seenCaptions.has(normalizedCaption)) continue;

    seenTaxa.add(value.taxon_id);
    seenNames.add(normalizedName);
    if (mediaUrl) seenMedia.add(mediaUrl);
    if (normalizedCaption) seenCaptions.add(normalizedCaption);
    accepted.push(value);
    if (accepted.length === 9) break;
  }

  return accepted;
}

function empty(status: SpeciesExhibitFetchResult['status']): SpeciesExhibitFetchResult {
  return { status, response: null, items: [] };
}

export async function fetchSpeciesExhibit(
  genus: string,
  signal?: AbortSignal,
): Promise<SpeciesExhibitFetchResult> {
  const requested = genus.trim();
  if (!requested || !/^[A-Za-z-]+$/.test(requested)) return empty('invalid_genus');

  try {
    const response = await fetch(
      `${CALYX_BACKEND_BASE_URL}/api/platform/homepage/genus/${encodeURIComponent(requested)}/species-exhibit?limit=9`,
      { signal, headers: { Accept: 'application/json' } },
    );
    if (response.status === 400) return empty('invalid_genus');
    if (response.status === 404 || response.status === 503) return empty('unavailable');
    if (!response.ok) return empty('service_error');

    const payload = (await response.json()) as Partial<SpeciesExhibitResponse>;
    if (
      payload.contract !== 'calyx-species-exhibit-v1' ||
      payload.publication_authority !== false ||
      payload.graph_mutation !== false ||
      !Array.isArray(payload.items)
    ) {
      return empty('service_error');
    }

    const items = sanitizeSpeciesExhibitCards(payload.items);
    return {
      status: items.length > 0 ? 'ok' : 'unavailable',
      response: payload as SpeciesExhibitResponse,
      items,
    };
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    return empty('service_error');
  }
}
