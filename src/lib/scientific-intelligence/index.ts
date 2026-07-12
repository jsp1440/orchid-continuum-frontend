export type {
  DataMode,
  Provenance,
  SubsystemCacheEntry,
  ScientificSubsystemIntelligence,
  EndpointRegistryEntry,
} from './shared/types'

export {
  safeArray,
  safeString,
  safeNumber,
  safeDate,
  safeRecord,
  computeDataAge,
  dataModeFromAge,
} from './shared/normalizers'

export { ENDPOINT_REGISTRY, getEndpointEntry } from './shared/endpointRegistry'

export { loadSubsystemCache, saveSubsystemCache } from './shared/cache'

export type { KnowledgeGraphIntelligence } from './knowledge-graph/adapter'
export { fetchKnowledgeGraphIntelligence } from './knowledge-graph/adapter'

export type { AtlasIntelligence } from './atlas/adapter'
export { fetchAtlasIntelligence } from './atlas/adapter'

export type { LiteratureIntelligence } from './literature/adapter'
export { fetchLiteratureIntelligence } from './literature/adapter'

export type { PollinatorRelationshipClass, PollinatorIntelligence } from './pollinators/adapter'
export { fetchPollinatorIntelligence } from './pollinators/adapter'

export type { MycorrhizaIntelligence } from './mycorrhiza/adapter'
export { fetchMycorrhizaIntelligence } from './mycorrhiza/adapter'

export type { VisionIntelligence } from './vision/adapter'
export { fetchVisionIntelligence } from './vision/adapter'

export type { GrantOpportunity, GrantsIntelligence } from './grants/adapter'
export { fetchGrantsIntelligence } from './grants/adapter'
