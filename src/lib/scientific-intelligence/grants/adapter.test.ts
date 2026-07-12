import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('GrantsAdapter', () => {
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

  it('returns unavailable when no grant items in store', async () => {
    const { fetchGrantsIntelligence } = await import('./adapter')
    const result = await fetchGrantsIntelligence()

    expect(result.subsystemId).toBe('grants')
    expect(result.activeOpportunities).toBe(0)
    expect(['unavailable', 'fallback']).toContain(result.mode)
  })

  it('returns intelligence from loaded grant items', async () => {
    const grantItem = {
      id: 'grant-1',
      title: 'NSF Systematics Grant',
      summary: 'NSF grant for systematics research',
      source: 'Daily Brief',
      source_date: '2024-01-01',
      category: ['Funding', 'Grant'],
      priority: 'high',
      status: 'new',
      deadline_date: '2025-06-01',
      funding_amount: '$150,000',
      organization: 'NSF',
      recommended_action: 'Prepare application',
      owner: '',
      notes: '',
      source_excerpt: '',
      application_progress: 20,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (key === 'oc_mission_control_intelligence_v1') {
          return JSON.stringify({ intelligenceItems: [grantItem], sourceBriefings: [] })
        }
        return null
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    })

    const { fetchGrantsIntelligence } = await import('./adapter')
    const result = await fetchGrantsIntelligence()

    expect(result.subsystemId).toBe('grants')
    expect(result.activeOpportunities).toBe(1)
    expect(result.opportunities).toHaveLength(1)
    expect(result.opportunities[0].title).toBe('NSF Systematics Grant')
    expect(result.provenance[0].endpoint).toContain('localStorage')
    expect(result.provenance[0].timestamp).toBeTruthy()
  })

  it('does not crash on malformed store data', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => 'not-valid-json{{{',
      setItem: () => undefined,
      removeItem: () => undefined,
    })

    const { fetchGrantsIntelligence } = await import('./adapter')
    await expect(fetchGrantsIntelligence()).resolves.toBeDefined()
  })

  it('mode is never live when data is from fallback', async () => {
    const { fetchGrantsIntelligence } = await import('./adapter')
    const result = await fetchGrantsIntelligence()
    expect(result.mode).not.toBe('live')
  })

  it('preserves cached data when store is empty', async () => {
    const cachedData = {
      subsystemId: 'grants',
      activeOpportunities: 3,
      mode: 'cached',
      connectionState: 'connected',
      endpoint: 'localStorage:oc_mission_control_intelligence_v1',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      dataAge: 3600000,
    }

    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (key === 'oc_sci_intel_cache_v1_grants') {
          return JSON.stringify({ data: cachedData, retrievedAt: cachedData.timestamp, endpoint: cachedData.endpoint, dataAge: 3600000, mode: 'cached' })
        }
        return null
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    })

    const { fetchGrantsIntelligence } = await import('./adapter')
    const result = await fetchGrantsIntelligence()

    expect(result.activeOpportunities).toBe(3)
    expect(['cached', 'fallback']).toContain(result.mode)
  })
})
