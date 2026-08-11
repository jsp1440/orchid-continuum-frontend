import { describe, expect, it } from 'vitest';

import { providerPresentation } from './providerMode';

describe('Calyx provider mode presentation', () => {
  it('labels deterministic fallback explicitly', () => {
    const presentation = providerPresentation({
      mode: 'deterministic-governed',
      generative_configured: false,
      model: 'calyx-governed-summary-v1',
      endpoint_configured: false,
      live_acceptance_verified: false,
      fallback_mode: 'deterministic-governed',
    });

    expect(presentation.state).toBe('deterministic_fallback');
    expect(presentation.label).toContain('Governed fallback');
    expect(presentation.detail).toContain('not a generative conversational model');
  });

  it('distinguishes configured generative mode from accepted generative mode', () => {
    const pending = providerPresentation({
      mode: 'openai-compatible',
      generative_configured: true,
      model: 'scientific-model-v1',
      endpoint_configured: true,
      live_acceptance_verified: false,
      fallback_mode: 'deterministic-governed',
    });
    const accepted = providerPresentation({
      mode: 'openai-compatible',
      generative_configured: true,
      model: 'scientific-model-v1',
      endpoint_configured: true,
      live_acceptance_verified: true,
      fallback_mode: 'deterministic-governed',
    });

    expect(pending.state).toBe('acceptance_pending');
    expect(pending.detail).toContain('not been attested');
    expect(accepted.state).toBe('accepted_generative');
    expect(accepted.label).toBe('Generative Calyx · scientific-model-v1');
  });

  it('fails closed when status is unavailable', () => {
    expect(providerPresentation(null).state).toBe('unavailable');
  });
});
