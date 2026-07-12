import { loadIntelligenceStore, grantItems } from '@/lib/missionControlIntelligence'
import { safeArray, safeNumber, safeString, computeDataAge, dataModeFromAge } from '../shared/normalizers'
import { loadSubsystemCache, saveSubsystemCache } from '../shared/cache'
import type { ScientificSubsystemIntelligence, Provenance } from '../shared/types'

const SUBSYSTEM_ID = 'grants'
const LOCAL_ENDPOINT = 'localStorage:oc_mission_control_intelligence_v1'

export type GrantOpportunity = {
  id: string
  title: string
  organization?: string
  deadline?: string
  amount?: string
  stage: string
  evidenceReadiness: number
  partnerReadiness: number
  missingAttachments: string[]
  ownerDecisions: string[]
  isUrgent: boolean
}

export type GrantsIntelligence = ScientificSubsystemIntelligence & {
  activeOpportunities: number
  urgentDeadlines: number
  opportunities: GrantOpportunity[]
  evidenceReadiness: number
  partnerReadiness: number
  scientificDependencies: string[]
  ownerDecisions: string[]
  nextAction: string
}

function buildUnavailable(reason: string): GrantsIntelligence {
  const timestamp = new Date().toISOString()
  return {
    subsystemId: SUBSYSTEM_ID,
    subsystemName: 'Grant Office',
    mode: 'unavailable',
    connectionState: 'unavailable',
    endpoint: LOCAL_ENDPOINT,
    timestamp,
    dataAge: Infinity,
    blockers: [reason],
    missingEvidence: [],
    recommendedNextAction: 'Add intelligence items via the Daily Brief to populate the Grant Office.',
    provenance: [],
    metrics: {},
    activeOpportunities: 0,
    urgentDeadlines: 0,
    opportunities: [],
    evidenceReadiness: 0,
    partnerReadiness: 0,
    scientificDependencies: [],
    ownerDecisions: [],
    nextAction: 'Add grant intelligence items via the Daily Brief.',
  }
}

export async function fetchGrantsIntelligence(): Promise<GrantsIntelligence> {
  const cached = loadSubsystemCache<GrantsIntelligence>(SUBSYSTEM_ID)
  const timestamp = new Date().toISOString()

  try {
    const store = loadIntelligenceStore()
    const allItems = safeArray(store.intelligenceItems)
    const grants = grantItems(allItems)

    if (grants.length === 0) {
      if (cached?.data) {
        return { ...cached.data, mode: 'cached', timestamp }
      }
      return buildUnavailable('No grant intelligence items found in store')
    }

    const opportunities: GrantOpportunity[] = grants.map((item) => ({
      id: safeString(item.id),
      title: safeString(item.title),
      organization: item.organization,
      deadline: item.deadline_date,
      amount: item.funding_amount,
      stage: safeString(item.status),
      evidenceReadiness: safeNumber(item.application_progress, 0) / 100,
      partnerReadiness: 0.5,
      missingAttachments: item.missing_information ? [item.missing_information] : [],
      ownerDecisions: item.owner ? [] : ['Assign owner'],
      isUrgent: item.priority === 'critical' || item.priority === 'high',
    }))

    const urgentDeadlines = opportunities.filter((o) => o.isUrgent).length
    const avgEvidenceReadiness = opportunities.length > 0
      ? opportunities.reduce((sum, o) => sum + o.evidenceReadiness, 0) / opportunities.length
      : 0

    const dataAge = computeDataAge(safeString(grants[0]?.updated_at) || timestamp)
    const mode = dataModeFromAge(dataAge, false, true)

    const provenance: Provenance[] = [{
      endpoint: LOCAL_ENDPOINT,
      sourceTable: 'intelligence_items',
      timestamp,
      recordCount: grants.length,
      confidence: avgEvidenceReadiness,
    }]

    const intel: GrantsIntelligence = {
      subsystemId: SUBSYSTEM_ID,
      subsystemName: 'Grant Office',
      mode,
      connectionState: 'connected',
      endpoint: LOCAL_ENDPOINT,
      timestamp,
      dataAge,
      recordCount: grants.length,
      coverage: avgEvidenceReadiness,
      evidenceQuality: avgEvidenceReadiness,
      integrationReadiness: avgEvidenceReadiness,
      automationReadiness: 0.3,
      reliability: 0.9,
      blockers: urgentDeadlines > 0 ? [`${urgentDeadlines} urgent grant deadlines`] : [],
      missingEvidence: [],
      recommendedNextAction: urgentDeadlines > 0
        ? `Review ${urgentDeadlines} urgent grant deadline(s) and prepare application packages.`
        : 'Review grant opportunities and advance evidence readiness.',
      provenance,
      metrics: { activeOpportunities: grants.length, urgentDeadlines, avgEvidenceReadiness },
      activeOpportunities: grants.length,
      urgentDeadlines,
      opportunities,
      evidenceReadiness: avgEvidenceReadiness,
      partnerReadiness: 0.5,
      scientificDependencies: [],
      ownerDecisions: opportunities.flatMap((o) => o.ownerDecisions),
      nextAction: urgentDeadlines > 0
        ? 'Prepare urgent grant packages immediately.'
        : 'Review and advance grant evidence readiness.',
    }

    saveSubsystemCache(SUBSYSTEM_ID, {
      data: intel,
      retrievedAt: timestamp,
      endpoint: LOCAL_ENDPOINT,
      dataAge: intel.dataAge,
      mode: intel.mode,
    })
    return intel
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Failed to load intelligence store'
    if (cached?.data) return { ...cached.data, mode: 'fallback', fallbackReason: reason, timestamp }
    return buildUnavailable(reason)
  }
}
