import { describe, expect, it } from 'vitest';

import { providerPresentation } from './providerMode';

const fallbackBase = {
  mode: 'deterministic-governed',
  generative_configured: false,
  model: 'calyx-governed-summary-v1',
  endpoint_configured: false,
  live_acceptance_verified: false,
  fallback_mode: 'deterministic-governed',
};

const generativeBase = {
  mode: 'openai-compatible',
  generative_configured: true,
  model: 'scientific-model-v1',
  endpoint_configured: true,
  live_acceptance_verified: false,
  fallback_mode: 'deterministic-governed',
};

describe('Calyx provider mode presentation', () => {
  it('labels an active deterministic provider as fallback even when stale generative flags remain', () => {
    const presentation = providerPresentation({
      ...fallbackBase,
      generative_configured: true,
      live_acceptance_verified: true,
      endpoint_configured: true,
    });

    expect(presentation.state).toBe('deterministic_fallback');
    expect(presentation.label).toContain('Governed fallback');
    expect(presentation.detail).toContain('active reply provider');
  });

  it('distinguishes configured generative mode from accepted generative mode', () => {
    const pending = providerPresentation(generativeBase);
    const accepted = providerPresentation({ ...generativeBase, live_acceptance_verified: true });

    expect(pending.state).toBe('acceptance_pending');
    expect(pending.detail).toContain('not been verified');
    expect(accepted.state).toBe('accepted_generative');
    expect(accepted.label).toBe('Generative Calyx · scientific-model-v1');
  });

  it('fails closed for unknown or internally inconsistent active modes', () => {
    expect(providerPresentation({ ...generativeBase, mode: 'mystery-provider' }).state).toBe('unavailable');
    expect(providerPresentation({ ...generativeBase, generative_configured: false }).state).toBe('unavailable');
  });

  it('fails closed when status is unavailable', () => {
    expect(providerPresentation(null).state).toBe('unavailable');
  });
});
