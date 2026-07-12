import {
  BACKEND_BASE_URL,
  CALYX_BACKEND_BASE_URL,
  IMAGES_BACKEND_BASE_URL,
} from '@/lib/backendConfig'
import type { EndpointRegistryEntry } from './types'

export const ENDPOINT_REGISTRY: EndpointRegistryEntry[] = [
  {
    subsystem: 'knowledge-graph',
    endpoint: `${CALYX_BACKEND_BASE_URL}/api/executive/state`,
    method: 'GET',
    responseShape: '{ subsystems: ContinuumSubsystem[], globalHealth: ... }',
    normalizedFields: ['subsystemId', 'connectionState', 'connectedEntities', 'relationshipCount'],
    connectedStatus: 'live',
    fallbackBehavior: 'Falls back to /api/mission-control/subsystems then cache',
    owningAdapter: 'knowledge-graph/adapter',
  },
  {
    subsystem: 'atlas',
    endpoint: `${BACKEND_BASE_URL}/atlas/occurrences`,
    method: 'GET',
    responseShape: '{ total: number, items: Occurrence[] } or Occurrence[]',
    normalizedFields: ['occurrenceCount', 'acceptedTaxa', 'coordinateQuality'],
    connectedStatus: 'live',
    fallbackBehavior: 'Returns unavailable with cached data preserved',
    owningAdapter: 'atlas/adapter',
    knownLimitation: 'Probe uses limit=1; full counts derived from total field',
  },
  {
    subsystem: 'literature',
    endpoint: `${CALYX_BACKEND_BASE_URL}/api/mission-control/subsystems`,
    method: 'GET',
    responseShape: '{ subsystems: ContinuumSubsystem[] }',
    normalizedFields: ['paperCount', 'citationCount', 'doiCoverage'],
    connectedStatus: 'live',
    fallbackBehavior: 'Returns fallback with cached entry if available',
    owningAdapter: 'literature/adapter',
    knownLimitation: 'Literature metrics derived from subsystem telemetry, not direct DB query',
  },
  {
    subsystem: 'pollinators',
    endpoint: `${BACKEND_BASE_URL}/api/species/pollinators`,
    method: 'GET',
    responseShape: '{ items: PollinatorRecord[] } or PollinatorRecord[]',
    normalizedFields: ['knownRelationships', 'missingRecords', 'taxaWithoutEvidence'],
    connectedStatus: 'live',
    fallbackBehavior: 'Probe genus used; falls back to unavailable on error',
    owningAdapter: 'pollinators/adapter',
    knownLimitation: 'Genus probe only; full counts extrapolated',
  },
  {
    subsystem: 'mycorrhiza',
    endpoint: `${BACKEND_BASE_URL}/api/species/mycorrhizal`,
    method: 'GET',
    responseShape: '{ items: MycorrhizaRecord[] } or MycorrhizaRecord[]',
    normalizedFields: ['orchidFungalRelationships', 'fungiRepresented', 'taxaRepresented'],
    connectedStatus: 'live',
    fallbackBehavior: 'Probe genus used; falls back to unavailable on error',
    owningAdapter: 'mycorrhiza/adapter',
    knownLimitation: 'Genus probe only; full dataset size extrapolated',
  },
  {
    subsystem: 'vision',
    endpoint: `${IMAGES_BACKEND_BASE_URL}/images/genus`,
    method: 'GET',
    responseShape: '{ images: ImageRecord[] } or ImageRecord[]',
    normalizedFields: ['totalMedia', 'taxaWithImages', 'qualityScore'],
    connectedStatus: 'live',
    fallbackBehavior: 'Probe genus used; also checks executive state telemetry',
    owningAdapter: 'vision/adapter',
    knownLimitation: 'Per-genus probe; aggregate computed from executive state if available',
  },
  {
    subsystem: 'grants',
    endpoint: 'localStorage:oc_mission_control_intelligence_v1',
    method: 'GET',
    responseShape: '{ intelligenceItems: IntelligenceItem[] }',
    normalizedFields: ['activeOpportunities', 'urgentDeadlines', 'evidenceReadiness'],
    connectedStatus: 'cached',
    fallbackBehavior: 'Returns empty/unavailable when store is empty',
    owningAdapter: 'grants/adapter',
    knownLimitation: 'No network fetch; reads from client-side intelligence store only',
  },
]

export function getEndpointEntry(subsystem: string): EndpointRegistryEntry | undefined {
  return ENDPOINT_REGISTRY.find((entry) => entry.subsystem === subsystem)
}
