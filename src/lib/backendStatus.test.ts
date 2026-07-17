import { describe, it, expect, beforeEach } from 'vitest';
import {
  getBackendStatus,
  setBackendStatus,
  subscribeBackendStatus,
} from '@/lib/backendStatus';

describe('backendStatus', () => {
  beforeEach(() => {
    // Reset to initial state between tests
    setBackendStatus({ source: 'pending', lastPingTime: null, cacheWrittenAt: null, genus: null });
  });

  it('starts with source "pending"', () => {
    setBackendStatus({ source: 'pending' });
    expect(getBackendStatus().source).toBe('pending');
  });

  it('accepts all valid DataSource values including proxy and inaturalist', () => {
    const sources = ['live', 'cache', 'fallback', 'proxy', 'inaturalist', 'pending'] as const;
    for (const source of sources) {
      setBackendStatus({ source });
      expect(getBackendStatus().source).toBe(source);
    }
  });

  it('notifies subscribers on update', () => {
    let calls = 0;
    const unsub = subscribeBackendStatus(() => { calls += 1; });
    setBackendStatus({ source: 'live' });
    setBackendStatus({ source: 'inaturalist' });
    unsub();
    expect(calls).toBe(2);
  });

  it('stops notifying after unsubscribe', () => {
    let calls = 0;
    const unsub = subscribeBackendStatus(() => { calls += 1; });
    setBackendStatus({ source: 'live' });
    unsub();
    setBackendStatus({ source: 'cache' });
    // only the first update should have been counted
    expect(calls).toBe(1);
  });

  it('setting source to "inaturalist" does not cause BackendHealthBanner to crash (META coverage)', () => {
    // This regression test verifies that the DataSource type includes 'inaturalist'
    // so that BackendHealthBanner.META[status.source] is never undefined.
    setBackendStatus({ source: 'inaturalist', genus: 'Dracula' });
    const status = getBackendStatus();
    expect(status.source).toBe('inaturalist');
    expect(status.genus).toBe('Dracula');

    const META: Record<string, { dot: string; label: string }> = {
      live: { dot: '#22c55e', label: 'Live data' },
      cache: { dot: '#f59e0b', label: 'Cached data' },
      fallback: { dot: '#ef4444', label: 'Fallback mode' },
      pending: { dot: '#a8a29e', label: 'Connecting…' },
      proxy: { dot: '#60a5fa', label: 'Proxy data' },
      inaturalist: { dot: '#84cc16', label: 'iNaturalist data' },
    };
    // This must not be undefined — previously the white-screen root cause
    expect(META[status.source]).toBeDefined();
    expect(META[status.source].dot).toBeTruthy();
  });
});
