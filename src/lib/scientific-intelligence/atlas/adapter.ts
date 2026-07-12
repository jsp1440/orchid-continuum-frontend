import { BACKEND_BASE_URL } from '@/lib/backendConfig'
import { safeArray, safeNumber, safeString, safeRecord, computeDataAge, dataModeFromAge } from '../shared/normalizers'
import { loadSubsystemCache, saveSubsystemCache } from '../shared/cache'
import type { ScientificSubsystemIntelligence, Provenance } from '../shared/types'

const SUBSYSTEM_ID = 'atlas'
const ATLAS_URL = `${BACKEND_BASE_URL}/atlas/occurrences`

export type AtlasIntelligence = ScientificSubsystemIntelligence & {
  occurrenceCount: number
  acceptedTaxa: number
  countriesRepresented: number
  coordinateQuality: number
  missingCoordinates: number
  duplicates: number
  geographicGaps: string[]
  freshness: string
  mostActiveTaxon?: string
  mostIncompleteGeography?: string
  nextAction: string
}

function buildFromResponse(raw: unknown, endpoint: string, timestamp: string): AtlasIntelligence {
  const record = safeRecord(raw)
  const items = safeArray<Record<string, unknown>>(raw)
  const occurrenceCount = safeNumber(record.total ?? record.count ?? record.occurrenceCount ?? items.length, 0)
  const acceptedTaxa = safeNumber(record.acceptedTaxa ?? record.taxa_count ?? record.species_count, 0)
  const countriesRepresented = safeNumber(record.countries ?? record.countriesRepresented, 0)
  const missingCoordinates = safeNumber(record.missingCoordinates ?? record.missing_coordinates, 0)
  const duplicates = safeNumber(record.duplicates ?? record.duplicate_count, 0)
  const coordinateQuality = occurrenceCount > 0
    ? Math.max(0, Math.min(1, (occurrenceCount - missingCoordinates) / occurrenceCount))
    : 0

  const dataAge = computeDataAge(safeString(record.updatedAt ?? record.updated_at) || timestamp)

  const provenance: Provenance[] = [{
    endpoint,
    sourceTable: 'atlas_occurrences',
    timestamp,
    recordCount: occurrenceCount,
    confidence: coordinateQuality,
  }]

  return {
    subsystemId: SUBSYSTEM_ID,
    subsystemName: 'Atlas',
    mode: dataModeFromAge(dataAge, false, true),
    connectionState: 'connected',
    endpoint,
    timestamp,
    dataAge,
    recordCount: occurrenceCount,
    coverage: coordinateQuality,
    evidenceQuality: coordinateQuality,
    integrationReadiness: 0.6,
    automationReadiness: 0.5,
    reliability: 0.8,
    blockers: missingCoordinates > 0 ? [`${missingCoordinates} occurrences missing coordinates`] : [],
    missingEvidence: [],
    recommendedNextAction: missingCoordinates > 0
      ? `Resolve ${missingCoordinates} occurrences with missing coordinates.`
      : 'Verify geographic coverage and resolve duplicate records.',
    provenance,
    metrics: { occurrenceCount, acceptedTaxa, countriesRepresented, coordinateQuality, missingCoordinates, duplicates },
    occurrenceCount,
    acceptedTaxa,
    countriesRepresented,
    coordinateQuality,
    missingCoordinates,
    duplicates,
    geographicGaps: [],
    freshness: dataAge < 5 * 60 * 1000 ? 'live' : dataAge < 86400000 ? 'recent' : 'stale',
    nextAction: 'Review coordinate gaps and confirm taxonomy alignment.',
  }
}

function buildUnavailable(endpoint: string, reason: string, cached: AtlasIntelligence | null): AtlasIntelligence {
  const timestamp = new Date().toISOString()
  const base: AtlasIntelligence = cached ?? {
    subsystemId: SUBSYSTEM_ID,
    subsystemName: 'Atlas',
    mode: 'unavailable',
    connectionState: 'unavailable',
    endpoint,
    timestamp,
    dataAge: Infinity,
    blockers: [reason],
    missingEvidence: [],
    recommendedNextAction: 'Restore backend connectivity to fetch Atlas data.',
    provenance: [],
    metrics: {},
    occurrenceCount: 0,
    acceptedTaxa: 0,
    countriesRepresented: 0,
    coordinateQuality: 0,
    missingCoordinates: 0,
    duplicates: 0,
    geographicGaps: [],
    freshness: 'unknown',
    nextAction: 'Restore backend connectivity.',
  }
  return { ...base, mode: 'fallback', connectionState: 'fallback', fallbackReason: reason, timestamp }
}

export async function fetchAtlasIntelligence(): Promise<AtlasIntelligence> {
  const cached = loadSubsystemCache<AtlasIntelligence>(SUBSYSTEM_ID)
  const timestamp = new Date().toISOString()

  try {
    const probeUrl = `${ATLAS_URL}?limit=1`
    const res = await fetch(probeUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = await res.json() as unknown
    const intel = buildFromResponse(raw, ATLAS_URL, timestamp)
    saveSubsystemCache(SUBSYSTEM_ID, {
      data: intel,
      retrievedAt: timestamp,
      endpoint: ATLAS_URL,
      dataAge: intel.dataAge,
      mode: intel.mode,
    })
    return intel
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Fetch failed'
    return buildUnavailable(ATLAS_URL, reason, cached?.data ?? null)
  }
}
