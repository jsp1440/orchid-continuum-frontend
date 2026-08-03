import { afterEach, describe, expect, it, vi } from 'vitest';
import { universityApi } from './universityApi';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('universityApi', () => {
  it('loads capability metadata without inventing enabled state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          enabled: false,
          session_writes_enabled: false,
          persistence: 'process_local_memory',
          publication_enabled: false,
          candidate_knowledge_writes_enabled: false,
          calyx_model_calls_enabled: false,
        }),
      }),
    );

    const capability = await universityApi.capability();
    expect(capability.enabled).toBe(false);
    expect(capability.publication_enabled).toBe(false);
    expect(capability.candidate_knowledge_writes_enabled).toBe(false);
  });

  it('surfaces HTTP failures rather than substituting fixture data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    await expect(universityApi.catalog()).rejects.toThrow(
      'University API request failed (404)',
    );
  });
});
