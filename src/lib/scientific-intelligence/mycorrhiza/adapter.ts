import { BACKEND_BASE_URL } from '@/lib/backendConfig'
import { safeArray, safeNumber, safeString, safeRecord, computeDataAge, dataModeFromAge } from '../shared/normalizers'
import { loadSubsystemCache, saveSubsystemCache } from '../shared/cache'
import type { ScientificSubsystemIntelligence, Provenance } from '../shared/types'

const SUBSYSTEM_ID = 'mycorrhiza'
const PROBE_GENUS = 'Dactylorhiza'
const MYCORRHIZA_URL = `${BACKEND_BASE_URL}/api/species/mycorrhizal`

export type MycorrhizaIntelligence = ScientificSubsystemIntelligence & {
  orchidFungalRelationships: number
  fungiRepresented: number
  taxaRepresented: number
  missingLinks: number
  unresolvedTaxonomy: number
  literatureCoverage: number
  habitatContext: string[]
  restorationRelevance: string
  topPriorityGap?: string
  nextAction: string
}

function buildFromResponse(raw: unknown, endpoint: string, timestamp: string): MycorrhizaIntelligence {
  const items = safeArray<Record<string, unknown>>(raw)
  const record = safeRecord(raw)
  const orchidFungalRelationships = safeNumber(record.total ?? record.count ?? record.orchidFungalRelationships ?? items.length, 0)
  const fungiRepresented = safeNumber(record.fungi_count ?? record.fungiRepresented, 0)
  const taxaRepresented = safeNumber(record.taxa_count ?? record.taxaRepresented, 0)
  const missingLinks = safeNumber(record.missing ?? record.missingLinks, 0)
  const unresolvedTaxonomy = safeNumber(record.unresolved ?? record.unresolvedTaxonomy, 0)
  const literatureCoverage = safeNumber(record.literature_coverage ?? record.literatureCoverage, 0)

  const dataAge = computeDataAge(safeString(record.updatedAt ?? record.updated_at) || timestamp)

  const provenance: Provenance[] = [{
    endpoint,
    sourceTable: 'mycorrhizal_relationships',
    timestamp,
    recordCount: orchidFungalRelationships,
    normalizationNote: `Probe genus: ${PROBE_GENUS}`,
  }]

  return {
    subsystemId: SUBSYSTEM_ID,
    subsystemName: 'Mycorrhiza',
    mode: dataModeFromAge(dataAge, false, true),
    connectionState: 'connected',
    endpoint,
    timestamp,
    dataAge,
    recordCount: orchidFungalRelationships,
    coverage: orchidFungalRelationships > 0 ? Math.min(1, orchidFungalRelationships / Math.max(orchidFungalRelationships + missingLinks, 1)) : 0,
    evidenceQuality: literatureCoverage > 0 ? Math.min(1, literatureCoverage / 100) : 0.3,
    integrationReadiness: 0.4,
    automationReadiness: 0.3,
    reliability: 0.65,
    blockers: missingLinks > 0 ? [`${missingLinks} fungal relationships missing`] : [],
    missingEvidence: [],
    recommendedNextAction: 'Connect orphan fungal nodes and validate taxonomy against current literature.',
    provenance,
    metrics: { orchidFungalRelationships, fungiRepresented, taxaRepresented, missingLinks, unresolvedTaxonomy, literatureCoverage },
    orchidFungalRelationships,
    fungiRepresented,
    taxaRepresented,
    missingLinks,
    unresolvedTaxonomy,
    literatureCoverage,
    habitatContext: [],
    restorationRelevance: 'Mycorrhizal data is critical for ex-situ conservation and restoration programs.',
    nextAction: 'Connect orphan fungal nodes and validate taxonomy.',
  }
}

function buildUnavailable(endpoint: string, reason: string, cached: MycorrhizaIntelligence | null): MycorrhizaIntelligence {
  const timestamp = new Date().toISOString()
  const base: MycorrhizaIntelligence = cached ?? {
    subsystemId: SUBSYSTEM_ID,
    subsystemName: 'Mycorrhiza',
    mode: 'unavailable',
    connectionState: 'unavailable',
    endpoint,
    timestamp,
    dataAge: Infinity,
    blockers: [reason],
    missingEvidence: [],
    recommendedNextAction: 'Restore backend connectivity to fetch mycorrhizal data.',
    provenance: [],
    metrics: {},
    orchidFungalRelationships: 0,
    fungiRepresented: 0,
    taxaRepresented: 0,
    missingLinks: 0,
    unresolvedTaxonomy: 0,
    literatureCoverage: 0,
    habitatContext: [],
    restorationRelevance: 'Unknown — backend unavailable.',
    nextAction: 'Restore backend connectivity.',
  }
  return { ...base, mode: 'fallback', connectionState: 'fallback', fallbackReason: reason, timestamp }
}

export async function fetchMycorrhizaIntelligence(): Promise<MycorrhizaIntelligence> {
  const cached = loadSubsystemCache<MycorrhizaIntelligence>(SUBSYSTEM_ID)
  const timestamp = new Date().toISOString()

  try {
    const url = `${MYCORRHIZA_URL}?genus=${PROBE_GENUS}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = await res.json() as unknown
    const intel = buildFromResponse(raw, MYCORRHIZA_URL, timestamp)
    saveSubsystemCache(SUBSYSTEM_ID, {
      data: intel,
      retrievedAt: timestamp,
      endpoint: MYCORRHIZA_URL,
      dataAge: intel.dataAge,
      mode: intel.mode,
    })
    return intel
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Fetch failed'
    return buildUnavailable(MYCORRHIZA_URL, reason, cached?.data ?? null)
  }
}
