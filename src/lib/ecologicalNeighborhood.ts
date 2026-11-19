import { homepageSafeUrl } from '@/lib/imageQuality';
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

type ImageRow = {
  image_url?: string | null;
  image_source?: string | null;
  license?: string | null;
  country?: string | null;
  photographer?: string | null;
};

const PRIORITY: Record<EcologicalNeighborType, number> = {
  species: 10,
  habitat: 20,
  pollinator: 30,
  fungal_dependency: 40,
  fungus: 45,
  geography: 50,
  conservation: 60,
  co_occurring_orchid: 70,
  host_tree: 80,
  ecological_partner: 85,
  knowledge: 90,
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

const BAD_IMAGE_TEXT_RE =
  /(herbari|specimen|voucher|sheet|barcode|holotype|isotype|lectotype|syntype|neotype|paratype|scan|plate|illustration|drawing|document|jstor|gbif\.org\/occurrence|biodiversitylibrary|archive\.org|botanicus|plants\.jstor|sweetgum\.nybg|sernec|idigbio|mnhn|recolnat|jacq|tropicos|mobot)/i;

const TRUSTED_LIVING_SOURCE_RE = /(inaturalist|flickr|wikimedia|orchid|supabase)/i;

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

function livingPhotoUrl(
  url: unknown,
  shared?: { title?: string; description?: string; source?: string; license?: string; name?: string },
): string | undefined {
  const clean = txt(url);
  if (!clean) return undefined;
  const hay = [clean, shared?.title, shared?.description, shared?.source, shared?.license, shared?.name]
    .filter(Boolean)
    .join(' ');
  if (BAD_IMAGE_TEXT_RE.test(hay)) return undefined;
  return homepageSafeUrl(clean, shared) ?? undefined;
}

function confidenceFromHarvest(row: HarvestRow, cardType: EcologicalNeighborType): string {
  if (cardType === 'missing') return 'gap';
  const score = typeof row.evidence_score === 'number' ? row.evidence_score : undefined;
  const count = typeof row.source_count === 'number' ? row.source_count : undefined;
  if ((score !== undefined && score >= 8) || (count !== undefined && count >= 10)) return 'high';
  if ((score !== undefined && score >= 4) || (count !== undefined && count >= 2)) return 'moderate';
  return 'emerging';
}

async function resolveSpeciesImage(scientificName: string): Promise<string | undefined> {
  const name = cleanSpecies(scientificName);
  if (!name) return undefined;

  const { data, error } = await supabase
    .schema('api')
    .from('v_frontend_orchid_images')
    .select('image_url, image_source, license, country, photographer')
    .ilike('scientific_name', name)
    .not('image_url', 'is', null)
    .limit(24);

  if (error || !Array.isArray(data)) return undefined;

  const ranked = (data as ImageRow[])
    .map((row, index) => {
      const source = txt(row.image_source) || '';
      const url = livingPhotoUrl(row.image_url, {
        title: name,
        description: [row.country, row.photographer].filter(Boolean).join(' '),
        source,
        license: txt(row.license),
        name,
      });
      if (!url) return null;
      const sourceBoost = TRUSTED_LIVING_SOURCE_RE.test(source) ? 100 : 0;
      return { url, score: sourceBoost - index };
    })
    .filter((x): x is { url: string; score: number } => !!x)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.url;
}

function mapHarvestRow(row: HarvestRow, focalSpecies: string): EcologicalNeighborhoodCard {
  const type = normalizeType(row.neighbor_type);
  const gap = row.relationship_category?.toLowerCase().includes('gap') || row.evidence_value === 'not yet linked';
  const cardType: EcologicalNeighborType = gap && type !== 'species' ? 'missing' : type;
  const title = txt(row.title) || txt(row.neighbor_name) || ecologicalTypeLabel(cardType);
  const relationship = txt(row.relationship_reason) || 'Relationship evidence is being assembled.';
  const harvestedImage = livingPhotoUrl(row.image_url, {
    title,
    description: relationship,
    source: sourceView(row),
    name: txt(row.neighbor_name) || focalSpecies,
  });

  return {
    id: cardId(row, cardType, focalSpecies),
    type: cardType,
    title,
    subtitle: txt(row.subtitle) || txt(row.relationship_category),
    scientificName: cardType === 'species' ? focalSpecies : undefined,
    imageUrl: harvestedImage,
    relationship,
    evidenceLabel: txt(row.evidence_label) || (row.source_count ? 'Records' : undefined),
    evidenceValue: row.evidence_value ?? row.evidence_score ?? row.source_count ?? undefined,
    sourceView: sourceView(row),
    confidenceClass: confidenceFromHarvest(row, cardType),
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
      confidenceClass: 'gap',
      priority: PRIORITY.species,
    },
    {
      id: `fallback:${scientificName}:missing`,
      type: 'missing',
      title: 'Ecological neighborhood not yet harvested',
      relationship: 'No harvested species-level relationship rows were returned for this taxon yet.',
      evidenceLabel: 'Status',
      evidenceValue: 'not yet linked',
      confidenceClass: 'gap',
      priority: PRIORITY.missing,
    },
  ];
}

function unavailableCards(): EcologicalNeighborhoodCard[] {
  return [{
    id: 'ecological-neighborhood:unavailable',
    type: 'missing',
    title: 'Ecological neighborhood unavailable',
    relationship: 'The relationship service could not answer this request. No absence of relationships is inferred.',
    evidenceLabel: 'Status',
    evidenceValue: 'service unavailable',
    confidenceClass: 'gap',
    priority: PRIORITY.missing,
  }];
}

export type EcologicalNeighborhoodOutcome =
  | { status: 'ok'; cards: EcologicalNeighborhoodCard[] }
  | { status: 'unavailable'; cards: EcologicalNeighborhoodCard[] };

export function isEcologicalNeighborhoodUnavailableCard(card: EcologicalNeighborhoodCard): boolean {
  return card.id === 'ecological-neighborhood:unavailable';
}

async function enrichCardImages(cards: EcologicalNeighborhoodCard[], focalSpecies: string): Promise<EcologicalNeighborhoodCard[]> {
  const names = Array.from(
    new Set(
      cards
        .map((c) => c.scientificName)
        .filter((n): n is string => !!n && n.split(/\s+/).length >= 2),
    ),
  );

  if (!names.includes(focalSpecies)) names.unshift(focalSpecies);

  const imagePairs = await Promise.all(
    names.slice(0, 8).map(async (name) => [name, await resolveSpeciesImage(name)] as const),
  );

  const imageByName = new Map<string, string | undefined>(
    imagePairs.map(([name, url]) => [cleanSpecies(name).toLowerCase(), url]),
  );

  return cards.map((card) => {
    if (card.imageUrl) return card;
    const target = cleanSpecies(card.scientificName || (card.type === 'species' ? focalSpecies : '')).toLowerCase();
    const imageUrl = target ? imageByName.get(target) : undefined;
    return imageUrl ? { ...card, imageUrl } : card;
  });
}

export async function fetchSpeciesEcologicalNeighborhoodOutcome(
  scientificNameInput: string,
  limit = 12,
): Promise<EcologicalNeighborhoodOutcome> {
  const scientificName = cleanSpecies(scientificNameInput);
  if (!scientificName) return { status: 'ok', cards: [] };

  const { data, error } = await supabase
    .schema('oc_api')
    .from('species_ecological_neighborhood_v1')
    .select(
      'relationship_id, focal_species, focal_genus, neighbor_name, neighbor_type, relationship_category, title, subtitle, relationship_reason, evidence_score, evidence_label, evidence_value, source_schema, source_table, source_count, image_url, source_url, harvest_build',
    )
    .ilike('focal_species', scientificName)
    .limit(Math.max(limit * 2, 24));

  if (error || !Array.isArray(data)) {
    return { status: 'unavailable', cards: unavailableCards() };
  }

  const harvestedCards =
    data.length === 0
      ? []
      : (data as HarvestRow[])
          .map((row) => mapHarvestRow(row, scientificName))
          .sort((a, b) => a.priority - b.priority);

  // Only harvested, sourced relationship rows are shown. There is no local
  // curated fallback: when nothing was harvested the honest gap cards render.
  const enriched = await enrichCardImages(harvestedCards.length > 0 ? harvestedCards : fallbackCards(scientificName), scientificName);
  return { status: 'ok', cards: enriched.slice(0, limit) };
}

export async function fetchSpeciesEcologicalNeighborhood(
  scientificNameInput: string,
  limit = 12,
): Promise<EcologicalNeighborhoodCard[]> {
  const outcome = await fetchSpeciesEcologicalNeighborhoodOutcome(scientificNameInput, limit);
  return outcome.cards;
}
