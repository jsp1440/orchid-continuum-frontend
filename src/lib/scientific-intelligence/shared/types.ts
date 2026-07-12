export type DataMode = 'live' | 'cached' | 'stale' | 'fallback' | 'stub' | 'unavailable' | 'error'

export type Provenance = {
  endpoint: string
  sourceTable?: string
  provider?: string
  timestamp: string
  recordCount?: number
  confidence?: number
  normalizationNote?: string
}

export type SubsystemCacheEntry<T> = {
  data: T
  retrievedAt: string
  endpoint: string
  dataAge: number
  apiVersion?: string
  mode: DataMode
  lastError?: string
  fallbackReason?: string
}

export type ScientificSubsystemIntelligence = {
  subsystemId: string
  subsystemName: string
  mode: DataMode
  connectionState: 'connected' | 'degraded' | 'unavailable' | 'error' | 'fallback'
  endpoint: string
  timestamp: string
  dataAge: number
  apiVersion?: string
  recordCount?: number
  coverage?: number
  evidenceQuality?: number
  integrationReadiness?: number
  automationReadiness?: number
  reliability?: number
  blockers: string[]
  missingEvidence: string[]
  activeJobs?: number
  recentActivity?: string[]
  recommendedNextAction: string
  ownerDecisionRequired?: string
  supportedActions?: string[]
  exportFormats?: string[]
  fallbackReason?: string
  confidence?: number
  provenance: Provenance[]
  metrics: Record<string, unknown>
  lastSuccessfulData?: unknown
}

export type EndpointRegistryEntry = {
  subsystem: string
  endpoint: string
  method: 'GET' | 'POST'
  responseShape: string
  normalizedFields: string[]
  connectedStatus: DataMode
  fallbackBehavior: string
  missingBackendCapability?: string
  owningAdapter: string
  knownLimitation?: string
}
