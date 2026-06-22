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
    missing: 'Data needed',
  };
  return labels[type];
}

type Row = Record<string, unknown>;

const PRIORITY: Record<EcologicalNeighborType, number> = {
  species: 10,
  fungal_dependency: 20,
  fungus: 30,
  pollinator: 40,
  habitat: 50,
  geography: 60,
  conservation: 70,
  knowledge: 80,
  missing: 90,
  co_occurring_orchid: 110,
  host_tree: 120,
};

function textValue(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function numberValue(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function cleanSpecies(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return [
    parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase(),
    ...parts.slice(1).map((p) => p.toLowerCase()),
  ].join(' ');
}

function cardId(type: EcologicalNeighborType, label: string): string {
  return `${type}:${label}`.toLowerCase().replace(/[^a-z0-9:_-]+/g, '-');
}

function normalizeType(v: unknown): EcologicalNeighborType {
  const raw = textValue(v)?.toLowerCase();
  if (!raw) return 'missing';
  if (raw in PRIORITY) return raw as EcologicalNeighborType;
  if (raw.includes('pollinat')) return 'pollinator';
  if (raw.includes('fung') || raw.includes('mycorrhiza')) return 'fungus';
  if (raw.includes('habitat')) return 'habitat';
  if (raw.includes('geo') || raw.includes('atlas')) return 'geography';
  return 'missing';
}

async function fetchHarvested(name: string, limit: number): Promise<EcologicalNeighborhoodCard[] | null> {
  const { data, error } = await supabase
    .schema('oc_api')
    .from('species_ecological_neighborhood_v1')
    .select('*')
    .ilike('focal_species', name)
    .order('evidence_score', { ascending: false, nullsFirst: false })
    .limit(Math.max(limit, 12));

  if (error || !Array.isArray(data) || data.length === 0) return null;

  return (data as Row[])
    .map((row, index) => {
      const type = normalizeType(row.neighbor_type);
      const sourceSchema = textValue(row.source_schema);
      const sourceTable = textValue(row.source_table);
      return {
        id: textValue(row.relationship_id) || cardId(type, `${name}-${index}`),
        type,
        title: textValue(row.title) || textValue(row.neighbor_name) || ecologicalTypeLabel(type),
        subtitle: textValue(row.subtitle) || textValue(row.relationship_category),
        scientificName: type === 'species' ? name : undefined,
        imageUrl: textValue(row.image_url),
        relationship: textValue(row.relationship_reason) || 'Ecological relationship harvested from the Orchid Continuum relationship layer.',
        evidenceLabel: textValue(row.evidence_label),
        evidenceValue: textValue(row.evidence_value) || numberValue(row.evidence_score),
        sourceView: sourceSchema && sourceTable ? `${sourceSchema}.${sourceTable}` : 'oc_api.species_ecological_neighborhood_v1',
        priority: PRIORITY[type] + index / 100,
      } satisfies EcologicalNeighborhoodCard;
    })
    .sort((a, b) => a.priority - b.priority)
    .slice(0, limit);
}

async function rows(schema: string, table: string, col: string, name: string, limit = 6): Promise<Row[]> {
  const { data, error } = await supabase.schema(schema).from(table).select('*').ilike(col, name).limit(limit);
  return error || !Array.isArray(data) ? [] : (data as Row[]);
}

async function firstRow(schema: string, table: string, col: string, name: string): Promise<Row | null> {
  const found = await rows(schema, table, col, name, 1);
  return found[0] || null;
}

async function fallbackCards(name: string, limit: number): Promise<EcologicalNeighborhoodCard[]> {
  const [profile, atlas, images, myco, fungalDependency, reasoning] = await Promise.all([
    firstRow('oc_api', 'v_relationship_explorer_species_profile_v1', 'scientific_name', name),
    firstRow('oc_api', 'species_atlas_summary_v1', 'scientific_name', name),
    rows('api', 'v_frontend_orchid_images', 'scientific_name', name, 1),
    rows('oc_ecology', 'literature_mycorrhiza_symbiosis_claims', 'scientific_name', name, 2),
    rows('oc_dependency', 'fungal_dependency_evidence', 'accepted_scientific_name', name, 1),
    firstRow('oc_api', 'v_species_reasoning_narrative_v1', 'scientific_name', name),
  ]);

  const cards: EcologicalNeighborhoodCard[] = [];
  const imageCount = numberValue(profile?.image_count) ?? images.length;

  cards.push({
    id: cardId('species', name),
    type: 'species',
    title: name,
    scientificName: name,
    imageUrl: textValue(images[0]?.image_url),
    relationship: imageCount > 0 ? `${name} is represented by ${imageCount.toLocaleString()} image record(s).` : 'Focal species selected from the active rotation.',
    evidenceLabel: 'Image records',
    evidenceValue: imageCount,
    sourceView: 'api.v_frontend_orchid_images',
    priority: PRIORITY.species,
  });

  if (fungalDependency.length) {
    const r = fungalDependency[0];
    cards.push({
      id: cardId('fungal_dependency', name),
      type: 'fungal_dependency',
      title: textValue(r.fungal_association_type) || 'Fungal dependency',
      subtitle: textValue(r.life_stage),
      relationship: textValue(r.evidence_summary) || `${name} has fungal dependency evidence.`,
      evidenceLabel: 'Confidence',
      evidenceValue: textValue(r.confidence) || numberValue(r.fungal_dependency_score),
      sourceView: 'oc_dependency.fungal_dependency_evidence',
      priority: PRIORITY.fungal_dependency,
    });
  }

  myco.forEach((r, i) => cards.push({
    id: cardId('fungus', `${name}-${i}`),
    type: 'fungus',
    title: textValue(r.partner_candidate) || 'Mycorrhizal association',
    subtitle: textValue(r.symbiosis_signal),
    relationship: textValue(r.source_title) || 'Literature-linked orchid mycorrhiza or fungal association claim.',
    evidenceLabel: 'Confidence',
    evidenceValue: numberValue(r.confidence_score) ?? 'literature claim',
    sourceView: 'oc_ecology.literature_mycorrhiza_symbiosis_claims',
    priority: PRIORITY.fungus + i / 100,
  }));

  const occ = numberValue(atlas?.occurrence_count) ?? numberValue(profile?.occurrence_count);
  if (atlas || profile) cards.push({
    id: cardId('geography', name),
    type: 'geography',
    title: 'Geographic neighborhood',
    subtitle: textValue(atlas?.atlas_readiness),
    relationship: occ !== undefined ? `${name} has ${occ.toLocaleString()} mapped occurrence record(s).` : `${name} has a pending occurrence profile.`,
    evidenceLabel: 'Countries',
    evidenceValue: numberValue(atlas?.country_count) ?? 'not yet summarized',
    sourceView: 'oc_api.species_atlas_summary_v1',
    priority: PRIORITY.geography,
  });

  if (reasoning) cards.push({
    id: cardId('knowledge', name),
    type: 'knowledge',
    title: 'Knowledge graph signal',
    subtitle: textValue(reasoning.reasoning_density),
    relationship: textValue(reasoning.reasoning_narrative) || 'The reasoning layer has inferred concepts for this species.',
    evidenceLabel: 'Rules fired',
    evidenceValue: numberValue(reasoning.fired_rule_count),
    sourceView: 'oc_api.v_species_reasoning_narrative_v1',
    priority: PRIORITY.knowledge,
  });

  [
    ['pollinator', 'Pollinator relationship not yet linked', 'No species-level pollinator card is linked yet.'],
    ['habitat', 'Habitat profile not yet linked', 'Species-level habitat should show habitat type, elevation band, substrate, climate, and associated community.'],
    ['conservation', 'Conservation card not yet linked', 'Future cards should show IUCN status, population trend, threat type, and habitat-loss pressure.'],
    ['co_occurring_orchid', 'Co-occurring orchid neighbors', 'Reserved for species-level co-occurrence.'],
    ['host_tree', 'Host tree / substrate', 'Reserved for epiphyte substrate relationships.'],
  ].forEach(([type, title, relationship], i) => cards.push({
    id: cardId('missing', `${name}-${type}`),
    type: type as EcologicalNeighborType,
    title,
    subtitle: 'Data needed',
    relationship,
    evidenceLabel: 'Status',
    evidenceValue: 'not yet linked',
    priority: PRIORITY[type as EcologicalNeighborType] + i / 100,
  }));

  return cards.sort((a, b) => a.priority - b.priority).slice(0, limit);
}

export async function fetchSpeciesEcologicalNeighborhood(scientificNameInput: string, limit = 12): Promise<EcologicalNeighborhoodCard[]> {
  const name = cleanSpecies(scientificNameInput);
  if (!name) return [];
  const harvested = await fetchHarvested(name, limit);
  return harvested?.length ? harvested : fallbackCards(name, limit);
}
