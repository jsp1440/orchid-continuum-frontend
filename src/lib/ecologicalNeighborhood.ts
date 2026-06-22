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
