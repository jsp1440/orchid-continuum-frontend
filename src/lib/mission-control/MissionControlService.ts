import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import { grantItems } from '@/lib/missionControlIntelligence';
import {
  fetchMissionControlOperations,
  type MissionControlOperations,
  type Recommendation,
} from '@/lib/missionControlOps';
import { researchInbox } from '@/lib/ownerOperationsConsole';
import type { MissionControlSnapshot } from '@/lib/mission-control/MissionControlTypes';

const EXECUTIVE_STATE_PATH = '/api/executive/state';
const MAX_RECOMMENDATIONS = 12;
const PRIORITY_CRITICAL_SCORE = 0;
const PRIORITY_HIGH_SCORE = 1;
const PRIORITY_MEDIUM_SCORE = 2;
const PRIORITY_LOW_SCORE = 3;

function buildRepositoryRevision(dashboard: MissionControlOperations): string {
  return dashboard.repositories.find((repository) => repository.latestCommit)?.latestCommit ?? 'unknown';
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
  const subsystemDriven = dashboard.globalHealth
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

  const grantDriven = grantItems.slice(0, 1).map((item): Recommendation => ({
    id: `grant-${item.id}`,
    title: `${item.organization}: evidence package readiness`,
    priority: item.priority === 'critical' ? 'critical' : 'high',
    rationale: item.summary,
    ownerDecisionNeeded: item.recommended_action,
    nextBuild: '/mission-control#mission-control-grants',
  }));

  const inboxDriven = researchInbox.slice(0, 1).map((item): Recommendation => ({
    id: `inbox-${item.id}`,
    title: `${item.title}: owner triage`,
    priority: item.status === 'waiting_owner' ? 'high' : 'medium',
    rationale: item.detail,
    ownerDecisionNeeded: item.status === 'waiting_owner' ? 'Pending Owner Approval' : 'Owner review required',
    nextBuild: '/mission-control#mission-control-research-command',
  }));

  return [...dashboard.recommendations, ...subsystemDriven, ...grantDriven, ...inboxDriven]
    .sort((a, b) => recommendationPriorityScore(a.priority) - recommendationPriorityScore(b.priority))
    .slice(0, MAX_RECOMMENDATIONS);
}

function hasLiveExecutiveState(dashboard: MissionControlOperations): boolean {
  const executiveDiagnostic = dashboard.diagnostics.find((diagnostic) => diagnostic.endpoint.includes(EXECUTIVE_STATE_PATH));
  if (executiveDiagnostic) return executiveDiagnostic.status === 'healthy';
  return dashboard.diagnostics.some((diagnostic) => diagnostic.status === 'healthy');
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
