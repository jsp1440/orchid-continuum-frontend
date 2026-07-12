import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('AtlasAdapter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns live intelligence from atlas occurrences response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        total: 45000,
        acceptedTaxa: 1200,
        countries: 38,
        missingCoordinates: 320,
        duplicates: 45,
      }),
    }))

    const { fetchAtlasIntelligence } = await import('./adapter')
    const result = await fetchAtlasIntelligence()

    expect(result.subsystemId).toBe('atlas')
    expect(result.occurrenceCount).toBe(45000)
    expect(result.acceptedTaxa).toBe(1200)
    expect(result.countriesRepresented).toBe(38)
    expect(result.missingCoordinates).toBe(320)
    expect(result.connectionState).toBe('connected')
    expect(result.mode).not.toBe('fallback')
    expect(result.provenance[0].endpoint).toBeTruthy()
    expect(result.provenance[0].timestamp).toBeTruthy()
  })

  it('returns fallback mode on backend error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const { fetchAtlasIntelligence } = await import('./adapter')
    const result = await fetchAtlasIntelligence()

    expect(result.mode).toBe('fallback')
    expect(result.connectionState).toBe('fallback')
    expect(result.mode).not.toBe('live')
  })

  it('handles null/malformed response without crashing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => null,
    }))

    const { fetchAtlasIntelligence } = await import('./adapter')
    await expect(fetchAtlasIntelligence()).resolves.toBeDefined()
  })

  it('handles empty array response gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    }))

    const { fetchAtlasIntelligence } = await import('./adapter')
    const result = await fetchAtlasIntelligence()
    expect(result.occurrenceCount).toBe(0)
  })

  it('preserves cached data after failure', async () => {
    const cachedData = {
      subsystemId: 'atlas',
      occurrenceCount: 50000,
      mode: 'cached',
      connectionState: 'connected',
      endpoint: 'https://cached.example.com',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    }

    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ data: cachedData, retrievedAt: cachedData.timestamp, endpoint: cachedData.endpoint, dataAge: 3600000, mode: 'cached' }),
      setItem: () => undefined,
      removeItem: () => undefined,
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))

    const { fetchAtlasIntelligence } = await import('./adapter')
    const result = await fetchAtlasIntelligence()

    expect(result.occurrenceCount).toBe(50000)
    expect(result.mode).toBe('fallback')
  })

  it('mode is never live when data is from fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))
    const { fetchAtlasIntelligence } = await import('./adapter')
    const result = await fetchAtlasIntelligence()
    expect(result.mode).not.toBe('live')
  })
})
