import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import type { HarvesterStatus } from '@/lib/missionControlOps';
import type { IntelligenceItem, SourceBriefing } from '@/lib/missionControlIntelligence';

export type OwnerAllowedAction = {
  allowed: boolean;
  state: string;
  auth: string;
  risk: string;
  writesDatabase: boolean;
  requiresConfirmation: boolean;
  reason: string;
};

export type OwnerAllowedActions = Record<string, OwnerAllowedAction>;

export type OwnerSession = {
  authenticated: boolean;
  status: string;
  owner: string;
  token?: 'cookie';
  expires_at: string | number | null;
  allowedActions: OwnerAllowedActions;
  reason?: string | null;
  credential_transport?: string;
};

export type OwnerOperationsState = {
  permissions: OwnerAllowedActions;
  intelligenceItems: IntelligenceItem[];
  sourceBriefings: SourceBriefing[];
  operationsQueue: BackendOperationsQueueItem[];
  commandHistory: BackendOwnerCommand[];
};

export type BackendOperationsQueueItem = {
  id: string;
  title: string;
  task_type?: string;
  source?: string;
  requested_by?: string;
  created_at?: string;
  priority?: string;
  risk_level?: string;
  authorization_state?: string;
  progress?: number;
  status?: string;
  result_summary?: string;
  related_subsystem?: string;
  logs?: string[];
  next_required_action?: string;
  command_id?: string;
};

export type BackendOwnerCommand = {
  id: string;
  command: string;
  intent: string;
  status: string;
  risk_level?: string;
  authorization_state?: string;
  result_summary?: string;
  created_at?: string;
  updated_at?: string;
};

export type OwnerApiResult<T> = T & {
  status?: string;
  allowedActions?: OwnerAllowedActions;
};

type JsonRecord = Record<string, unknown>;

function ownerHeaders(_token?: string): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Orchid-Actor': 'mission-control-owner',
  };
}

async function requestJson<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${CALYX_BACKEND_BASE_URL}${endpoint}`, { ...options, credentials: 'include' });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as T : {} as T;
  if (!response.ok) {
    const detail = typeof payload === 'object' && payload && 'detail' in payload
      ? String((payload as JsonRecord).detail)
      : response.statusText;
    throw new Error(`Calyx backend ${response.status}: ${detail}`);
  }
  return payload;
}

function normalizeIntelligenceItem(raw: JsonRecord): IntelligenceItem {
  const stamped = new Date().toISOString();
  const category = Array.isArray(raw.category) ? raw.category.map(String) : ['Unknown'];
  return {
    id: String(raw.id ?? `backend-${Date.now()}`),
    source_briefing_id: typeof raw.source_briefing_id === 'string' ? raw.source_briefing_id : undefined,
    title: String(raw.title ?? 'Untitled backend intelligence item'),
    summary: String(raw.summary ?? ''),
    source: String(raw.source ?? 'Calyx backend'),
    source_date: String(raw.source_date ?? stamped.slice(0, 10)),
    category: category.filter(Boolean) as IntelligenceItem['category'],
    priority: ['critical', 'high', 'medium', 'low'].includes(String(raw.priority)) ? String(raw.priority) as IntelligenceItem['priority'] : 'medium',
    status: ['new', 'triaged', 'active', 'waiting', 'submitted', 'completed', 'declined', 'archived'].includes(String(raw.status)) ? String(raw.status) as IntelligenceItem['status'] : 'new',
    deadline_date: typeof raw.deadline_date === 'string' ? raw.deadline_date : undefined,
    funding_amount: typeof raw.funding_amount === 'string' ? raw.funding_amount : undefined,
    organization: typeof raw.organization === 'string' ? raw.organization : undefined,
    recommended_action: String(raw.recommended_action ?? 'Owner review required.'),
    owner: String(raw.owner ?? ''),
    notes: String(raw.notes ?? ''),
    source_excerpt: String(raw.source_excerpt ?? raw.summary ?? ''),
    source_link: typeof raw.source_link === 'string' ? raw.source_link : undefined,
    eligibility_summary: typeof raw.eligibility_summary === 'string' ? raw.eligibility_summary : undefined,
    missing_information: Array.isArray(raw.missing_information) ? raw.missing_information.join(', ') : typeof raw.missing_information === 'string' ? raw.missing_information : undefined,
    application_progress: typeof raw.application_progress === 'number' ? raw.application_progress : undefined,
    created_at: String(raw.created_at ?? stamped),
    updated_at: String(raw.updated_at ?? stamped),
  };
}

function normalizeSourceBriefing(raw: JsonRecord): SourceBriefing {
  return {
    id: String(raw.id ?? `briefing-${Date.now()}`),
    source: String(raw.source ?? 'Calyx backend'),
    source_date: String(raw.source_date ?? new Date().toISOString().slice(0, 10)),
    raw_text: String(raw.raw_text ?? ''),
    created_at: String(raw.created_at ?? new Date().toISOString()),
  };
}

export async function createOwnerSession(accessCode: string, owner = 'owner'): Promise<OwnerSession> {
  // Step 1: POST login credentials — backend sets an HttpOnly session cookie.
  await requestJson<OwnerSession>('/api/mission-control/owner/session', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_code: accessCode, owner }),
  });
  // Step 2: Immediately inspect the cookie session with credentials: "include".
  // A truthy session is only returned when the inspection explicitly confirms
  // authenticated === true and owner permissions are present.
  // This eliminates any code path where a successful login POST alone implies
  // authenticated state (BUILD-057).
  const inspected = await validateOwnerSession();
  if (!inspected.authenticated) {
    throw new Error(inspected.reason ?? 'Owner session inspection did not confirm authentication');
  }
  if (!inspected.owner) {
    throw new Error('Owner session inspection: required owner permissions absent');
  }
  // validateOwnerSession already sets token: 'cookie' when authenticated, but
  // we assert it explicitly here so callers always receive a truthy token after
  // inspection succeeds.
  return { ...inspected, token: 'cookie' as const };
}

export async function validateOwnerSession(_token?: string): Promise<OwnerSession> {
  let raw: Record<string, unknown>;
  try {
    raw = await requestJson<Record<string, unknown>>('/api/mission-control/owner/session', {
      headers: ownerHeaders(),
    });
  } catch (err) {
    return {
      authenticated: false,
      status: 'error',
      owner: '',
      token: undefined,
      expires_at: null,
      allowedActions: {},
      reason: err instanceof Error ? err.message : 'Session inspection request failed',
    };
  }
  // Guard against malformed responses: require a proper object.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      authenticated: false,
      status: 'error',
      owner: '',
      token: undefined,
      expires_at: null,
      allowedActions: {},
      reason: 'Malformed session inspection response',
    };
  }
  const session = raw as Omit<OwnerSession, 'token'> & { token?: string };
  // Shared validation (BUILD-058): token: 'cookie' is returned ONLY when ALL
  // required conditions are explicitly verified:
  //   1. authenticated === true (strict equality, not merely truthy)
  //   2. owner identity is a non-empty, non-whitespace string
  //      (typeof guards against null/'object' and undefined/'undefined' too)
  // Any other combination — including authenticated: true with null/empty/whitespace
  // owner — must not produce a truthy token or activate privileged controls.
  const ownerValue = typeof session.owner === 'string' ? session.owner.trim() : '';
  const fullyVerified = session.authenticated === true && ownerValue.length > 0;
  return {
    ...session,
    token: fullyVerified ? 'cookie' : undefined,
    reason: !fullyVerified && session.authenticated
      ? (session.reason ?? 'Owner session inspection: required owner identity absent')
      : session.reason,
  };
}

export async function endOwnerSession(): Promise<void> {
  await requestJson('/api/mission-control/owner/session', { method: 'DELETE', headers: ownerHeaders() });
}

export async function fetchOwnerOperationsState(token: string): Promise<OwnerOperationsState> {
  const [permissions, intelligence, briefings, queue, commands] = await Promise.all([
    requestJson<{ allowedActions: OwnerAllowedActions }>('/api/mission-control/owner/permissions', { headers: ownerHeaders(token) }),
    requestJson<{ items: JsonRecord[] }>('/api/mission-control/owner/intelligence', { headers: ownerHeaders(token) }),
    requestJson<{ source_briefings: JsonRecord[] }>('/api/mission-control/owner/source-briefings', { headers: ownerHeaders(token) }),
    requestJson<{ items: BackendOperationsQueueItem[] }>('/api/mission-control/owner/operations-queue', { headers: ownerHeaders(token) }),
    requestJson<{ commands: BackendOwnerCommand[] }>('/api/mission-control/owner/commands', { headers: ownerHeaders(token) }),
  ]);
  return {
    permissions: permissions.allowedActions,
    intelligenceItems: (intelligence.items ?? []).map(normalizeIntelligenceItem),
    sourceBriefings: (briefings.source_briefings ?? []).map(normalizeSourceBriefing),
    operationsQueue: queue.items ?? [],
    commandHistory: commands.commands ?? [],
  };
}

export async function saveSourceBriefingToBackend(token: string, request: { source: string; source_date: string; raw_text: string; provenance?: JsonRecord }) {
  const result = await requestJson<{ source_briefing: JsonRecord; items: JsonRecord[] }>('/api/mission-control/owner/source-briefings', {
    method: 'POST',
    headers: ownerHeaders(token),
    body: JSON.stringify(request),
  });
  return {
    sourceBriefing: normalizeSourceBriefing(result.source_briefing),
    items: (result.items ?? []).map(normalizeIntelligenceItem),
  };
}

export async function importLocalIntelligenceToBackend(token: string, records: IntelligenceItem[]) {
  return requestJson<{ imported: JsonRecord[]; skipped_duplicates: number }>('/api/mission-control/owner/intelligence/import-local', {
    method: 'POST',
    headers: ownerHeaders(token),
    body: JSON.stringify({ source: 'oc_mission_control_intelligence_v1', records }),
  });
}

export async function updateBackendIntelligenceItem(token: string, item: IntelligenceItem) {
  const result = await requestJson<{ item: JsonRecord }>(`/api/mission-control/owner/intelligence/${encodeURIComponent(item.id)}`, {
    method: 'PATCH',
    headers: ownerHeaders(token),
    body: JSON.stringify({
      status: item.status,
      priority: item.priority,
      owner: item.owner,
      notes: item.notes,
      verification_state: 'owner_reviewed',
    }),
  });
  return normalizeIntelligenceItem(result.item);
}

export async function generateOwnerAudit(token: string, auditType: string, outputFormat: 'json' | 'markdown' = 'markdown') {
  return requestJson<{ audit: { id: string; content: string | JsonRecord; output_format: string } }>('/api/mission-control/owner/audits', {
    method: 'POST',
    headers: ownerHeaders(token),
    body: JSON.stringify({ audit_type: auditType, output_format: outputFormat }),
  });
}

export async function submitOwnerCommand(token: string, command: string, confirm = false) {
  return requestJson<{ command: BackendOwnerCommand; queue_item: BackendOperationsQueueItem; status: string }>('/api/mission-control/owner/commands', {
    method: 'POST',
    headers: ownerHeaders(token),
    body: JSON.stringify({ command, confirm }),
  });
}

export async function transitionOwnerQueueItem(token: string, itemId: string, transition: 'approve' | 'reject' | 'cancel' | 'retry', reason?: string) {
  return requestJson<{ item: BackendOperationsQueueItem; status: string }>(`/api/mission-control/owner/operations-queue/${encodeURIComponent(itemId)}/${transition}`, {
    method: 'POST',
    headers: ownerHeaders(token),
    body: JSON.stringify({ reason }),
  });
}

export async function createResearchRequest(token: string, template: ResearchCommandTemplate) {
  return requestJson<{ research_request: JsonRecord; status: string }>('/api/mission-control/owner/research-requests', {
    method: 'POST',
    headers: ownerHeaders(token),
    body: JSON.stringify({
      title: template.label,
      research_question: template.prompt,
      taxa: [],
      geography: [],
      requested_evidence_sources: ['taxonomy', 'literature', 'occurrences', 'media', 'knowledge_graph'],
      requested_outputs: [template.output],
      priority: 'medium',
      provenance: { source: 'Mission Control Research Command Center', template_id: template.id },
    }),
  });
}

export async function generatePartnershipPacket(token: string, template: PartnershipTemplate) {
  return requestJson<{ packet: { id: string; content: string | JsonRecord } }>('/api/mission-control/owner/partnership-packets', {
    method: 'POST',
    headers: ownerHeaders(token),
    body: JSON.stringify({
      organization_name: template.partner,
      partner_type: template.id,
      output_format: 'markdown',
    }),
  });
}

export async function runHarvesterOwnerAction(token: string, harvester: HarvesterStatus, action: 'run-once' | 'pause' | 'resume' | 'retire' | 'restore' | 'reassess') {
  return requestJson<JsonRecord>(`/api/harvesters/${encodeURIComponent(harvester.id)}/${action}`, {
    method: 'POST',
    headers: ownerHeaders(token),
  });
}

export async function runRuntimeOwnerAction(action: 'cycle' | 'start' | 'stop' | 'restart') {
  const endpoint = action === 'cycle' ? 'autonomous-cycle' : `autonomous-${action}`;
  return requestJson<JsonRecord>(`/api/runner/${endpoint}`, {
    method: 'POST',
    headers: ownerHeaders(),
  });
}

export type OwnerSubsystemGuide = {
  id: string;
  name: string;
  category: string;
  purpose: string;
  scientificImportance: string;
  completion: number;
  readiness: number;
  dataSources: string[];
  dependencies: string[];
  limitations: string[];
  plannedCapability: string;
  ownerActions: string[];
  automaticCalyxActions: string[];
  relatedSystems: string[];
  exportOptions: string[];
};

export type OperationsQueueItem = {
  id: string;
  lane: 'Now working' | 'Queued' | 'Waiting for owner' | 'Waiting for external partner' | 'Completed today';
  title: string;
  subsystem: string;
  detail: string;
  ownerDecision?: string;
};

export type ExecutiveAuditTemplate = {
  id: string;
  title: string;
  scope: string;
  formats: string[];
  includes: string[];
  partnerReady: boolean;
  grantReady: boolean;
};

export type PartnershipTemplate = {
  id: string;
  partner: string;
  mission: string;
  federationOpportunity: string;
  desiredIntegrations: string[];
  researchOpportunities: string[];
};

export type ResearchCommandTemplate = {
  id: string;
  label: string;
  prompt: string;
  output: string;
  ownerReview: string;
};

export type ResearchInboxItem = {
  id: string;
  title: string;
  source: string;
  status: 'new' | 'triage' | 'waiting_owner' | 'ready' | 'blocked';
  detail: string;
};

export type OwnerManualTopic = {
  id: string;
  title: string;
  workflow: string;
  steps: string[];
};

export type LifecycleProject = {
  id: string;
  name: string;
  stage: 'Dream' | 'Specification' | 'Building' | 'Validation' | 'Production' | 'Maintenance';
  nextCheckpoint: string;
};

export const ownerGuides: OwnerSubsystemGuide[] = [
  {
    id: 'atlas',
    name: 'Atlas',
    category: 'Maps / Occurrences',
    purpose: 'Show where orchid taxa occur, how records cluster, and which geography still needs verification.',
    scientificImportance: 'Distribution data anchors conservation, habitat inference, climate comparison, and collaborator targeting.',
    completion: 38,
    readiness: 44,
    dataSources: ['GBIF', 'iNaturalist', 'Calyx occurrence harvesters'],
    dependencies: ['Taxonomy backbone', 'Occurrence deduplication', 'Coordinate quality checks'],
    limitations: ['Sparse georeferencing for older records', 'Country filters need owner-approved write path'],
    plannedCapability: 'Country, habitat, elevation, and climate overlays with exportable collaborator packets.',
    ownerActions: ['Audit country coverage', 'Generate habitat cards', 'Export Atlas readiness report'],
    automaticCalyxActions: ['Flag coordinate gaps', 'Compare occurrence freshness', 'Queue range reconciliation'],
    relatedSystems: ['Species Explorer', 'Habitat', 'Conservation', 'Knowledge Graph'],
    exportOptions: ['Markdown', 'PDF', 'JSON'],
  },
  {
    id: 'knowledge_graph',
    name: 'Knowledge Graph',
    category: 'Relationships',
    purpose: 'Connect orchids to images, occurrences, literature, pollinators, fungi, habitats, climate, and people.',
    scientificImportance: 'The graph turns isolated records into explainable scientific relationships.',
    completion: 31,
    readiness: 36,
    dataSources: ['Calyx runtime', 'Literature extraction', 'Trait and relationship harvesters'],
    dependencies: ['Taxonomy', 'Literature', 'Pollinator data', 'Mycorrhiza data'],
    limitations: ['Relationship confidence needs more provenance', 'Graph validation is currently audit-first'],
    plannedCapability: 'One-click missing-relationship auditor and partner-ready relationship exports.',
    ownerActions: ['Audit missing relationships', 'Review AI decisions', 'Export integration audit'],
    automaticCalyxActions: ['List unlinked images', 'Flag evidence gaps', 'Queue graph repair tasks'],
    relatedSystems: ['Literature', 'Pollinators', 'Mycorrhiza', 'Vision Lab'],
    exportOptions: ['Markdown', 'JSON', 'DOCX'],
  },
  {
    id: 'pollinators',
    name: 'Pollinators',
    category: 'Ecology',
    purpose: 'Track known and missing pollination relationships across genera, species, regions, and literature.',
    scientificImportance: 'Pollination relationships are central to conservation, evolution, education, and grant narratives.',
    completion: 22,
    readiness: 29,
    dataSources: ['Literature', 'EOL / TraitBank', 'Relationship extraction'],
    dependencies: ['Citation parsing', 'Taxon matching', 'Confidence scoring'],
    limitations: ['Many records require manual review', 'Inferred relationships must remain labeled as inference'],
    plannedCapability: 'Missing pollinator finder with genus and country comparison workflows.',
    ownerActions: ['Show missing pollinators', 'Generate pollinator audit', 'Launch literature review'],
    automaticCalyxActions: ['Queue citation extraction', 'Separate evidence from inference', 'Prioritize high-value gaps'],
    relatedSystems: ['Knowledge Graph', 'Literature', 'Species Explorer'],
    exportOptions: ['Markdown', 'PDF', 'JSON'],
  },
  {
    id: 'mycorrhiza',
    name: 'Mycorrhiza',
    category: 'Ecology',
    purpose: 'Expose orchid-fungal relationships, missing fungal evidence, and research opportunities.',
    scientificImportance: 'Fungal relationships influence germination, habitat restoration, and conservation planning.',
    completion: 18,
    readiness: 24,
    dataSources: ['Literature', 'Relationship harvesters', 'Calyx science gaps'],
    dependencies: ['Fungal taxonomy normalization', 'Citation confidence', 'Habitat context'],
    limitations: ['Sparse structured datasets', 'Needs partner research collaboration'],
    plannedCapability: 'Genus-level fungal relationship briefs and conservation restoration reports.',
    ownerActions: ['Locate missing mycorrhiza', 'Generate conservation report', 'Create partner packet'],
    automaticCalyxActions: ['Identify fungal evidence gaps', 'Queue literature extraction', 'Mark uncertainty'],
    relatedSystems: ['Knowledge Graph', 'Habitat', 'Grant Office'],
    exportOptions: ['Markdown', 'PDF', 'DOCX'],
  },
  {
    id: 'vision_lab',
    name: 'Vision Lab',
    category: 'Images / AI',
    purpose: 'Assess image completeness, quality, identification support, and species-page media readiness.',
    scientificImportance: 'Images support education, field recognition, public engagement, and visual trait research.',
    completion: 47,
    readiness: 52,
    dataSources: ['Image/media harvesters', 'iNaturalist', 'Calyx media resolver'],
    dependencies: ['Taxonomy links', 'Image provenance', 'Quality scoring'],
    limitations: ['Automated ID must not replace evidence-backed taxonomy', 'Some genera lack usable media'],
    plannedCapability: 'Image QA queue with owner approval and species evidence linking.',
    ownerActions: ['Audit images', 'Show missing images', 'Export media readiness'],
    automaticCalyxActions: ['Flag missing media', 'Check image links', 'Queue QA review'],
    relatedSystems: ['Species Explorer', 'Knowledge Graph', 'Presentation Archive'],
    exportOptions: ['Markdown', 'JSON'],
  },
  {
    id: 'grant_office',
    name: 'Grant Office',
    category: 'Funding',
    purpose: 'Turn Continuum evidence, coverage, collaborators, and build roadmap into funding-ready packages.',
    scientificImportance: 'Grant readiness translates the platform into sustained research, conservation, and education capacity.',
    completion: 34,
    readiness: 41,
    dataSources: ['Mission Control', 'Opportunity intake', 'Executive audits'],
    dependencies: ['Partnership packets', 'Budget narratives', 'Evidence exports'],
    limitations: ['Requires owner review before external submission', 'Deadlines need live calendar integration'],
    plannedCapability: 'Grant package generator with collaborator-specific evidence appendices.',
    ownerActions: ['Generate grant readiness', 'Create collaboration package', 'Review deadlines'],
    automaticCalyxActions: ['Summarize fit', 'Prepare evidence checklist', 'Queue missing attachments'],
    relatedSystems: ['Partnerships', 'Executive Audit', 'Research Queue'],
    exportOptions: ['Markdown', 'PDF', 'DOCX'],
  },
];

export const operationsQueue: OperationsQueueItem[] = [
  { id: 'image-qa', lane: 'Now working', title: 'Image QA', subsystem: 'Vision Lab', detail: 'Calyx is checking image coverage and provenance gaps for media readiness.' },
  { id: 'taxonomy-reconciliation', lane: 'Queued', title: 'Taxonomy reconciliation', subsystem: 'Species Explorer', detail: 'Synonym and accepted-name differences are queued for review.' },
  { id: 'presentation-processing', lane: 'Waiting for owner', title: 'Presentation processing', subsystem: 'Personal Knowledge Harvester', detail: 'New folder sources need owner confirmation before ingestion.', ownerDecision: 'Choose the first presentation folder source.' },
  { id: 'partner-gbif', lane: 'Waiting for external partner', title: 'GBIF collaboration packet', subsystem: 'Partnerships', detail: 'A partner-ready report can describe federation opportunities and desired APIs.' },
  { id: 'grant-research', lane: 'Completed today', title: 'Grant research triage', subsystem: 'Grant Office', detail: 'Current opportunities were organized into active, waiting, and archived lanes.' },
];

export const executiveAuditTemplates: ExecutiveAuditTemplate[] = [
  { id: 'overall', title: 'Overall Executive Audit', scope: 'Complete Orchid Continuum readiness, risks, priorities, grants, and partner posture.', formats: ['Markdown', 'PDF', 'DOCX', 'JSON'], includes: ['Executive summary', 'Strengths', 'Weaknesses', 'Coverage', 'Confidence', 'Priority builds'], partnerReady: true, grantReady: true },
  { id: 'taxonomy', title: 'Taxonomy Audit', scope: 'Accepted names, synonyms, conflicts, source alignment, and unresolved decisions.', formats: ['Markdown', 'JSON'], includes: ['Coverage', 'Conflicts', 'Recommendations'], partnerReady: true, grantReady: false },
  { id: 'knowledge-graph', title: 'Knowledge Graph Audit', scope: 'Missing images, occurrences, literature, pollinator, fungi, climate, habitat, and elevation links.', formats: ['Markdown', 'PDF', 'JSON'], includes: ['Missing relationships', 'Confidence', 'Priority repairs'], partnerReady: true, grantReady: true },
  { id: 'grant-readiness', title: 'Grant Readiness', scope: 'Funding narrative, partner readiness, scientific completeness, and evidence package gaps.', formats: ['Markdown', 'PDF', 'DOCX'], includes: ['Grant readiness', 'Partner readiness', 'Priority builds'], partnerReady: true, grantReady: true },
];

export const partnershipTemplates: PartnershipTemplate[] = [
  { id: 'smithsonian', partner: 'Smithsonian', mission: 'Connect orchid biodiversity evidence to institutional research and education.', federationOpportunity: 'Shared specimen, media, taxonomy, and education pathways.', desiredIntegrations: ['Specimen APIs', 'Media provenance', 'Research collaborator workflow'], researchOpportunities: ['Habitat cards', 'Knowledge graph validation', 'Public education exhibits'] },
  { id: 'gbif', partner: 'GBIF', mission: 'Improve occurrence quality and orchid range interpretation.', federationOpportunity: 'Occurrence gap detection, coordinate quality, and taxon reconciliation feedback.', desiredIntegrations: ['Occurrence API', 'Dataset metadata', 'Download citations'], researchOpportunities: ['Country completeness', 'Range shifts', 'Habitat inference'] },
  { id: 'inat', partner: 'iNaturalist', mission: 'Use community observations and media as reviewable orchid evidence.', federationOpportunity: 'Observation freshness, image evidence, and citizen-science learning loops.', desiredIntegrations: ['Observation API', 'Photo metadata', 'Taxon links'], researchOpportunities: ['Image QA', 'Phenology', 'Regional discovery queues'] },
  { id: 'universities', partner: 'Universities / Research Labs', mission: 'Turn Continuum gaps into supervised research projects and grants.', federationOpportunity: 'Student projects, lab collaborations, literature reviews, and ecological relationship validation.', desiredIntegrations: ['Research project intake', 'Citation exports', 'Partner dashboards'], researchOpportunities: ['Pollinator gaps', 'Mycorrhiza restoration', 'Climate comparisons'] },
];

export const researchCommands: ResearchCommandTemplate[] = [
  { id: 'compare-species', label: 'Compare Species', prompt: 'Compare two orchid species across taxonomy, habitat, images, occurrences, pollinators, fungi, and literature.', output: 'Comparison brief', ownerReview: 'Confirm species names and desired geography.' },
  { id: 'literature-review', label: 'Generate Literature Review', prompt: 'Build a citation-backed literature review for a genus, species, or ecological relationship.', output: 'Markdown or DOCX review', ownerReview: 'Approve topic scope before external use.' },
  { id: 'knowledge-gaps', label: 'Find Knowledge Gaps', prompt: 'List missing images, pollinators, mycorrhiza, habitat, elevation, climate, and citations for a target.', output: 'Research gap queue', ownerReview: 'Choose which gaps become build priorities.' },
  { id: 'grant-package', label: 'Generate Grant Package', prompt: 'Create a grant-ready packet with mission, evidence, partner fit, readiness, and missing attachments.', output: 'Grant package', ownerReview: 'Owner must review before submission.' },
];

export const researchInbox: ResearchInboxItem[] = [
  { id: 'new-presentations', title: 'New presentations', source: 'Personal Knowledge Harvester', status: 'waiting_owner', detail: 'Presentation folders are listed as supported sources and need owner source selection.' },
  { id: 'taxon-conflicts', title: 'Taxonomy conflicts', source: 'Taxonomy', status: 'triage', detail: 'Accepted-name and synonym conflicts should be ranked for owner review.' },
  { id: 'pollinator-conflicts', title: 'Pollinator conflicts', source: 'Knowledge Graph', status: 'new', detail: 'Conflicting relationship claims need citation-backed confidence labels.' },
  { id: 'grant-opportunities', title: 'Grant opportunities', source: 'Grant Office', status: 'ready', detail: 'Current opportunities can be converted into evidence checklists.' },
];

export const ownerManualTopics: OwnerManualTopic[] = [
  { id: 'daily', title: 'Daily Workflow', workflow: 'Start with the command bar, review waiting owner decisions, then export or assign one priority packet.', steps: ['Open Mission Control', 'Review Now Working and Waiting Owner lanes', 'Run one audit or research command', 'Record the next owner decision'] },
  { id: 'weekly', title: 'Weekly Workflow', workflow: 'Check scientific completeness and partnership readiness every week.', steps: ['Review completeness matrix', 'Export executive audit', 'Update grant and partner packets', 'Choose one priority build'] },
  { id: 'harvesters', title: 'Running Harvesters', workflow: 'Harvester controls remain disabled until backend owner authorization permits a specific action.', steps: ['Review harvester status', 'Inspect allowed action reason', 'Use backend-authorized action only', 'Confirm decision ledger'] },
  { id: 'troubleshooting', title: 'Troubleshooting', workflow: 'Use endpoint diagnostics and safe fallback data to separate UI issues from backend availability.', steps: ['Refresh telemetry', 'Read diagnostics', 'Check backend base URL', 'Avoid production writes until auth is confirmed'] },
];

export const lifecycleProjects: LifecycleProject[] = [
  { id: 'build-051', name: 'Owner Operations Console', stage: 'Building', nextCheckpoint: 'Validate command center, downloads, and owner guide rendering.' },
  { id: 'backend-runtime', name: 'Calyx Runtime Integration', stage: 'Validation', nextCheckpoint: 'Deploy PR #34 after migration and smoke SQL review.' },
  { id: 'harvester-control', name: 'Harvester Command Center', stage: 'Validation', nextCheckpoint: 'Confirm backend allowedActions contract with frontend controls.' },
  { id: 'personal-knowledge', name: 'Personal Knowledge Harvester', stage: 'Specification', nextCheckpoint: 'Choose first presentation folder and ingestion source.' },
  { id: 'partner-packets', name: 'Partnership Generator', stage: 'Specification', nextCheckpoint: 'Pick first partner packet: Smithsonian, GBIF, iNaturalist, or universities.' },
];

export function buildAuditMarkdown(template: ExecutiveAuditTemplate): string {
  return [
    `# ${template.title}`,
    '',
    `Scope: ${template.scope}`,
    '',
    '## Executive Summary',
    'Mission Control generated this audit shell for owner review. Live backend telemetry, evidence exports, and provenance should be attached before external use.',
    '',
    '## Included Sections',
    ...template.includes.map((item) => `- ${item}`),
    '',
    '## Output Formats',
    ...template.formats.map((format) => `- ${format}`),
    '',
    `Grant readiness: ${template.grantReady ? 'ready for owner-reviewed packet drafting' : 'supporting evidence only'}`,
    `Partner readiness: ${template.partnerReady ? 'partner packet compatible' : 'internal audit only'}`,
  ].join('\n');
}
