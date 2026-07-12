import type { MissionControlOperations } from '@/lib/missionControlOps';

export type CachedMissionControlData = {
  dashboard: MissionControlOperations;
  lastSuccessfulSync: string;
  sourceEndpoint: string;
  apiVersion: string;
  repositoryRevision: string;
};

const MISSION_CONTROL_CACHE_KEY = 'oc_mission_control_live_cache_v1';

export function loadMissionControlCache(): CachedMissionControlData | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(MISSION_CONTROL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedMissionControlData;
    if (!parsed?.dashboard || !parsed?.lastSuccessfulSync) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveMissionControlCache(value: CachedMissionControlData): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(MISSION_CONTROL_CACHE_KEY, JSON.stringify(value));
  } catch {
    // Cache writes should never break Mission Control rendering.
  }
}
