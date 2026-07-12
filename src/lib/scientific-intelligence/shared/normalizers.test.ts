import { describe, it, expect } from 'vitest'
import {
  safeArray,
  safeString,
  safeNumber,
  safeDate,
  safeRecord,
  computeDataAge,
  dataModeFromAge,
} from './normalizers'

describe('safeArray', () => {
  it('returns a direct array unchanged', () => {
    expect(safeArray([1, 2, 3])).toEqual([1, 2, 3])
  })

  it('unwraps { items } wrapper', () => {
    expect(safeArray({ items: ['a', 'b'] })).toEqual(['a', 'b'])
  })

  it('unwraps { data } wrapper', () => {
    expect(safeArray({ data: [1, 2] })).toEqual([1, 2])
  })

  it('unwraps { results } wrapper', () => {
    expect(safeArray({ results: ['x'] })).toEqual(['x'])
  })

  it('returns [] for null', () => {
    expect(safeArray(null)).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(safeArray(undefined)).toEqual([])
  })

  it('returns [] for a scalar string', () => {
    expect(safeArray('hello')).toEqual([])
  })

  it('returns [] for a number', () => {
    expect(safeArray(42)).toEqual([])
  })

  it('returns [] for a plain object with no known wrapper key', () => {
    expect(safeArray({ foo: 'bar' })).toEqual([])
  })

  it('returns [] for an empty object', () => {
    expect(safeArray({})).toEqual([])
  })

  it('returns an empty array for an empty array input', () => {
    expect(safeArray([])).toEqual([])
  })

  it('handles nested object that looks like a wrapper but has a non-array value', () => {
    expect(safeArray({ items: 'not-array' })).toEqual([])
  })
})

describe('safeString', () => {
  it('returns string as-is', () => {
    expect(safeString('hello')).toBe('hello')
  })

  it('returns fallback for null', () => {
    expect(safeString(null)).toBe('')
    expect(safeString(null, 'default')).toBe('default')
  })

  it('returns fallback for undefined', () => {
    expect(safeString(undefined, 'x')).toBe('x')
  })

  it('coerces number to string', () => {
    expect(safeString(42)).toBe('42')
  })

  it('coerces boolean to string', () => {
    expect(safeString(true)).toBe('true')
  })
})

describe('safeNumber', () => {
  it('returns number as-is', () => {
    expect(safeNumber(42)).toBe(42)
  })

  it('returns fallback for NaN', () => {
    expect(safeNumber(NaN)).toBe(0)
  })

  it('parses a numeric string', () => {
    expect(safeNumber('123')).toBe(123)
    expect(safeNumber('3.14')).toBe(3.14)
  })

  it('returns fallback for non-numeric string', () => {
    expect(safeNumber('abc', -1)).toBe(-1)
  })

  it('returns fallback for null', () => {
    expect(safeNumber(null, 5)).toBe(5)
  })

  it('returns fallback for undefined', () => {
    expect(safeNumber(undefined, 99)).toBe(99)
  })

  it('returns 0 for missing value with default fallback', () => {
    expect(safeNumber(null)).toBe(0)
  })
})

describe('safeDate', () => {
  it('returns ISO string for valid date string', () => {
    const result = safeDate('2024-01-15T12:00:00Z')
    expect(result).not.toBeNull()
    expect(typeof result).toBe('string')
    expect(result).toContain('2024-01-15')
  })

  it('returns null for null', () => {
    expect(safeDate(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(safeDate(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(safeDate('')).toBeNull()
  })

  it('returns null for invalid date string', () => {
    expect(safeDate('not-a-date')).toBeNull()
  })

  it('coerces a number to a date', () => {
    const ts = Date.now()
    const result = safeDate(ts)
    expect(result).not.toBeNull()
  })
})

describe('safeRecord', () => {
  it('returns object as-is', () => {
    const obj = { a: 1, b: 'x' }
    expect(safeRecord(obj)).toEqual(obj)
  })

  it('returns {} for null', () => {
    expect(safeRecord(null)).toEqual({})
  })

  it('returns {} for undefined', () => {
    expect(safeRecord(undefined)).toEqual({})
  })

  it('returns {} for an array', () => {
    expect(safeRecord([1, 2, 3])).toEqual({})
  })

  it('returns {} for a string', () => {
    expect(safeRecord('hello')).toEqual({})
  })

  it('returns {} for a number', () => {
    expect(safeRecord(42)).toEqual({})
  })
})

describe('computeDataAge', () => {
  it('returns a positive number for a past timestamp', () => {
    const past = new Date(Date.now() - 60000).toISOString()
    const age = computeDataAge(past)
    expect(age).toBeGreaterThan(0)
    expect(age).toBeLessThan(120000)
  })

  it('returns Infinity for null', () => {
    expect(computeDataAge(null)).toBe(Infinity)
  })

  it('returns Infinity for empty string', () => {
    expect(computeDataAge('')).toBe(Infinity)
  })

  it('returns Infinity for an invalid timestamp', () => {
    expect(computeDataAge('not-a-date')).toBe(Infinity)
  })
})

describe('dataModeFromAge', () => {
  it('returns live for fresh data under 5 minutes', () => {
    expect(dataModeFromAge(60000, false, true)).toBe('live')
  })

  it('returns cached for data between 5 minutes and 24 hours', () => {
    expect(dataModeFromAge(10 * 60 * 1000, false, true)).toBe('cached')
  })

  it('returns stale for data older than 24 hours', () => {
    expect(dataModeFromAge(25 * 60 * 60 * 1000, false, true)).toBe('stale')
  })

  it('returns fallback when hasError=true and hasData=true', () => {
    expect(dataModeFromAge(1000, true, true)).toBe('fallback')
  })

  it('returns error when hasError=true and hasData=false', () => {
    expect(dataModeFromAge(1000, true, false)).toBe('error')
  })

  it('returns unavailable when no data', () => {
    expect(dataModeFromAge(1000, false, false)).toBe('unavailable')
  })
})
