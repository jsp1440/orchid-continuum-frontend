import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

/**
 * Atlas checklist layer client. Every call is a read of GET /atlas/checklist/* on the Calyx backend, which reads
 * the Knowledge Graph. Nothing here builds a name join: a taxon is identified by its graph node id.
 */

export type ChecklistStatus = 'available' | 'not_enabled' | 'unavailable' | 'no_such_node';

export interface GraphIdentity {
  kg_node_id: number;
  canonical_key: string;
  label: string;
}

export interface CalyxHandoff {
  question: string | null;
  identity?: GraphIdentity;
  reason?: string;
}

export interface AreaSummary {
  kg_node_id: number;
  label: string;
  name_without_direction_prefix: string | null;
  taxa_listed: number;
}

export interface ChecklistEvidence {
  evidence_status?: string;
  checklist?: { source_marker?: string | null; source_tags?: string[] | null };
}

export interface AreaTaxon {
  kg_edge_id: number;
  taxon: GraphIdentity;
  evidence: ChecklistEvidence;
  calyx: CalyxHandoff;
}

export interface ContractRow {
  kg_edge_id: number;
  to_label: string | null;
  evidence_status?: string;
  review_state?: string | null;
  rule_name?: string | null;
  source_table?: string | null;
  citation?: { doi?: string | null; year?: number | null } | null;
  evidence?: ChecklistEvidence;
  area?: { name_without_direction_prefix?: string | null };
}

export interface FacetPanel {
  state: string;
  rows: ContractRow[];
  truncated?: boolean;
  gap: string | null;
  /** Sentences of the backend's reader for facets whose rows are aggregates (record_context). */
  statements?: string[];
}

export interface Envelope {
  schema: string;
  status: ChecklistStatus;
  notice: string;
  explanation?: string;
  geometry: { state: string; explanation: string };
}

export interface AreasResponse extends Envelope {
  areas: AreaSummary[];
  areas_matching: number;
  next_offset: number | null;
}

export interface AreaResponse extends Envelope {
  reader_state?: string;
  area?: { label: string };
  taxa_listed?: number;
  taxa_listed_with_a_marker?: number;
  taxa_matching_filter?: number;
  taxa: AreaTaxon[];
  next_offset: number | null;
  gap?: string;
  calyx: CalyxHandoff | null;
}

export interface TaxonResponse extends Envelope {
  identity?: GraphIdentity;
  panels?: Record<string, Record<string, FacetPanel>>;
  not_served?: { facet: string }[];
  calyx?: CalyxHandoff;
}

export interface SearchResponse extends Envelope {
  reader_state?: string;
  candidates: (GraphIdentity & { calyx: CalyxHandoff })[];
  gap?: string;
}

async function get<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(`${CALYX_BACKEND_BASE_URL}/atlas/checklist/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  });
  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok && response.status !== 503) throw new Error(`Atlas checklist request failed (${response.status})`);
  return (await response.json()) as T;
}

export const checklistApi = {
  areas: (q: string, offset = 0) => get<AreasResponse>('areas', { q, offset }),
  area: (name: string, offset: number, genus: string, marked: boolean | undefined) =>
    get<AreaResponse>('area', { name, offset, genus, marked }),
  search: (q: string) => get<SearchResponse>('taxa/search', { q }),
  taxon: (id: number) => get<TaxonResponse>(`taxon/${id}`, {}),
};
