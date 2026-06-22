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

function txt(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function id(type: EcologicalNeighborType, name: string): string {
  return `${type}:${name}`.toLowerCase().replace(/[^a-z0-9:_-]+/g, '-');
}

function cleanSpecies(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '';
  return [p[0].charAt(0).toUpperCase() + p[0].slice(1).toLowerCase(), ...p.slice(1).map((x) => x.toLowerCase())].join(' ');
}

async function one(schema: string, table: string, col: string, name: string): Promise<Row | null> {
  const { data, error } = await supabase.schema(schema).from(table).select('*').ilike(col, name).limit(1);
  if (error || !Array.isArray(data) || !data.length) return null;
  return data[0] as Row;
}

async function many(schema: string, table: string, col: string, name: string, limit = 6): Promise<Row[]> {
  const { data, error } = await supabase.schema(schema).from(table).select('*').ilike(col, name).limit(limit);
  if (error || !Array.isArray(data)) return [];
  return data as Row[];
}

async function imageRows(name: string): Promise<Row[]> {
  const { data, error } = await supabase
    .schema('api')
    .from('v_frontend_orchid_images')
    .select('image_id, scientific_name, image_url, image_source, license, country, photographer')
    .ilike('scientific_name', name)
    .not('image_url', 'is', null)
    .limit(8);
  if (error || !Array.isArray(data)) return [];
  return data as Row[];
}

export async function fetchSpeciesEcologicalNeighborhood(
  scientificNameInput: string,
  limit = 12,
): Promise<EcologicalNeighborhoodCard[]> {
  const name = cleanSpecies(scientificNameInput);
  if (!name) return [];

  const [
    profile,
    atlas,
    images,
    pollinatorSummary,
    pollinatorPanel,
    myco,
    fungalDependency,
    reasoning,
    habitat,
    conservation,
  ] = await Promise.all([
    one('oc_api', 'v_relationship_explorer_species_profile_v1', 'scientific_name', name),
    one('oc_api', 'species_atlas_summary_v1', 'scientific_name', name),
    imageRows(name),
    one('oc_api', 'v_species_globi_interaction_summary_v1', 'orchid_name', name),
    many('oc_api', 'species_page_globi_interaction_panel_v1', 'orchid_name', name, 4),
    many('oc_ecology', 'literature_mycorrhiza_symbiosis_claims', 'scientific_name', name, 4),
    many('oc_dependency', 'fungal_dependency_evidence', 'accepted_scientific_name', name, 2),
    one('oc_api', 'v_species_reasoning_narrative_v1', 'scientific_name', name),
    one('oc_ecology', 'species_ecology_profile_api_ready', 'scientific_name', name),
    one('oc_api', 'species_conservation_summary_v1', 'scientific_name', name),
  ]);

  const cards: EcologicalNeighborhoodCard[] = [];
  const imageUrl = txt(images[0]?.image_url);
  const imageCount = num(profile?.image_count) ?? images.length;

  cards.push({
    id: id('species', name),
    type: 'species',
    title: name,
    scientificName: name,
    imageUrl,
    relationship: imageCount > 0
      ? `${name} is represented by ${imageCount.toLocaleString()} image record(s) in the Continuum image layer.`
      : 'Focal species selected from the active Genus of the Day rotation.',
    evidenceLabel: 'Image records',
    evidenceValue: imageCount,
    sourceView: 'api.v_frontend_orchid_images',
    priority: 10,
  });

  if (fungalDependency.length) {
    const r = fungalDependency[0];
    cards.push({
      id: id('fungal_dependency', name),
      type: 'fungal_dependency',
      title: txt(r.fungal_association_type) || 'Fungal dependency',
      subtitle: txt(r.life_stage),
      relationship: txt(r.evidence_summary) || `${name} has a fungal dependency evidence record.`,
      evidenceLabel: 'Confidence',
      evidenceValue: txt(r.confidence) || num(r.fungal_dependency_score),
      sourceView: 'oc_dependency.fungal_dependency_evidence',
      priority: 20,
    });
  }

  if (myco.length) {
    for (const r of myco.slice(0, 2)) {
      const partner = txt(r.partner_candidate) || txt(r.symbiosis_signal) || 'Mycorrhizal partner';
      cards.push({
        id: id('fungus', `${name}-${partner}`),
        type: 'fungus',
        title: partner,
        subtitle: txt(r.symbiosis_signal),
        relationship: `${name} has a literature-linked fungal association claim${txt(r.source_title) ? ` from “${txt(r.source_title)}.”` : '.'}`,
        evidenceLabel: 'Confidence',
        evidenceValue: num(r.confidence_score) ?? 'literature claim',
        sourceView: 'oc_ecology.literature_mycorrhiza_symbiosis_claims',
        priority: 30,
      });
    }
  } else {
    cards.push({
      id: id('missing', `${name}-fungus`),
      type: 'missing',
      title: 'Fungal partner not yet linked',
      relationship: 'Future cards can show Tulasnella, Ceratobasidium, Sebacina, culture plates, micrographs, or fruiting-body images when available.',
      evidenceLabel: 'Status',
      evidenceValue: 'not yet linked',
      priority: 90,
    });
  }

  const totalInteractions = num(pollinatorSummary?.total_display_ready_interactions) ?? 0;
  const firstInteraction = pollinatorPanel[0];

  if (totalInteractions > 0 || pollinatorPanel.length > 0) {
    cards.push({
      id: id('pollinator', name),
      type: 'pollinator',
      title: txt(firstInteraction?.partner_taxon_name) || 'Ecological interaction partner',
      subtitle: txt(firstInteraction?.interaction_category) || txt(firstInteraction?.interaction_type_name),
      relationship: totalInteractions > 0
        ? `${name} has ${totalInteractions.toLocaleString()} display-ready ecological interaction record(s).`
        : `${name} has a display-ready interaction record.`,
      evidenceLabel: 'Distinct partners',
      evidenceValue: num(pollinatorSummary?.distinct_partner_taxa) ?? pollinatorPanel.length,
      sourceView: 'oc_api.species_page_globi_interaction_panel_v1',
      priority: 40,
    });
  } else {
    cards.push({
      id: id('missing', `${name}-pollinator`),
      type: 'missing',
      title: 'Pollinator relationship not yet linked',
      relationship: 'No species-level pollinator card is linked yet. This prevents fake pollinator claims while highlighting a priority data gap.',
      evidenceLabel: 'Status',
      evidenceValue: 'not yet linked',
      priority: 95,
    });
  }

  if (habitat) {
    cards.push({
      id: id('habitat', name),
      type: 'habitat',
      title: txt(habitat.strongest_syndrome_signal) || 'Habitat / ecology signal',
      subtitle: txt(habitat.strongest_pollinator_group),
      relationship: txt(habitat.ecological_summary) || `${name} has a species-level ecology profile that needs narrative enrichment.`,
      evidenceLabel: 'Confidence',
      evidenceValue: txt(habitat.confidence_class) || num(habitat.strongest_confidence_score),
      sourceView: 'oc_ecology.species_ecology_profile_api_ready',
      priority: 50,
    });
  } else {
    cards.push({
      id: id('missing', `${name}-habitat`),
      type: 'missing',
      title: 'Habitat profile not yet linked',
      relationship: 'Species-level habitat should show habitat type, elevation band, substrate, climate, and associated community.',
      evidenceLabel: 'Status',
      evidenceValue: 'not yet linked',
      priority: 100,
    });
  }

  if (atlas || profile) {
    const occ = num(atlas?.occurrence_count) ?? num(profile?.occurrence_count) ?? 0;
    cards.push({
      id: id('geography', name),
      type: 'geography',
      title: 'Geographic neighborhood',
      subtitle: txt(atlas?.atlas_readiness) || txt(profile?.atlas_readiness),
      relationship: occ > 0
        ? `${name} has ${occ.toLocaleString()} mapped occurrence record(s) currently linked.`
        : `${name} has a sparse or pending occurrence profile.`,
      evidenceLabel: 'Countries',
      evidenceValue: num(atlas?.country_count) ?? num(profile?.country_count) ?? 'not yet summarized',
      sourceView: 'oc_api.species_atlas_summary_v1',
      priority: 60,
    });
  }

  if (conservation) {
    cards.push({
      id: id('conservation', name),
      type: 'conservation',
      title: txt(conservation.iucn_category) || 'Conservation signal',
      relationship: txt(conservation.conservation_summary) || `${name} has a conservation summary record attached.`,
      evidenceLabel: 'Source',
      evidenceValue: txt(conservation.source) || 'conservation summary',
      sourceView: 'oc_api.species_conservation_summary_v1',
      priority: 70,
    });
  } else {
    cards.push({
      id: id('missing', `${name}-conservation`),
      type: 'missing',
      title: 'Conservation card not yet linked',
      relationship: 'Future cards should show IUCN status, population trend, threat type, and habitat-loss pressure.',
      evidenceLabel: 'Status',
      evidenceValue: 'not yet linked',
      priority: 105,
    });
  }

  if (reasoning) {
    cards.push({
      id: id('knowledge', name),
      type: 'knowledge',
      title: 'Knowledge graph signal',
      subtitle: txt(reasoning.reasoning_density),
      relationship: txt(reasoning.reasoning_narrative) || 'The reasoning layer has inferred concepts for this species.',
      evidenceLabel: 'Rules fired',
      evidenceValue: num(reasoning.fired_rule_count),
      sourceView: 'oc_api.v_species_reasoning_narrative_v1',
      priority: 80,
    });
  }

  cards.push({
    id: id('co_occurring_orchid', name),
    type: 'co_occurring_orchid',
    title: 'Co-occurring orchid neighbors',
    relationship: 'Reserved for species-level co-occurrence: same locality, same habitat, same elevation band, shared pollinator, or documented ecological partitioning.',
    evidenceLabel: 'Engine status',
    evidenceValue: 'adapter ready',
    priority: 110,
  });

  cards.push({
    id: id('host_tree', name),
    type: 'host_tree',
    title: 'Host tree / substrate',
    relationship: 'Reserved for epiphyte substrate relationships such as host trees, mossy branches, palms, nurse logs, rock faces, or other documented attachment substrates.',
    evidenceLabel: 'Status',
    evidenceValue: 'awaiting host substrate source',
    priority: 120,
  });

  return cards.sort((a, b) => a.priority - b.priority).slice(0, limit);
}
