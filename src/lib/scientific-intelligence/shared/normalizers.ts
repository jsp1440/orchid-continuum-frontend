import type { DataMode } from './types'

export function safeArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['items', 'data', 'results']) {
      if (Array.isArray(record[key])) return record[key] as T[]
    }
  }
  return []
}

export function safeString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return fallback
  return String(value)
}

export function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return fallback
}

export function safeDate(value: unknown): string | null {
  if (!value) return null
  const d = typeof value === 'number' ? new Date(value) : new Date(typeof value === 'string' ? value : String(value))
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function safeRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

export function computeDataAge(timestamp: string | null): number {
  if (!timestamp) return Infinity
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return Infinity
  return Date.now() - parsed.getTime()
}

const FIVE_MINUTES_MS = 5 * 60 * 1000
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export function dataModeFromAge(ageMs: number, hasError: boolean, hasData: boolean): DataMode {
  if (hasError) return hasData ? 'fallback' : 'error'
  if (!hasData) return 'unavailable'
  if (ageMs < FIVE_MINUTES_MS) return 'live'
  if (ageMs < TWENTY_FOUR_HOURS_MS) return 'cached'
  return 'stale'
}
