import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import { grantItems, loadIntelligenceStore } from '@/lib/missionControlIntelligence';
import {
  fetchMissionControlOperations,
  type ContinuumSubsystem,
  type EndpointDiagnostic,
  type MissionControlOperations,
  type Recommendation,
  type RepositoryStatus,
} from '@/lib/missionControlOps';
import { researchInbox } from '@/lib/ownerOperationsConsole';
import type { MissionControlSnapshot } from '@/lib/mission-control/MissionControlTypes';

const EXECUTIVE_STATE_PATH = '/api/executive/state';
const MAX_RECOMMENDATIONS = 12;
const PRIORITY_CRITICAL_SCORE = 0;
const PRIORITY_HIGH_SCORE = 1;
const PRIORITY_MEDIUM_SCORE = 2;
const PRIORITY_LOW_SCORE = 3;

/**
 * Safely coerce any backend value into a typed array.
 * Supports direct arrays, { items }, { data }, { results } wrappers, and
 * falls back to an empty array for null / undefined / non-array scalars.
 * This prevents `.slice / .map / .filter / .find / .some is not a function`
 * runtime errors when the backend returns an unexpected shape.
 */
function safeArr<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['items', 'data', 'results']) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
}

function buildRepositoryRevision(dashboard: MissionControlOperations): string {
  return safeArr<RepositoryStatus>(dashboard.repositories)
    .find((repository) => repository.latestCommit)?.latestCommit ?? 'unknown';
}

function resolveApiVersion(): string {
  const envVersion = import.meta.env.VITE_API_VERSION;
  return typeof envVersion === 'string' && envVersion.trim().length ? envVersion : 'unknown';
}

function recommendationPriorityScore(priority: Recommendation['priority']): number {
  if (priority === 'critical') return PRIORITY_CRITICAL_SCORE;
  if (priority === 'high') return PRIORITY_HIGH_SCORE;
  if (priority === 'medium') return PRIORITY_MEDIUM_SCORE;
  return PRIORITY_LOW_SCORE;
}

function mergeLiveRecommendations(dashboard: MissionControlOperations): Recommendation[] {
  const subsystemDriven = safeArr<ContinuumSubsystem>(dashboard.globalHealth)
    .filter((item) => item.status === 'critical' || item.status === 'error' || item.status === 'warning')
    .slice(0, 4)
    .map((item): Recommendation => ({
      id: `subsystem-${item.id}`,
      title: `${item.name}: ${item.status === 'warning' ? 'Needs attention' : 'Critical follow-up'}`,
      priority: item.status === 'warning' ? 'high' : 'critical',
      rationale: item.summary,
      ownerDecisionNeeded: item.recommendedNextAction,
      nextBuild: item.route ?? '/mission-control',
    }));

  // grantItems is a filter function — call it with loaded intelligence items.
  // Prior to BUILD-059A this was incorrectly used as `grantItems.slice(0,1)`,
  // treating the function reference as an array and causing the production
  // runtime error: "Ju.slice is not a function".
  const loadedGrantItems = grantItems(loadIntelligenceStore().intelligenceItems);
  const grantDriven = safeArr(loadedGrantItems).slice(0, 1).map((item): Recommendation => ({
    id: `grant-${item.id}`,
    title: `${item.organization ?? item.title}: evidence package readiness`,
    priority: item.priority === 'critical' ? 'critical' : 'high',
    rationale: item.summary,
    ownerDecisionNeeded: item.recommended_action,
    nextBuild: '/mission-control#mission-control-grants',
  }));

  const inboxDriven = safeArr(researchInbox).slice(0, 1).map((item): Recommendation => ({
    id: `inbox-${item.id}`,
    title: `${item.title}: owner triage`,
    priority: item.status === 'waiting_owner' ? 'high' : 'medium',
    rationale: item.detail,
    ownerDecisionNeeded: item.status === 'waiting_owner' ? 'Pending Owner Approval' : 'Owner review required',
    nextBuild: '/mission-control#mission-control-research-command',
  }));

  return [
    ...safeArr<Recommendation>(dashboard.recommendations),
    ...subsystemDriven,
    ...grantDriven,
    ...inboxDriven,
  ]
    .sort((a, b) => recommendationPriorityScore(a.priority) - recommendationPriorityScore(b.priority))
    .slice(0, MAX_RECOMMENDATIONS);
}

function hasLiveExecutiveState(dashboard: MissionControlOperations): boolean {
  const diagnostics = safeArr<EndpointDiagnostic>(dashboard.diagnostics);
  const executiveDiagnostic = diagnostics.find((diagnostic) => diagnostic.endpoint.includes(EXECUTIVE_STATE_PATH));
  if (executiveDiagnostic) return executiveDiagnostic.status === 'healthy';
  return diagnostics.some((diagnostic) => diagnostic.status === 'healthy');
}

function withLiveRecommendationEngine(dashboard: MissionControlOperations): MissionControlOperations {
  return {
    ...dashboard,
    recommendations: mergeLiveRecommendations(dashboard),
  };
}

export async function fetchMissionControlSnapshot(): Promise<MissionControlSnapshot> {
  const fetchedAt = new Date().toISOString();
  const dashboard = withLiveRecommendationEngine(await fetchMissionControlOperations());
  const backendAvailable = hasLiveExecutiveState(dashboard);

  return {
    dashboard,
    fetchedAt,
    backendAvailable,
    sourceEndpoint: `${CALYX_BACKEND_BASE_URL}${EXECUTIVE_STATE_PATH}`,
    apiVersion: resolveApiVersion(),
    repositoryRevision: buildRepositoryRevision(dashboard),
  };
}
