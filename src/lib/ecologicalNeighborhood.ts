import { supabase } from '@/lib/supabase';

export type EcologicalNeighborType =
  | 'species'
  | 'geography'
  | 'habitat'
  | 'pollinator'
  | 'fungus'
  | 'fungal_dependency'
  | 'knowledge'
  | 'co_occurring_orchid'
  | 'host_tree'
  | 'conservation'
  | 'ecological_partner'
  | 'missing';

export interface EcologicalNeighborhoodCard {
  id: string;
  type: EcologicalNeighborType;
  title: string;
  subtitle?: string;
  scientificName?: string;
  imageUrl?: string;
  relationship: string;
  evidenceLabel?: string;
  evidenceValue?: string | number;
  sourceView?: string;
  confidenceClass?: string;
  priority: number;
}

export function ecologicalTypeLabel(type: EcologicalNeighborType): string {
  const labels: Record<EcologicalNeighborType, string> = {
    species: 'Focal species',
    geography: 'Geography',
    habitat: 'Habitat',
    pollinator: 'Pollinator',
    fungus: 'Fungus',
    fungal_dependency: 'Fungal dependency',
    knowledge: 'Knowledge graph',
    co_occurring_orchid: 'Co-occurring orchid',
    host_tree: 'Host tree / substrate',
    conservation: 'Conservation',
    ecological_partner: 'Ecological partner',
    missing: 'Data needed',
  };

  return labels[type] ?? 'Relationship';
}

type HarvestRow = {
  relationship_id?: number;
  focal_species?: string | null;
  focal_genus?: string | null;
  neighbor_name?: string | null;
  neighbor_type?: string | null;
  relationship_category?: string | null;
  title?: string | null;
  subtitle?: string | null;
  relationship_reason?: string | null;
  evidence_score?: number | null;
  evidence_label?: string | null;
  evidence_value?: string | number | null;
  source_schema?: string | null;
  source_table?: string | null;
  source_count?: number | null;
  image_url?: string | null;
  source_url?: string | null;
  harvest_build?: string | null;
};

const PRIORITY: Record<EcologicalNeighborType, number> = {
  species: 10,
  fungal_dependency: 20,
  fungus: 30,
  pollinator: 40,
  habitat: 50,
  geography: 60,
  conservation: 70,
  knowledge: 80,
  ecological_partner: 85,
  co_occurring_orchid: 90,
  host_tree: 100,
  missing: 120,
};

const ALLOWED_TYPES = new Set<EcologicalNeighborType>([
  'species',
  'geography',
  'habitat',
  'pollinator',
  'fungus',
  'fungal_dependency',
  'knowledge',
  'co_occurring_orchid',
  'host_tree',
  'conservation',
  'ecological_partner',
  'missing',
]);

function txt(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function cleanSpecies(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const genus = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
  return parts.length === 1 ? genus : `${genus} ${parts.slice(1).join(' ').toLowerCase()}`;
}

function normalizeType(raw: unknown): EcologicalNeighborType {
  const value = txt(raw)?.toLowerCase() as EcologicalNeighborType | undefined;
  if (value && ALLOWED_TYPES.has(value)) return value;
  return 'missing';
}

function cardId(row: HarvestRow, type: EcologicalNeighborType, fallbackName: string): string {
  if (typeof row.relationship_id === 'number') return `harvest:${row.relationship_id}`;
  return `${type}:${row.neighbor_name || row.title || fallbackName}`
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-');
}

function sourceView(row: HarvestRow): string | undefined {
  const schema = txt(row.source_schema);
  const table = txt(row.source_table);
  if (schema && table) return `${schema}.${table}`;
  return table || schema;
}

function mapHarvestRow(row: HarvestRow, focalSpecies: string): EcologicalNeighborhoodCard {
  const type = normalizeType(row.neighbor_type);
  const gap = row.relationship_category?.toLowerCase().includes('gap') || row.evidence_value === 'not yet linked';
  const cardType: EcologicalNeighborType = gap && type !== 'species' ? 'missing' : type;

  return {
    id: cardId(row, cardType, focalSpecies),
    type: cardType,
    title: txt(row.title) || txt(row.neighbor_name) || ecologicalTypeLabel(cardType),
    subtitle: txt(row.subtitle) || txt(row.relationship_category),
    scientificName: cardType === 'species' ? focalSpecies : undefined,
    imageUrl: txt(row.image_url),
    relationship: txt(row.relationship_reason) || 'Relationship evidence is being assembled.',
    evidenceLabel: txt(row.evidence_label),
    evidenceValue: row.evidence_value ?? row.evidence_score ?? row.source_count ?? undefined,
    sourceView: sourceView(row),
    priority: PRIORITY[cardType] + (row.evidence_score ? -Math.min(Number(row.evidence_score), 10) / 100 : 0),
  };
}

function fallbackCards(scientificName: string): EcologicalNeighborhoodCard[] {
  return [
    {
      id: `fallback:${scientificName}:species`,
      type: 'species',
      title: scientificName,
      scientificName,
      relationship: 'Focal species selected from the active Genus of the Day rotation.',
      evidenceLabel: 'Status',
      evidenceValue: 'awaiting relationship harvest',
      priority: PRIORITY.species,
    },
    {
      id: `fallback:${scientificName}:missing`,
      type: 'missing',
      title: 'Ecological neighborhood not yet harvested',
      relationship: 'No harvested species-level relationship rows were returned for this taxon yet.',
      evidenceLabel: 'Status',
      evidenceValue: 'not yet linked',
      priority: PRIORITY.missing,
    },
  ];
}

export async function fetchSpeciesEcologicalNeighborhood(
  scientificNameInput: string,
  limit = 12,
): Promise<EcologicalNeighborhoodCard[]> {
  const scientificName = cleanSpecies(scientificNameInput);
  if (!scientificName) return [];

  const { data, error } = await supabase
    .schema('oc_api')
    .from('species_ecological_neighborhood_v1')
    .select(
      'relationship_id, focal_species, focal_genus, neighbor_name, neighbor_type, relationship_category, title, subtitle, relationship_reason, evidence_score, evidence_label, evidence_value, source_schema, source_table, source_count, image_url, source_url, harvest_build',
    )
    .ilike('focal_species', scientificName)
    .limit(Math.max(limit * 2, 24));

  if (error || !Array.isArray(data) || data.length === 0) {
    return fallbackCards(scientificName).slice(0, limit);
  }

  return (data as HarvestRow[])
    .map((row) => mapHarvestRow(row, scientificName))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, limit);
}
