import type { MissionControlOperations, MissionControlStatus } from '@/lib/missionControlOps';

export type MissionControlCardState = 'healthy' | 'warning' | 'critical' | 'offline' | 'loading' | 'stale';

export type MissionControlProviderStatus = 'idle' | 'loading' | 'ready' | 'error';

export type MissionControlIntegrationMeta = {
  liveTimestamp: string | null;
  lastSuccessfulSync: string | null;
  lastSyncAttempt: string | null;
  backendAvailable: boolean;
  sourceEndpoint: string;
  usingCachedData: boolean;
  apiVersion: string;
  repositoryRevision: string;
  frontendBuildNumber: string;
};

export type MissionControlSnapshot = {
  dashboard: MissionControlOperations;
  fetchedAt: string;
  backendAvailable: boolean;
  sourceEndpoint: string;
  apiVersion: string;
  repositoryRevision: string;
};

export type MissionControlContextValue = {
  status: MissionControlProviderStatus;
  data: MissionControlOperations | null;
  error: string | null;
  meta: MissionControlIntegrationMeta;
  refresh: () => Promise<void>;
};

export function missionStatusToCardState(status: MissionControlStatus, stale = false): MissionControlCardState {
  if (stale) return 'stale';
  if (status === 'stale') return 'stale';
  if (status === 'healthy') return 'healthy';
  if (status === 'warning') return 'warning';
  if (status === 'critical' || status === 'error') return 'critical';
  if (status === 'loading') return 'loading';
  return 'offline';
}
