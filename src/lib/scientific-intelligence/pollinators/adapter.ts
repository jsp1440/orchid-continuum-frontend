import { BACKEND_BASE_URL } from '@/lib/backendConfig'
import { safeArray, safeNumber, safeString, safeRecord, computeDataAge, dataModeFromAge } from '../shared/normalizers'
import { loadSubsystemCache, saveSubsystemCache } from '../shared/cache'
import type { ScientificSubsystemIntelligence, Provenance } from '../shared/types'

const SUBSYSTEM_ID = 'pollinators'
const PROBE_GENUS = 'Dracula'
const POLLINATORS_URL = `${BACKEND_BASE_URL}/api/species/pollinators`

export type PollinatorRelationshipClass = 'confirmed' | 'literature-supported' | 'inferred' | 'unverified' | 'missing'

export type PollinatorIntelligence = ScientificSubsystemIntelligence & {
  knownRelationships: number
  missingRecords: number
  taxaWithoutEvidence: number
  regionalGaps: string[]
  genusGaps: string[]
  sourcesCoverage: string[]
  conflictingClaims: number
  unresolvedMatching: number
  relationshipClassification: Record<PollinatorRelationshipClass, number>
  recommendedTarget?: string
  nextAction: string
}

function buildFromResponse(raw: unknown, endpoint: string, timestamp: string): PollinatorIntelligence {
  const items = safeArray<Record<string, unknown>>(raw)
  const record = safeRecord(raw)
  const knownRelationships = safeNumber(record.total ?? record.count ?? record.knownRelationships ?? items.length, 0)
  const missingRecords = safeNumber(record.missing ?? record.missingRecords, 0)
  const taxaWithoutEvidence = safeNumber(record.taxaWithoutEvidence ?? record.unmatched_taxa, 0)
  const conflictingClaims = safeNumber(record.conflicts ?? record.conflictingClaims, 0)
  const unresolvedMatching = safeNumber(record.unresolved ?? record.unresolvedMatching, 0)

  const sources = safeArray<string>(record.sources ?? record.sourcesCoverage)
  const dataAge = computeDataAge(safeString(record.updatedAt ?? record.updated_at) || timestamp)

  const provenance: Provenance[] = [{
    endpoint,
    sourceTable: 'pollinator_relationships',
    timestamp,
    recordCount: knownRelationships,
    normalizationNote: `Probe genus: ${PROBE_GENUS}`,
  }]

  return {
    subsystemId: SUBSYSTEM_ID,
    subsystemName: 'Pollinators',
    mode: dataModeFromAge(dataAge, false, true),
    connectionState: 'connected',
    endpoint,
    timestamp,
    dataAge,
    recordCount: knownRelationships,
    coverage: knownRelationships > 0 ? Math.min(1, knownRelationships / Math.max(knownRelationships + missingRecords, 1)) : 0,
    evidenceQuality: conflictingClaims === 0 ? 0.8 : 0.5,
    integrationReadiness: 0.5,
    automationReadiness: 0.4,
    reliability: 0.7,
    blockers: taxaWithoutEvidence > 0 ? [`${taxaWithoutEvidence} taxa missing pollinator evidence`] : [],
    missingEvidence: [],
    recommendedNextAction: 'Import latest pollinator literature and resolve unmatched taxa.',
    provenance,
    metrics: { knownRelationships, missingRecords, taxaWithoutEvidence, conflictingClaims, unresolvedMatching },
    knownRelationships,
    missingRecords,
    taxaWithoutEvidence,
    regionalGaps: [],
    genusGaps: [],
    sourcesCoverage: sources,
    conflictingClaims,
    unresolvedMatching,
    relationshipClassification: {
      confirmed: safeNumber(record.confirmed, 0),
      // Backend may return snake_case (literature_supported) or kebab-case (literature-supported)
      'literature-supported': safeNumber(record.literature_supported ?? record['literature-supported'], 0),
      inferred: safeNumber(record.inferred, 0),
      unverified: safeNumber(record.unverified, 0),
      missing: missingRecords,
    },
    nextAction: 'Import latest pollinator literature and validate taxonomy alignment.',
  }
}

function buildUnavailable(endpoint: string, reason: string, cached: PollinatorIntelligence | null): PollinatorIntelligence {
  const timestamp = new Date().toISOString()
  const base: PollinatorIntelligence = cached ?? {
    subsystemId: SUBSYSTEM_ID,
    subsystemName: 'Pollinators',
    mode: 'unavailable',
    connectionState: 'unavailable',
    endpoint,
    timestamp,
    dataAge: Infinity,
    blockers: [reason],
    missingEvidence: [],
    recommendedNextAction: 'Restore backend connectivity to fetch pollinator data.',
    provenance: [],
    metrics: {},
    knownRelationships: 0,
    missingRecords: 0,
    taxaWithoutEvidence: 0,
    regionalGaps: [],
    genusGaps: [],
    sourcesCoverage: [],
    conflictingClaims: 0,
    unresolvedMatching: 0,
    relationshipClassification: { confirmed: 0, 'literature-supported': 0, inferred: 0, unverified: 0, missing: 0 },
    nextAction: 'Restore backend connectivity.',
  }
  return { ...base, mode: 'fallback', connectionState: 'fallback', fallbackReason: reason, timestamp }
}

export async function fetchPollinatorIntelligence(): Promise<PollinatorIntelligence> {
  const cached = loadSubsystemCache<PollinatorIntelligence>(SUBSYSTEM_ID)
  const timestamp = new Date().toISOString()

  try {
    const url = `${POLLINATORS_URL}?genus=${PROBE_GENUS}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = await res.json() as unknown
    const intel = buildFromResponse(raw, POLLINATORS_URL, timestamp)
    saveSubsystemCache(SUBSYSTEM_ID, {
      data: intel,
      retrievedAt: timestamp,
      endpoint: POLLINATORS_URL,
      dataAge: intel.dataAge,
      mode: intel.mode,
    })
    return intel
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Fetch failed'
    return buildUnavailable(POLLINATORS_URL, reason, cached?.data ?? null)
  }
}
