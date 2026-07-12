import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { loadMissionControlCache, saveMissionControlCache } from '@/lib/mission-control/MissionControlCache';
import { MissionControlContext } from '@/lib/mission-control/MissionControlContext';
import { fetchMissionControlSnapshot } from '@/lib/mission-control/MissionControlService';
import type { MissionControlContextValue, MissionControlIntegrationMeta } from '@/lib/mission-control/MissionControlTypes';

const DEFAULT_META: MissionControlIntegrationMeta = {
  liveTimestamp: null,
  lastSuccessfulSync: null,
  lastSyncAttempt: null,
  backendAvailable: false,
  sourceEndpoint: 'unavailable',
  usingCachedData: false,
  apiVersion: 'unknown',
  repositoryRevision: 'unknown',
  frontendBuildNumber: typeof import.meta.env.VITE_BUILD_NUMBER === 'string' && import.meta.env.VITE_BUILD_NUMBER.trim().length
    ? import.meta.env.VITE_BUILD_NUMBER
    : 'dev',
};

type MissionControlProviderProps = {
  children: React.ReactNode;
  enabled?: boolean;
  refreshIntervalMs?: number;
};

export function MissionControlProvider({ children, enabled = true, refreshIntervalMs = 60_000 }: MissionControlProviderProps) {
  const cached = useMemo(() => loadMissionControlCache(), []);
  const [status, setStatus] = useState<MissionControlContextValue['status']>(cached ? 'ready' : 'idle');
  const [data, setData] = useState<MissionControlContextValue['data']>(cached?.dashboard ?? null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<MissionControlIntegrationMeta>({
    ...DEFAULT_META,
    lastSuccessfulSync: cached?.lastSuccessfulSync ?? null,
    sourceEndpoint: cached?.sourceEndpoint ?? DEFAULT_META.sourceEndpoint,
    apiVersion: cached?.apiVersion ?? DEFAULT_META.apiVersion,
    repositoryRevision: cached?.repositoryRevision ?? DEFAULT_META.repositoryRevision,
    usingCachedData: Boolean(cached),
  });

  const refresh = useCallback(async () => {
    setStatus('loading');
    const syncAttempt = new Date().toISOString();
    setMeta((previous) => ({ ...previous, lastSyncAttempt: syncAttempt }));
    setError(null);

    try {
      const snapshot = await fetchMissionControlSnapshot();

      if (snapshot.backendAvailable) {
        setData(snapshot.dashboard);
        setStatus('ready');
        setMeta((previous) => ({
          ...previous,
          liveTimestamp: snapshot.fetchedAt,
          lastSuccessfulSync: snapshot.fetchedAt,
          backendAvailable: true,
          sourceEndpoint: snapshot.sourceEndpoint,
          usingCachedData: false,
          apiVersion: snapshot.apiVersion,
          repositoryRevision: snapshot.repositoryRevision,
          lastSyncAttempt: syncAttempt,
        }));
        saveMissionControlCache({
          dashboard: snapshot.dashboard,
          lastSuccessfulSync: snapshot.fetchedAt,
          sourceEndpoint: snapshot.sourceEndpoint,
          apiVersion: snapshot.apiVersion,
          repositoryRevision: snapshot.repositoryRevision,
        });
        return;
      }

      const fallbackCache = loadMissionControlCache();
      if (fallbackCache) {
        setData(fallbackCache.dashboard);
        setStatus('ready');
        setMeta((previous) => ({
          ...previous,
          liveTimestamp: snapshot.fetchedAt,
          lastSuccessfulSync: fallbackCache.lastSuccessfulSync,
          backendAvailable: false,
          sourceEndpoint: snapshot.sourceEndpoint,
          usingCachedData: true,
          apiVersion: fallbackCache.apiVersion,
          repositoryRevision: fallbackCache.repositoryRevision,
          lastSyncAttempt: syncAttempt,
        }));
        return;
      }

      setData(snapshot.dashboard);
      setStatus('ready');
      setMeta((previous) => ({
        ...previous,
        liveTimestamp: snapshot.fetchedAt,
        backendAvailable: false,
        sourceEndpoint: snapshot.sourceEndpoint,
        usingCachedData: false,
        apiVersion: snapshot.apiVersion,
        repositoryRevision: snapshot.repositoryRevision,
        lastSyncAttempt: syncAttempt,
      }));
    } catch (loadError) {
      const fallbackCache = loadMissionControlCache();
      if (fallbackCache) {
        setData(fallbackCache.dashboard);
        setStatus('ready');
        setMeta((previous) => ({
          ...previous,
          backendAvailable: false,
          usingCachedData: true,
          lastSuccessfulSync: fallbackCache.lastSuccessfulSync,
          sourceEndpoint: fallbackCache.sourceEndpoint,
          apiVersion: fallbackCache.apiVersion,
          repositoryRevision: fallbackCache.repositoryRevision,
          lastSyncAttempt: syncAttempt,
        }));
      } else {
        setStatus('error');
      }
      setError(loadError instanceof Error ? loadError.message : 'Mission Control live integration failed');
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, refresh, refreshIntervalMs]);

  const value = useMemo<MissionControlContextValue>(
    () => ({ status, data, error, meta, refresh }),
    [status, data, error, meta, refresh],
  );

  return <MissionControlContext.Provider value={value}>{children}</MissionControlContext.Provider>;
}
