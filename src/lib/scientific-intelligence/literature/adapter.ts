import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig'
import { safeArray, safeNumber, safeString, safeRecord, computeDataAge, dataModeFromAge } from '../shared/normalizers'
import { loadSubsystemCache, saveSubsystemCache } from '../shared/cache'
import type { ScientificSubsystemIntelligence, Provenance } from '../shared/types'

const SUBSYSTEM_ID = 'literature'
const SUBSYSTEMS_URL = `${CALYX_BACKEND_BASE_URL}/api/mission-control/subsystems`

export type LiteratureIntelligence = ScientificSubsystemIntelligence & {
  paperCount: number
  citationCount: number
  parsedRecords: number
  unparsedRecords: number
  doiCoverage: number
  extractionCoverage: number
  unresolvedCitations: number
  gapsBySubsystem: Record<string, number>
  urgentTarget?: string
  nextAction: string
}

function buildFromSubsystem(subsystem: Record<string, unknown>, endpoint: string, timestamp: string): LiteratureIntelligence {
  const completeness = safeNumber(subsystem.completeness, 0)
  const counts = safeRecord(subsystem.sourceRecordCounts)
  const paperCount = safeNumber(counts.papers ?? counts.paper_count ?? subsystem.paperCount, 0)
  const citationCount = safeNumber(counts.citations ?? counts.citation_count ?? subsystem.citationCount, 0)
  const parsedRecords = safeNumber(counts.parsed ?? counts.parsed_records, 0)
  const unparsedRecords = safeNumber(counts.unparsed ?? counts.unparsed_records, 0)
  const doiCoverage = safeNumber(subsystem.doiCoverage ?? completeness / 100, completeness / 100)
  const blockers = safeArray<string>(subsystem.blockers)
  const dataAge = computeDataAge(safeString(subsystem.lastChecked) || timestamp)

  const provenance: Provenance[] = [{
    endpoint,
    sourceTable: 'literature_subsystem',
    timestamp,
    recordCount: paperCount,
    confidence: completeness / 100,
  }]

  return {
    subsystemId: SUBSYSTEM_ID,
    subsystemName: 'Literature',
    mode: dataModeFromAge(dataAge, false, true),
    connectionState: 'connected',
    endpoint,
    timestamp,
    dataAge,
    recordCount: paperCount,
    coverage: completeness / 100,
    evidenceQuality: completeness / 100,
    integrationReadiness: 0.5,
    automationReadiness: 0.4,
    reliability: 0.7,
    blockers,
    missingEvidence: blockers.slice(0, 3),
    recommendedNextAction: safeString(subsystem.recommendedNextAction, 'Import latest literature batch and resolve unmatched citations.'),
    provenance,
    metrics: { completeness, paperCount, citationCount, parsedRecords, unparsedRecords, doiCoverage },
    paperCount,
    citationCount,
    parsedRecords,
    unparsedRecords,
    doiCoverage,
    extractionCoverage: parsedRecords > 0 && (parsedRecords + unparsedRecords) > 0
      ? parsedRecords / (parsedRecords + unparsedRecords)
      : completeness / 100,
    unresolvedCitations: safeNumber(counts.unresolved ?? subsystem.unresolvedCitations, 0),
    gapsBySubsystem: {},
    nextAction: safeString(subsystem.recommendedNextAction, 'Import latest batch and validate DOI coverage.'),
  }
}

function buildUnavailable(endpoint: string, reason: string, cached: LiteratureIntelligence | null): LiteratureIntelligence {
  const timestamp = new Date().toISOString()
  const base: LiteratureIntelligence = cached ?? {
    subsystemId: SUBSYSTEM_ID,
    subsystemName: 'Literature',
    mode: 'unavailable',
    connectionState: 'unavailable',
    endpoint,
    timestamp,
    dataAge: Infinity,
    blockers: [reason],
    missingEvidence: [],
    recommendedNextAction: 'Restore backend connectivity to fetch literature data.',
    provenance: [],
    metrics: {},
    paperCount: 0,
    citationCount: 0,
    parsedRecords: 0,
    unparsedRecords: 0,
    doiCoverage: 0,
    extractionCoverage: 0,
    unresolvedCitations: 0,
    gapsBySubsystem: {},
    nextAction: 'Restore backend connectivity.',
  }
  return { ...base, mode: 'fallback', connectionState: 'fallback', fallbackReason: reason, timestamp }
}

export async function fetchLiteratureIntelligence(): Promise<LiteratureIntelligence> {
  const cached = loadSubsystemCache<LiteratureIntelligence>(SUBSYSTEM_ID)
  const timestamp = new Date().toISOString()

  try {
    const res = await fetch(SUBSYSTEMS_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = await res.json() as unknown
    const record = safeRecord(raw)
    const subsystems = safeArray<Record<string, unknown>>(
      record.subsystems ?? record.globalHealth ?? raw,
    )
    const litSubsystem = subsystems.find((s) => {
      const name = safeString(s.name).toLowerCase()
      const id = safeString(s.id).toLowerCase()
      return name.includes('literature') || name.includes('paper') || id.includes('literature')
    })

    if (litSubsystem) {
      const intel = buildFromSubsystem(litSubsystem, SUBSYSTEMS_URL, timestamp)
      saveSubsystemCache(SUBSYSTEM_ID, {
        data: intel,
        retrievedAt: timestamp,
        endpoint: SUBSYSTEMS_URL,
        dataAge: intel.dataAge,
        mode: intel.mode,
      })
      return intel
    }
    throw new Error('Literature subsystem not found in response')
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Fetch failed'
    return buildUnavailable(SUBSYSTEMS_URL, reason, cached?.data ?? null)
  }
}
