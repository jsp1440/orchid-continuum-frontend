export interface KnowledgeMetric {
  label: string;
  value: number | string;
}

export interface KnowledgeRelationship {
  id: string;
  type: string;
  targetId: string;
  targetName: string;
  count?: number;
}

export interface KnowledgeObject {
  id: string;
  objectType:
    | 'species'
    | 'genus'
    | 'pollinator'
    | 'fungus'
    | 'habitat'
    | 'literature'
    | 'conservation';

  scientificName: string;
  image?: string;
  summary?: string;

  metrics: KnowledgeMetric[];

  relationships: KnowledgeRelationship[];
}
