import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig'
import { safeArray, safeNumber, safeString, safeRecord, computeDataAge, dataModeFromAge } from '../shared/normalizers'
import { loadSubsystemCache, saveSubsystemCache } from '../shared/cache'
import type { ScientificSubsystemIntelligence, Provenance } from '../shared/types'

const SUBSYSTEM_ID = 'knowledge-graph'
const EXECUTIVE_STATE_URL = `${CALYX_BACKEND_BASE_URL}/api/executive/state`
const SUBSYSTEMS_URL = `${CALYX_BACKEND_BASE_URL}/api/mission-control/subsystems`

export type KnowledgeGraphIntelligence = ScientificSubsystemIntelligence & {
  connectedEntities: number
  relationshipCount: number
  missingRelationships: string[]
  orphanedRecords: number
  unsupportedCategories: string[]
  provenanceGaps: string[]
  graphCompleteness: number
  targetSpecies?: string
  targetGenus?: string
  repairAction: string
}

function buildFromSubsystem(subsystem: Record<string, unknown>, endpoint: string, timestamp: string): KnowledgeGraphIntelligence {
  const completeness = safeNumber(subsystem.completeness, 0)
  const counts = safeRecord(subsystem.sourceRecordCounts)
  const connectedEntities = safeNumber(counts.entities ?? counts.connected_entities ?? subsystem.connectedEntities, 0)
  const relationshipCount = safeNumber(counts.relationships ?? counts.relationship_count ?? subsystem.relationshipCount, 0)
  const blockers = safeArray<string>(subsystem.blockers)
  const dataAge = computeDataAge(safeString(subsystem.lastChecked) || timestamp)

  const provenance: Provenance[] = [{
    endpoint,
    sourceTable: 'executive_state',
    timestamp,
    confidence: completeness / 100,
  }]

  return {
    subsystemId: SUBSYSTEM_ID,
    subsystemName: 'Knowledge Graph',
    mode: dataModeFromAge(dataAge, false, true),
    connectionState: 'connected',
    endpoint,
    timestamp,
    dataAge,
    recordCount: connectedEntities + relationshipCount,
    coverage: completeness / 100,
    evidenceQuality: safeNumber(subsystem.evidenceQuality, completeness / 100),
    integrationReadiness: safeNumber(subsystem.integrationReadiness, completeness / 100),
    automationReadiness: safeNumber(subsystem.automationReadiness, 0.3),
    reliability: safeNumber(subsystem.operationalReliability, 0.7),
    blockers,
    missingEvidence: blockers.slice(0, 3),
    recommendedNextAction: safeString(subsystem.recommendedNextAction, 'Review orphaned relationships and reconnect missing nodes.'),
    provenance,
    metrics: { completeness, connectedEntities, relationshipCount },
    connectedEntities,
    relationshipCount,
    missingRelationships: safeArray<string>(subsystem.failures),
    orphanedRecords: safeNumber(counts.orphans ?? subsystem.orphanedRecords, 0),
    unsupportedCategories: [],
    provenanceGaps: [],
    graphCompleteness: completeness / 100,
    repairAction: safeString(subsystem.recommendedNextAction, 'Reconnect orphaned nodes and validate relationship integrity.'),
  }
}

function buildUnavailable(endpoint: string, reason: string, cached: KnowledgeGraphIntelligence | null): KnowledgeGraphIntelligence {
  const timestamp = new Date().toISOString()
  const base: KnowledgeGraphIntelligence = cached ?? {
    subsystemId: SUBSYSTEM_ID,
    subsystemName: 'Knowledge Graph',
    mode: 'unavailable',
    connectionState: 'unavailable',
    endpoint,
    timestamp,
    dataAge: Infinity,
    blockers: [reason],
    missingEvidence: ['Backend connection required'],
    recommendedNextAction: 'Restore backend connectivity to fetch knowledge graph telemetry.',
    provenance: [],
    metrics: {},
    connectedEntities: 0,
    relationshipCount: 0,
    missingRelationships: [],
    orphanedRecords: 0,
    unsupportedCategories: [],
    provenanceGaps: [],
    graphCompleteness: 0,
    repairAction: 'Restore backend connectivity.',
  }
  return {
    ...base,
    mode: 'fallback',
    connectionState: 'fallback',
    fallbackReason: reason,
    timestamp,
  }
}

export async function fetchKnowledgeGraphIntelligence(): Promise<KnowledgeGraphIntelligence> {
  const cached = loadSubsystemCache<KnowledgeGraphIntelligence>(SUBSYSTEM_ID)
  const timestamp = new Date().toISOString()

  for (const url of [EXECUTIVE_STATE_URL, SUBSYSTEMS_URL]) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const raw = await res.json() as unknown
      const record = safeRecord(raw)
      const globalHealth = safeArray<Record<string, unknown>>(
        record.globalHealth ?? record.subsystems ?? raw,
      )
      const kgSubsystem = globalHealth.find((s) => {
        const name = safeString(s.name).toLowerCase()
        const id = safeString(s.id).toLowerCase()
        return name.includes('knowledge') || name.includes('graph') || id.includes('knowledge') || id.includes('graph')
      })

      if (kgSubsystem) {
        const intel = buildFromSubsystem(kgSubsystem, url, timestamp)
        saveSubsystemCache(SUBSYSTEM_ID, {
          data: intel,
          retrievedAt: timestamp,
          endpoint: url,
          dataAge: intel.dataAge,
          mode: intel.mode,
        })
        return intel
      }
    } catch {
      // Try next URL
    }
  }

  return buildUnavailable(EXECUTIVE_STATE_URL, 'Backend unreachable or no knowledge-graph subsystem in response', cached?.data ?? null)
}
