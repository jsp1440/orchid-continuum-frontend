import { IMAGES_BACKEND_BASE_URL, CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig'
import { safeArray, safeNumber, safeString, safeRecord, computeDataAge, dataModeFromAge } from '../shared/normalizers'
import { loadSubsystemCache, saveSubsystemCache } from '../shared/cache'
import type { ScientificSubsystemIntelligence, Provenance } from '../shared/types'

const SUBSYSTEM_ID = 'vision'
const PROBE_GENUS = 'Lepanthes'
const VISION_URL = `${IMAGES_BACKEND_BASE_URL}/images/genus`
const EXECUTIVE_STATE_URL = `${CALYX_BACKEND_BASE_URL}/api/executive/state`

export type VisionIntelligence = ScientificSubsystemIntelligence & {
  totalMedia: number
  taxaWithImages: number
  taxaMissingImages: number
  unlinkedMedia: number
  provenanceGaps: number
  duplicateSuspect: number
  qualityScore: number
  mostIncompleteTaxon?: string
  mostIncompleteGenus?: string
  nextAction: string
}

function buildFromResponse(raw: unknown, endpoint: string, timestamp: string, execSubsystem?: Record<string, unknown>): VisionIntelligence {
  const record = safeRecord(raw)
  const probeImages = safeArray<unknown>(record.images ?? raw)
  const probeCount = probeImages.length || safeNumber(record.count ?? record.total, 0)

  const totalMedia = execSubsystem
    ? safeNumber(safeRecord(execSubsystem.sourceRecordCounts).images ?? execSubsystem.totalMedia, probeCount)
    : safeNumber(record.total_media ?? record.totalMedia, probeCount)

  const taxaWithImages = safeNumber(record.taxa_with_images ?? record.taxaWithImages, 0)
  const taxaMissingImages = safeNumber(record.taxa_missing_images ?? record.taxaMissingImages, 0)
  const unlinkedMedia = safeNumber(record.unlinked ?? record.unlinkedMedia, 0)
  const provenanceGaps = safeNumber(record.provenance_gaps ?? record.provenanceGaps, 0)
  const duplicateSuspect = safeNumber(record.duplicates ?? record.duplicateSuspect, 0)
  const qualityScore = safeNumber(record.quality_score ?? record.qualityScore, totalMedia > 0 ? 0.6 : 0)

  const dataAge = computeDataAge(safeString(record.updatedAt ?? record.updated_at) || timestamp)

  const provenance: Provenance[] = [{
    endpoint,
    sourceTable: 'genus_images',
    timestamp,
    recordCount: totalMedia,
    normalizationNote: `Probe genus: ${PROBE_GENUS}`,
  }]

  return {
    subsystemId: SUBSYSTEM_ID,
    subsystemName: 'Vision Lab',
    mode: dataModeFromAge(dataAge, false, true),
    connectionState: 'connected',
    endpoint,
    timestamp,
    dataAge,
    recordCount: totalMedia,
    coverage: taxaWithImages > 0 ? Math.min(1, taxaWithImages / Math.max(taxaWithImages + taxaMissingImages, 1)) : 0,
    evidenceQuality: qualityScore,
    integrationReadiness: 0.55,
    automationReadiness: 0.6,
    reliability: 0.75,
    blockers: taxaMissingImages > 0 ? [`${taxaMissingImages} taxa missing images`] : [],
    missingEvidence: [],
    recommendedNextAction: `Prioritize imaging for ${PROBE_GENUS} and other underrepresented genera.`,
    provenance,
    metrics: { totalMedia, taxaWithImages, taxaMissingImages, unlinkedMedia, provenanceGaps, duplicateSuspect, qualityScore },
    totalMedia,
    taxaWithImages,
    taxaMissingImages,
    unlinkedMedia,
    provenanceGaps,
    duplicateSuspect,
    qualityScore,
    mostIncompleteGenus: PROBE_GENUS,
    nextAction: `Review Vision Lab queue and prioritize ${PROBE_GENUS} imaging.`,
  }
}

function buildUnavailable(endpoint: string, reason: string, cached: VisionIntelligence | null): VisionIntelligence {
  const timestamp = new Date().toISOString()
  const base: VisionIntelligence = cached ?? {
    subsystemId: SUBSYSTEM_ID,
    subsystemName: 'Vision Lab',
    mode: 'unavailable',
    connectionState: 'unavailable',
    endpoint,
    timestamp,
    dataAge: Infinity,
    blockers: [reason],
    missingEvidence: [],
    recommendedNextAction: 'Restore backend connectivity to fetch vision lab data.',
    provenance: [],
    metrics: {},
    totalMedia: 0,
    taxaWithImages: 0,
    taxaMissingImages: 0,
    unlinkedMedia: 0,
    provenanceGaps: 0,
    duplicateSuspect: 0,
    qualityScore: 0,
    nextAction: 'Restore backend connectivity.',
  }
  return { ...base, mode: 'fallback', connectionState: 'fallback', fallbackReason: reason, timestamp }
}

export async function fetchVisionIntelligence(): Promise<VisionIntelligence> {
  const cached = loadSubsystemCache<VisionIntelligence>(SUBSYSTEM_ID)
  const timestamp = new Date().toISOString()

  let execSubsystem: Record<string, unknown> | undefined
  try {
    const execRes = await fetch(EXECUTIVE_STATE_URL)
    if (execRes.ok) {
      const execRaw = await execRes.json() as unknown
      const execRecord = safeRecord(execRaw)
      const globalHealth = safeArray<Record<string, unknown>>(execRecord.globalHealth ?? execRecord.subsystems)
      execSubsystem = globalHealth.find((s) => {
        const name = safeString(s.name).toLowerCase()
        const id = safeString(s.id).toLowerCase()
        return name.includes('vision') || name.includes('image') || id.includes('vision') || id.includes('image')
      })
    }
  } catch {
    // Non-fatal — continue with image backend probe
  }

  try {
    const url = `${VISION_URL}/${PROBE_GENUS}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = await res.json() as unknown
    const intel = buildFromResponse(raw, VISION_URL, timestamp, execSubsystem)
    saveSubsystemCache(SUBSYSTEM_ID, {
      data: intel,
      retrievedAt: timestamp,
      endpoint: VISION_URL,
      dataAge: intel.dataAge,
      mode: intel.mode,
    })
    return intel
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Fetch failed'
    return buildUnavailable(VISION_URL, reason, cached?.data ?? null)
  }
}
