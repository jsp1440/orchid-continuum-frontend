/**
 * backendStatus — a tiny global store describing where the homepage's
 * "Genus of the Day" data currently came from.
 *
 * This powers the curator-facing BackendHealthBanner. It is intentionally
 * framework-free (a Set of listeners) so any component can subscribe via the
 * `useBackendStatus` hook without prop drilling or context wiring.
 *
 *  - 'live'     : backend responded successfully within the 2s threshold.
 *  - 'cache'    : backend timed out / failed but today's localStorage cache
 *                 was available and is being used.
 *  - 'fallback' : neither backend nor cache available — hardcoded fallback.
 */

export type DataSource = 'live' | 'cache' | 'fallback' | 'pending';

export interface BackendStatus {
  source: DataSource;
  /** Epoch ms of the last successful backend response (null if never). */
  lastPingTime: number | null;
  /** Epoch ms the active cache entry was written (null if not from cache). */
  cacheWrittenAt: number | null;
  /** Genus currently being shown. */
  genus: string | null;
}

let state: BackendStatus = {
  source: 'pending',
  lastPingTime: null,
  cacheWrittenAt: null,
  genus: null,
};

const listeners = new Set<() => void>();

export function getBackendStatus(): BackendStatus {
  return state;
}

export function setBackendStatus(patch: Partial<BackendStatus>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribeBackendStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
