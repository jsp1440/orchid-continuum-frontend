import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('VisionAdapter', () => {
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

  it('returns live intelligence from image backend response', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ globalHealth: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          images: [{}, {}, {}],
          taxa_with_images: 45,
          taxa_missing_images: 12,
          quality_score: 0.72,
        }),
      }))

    const { fetchVisionIntelligence } = await import('./adapter')
    const result = await fetchVisionIntelligence()

    expect(result.subsystemId).toBe('vision')
    expect(result.taxaWithImages).toBe(45)
    expect(result.taxaMissingImages).toBe(12)
    expect(result.qualityScore).toBe(0.72)
    expect(result.connectionState).toBe('connected')
    expect(result.mode).not.toBe('fallback')
    expect(result.provenance[0].endpoint).toBeTruthy()
    expect(result.provenance[0].timestamp).toBeTruthy()
  })

  it('returns fallback when image backend fails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ globalHealth: [] }) })
      .mockRejectedValueOnce(new Error('Image backend down')))

    const { fetchVisionIntelligence } = await import('./adapter')
    const result = await fetchVisionIntelligence()

    expect(result.mode).toBe('fallback')
    expect(result.mode).not.toBe('live')
  })

  it('handles null response without crashing', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => null }))

    const { fetchVisionIntelligence } = await import('./adapter')
    await expect(fetchVisionIntelligence()).resolves.toBeDefined()
  })

  it('preserves cached data after failure', async () => {
    const cachedData = { subsystemId: 'vision', totalMedia: 5000, taxaWithImages: 120, mode: 'cached', connectionState: 'connected', endpoint: 'x', timestamp: new Date().toISOString() }
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ data: cachedData, retrievedAt: cachedData.timestamp, endpoint: 'x', dataAge: 1000, mode: 'cached' }),
      setItem: () => undefined,
      removeItem: () => undefined,
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))
    const { fetchVisionIntelligence } = await import('./adapter')
    const result = await fetchVisionIntelligence()
    expect(result.totalMedia).toBe(5000)
    expect(result.mode).toBe('fallback')
  })

  it('mode is never live when data is from fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))
    const { fetchVisionIntelligence } = await import('./adapter')
    const result = await fetchVisionIntelligence()
    expect(result.mode).not.toBe('live')
  })
})
