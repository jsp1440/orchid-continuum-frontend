/**
 * Ecological interaction hooks.
 * -------------------------------------------------
 * Typed contracts for the Orchid Continuum API endpoints that surface
 * ecological interaction intelligence. The backend will implement these
 * by wrapping the following oc_api views/functions:
 *
 *   oc_api.species_page_globi_interaction_panel_v1
 *   oc_api.v_species_globi_interaction_summary_v1
 *   oc_api.v_species_globi_partner_summary_v1
 *   oc_api.v_species_page_ecological_interaction_badges_v1
 *
 * The frontend never queries the database directly — these endpoints
 * proxy the curated views and apply licensing/redaction policy.
 *
 * Endpoint map (suggested):
 *   GET /api/interactions/{taxonomy_id}/panel       → InteractionPanel
 *   GET /api/interactions/{taxonomy_id}/summary     → InteractionSummary
 *   GET /api/interactions/{taxonomy_id}/partners    → PartnerRow[]
 *   GET /api/interactions/{taxonomy_id}/badges      → InteractionBadge[]
 *   GET /api/interactions/{taxonomy_id}/{kind}      → InteractionPanelData (legacy)
 */

import { apiRequest, type ApiResult } from './api';

// ---------------------------------------------------------------------------
// Legacy per-kind contract (kept for backwards compatibility).
// ---------------------------------------------------------------------------

export type InteractionKind =
  | 'pollination'
  | 'mycorrhiza'
  | 'herbivory'
  | 'co-occurrence';

export interface InteractionRecord {
  partner_taxon: string;
  partner_kingdom?: string;
  evidence?: string;
  source?: string;
  reference_url?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface InteractionPanelData {
  kind: InteractionKind;
  total: number;
  records: InteractionRecord[];
  last_updated?: string;
}

// ---------------------------------------------------------------------------
// New ecological interaction contracts (mirror the oc_api views).
// ---------------------------------------------------------------------------

/**
 * Mirrors `oc_api.v_species_globi_interaction_summary_v1`.
 * Aggregate counts for the species page header strip.
 */
export interface InteractionSummary {
  taxonomy_id: string;
  canonical_name?: string;
  pollinator_count?: number;
  flower_visitor_count?: number;
  mycorrhizal_partner_count?: number;
  herbivore_count?: number;
  total_interactions?: number;
  partner_diversity_index?: number;
  last_updated?: string;
}

/**
 * Mirrors `oc_api.v_species_globi_partner_summary_v1`.
 * One row per interacting partner taxon.
 */
export interface PartnerRow {
  partner_taxon: string;
  partner_kingdom?: string;
  partner_family?: string;
  interaction_type: string; // e.g. "pollinatedBy", "visitedBy", "hasHost"
  interaction_count?: number;
  evidence_records?: number;
  reference_count?: number;
  first_observed?: string;
  last_observed?: string;
  primary_source?: string;
  reference_url?: string;
}

/**
 * Mirrors `oc_api.v_species_page_ecological_interaction_badges_v1`.
 * Compact badge metadata for inline display.
 */
export interface InteractionBadge {
  code: string;          // e.g. "POLLINATOR_RECORDED"
  label: string;         // e.g. "Pollinator recorded"
  tone?: 'emerald' | 'amber' | 'rose' | 'sky' | 'neutral';
  evidence_strength?: 'high' | 'medium' | 'low';
  count?: number;
  description?: string;
}

/**
 * Mirrors `oc_api.species_page_globi_interaction_panel_v1`.
 * Composite payload returned for the species page panel.
 */
export interface InteractionPanel {
  taxonomy_id: string;
  canonical_name?: string;
  summary?: InteractionSummary;
  partners?: PartnerRow[];
  badges?: InteractionBadge[];
  data_needed?: boolean;
  data_needed_reason?: string;
  last_updated?: string;
  source?: string; // e.g. "GloBI · curated"
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export const interactionsApi = {
  /** Composite panel — preferred. Backed by oc_api.species_page_globi_interaction_panel_v1. */
  panel(
    taxonomyId: string,
    signal?: AbortSignal,
  ): Promise<ApiResult<InteractionPanel>> {
    return apiRequest<InteractionPanel>(
      `/api/interactions/${encodeURIComponent(taxonomyId)}/panel`,
      { signal },
    );
  },

  summary(
    taxonomyId: string,
    signal?: AbortSignal,
  ): Promise<ApiResult<InteractionSummary>> {
    return apiRequest<InteractionSummary>(
      `/api/interactions/${encodeURIComponent(taxonomyId)}/summary`,
      { signal },
    );
  },

  partners(
    taxonomyId: string,
    signal?: AbortSignal,
  ): Promise<ApiResult<PartnerRow[]>> {
    return apiRequest<PartnerRow[]>(
      `/api/interactions/${encodeURIComponent(taxonomyId)}/partners`,
      { signal },
    );
  },

  badges(
    taxonomyId: string,
    signal?: AbortSignal,
  ): Promise<ApiResult<InteractionBadge[]>> {
    return apiRequest<InteractionBadge[]>(
      `/api/interactions/${encodeURIComponent(taxonomyId)}/badges`,
      { signal },
    );
  },

  /** Legacy per-kind fetch (kept so older imports keep compiling). */
  fetch(
    taxonomyId: string,
    kind: InteractionKind,
    signal?: AbortSignal,
  ): Promise<ApiResult<InteractionPanelData>> {
    return apiRequest<InteractionPanelData>(
      `/api/interactions/${encodeURIComponent(taxonomyId)}/${kind}`,
      { signal },
    );
  },
};

// ---------------------------------------------------------------------------
// UI strings
// ---------------------------------------------------------------------------

export const INTERACTION_PLACEHOLDER_MESSAGE =
  'Interaction intelligence coming online.';

export const INTERACTION_DATA_NEEDED_MESSAGE =
  'No reviewed interaction records yet — this taxon is flagged as Data Needed.';

export const INTERACTION_PANELS: {
  kind: InteractionKind;
  label: string;
  description: string;
}[] = [
  {
    kind: 'pollination',
    label: 'Pollination',
    description:
      'Pollinator partners, floral mechanisms, and reward syndromes — sourced from GloBI and curated literature.',
  },
  {
    kind: 'mycorrhiza',
    label: 'Mycorrhiza',
    description:
      'Fungal symbionts essential for germination and nutrient exchange across the orchid life cycle.',
  },
  {
    kind: 'herbivory',
    label: 'Herbivory',
    description:
      'Documented herbivore pressures, including invertebrate florivores and vertebrate browsers.',
  },
  {
    kind: 'co-occurrence',
    label: 'Co-occurrence',
    description:
      'Co-occurring plant taxa and habitat associates derived from spatial occurrence overlap.',
  },
];
