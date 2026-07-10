import { BACKEND_BASE_URL, CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export type MissionControlStatus = 'healthy' | 'warning' | 'error' | 'unknown' | 'stub';
export type ControlState = 'read_only' | 'disabled' | 'planned' | 'requires_owner_authorization';

export type EndpointDiagnostic = {
  label: string;
  endpoint: string;
  status: MissionControlStatus;
  detail: string;
  updatedAt: string;
};

export type ContinuumSubsystem = {
  id: string;
  name: string;
  category: string;
  status: MissionControlStatus;
  completeness: number;
  lastChecked: string;
  summary: string;
  blockers: string[];
  recommendedNextAction: string;
  route?: string;
  dataSource?: string;
  maturity?: string;
};

export type HarvesterStatus = {
  id: string;
  name: string;
  source: string;
  enabled: boolean;
  state: 'running' | 'idle' | 'error' | 'unknown' | 'planned' | 'active' | 'paused' | 'run_once' | 'draining' | 'exhausted' | 'needs_review' | 'redirect_pending' | 'failed' | 'retired';
  target?: string;
  schedule?: string;
  lastRun: string;
  nextRun?: string;
  duration?: string;
  rowsProcessed?: number;
  rowsInserted?: number;
  rowsUpdated?: number;
  duplicatesDetected?: number;
  rowsRejected?: number;
  noveltyRate?: number;
  duplicateRate?: number;
  freshness?: string;
  sourceExhaustion?: number;
  recommendation?: string;
  approvalStatus?: string;
  runHistoryEndpoint?: string;
  errors: string[];
  warningCount: number;
  checkpoint?: string;
  runNow: ControlState;
  pauseResume: ControlState;
  changeTarget: ControlState;
  changeSchedule: ControlState;
  retire: ControlState;
  approveRecommendation: ControlState;
  rejectRecommendation: ControlState;
  reassess: ControlState;
  logSummary: string;
};

export type RepositoryStatus = {
  name: string;
  defaultBranch: string;
  latestCommit?: string;
  openPullRequests?: number;
  deploymentTarget: string;
  deployStatus: MissionControlStatus;
  lastDeploy?: string;
  frontendDeployNeeded: boolean;
  backendDeployNeeded: boolean;
  knownBlockers: string[];
};

export type Recommendation = {
  id: string;
  title: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  rationale: string;
  ownerDecisionNeeded: string;
  nextBuild: string;
};

export type RecentActivity = {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
  source: 'live' | 'fallback' | 'planned';
};

export type SafetyBoundary = {
  id: string;
  label: string;
  state: ControlState;
  detail: string;
};

export type GovernanceSummary = {
  build: string;
  status: MissionControlStatus;
  northStar: string;
  missions: MissionRecord[];
  policies: PolicyRecord[];
  decisions: DecisionRecord[];
  questions: GovernanceQuestion[];
};

export type MissionRecord = {
  mission_id?: string;
  mission_key?: string;
  title: string;
  purpose?: string;
  status?: string;
  next_action?: string;
  safe_autonomy_level?: number | string;
};

export type PolicyRecord = {
  policy_id?: string;
  policy_key?: string;
  title: string;
  principle?: string;
  description?: string;
  protected?: boolean;
};

export type DecisionRecord = {
  decision_id?: string;
  action?: string;
  decision?: string;
  status?: string;
  risk_level?: string;
  rationale?: string;
  created_at?: string;
  timestamp?: string;
};

export type GovernanceQuestion = {
  question_id?: string;
  question: string;
  reason?: string;
  status?: string;
  created_at?: string;
  timestamp?: string;
};

export type MissionControlOperations = {
  generatedAt: string;
  dataMode: 'live' | 'mixed' | 'fallback';
  diagnostics: EndpointDiagnostic[];
  globalHealth: ContinuumSubsystem[];
  subsystemRegistry: ContinuumSubsystem[];
  scientificSystems: ContinuumSubsystem[];
  completenessMatrix: ContinuumSubsystem[];
  harvesters: HarvesterStatus[];
  repositories: RepositoryStatus[];
  calyxSelfAudit: {
    summary: string;
    canDo: string[];
    cannotDoYet: string[];
    connectedTools: string[];
    failingServices: string[];
    riskLevel: string;
  };
  recommendations: Recommendation[];
  recentActivity: RecentActivity[];
  safetyBoundaries: SafetyBoundary[];
  governance: GovernanceSummary;
};

const nowIso = () => new Date().toISOString();

function diagnostic(label: string, endpoint: string, status: MissionControlStatus, detail: string): EndpointDiagnostic {
  return { label, endpoint, status, detail, updatedAt: nowIso() };
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('Failed to fetch') || error.message.includes('Load failed')) {
      return `Load failed: ${error.message}. This usually means the backend route is absent, CORS rejected the browser, or the service is unavailable.`;
    }
    return error.message;
  }
  return 'Unknown endpoint failure';
}

async function getJson<T>(baseUrl: string, endpoint: string, label: string): Promise<{ payload?: T; diagnostic: EndpointDiagnostic }> {
  const url = `${baseUrl}${endpoint}`;
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      return {
        diagnostic: diagnostic(label, url, 'error', `HTTP ${response.status} from ${endpoint}`),
      };
    }
    return {
      payload: (await response.json()) as T,
      diagnostic: diagnostic(label, url, 'healthy', 'Endpoint returned JSON.'),
    };
  } catch (error) {
    return {
      diagnostic: diagnostic(label, url, 'error', describeError(error)),
    };
  }
}

const fallbackGlobalHealth: ContinuumSubsystem[] = [
  ['frontend', 'Frontend', 'Experience', 'healthy', 82, 'React/Vite shell renders Mission Control and public site routes.', [], 'Redeploy frontend after BUILD-036 merge.'],
  ['backend', 'Backend', 'Runtime', 'unknown', 45, 'Calyx backend host is configured, but mission-control read endpoints are not confirmed.', ['Mission Control API endpoints may be absent or blocked by CORS.'], 'Add server-owned read endpoints for operations telemetry.'],
  ['database', 'Database', 'Data', 'unknown', 35, 'Frontend cannot verify database health directly without a backend status route.', ['No safe browser-readable DB health endpoint confirmed.'], 'Expose read-only database summary through Calyx backend.'],
  ['brain', 'Brain', 'Intelligence', 'warning', 40, 'Brain repository is registered; live sync/runtime state is not visible here yet.', ['No Brain status endpoint connected to Mission Control.'], 'Create Brain status adapter with no secret exposure.'],
  ['knowledge_graph', 'Knowledge Graph', 'Science', 'stub', 25, 'Graph is a planned science system in the operations center.', ['No graph endpoint or registry feed connected.'], 'Define graph source tables and health model.'],
  ['images_media', 'Images / Media', 'Media', 'warning', 58, 'Image and media harvesters are known systems, with status currently heuristic.', ['Harvester heartbeat not exposed to frontend.'], 'Publish media harvester heartbeat and image quality metrics.'],
  ['harvesters', 'Harvesters', 'Pipelines', 'warning', 42, 'Required harvesters are registered as read-only/planned rows.', ['No safe run-state endpoint confirmed.'], 'Implement GET /api/mission-control/harvesters.'],
  ['runners_jobs', 'Runners / Jobs', 'Runtime', 'unknown', 38, 'Legacy runner probes may return Load failed from the browser.', ['Runner route may be unavailable or CORS-blocked.'], 'Repair runner health endpoint and CORS policy.'],
  ['ai_services', 'AI Services', 'Intelligence', 'stub', 30, 'Calyx executive lane is represented; model/router execution remains outside this frontend.', ['No model router status endpoint.'], 'Expose read-only AI service inventory.'],
  ['github_build', 'GitHub / Build System', 'Delivery', 'warning', 60, 'Repositories and PR/deployment needs are registered as operational data.', ['Live GitHub status requires backend connector support.'], 'Add GitHub-backed repository status route.'],
  ['render_deployment', 'Render / Deployment', 'Delivery', 'unknown', 45, 'Deployment targets are documented; deploy controls are disabled.', ['No Render deployment telemetry route.'], 'Add read-only deployment registry before deploy actions.'],
  ['atlas', 'Atlas', 'Science', 'healthy', 72, 'Atlas routes exist in the frontend and are part of the scientific registry.', [], 'Connect Atlas table completeness to Mission Control.'],
  ['species_pages', 'Species Pages', 'Science', 'warning', 62, 'Species pages exist; dossier completeness remains partial.', ['Trait, literature, conservation, and relationship layers are incomplete.'], 'Publish species dossier completeness metrics.'],
  ['pollinators', 'Pollinator System', 'Science', 'stub', 18, 'Pollinator routes exist but underlying records are not yet fully connected.', ['No pollinator pipeline status endpoint.'], 'Define pollinator data contract.'],
  ['mycorrhiza', 'Mycorrhizal System', 'Science', 'stub', 18, 'Mycorrhizal profiles are present as UI surfaces; data pipeline remains planned.', ['No mycorrhizal source integration status.'], 'Define mycorrhizal source and ingestion plan.'],
  ['literature', 'Literature System', 'Science', 'stub', 15, 'Literature extraction is a planned system.', ['No literature extraction endpoint.'], 'Create literature ingestion and citation pipeline.'],
  ['conservation', 'Conservation System', 'Mission', 'warning', 45, 'Conservation hub exists; operational scoring remains partial.', ['No conservation data freshness telemetry.'], 'Add conservation status enrichment registry.'],
  ['grants', 'Grants / Funding Intelligence', 'Funding', 'stub', 22, 'Funding intelligence is planned for Mission Control.', ['No grants pipeline or deadline feed.'], 'Define grants/funding intelligence workspace.'],
  ['ocu', 'Orchid Continuum University', 'Education', 'warning', 50, 'OCU routes exist; operational curriculum metrics are not wired.', ['No education progress telemetry.'], 'Register OCU learning modules and content gaps.'],
  ['vision_lab', 'Vision Lab', 'Media', 'stub', 20, 'Vision Lab is registered as a future media/intelligence system.', ['No vision pipeline status.'], 'Add image-quality and vision model status.'],
  ['governance', 'Governance / Constitution', 'Governance', 'warning', 64, 'Constitutional objects are preserved and shown when backend endpoints load.', ['Browser probes may currently fail.'], 'Repair constitutional endpoint access and server auth.'],
].map(([id, name, category, status, completeness, summary, blockers, recommendedNextAction]) => ({
  id: String(id),
  name: String(name),
  category: String(category),
  status: status as MissionControlStatus,
  completeness: Number(completeness),
  lastChecked: nowIso(),
  summary: String(summary),
  blockers: blockers as string[],
  recommendedNextAction: String(recommendedNextAction),
}));

const fallbackHarvesters: HarvesterStatus[] = [
  ['inaturalist', 'iNaturalist', 'iNaturalist observations/media'],
  ['gbif', 'GBIF', 'GBIF occurrence backbone'],
  ['world_plants_hassler', 'World Plants / Hassler', 'Taxonomic backbone'],
  ['eol_traitbank', 'EOL / TraitBank', 'Trait records'],
  ['globi', 'GloBI', 'Interaction records'],
  ['pollinator_datasets', 'Pollinator datasets', 'Pollination sources'],
  ['mycorrhizal_data', 'Mycorrhizal literature/data', 'Mycorrhizal sources'],
  ['image_media', 'Image/media harvesters', 'Image/media services'],
  ['literature', 'Literature harvesters', 'Literature and citation sources'],
  ['climate_elevation', 'Climate/elevation enrichment', 'Climate and elevation sources'],
  ['conservation_status', 'Conservation status enrichment', 'Conservation sources'],
].map(([id, name, source]) => ({
  id,
  name,
  source,
  enabled: false,
  state: 'planned',
  lastRun: 'not connected',
  nextRun: 'requires scheduler',
  duration: 'unknown',
  rowsProcessed: 0,
  rowsInserted: 0,
  errors: [],
  warningCount: 1,
  checkpoint: 'not exposed',
  target: 'unknown',
  schedule: 'unknown',
  freshness: 'unknown',
  recommendation: 'backend authorization unavailable',
  approvalStatus: 'requires backend owner authorization',
  runHistoryEndpoint: `/api/harvesters/${id}/runs`,
  runNow: 'requires_owner_authorization',
  pauseResume: 'requires_owner_authorization',
  changeTarget: 'requires_owner_authorization',
  changeSchedule: 'requires_owner_authorization',
  retire: 'requires_owner_authorization',
  approveRecommendation: 'requires_owner_authorization',
  rejectRecommendation: 'requires_owner_authorization',
  reassess: 'requires_owner_authorization',
  logSummary: 'Registered for BUILD-036 visibility; safe backend status endpoint still required.',
}));

const fallbackRepositories: RepositoryStatus[] = [
  {
    name: 'jsp1440/orchid-continuum-frontend',
    defaultBranch: 'main',
    deploymentTarget: 'Frontend hosting',
    deployStatus: 'warning',
    frontendDeployNeeded: true,
    backendDeployNeeded: false,
    knownBlockers: ['BUILD-036 needs frontend redeploy after merge.'],
  },
  {
    name: 'jsp1440/orchid-calyx-backend',
    defaultBranch: 'main',
    deploymentTarget: 'https://orchid-calyx-backend.onrender.com',
    deployStatus: 'unknown',
    frontendDeployNeeded: false,
    backendDeployNeeded: true,
    knownBlockers: ['Mission Control read endpoints are documented but not confirmed in backend code search.'],
  },
  {
    name: 'jsp1440/orchid-continuum-control-panel',
    defaultBranch: 'main',
    deploymentTarget: 'Control panel backend',
    deployStatus: 'unknown',
    frontendDeployNeeded: false,
    backendDeployNeeded: false,
    knownBlockers: ['Separate repo; status should be reported through a backend adapter.'],
  },
  {
    name: 'jsp1440/Orchid-Continuum-Brain',
    defaultBranch: 'main',
    deploymentTarget: 'Brain services',
    deployStatus: 'stub',
    frontendDeployNeeded: false,
    backendDeployNeeded: false,
    knownBlockers: ['No Brain runtime status exposed to this frontend.'],
  },
];

const fallbackScientificSystems: ContinuumSubsystem[] = [
  ['atlas', 'Atlas', '/atlas', 'oc_regions and occurrence APIs', 'operational shell', 72, ['Region completeness not reported.'], 'Add Atlas operational feed.'],
  ['species_explorer', 'Species Explorer', '/species', 'taxonomy, images, occurrences', 'partial', 62, ['Dossier layers incomplete.'], 'Add species completeness scoring.'],
  ['featured_genus', 'Featured Genus', '/', 'daily genus and media APIs', 'partial', 64, ['Freshness signal missing.'], 'Expose daily genus freshness.'],
  ['image_quality', 'Image Quality System', '/diagnostics/daily-genus', 'media resolver and quality checks', 'partial', 55, ['No centralized image QA registry.'], 'Register image QA metrics.'],
  ['knowledge_graph', 'Knowledge Graph', '/knowledge', 'planned graph sources', 'planned', 25, ['Graph data model pending.'], 'Define graph endpoints.'],
  ['pollinators', 'Pollinators', '/pollinators', 'pollinator datasets', 'planned', 18, ['Relationship data source pending.'], 'Create pollinator ingestion contract.'],
  ['mycorrhiza', 'Mycorrhiza', '/mycorrhizae', 'mycorrhizal literature/data', 'planned', 18, ['Relationship data source pending.'], 'Create mycorrhizal ingestion contract.'],
  ['literature_extraction', 'Literature Extraction', '/literature', 'literature pipeline', 'planned', 15, ['Citation extraction absent.'], 'Build literature harvester.'],
  ['conservation_priorities', 'Conservation Priorities', '/conservation', 'conservation datasets', 'partial', 45, ['Status enrichment pending.'], 'Add conservation enrichment.'],
  ['climate_comparison', 'Climate Comparison', '/climate', 'climate/elevation enrichment', 'partial', 42, ['Climate source status unknown.'], 'Add climate status feed.'],
  ['vision_lab', 'Vision Lab', 'planned', 'vision/image AI', 'planned', 20, ['Vision service not connected.'], 'Register Vision Lab services.'],
  ['ocu', 'Orchid Continuum University', '/university', 'education content', 'partial', 50, ['Curriculum telemetry absent.'], 'Register learning modules.'],
  ['grants_funding', 'Grants/Funding', 'planned', 'funding intelligence', 'planned', 22, ['Deadline/source model absent.'], 'Define funding intelligence workspace.'],
  ['society_tools', 'Society/Calyx community tools', '/societies', 'community tooling', 'partial', 35, ['Community operations not wired.'], 'Add society operations registry.'],
].map(([id, name, route, dataSource, maturity, completeness, risks, next]) => ({
  id: String(id),
  name: String(name),
  category: 'Scientific Systems',
  status: Number(completeness) >= 60 ? 'warning' : 'stub',
  completeness: Number(completeness),
  lastChecked: nowIso(),
  summary: `${maturity} system. Data source: ${dataSource}.`,
  blockers: risks as string[],
  recommendedNextAction: String(next),
  route: String(route),
  dataSource: String(dataSource),
  maturity: String(maturity),
}));

const fallbackRecommendations: Recommendation[] = [
  {
    id: 'build-037',
    title: 'Add server-owned Mission Control operations API',
    priority: 'critical',
    rationale: 'BUILD-036 can render the cockpit, but live health, harvesters, repositories, and deployment state need safe backend routes.',
    ownerDecisionNeeded: 'Approve backend BUILD-037 scope for read-only operations endpoints and server-side action authorization.',
    nextBuild: 'BUILD-037',
  },
  {
    id: 'harvester-heartbeat',
    title: 'Expose harvester heartbeat and checkpoints',
    priority: 'high',
    rationale: 'Harvesters are registered but currently shown as planned because run-state telemetry is not available to the frontend.',
    ownerDecisionNeeded: 'Confirm which harvester sources get first-class heartbeat support first.',
    nextBuild: 'BUILD-037',
  },
  {
    id: 'deployment-registry',
    title: 'Connect GitHub/Render deployment registry',
    priority: 'high',
    rationale: 'Deployment buttons remain disabled until backend authorization and deployment status exist.',
    ownerDecisionNeeded: 'Approve read-only GitHub/Render connector integration before action buttons.',
    nextBuild: 'BUILD-037',
  },
];

const fallbackSafety: SafetyBoundary[] = [
  { id: 'frontend_unlock', label: 'Frontend owner unlock', state: 'read_only', detail: 'UI gate only. It is not real security and does not authorize production writes.' },
  { id: 'run_now', label: 'Run-now controls', state: 'requires_owner_authorization', detail: 'Rendered disabled until a server-authorized harvester action API exists.' },
  { id: 'pause_resume', label: 'Pause/resume controls', state: 'requires_owner_authorization', detail: 'Rendered disabled until server-side owner authorization is available.' },
  { id: 'deploy', label: 'Deploy controls', state: 'planned', detail: 'No deploy button is enabled. Deployment must remain explicit and server-authorized.' },
  { id: 'credentials', label: 'Credential management', state: 'disabled', detail: 'No secrets or credentials are exposed in frontend code.' },
  { id: 'production_write', label: 'Production writes', state: 'requires_owner_authorization', detail: 'All real writes require backend authorization and explicit owner approval.' },
];

const fallbackGovernance: GovernanceSummary = {
  build: 'BUILD-036',
  status: 'warning',
  northStar: 'The Orchid Continuum exists to cultivate understanding by revealing relationships.',
  missions: [
    { mission_key: 'build-036', title: 'Mission Control Operations Center', status: 'implemented_frontend', next_action: 'Add backend operations API in BUILD-037.', safe_autonomy_level: 1 },
  ],
  policies: [
    { policy_key: 'owner_authorization', title: 'Owner authorization required', principle: 'Destructive actions, deploys, credential changes, and production writes require server-side owner authorization.', protected: true },
    { policy_key: 'frontend_unlock_is_not_security', title: 'Frontend unlock is only a UI gate', principle: 'The Mission Control access code hides the interface; it is not an authorization layer.', protected: true },
  ],
  decisions: [
    { decision_id: 'build-036-decision', action: 'Expand Mission Control into Calyx master operations center using read-only data first.', status: 'recorded', risk_level: 'low' },
  ],
  questions: [
    { question_id: 'build-037-scope', question: 'Which backend operational endpoints should BUILD-037 prioritize first: harvesters, deployment registry, or repository status?', status: 'open' },
  ],
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function pickString(record: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function pickNumber(record: Record<string, unknown>, keys: string[], fallback: number): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

function pickBoolean(record: Record<string, unknown>, keys: string[], fallback: boolean): boolean {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const text = value.toLowerCase().trim();
      if (['true', 'yes', '1'].includes(text)) return true;
      if (['false', 'no', '0'].includes(text)) return false;
    }
  }
  return fallback;
}

function pickStringArray(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value.map((item) => String(item));
    if (typeof value === 'string' && value.trim()) return [value];
  }
  return [];
}

function firstPayloadArray<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

function normalizeStatus(value: unknown): MissionControlStatus {
  const text = String(value ?? '').toLowerCase().trim();

  if (!text) return 'unknown';

  if (
    /\b(not[_\s-]?ok|broken|error|errored|failed|failing|failure|unhealthy|offline|blocked|degraded|critical|down|unavailable|fatal)\b/.test(text)
  ) {
    return 'error';
  }

  if (/\b(warn|warning|partial|attention|caution|limited)\b/.test(text)) return 'warning';
  if (/\b(stub|planned|todo|not[_\s-]?implemented|placeholder)\b/.test(text)) return 'stub';
  if (/\b(healthy|ok|online|operational|available|ready|success|passing)\b/.test(text)) return 'healthy';

  return 'unknown';
}

function normalizeControlState(value: unknown, fallback: ControlState): ControlState {
  const text = String(value ?? '').toLowerCase().trim();
  if (text === 'read_only' || text === 'readonly' || text === 'read-only') return 'read_only';
  if (text === 'disabled') return 'disabled';
  if (text === 'planned') return 'planned';
  if (text === 'requires_owner_authorization' || text === 'requires-owner-authorization') return 'requires_owner_authorization';
  return fallback;
}

function normalizeSubsystemRecord(value: unknown, index: number): ContinuumSubsystem | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = pickString(record, ['id', 'key', 'slug', 'name'], `subsystem-${index + 1}`);
  const name = pickString(record, ['name', 'title', 'label', 'id'], id);
  const category = pickString(record, ['category', 'group', 'domain', 'type'], 'Live Telemetry');
  const status = normalizeStatus(record.status ?? record.health ?? record.state ?? record.mode);
  const completeness = Math.max(0, Math.min(100, pickNumber(record, ['completeness', 'percentComplete', 'percentage', 'score'], status === 'healthy' ? 75 : 50)));

  return {
    id,
    name,
    category,
    status,
    completeness,
    lastChecked: pickString(record, ['lastChecked', 'updatedAt', 'updated_at', 'timestamp', 'checkedAt'], nowIso()),
    summary: pickString(record, ['summary', 'detail', 'description', 'message'], 'Live subsystem telemetry returned by the backend.'),
    blockers: pickStringArray(record, ['blockers', 'knownBlockers', 'errors', 'risks']),
    recommendedNextAction: pickString(record, ['recommendedNextAction', 'nextAction', 'next_action', 'recommendation'], 'Review live subsystem telemetry.'),
    route: typeof record.route === 'string' ? record.route : undefined,
    dataSource: pickString(record, ['dataSource', 'data_source', 'source'], 'Mission Control backend'),
    maturity: typeof record.maturity === 'string' ? record.maturity : undefined,
  };
}

function normalizeHarvesterRecord(value: unknown, index: number): HarvesterStatus | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = pickString(record, ['id', 'key', 'slug', 'name'], `harvester-${index + 1}`);
  const state = pickString(record, ['state', 'status', 'mode'], 'unknown').toLowerCase();
  const targetRecord = asRecord(record.target);
  const target = targetRecord
    ? `${pickString(targetRecord, ['target_type', 'targetType'], 'target')}: ${pickString(targetRecord, ['target_value', 'targetValue'], 'unknown')}`
    : pickString(record, ['target', 'current_target', 'currentTarget'], 'unknown');
  const rowsProcessed = pickNumber(record, ['rowsProcessed', 'rows_processed', 'rows_examined', 'processed'], 0);
  const duplicatesDetected = pickNumber(record, ['duplicatesDetected', 'duplicates_detected', 'duplicated'], 0);

  return {
    id,
    name: pickString(record, ['name', 'title', 'label', 'id'], id),
    source: pickString(record, ['source', 'provider', 'data_source', 'dataSource'], 'Mission Control backend'),
    enabled: pickBoolean(record, ['enabled', 'active'], false),
    state: ['running', 'idle', 'error', 'unknown', 'planned', 'active', 'paused', 'run_once', 'draining', 'exhausted', 'needs_review', 'redirect_pending', 'failed', 'retired'].includes(state)
      ? (state as HarvesterStatus['state'])
      : normalizeStatus(state) === 'error'
        ? 'error'
        : 'unknown',
    target,
    schedule: pickString(record, ['schedule'], 'unknown'),
    lastRun: pickString(record, ['lastRun', 'last_run', 'heartbeat_at', 'updatedAt', 'updated_at'], 'not connected'),
    nextRun: pickString(record, ['nextRun', 'next_run'], 'unknown'),
    duration: pickString(record, ['duration', 'elapsed'], 'unknown'),
    rowsProcessed,
    rowsInserted: pickNumber(record, ['rowsInserted', 'rows_inserted', 'inserted'], 0),
    rowsUpdated: pickNumber(record, ['rowsUpdated', 'rows_updated', 'updated'], 0),
    duplicatesDetected,
    rowsRejected: pickNumber(record, ['rowsRejected', 'rows_rejected', 'rejected'], 0),
    noveltyRate: pickNumber(record, ['noveltyRate', 'novelty_rate', 'novelty_yield_rate'], 0),
    duplicateRate: rowsProcessed > 0 ? duplicatesDetected / rowsProcessed : pickNumber(record, ['duplicateRate', 'duplicate_rate'], 0),
    freshness: pickString(record, ['freshness'], 'unknown'),
    sourceExhaustion: pickNumber(record, ['sourceExhaustion', 'source_exhaustion', 'source_exhaustion_score'], 0),
    recommendation: pickString(record, ['recommendation', 'current_recommendation'], 'unknown'),
    approvalStatus: pickString(record, ['approvalStatus', 'approval_status', 'required_approval_level'], 'requires backend owner authorization'),
    runHistoryEndpoint: `/api/harvesters/${id}/runs`,
    errors: pickStringArray(record, ['errors', 'failures']),
    warningCount: pickNumber(record, ['warningCount', 'warning_count', 'warnings'], 0),
    checkpoint: pickString(record, ['checkpoint', 'cursor'], 'not exposed'),
    runNow: normalizeControlState(record.runNow ?? record.run_now, 'requires_owner_authorization'),
    pauseResume: normalizeControlState(record.pauseResume ?? record.pause_resume, 'requires_owner_authorization'),
    changeTarget: normalizeControlState(record.changeTarget ?? record.change_target, 'requires_owner_authorization'),
    changeSchedule: normalizeControlState(record.changeSchedule ?? record.change_schedule, 'requires_owner_authorization'),
    retire: normalizeControlState(record.retire, 'requires_owner_authorization'),
    approveRecommendation: normalizeControlState(record.approveRecommendation ?? record.approve_recommendation, 'requires_owner_authorization'),
    rejectRecommendation: normalizeControlState(record.rejectRecommendation ?? record.reject_recommendation, 'requires_owner_authorization'),
    reassess: normalizeControlState(record.reassess, 'requires_owner_authorization'),
    logSummary: pickString(record, ['logSummary', 'log_summary', 'summary', 'detail'], 'Live harvester telemetry returned by the backend.'),
  };
}

function normalizeRepositoryRecord(value: unknown, index: number): RepositoryStatus | null {
  const record = asRecord(value);
  if (!record) return null;
  const name = pickString(record, ['name', 'repository', 'repo'], `repository-${index + 1}`);

  return {
    name,
    defaultBranch: pickString(record, ['defaultBranch', 'default_branch', 'branch'], 'main'),
    latestCommit: pickString(record, ['latestCommit', 'latest_commit', 'commit'], ''),
    openPullRequests: pickNumber(record, ['openPullRequests', 'open_pull_requests', 'open_prs'], 0),
    deploymentTarget: pickString(record, ['deploymentTarget', 'deployment_target', 'target'], 'not configured'),
    deployStatus: normalizeStatus(record.deployStatus ?? record.deploy_status ?? record.status),
    lastDeploy: pickString(record, ['lastDeploy', 'last_deploy', 'deployed_at'], ''),
    frontendDeployNeeded: pickBoolean(record, ['frontendDeployNeeded', 'frontend_deploy_needed'], false),
    backendDeployNeeded: pickBoolean(record, ['backendDeployNeeded', 'backend_deploy_needed'], false),
    knownBlockers: pickStringArray(record, ['knownBlockers', 'known_blockers', 'blockers', 'errors']),
  };
}

function normalizeRecommendationRecord(value: unknown, index: number): Recommendation | null {
  const record = asRecord(value);
  if (!record) return null;
  const priority = pickString(record, ['priority', 'severity'], 'medium').toLowerCase();

  return {
    id: pickString(record, ['id', 'key', 'recommendation_id', 'title'], `recommendation-${index + 1}`),
    title: pickString(record, ['title', 'label'], 'Mission Control recommendation'),
    priority: ['critical', 'high', 'medium', 'low'].includes(priority) ? (priority as Recommendation['priority']) : 'medium',
    rationale: pickString(record, ['rationale', 'summary', 'detail'], 'Review Mission Control telemetry.'),
    ownerDecisionNeeded: pickString(record, ['ownerDecisionNeeded', 'owner_decision_needed', 'decision'], 'Review and decide next action.'),
    nextBuild: pickString(record, ['nextBuild', 'next_build', 'build'], 'TBD'),
  };
}

function readLiveHarvesters(payload: unknown): HarvesterStatus[] {
  return firstPayloadArray<unknown>(payload, ['harvesters', 'items'])
    .map((item, index) => normalizeHarvesterRecord(item, index))
    .filter((item): item is HarvesterStatus => Boolean(item));
}

function readLiveRepositories(payload: unknown): RepositoryStatus[] {
  return firstPayloadArray<unknown>(payload, ['repositories', 'repos', 'items'])
    .map((item, index) => normalizeRepositoryRecord(item, index))
    .filter((item): item is RepositoryStatus => Boolean(item));
}

function readLiveRecommendations(payload: unknown): Recommendation[] {
  return firstPayloadArray<unknown>(payload, ['recommendations', 'items'])
    .map((item, index) => normalizeRecommendationRecord(item, index))
    .filter((item): item is Recommendation => Boolean(item));
}

function readLiveSubsystems(payload: unknown): ContinuumSubsystem[] {
  const raw = firstPayloadArray<unknown>(payload, [
    'subsystems',
    'globalHealth',
    'global_health',
    'systems',
    'registry',
    'items',
    'completenessMatrix',
    'completeness_matrix',
  ]);

  return raw
    .map((item, index) => normalizeSubsystemRecord(item, index))
    .filter((item): item is ContinuumSubsystem => Boolean(item));
}

function withGovernance(statusPayload?: Record<string, unknown>, missionsPayload?: Record<string, unknown>, policiesPayload?: Record<string, unknown>, decisionsPayload?: Record<string, unknown>, questionsPayload?: Record<string, unknown>): GovernanceSummary {
  return {
    build: String(statusPayload?.build ?? fallbackGovernance.build),
    status: normalizeStatus(statusPayload?.status ?? fallbackGovernance.status),
    northStar: String(statusPayload?.north_star ?? fallbackGovernance.northStar),
    missions: asArray<MissionRecord>(missionsPayload?.missions).length ? asArray<MissionRecord>(missionsPayload?.missions) : fallbackGovernance.missions,
    policies: asArray<PolicyRecord>(policiesPayload?.policies).length ? asArray<PolicyRecord>(policiesPayload?.policies) : fallbackGovernance.policies,
    decisions: asArray<DecisionRecord>(decisionsPayload?.decisions).length ? asArray<DecisionRecord>(decisionsPayload?.decisions) : fallbackGovernance.decisions,
    questions: asArray<GovernanceQuestion>(questionsPayload?.questions).length ? asArray<GovernanceQuestion>(questionsPayload?.questions) : fallbackGovernance.questions,
  };
}

export async function fetchMissionControlOperations(): Promise<MissionControlOperations> {
  const [
    statusResult,
    subsystemsResult,
    auditResult,
    harvestersResult,
    repositoriesResult,
    recommendationsResult,
    governanceResult,
    constitutionalStatusResult,
    missionsResult,
    policiesResult,
    decisionsResult,
    questionsResult,
    publicApiResult,
  ] = await Promise.all([
    getJson<Record<string, unknown>>(CALYX_BACKEND_BASE_URL, '/api/mission-control/status', 'Mission Control status'),
    getJson<Record<string, unknown>>(CALYX_BACKEND_BASE_URL, '/api/mission-control/subsystems', 'Subsystem registry'),
    getJson<Record<string, unknown>>(CALYX_BACKEND_BASE_URL, '/api/mission-control/audit', 'Operations audit'),
    getJson<Record<string, unknown>>(CALYX_BACKEND_BASE_URL, '/api/mission-control/harvesters', 'Harvester status'),
    getJson<Record<string, unknown>>(CALYX_BACKEND_BASE_URL, '/api/mission-control/repositories', 'Repository registry'),
    getJson<Record<string, unknown>>(CALYX_BACKEND_BASE_URL, '/api/mission-control/recommendations', 'Calyx recommendations'),
    getJson<Record<string, unknown>>(CALYX_BACKEND_BASE_URL, '/api/mission-control/governance', 'Mission Control governance'),
    getJson<Record<string, unknown>>(CALYX_BACKEND_BASE_URL, '/api/runtime/constitutional/status', 'Constitutional status'),
    getJson<Record<string, unknown>>(CALYX_BACKEND_BASE_URL, '/api/runtime/constitutional/missions', 'Constitutional missions'),
    getJson<Record<string, unknown>>(CALYX_BACKEND_BASE_URL, '/api/runtime/constitutional/policies', 'Constitutional policies'),
    getJson<Record<string, unknown>>(CALYX_BACKEND_BASE_URL, '/api/runtime/constitutional/decision-ledger', 'Decision ledger'),
    getJson<Record<string, unknown>>(CALYX_BACKEND_BASE_URL, '/api/runtime/constitutional/governance-questions', 'Governance questions'),
    getJson<Record<string, unknown>>(BACKEND_BASE_URL, '/health', 'Public API health'),
  ]);

  const diagnostics = [
    statusResult.diagnostic,
    subsystemsResult.diagnostic,
    auditResult.diagnostic,
    harvestersResult.diagnostic,
    repositoriesResult.diagnostic,
    recommendationsResult.diagnostic,
    governanceResult.diagnostic,
    constitutionalStatusResult.diagnostic,
    missionsResult.diagnostic,
    policiesResult.diagnostic,
    decisionsResult.diagnostic,
    questionsResult.diagnostic,
    publicApiResult.diagnostic,
  ];

  const liveCount = diagnostics.filter((item) => item.status === 'healthy').length;
  const liveSubsystems = readLiveSubsystems(subsystemsResult.payload);
  const auditSubsystems = readLiveSubsystems(auditResult.payload);
  const subsystemPayload = liveSubsystems.length ? liveSubsystems : auditSubsystems;
  const liveHarvesters = readLiveHarvesters(harvestersResult.payload);
  const liveRepositories = readLiveRepositories(repositoriesResult.payload);
  const liveRecommendations = readLiveRecommendations(recommendationsResult.payload);
  const dataMode = liveCount === 0 ? 'fallback' : liveCount === diagnostics.length ? 'live' : 'mixed';
  const governance = withGovernance(
    constitutionalStatusResult.payload,
    missionsResult.payload,
    policiesResult.payload,
    decisionsResult.payload,
    questionsResult.payload,
  );

  const fallbackEnhancedGlobalHealth = fallbackGlobalHealth.map((subsystem) => {
    if (subsystem.id === 'frontend') return subsystem;
    if (subsystem.id === 'backend') {
      return {
        ...subsystem,
        status: statusResult.diagnostic.status === 'healthy' ? 'healthy' : subsystem.status,
        completeness: statusResult.diagnostic.status === 'healthy' ? 70 : subsystem.completeness,
        summary: statusResult.diagnostic.status === 'healthy' ? 'Mission Control backend status endpoint returned JSON.' : subsystem.summary,
      };
    }
    if (subsystem.id === 'governance') {
      return {
        ...subsystem,
        status: governance.status === 'healthy' ? 'healthy' : subsystem.status,
        completeness: constitutionalStatusResult.diagnostic.status === 'healthy' ? 72 : subsystem.completeness,
        summary: `${governance.build} governance status: ${governance.status}.`,
      };
    }
    return subsystem;
  });

  const globalHealth = subsystemPayload.length ? subsystemPayload : fallbackEnhancedGlobalHealth;
  const subsystemRegistry = subsystemPayload.length ? subsystemPayload : globalHealth;

  const recentActivity: RecentActivity[] = [
    {
      id: 'build-037-review-fixes',
      label: 'BUILD-037 Mission Control review fixes loaded',
      detail: `Mission Control rendered in ${dataMode} mode with ${liveCount}/${diagnostics.length} live endpoint(s); ${subsystemPayload.length} live subsystem row(s) consumed.`,
      timestamp: nowIso(),
      source: subsystemPayload.length || dataMode !== 'fallback' ? 'live' : 'fallback',
    },
    {
      id: 'build-036-safety',
      label: 'Safety posture preserved',
      detail: 'Run, pause, resume, deploy, credential, and production-write controls are disabled or require server authorization.',
      timestamp: nowIso(),
      source: 'planned',
    },
    ...diagnostics
      .filter((item) => item.status === 'error')
      .slice(0, 5)
      .map((item, index) => ({
        id: `diagnostic-${index}`,
        label: `${item.label} unavailable`,
        detail: item.detail,
        timestamp: item.updatedAt,
        source: 'fallback' as const,
      })),
  ];

  return {
    generatedAt: nowIso(),
    dataMode,
    diagnostics,
    globalHealth,
    subsystemRegistry,
    scientificSystems: fallbackScientificSystems,
    completenessMatrix: [...subsystemRegistry, ...fallbackScientificSystems].sort((a, b) => a.completeness - b.completeness),
    harvesters: liveHarvesters.length ? liveHarvesters : fallbackHarvesters,
    repositories: liveRepositories.length ? liveRepositories : fallbackRepositories,
    calyxSelfAudit: {
      summary: 'Calyx can present the operations center, preserve governance context, explain endpoint failures, consume live subsystem telemetry when available, and recommend the next build. It cannot execute production actions from this frontend.',
      canDo: ['Render Mission Control while endpoints fail', 'Consume live subsystem telemetry before fallback', 'Preserve Constitution and decision ledger visibility', 'Register harvesters and scientific systems', 'Explain safety boundaries and next actions'],
      cannotDoYet: ['Run harvesters', 'Pause or resume jobs', 'Deploy services', 'Read credentials', 'Guarantee live GitHub/Render status without backend routes'],
      connectedTools: ['Frontend routes', 'Calyx backend base URL', 'Public API base URL', 'Mission Control subsystem telemetry when available', 'Constitutional telemetry probes when available'],
      failingServices: diagnostics.filter((item) => item.status === 'error').map((item) => item.label),
      riskLevel: 'low for read-only frontend visibility; high-risk actions remain disabled.',
    },
    recommendations: liveRecommendations.length ? liveRecommendations : fallbackRecommendations,
    recentActivity,
    safetyBoundaries: fallbackSafety,
    governance,
  };
}
