import type { SubsystemCacheEntry } from './types'

const CACHE_KEY_PREFIX = 'oc_sci_intel_cache_v1_'

export function loadSubsystemCache<T>(subsystemId: string): SubsystemCacheEntry<T> | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${subsystemId}`)
    if (!raw) return null
    return JSON.parse(raw) as SubsystemCacheEntry<T>
  } catch {
    return null
  }
}

export function saveSubsystemCache<T>(subsystemId: string, entry: SubsystemCacheEntry<T>): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(`${CACHE_KEY_PREFIX}${subsystemId}`, JSON.stringify(entry))
  } catch {
    // Non-fatal — cache is best-effort
  }
}
