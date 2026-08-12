import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export interface CalyxProviderReadiness {
  mode: string;
  generative_configured: boolean;
  model: string;
  endpoint_configured: boolean;
  live_acceptance_verified: boolean;
  acceptance_attestation_matches_runtime?: boolean;
  accepted_speak_release?: string;
  fallback_mode: string;
}

export interface CalyxSpeakStatus {
  release: string;
  reply_provider?: CalyxProviderReadiness;
}

export type CalyxProviderPresentation = {
  state: 'accepted_generative' | 'acceptance_pending' | 'deterministic_fallback' | 'unavailable';
  label: string;
  detail: string;
};

export function providerPresentation(readiness?: CalyxProviderReadiness | null): CalyxProviderPresentation {
  if (!readiness) {
    return {
      state: 'unavailable',
      label: 'Provider status unavailable',
      detail: 'Calyx provider readiness could not be confirmed from the server.',
    };
  }

  if (readiness.mode === 'deterministic-governed') {
    return {
      state: 'deterministic_fallback',
      label: `Governed fallback · ${readiness.model}`,
      detail: 'The server reports the deterministic governed evidence formatter as the active reply provider, not a generative conversational model.',
    };
  }

  if (readiness.mode !== 'openai-compatible') {
    return {
      state: 'unavailable',
      label: 'Provider mode unrecognized',
      detail: `The server reported an unsupported provider mode (${readiness.mode || 'empty'}), so the interface will not infer generative readiness.`,
    };
  }

  if (!readiness.generative_configured) {
    return {
      state: 'unavailable',
      label: 'Provider state inconsistent',
      detail: 'The server reports a generative provider mode without a complete generative configuration. Live generative readiness is not asserted.',
    };
  }

  if (readiness.live_acceptance_verified) {
    return {
      state: 'accepted_generative',
      label: `Generative Calyx · ${readiness.model}`,
      detail: 'The active generative provider is configured and has a matching live-acceptance attestation for the current runtime contract.',
    };
  }

  return {
    state: 'acceptance_pending',
    label: `Generative provider configured · ${readiness.model}`,
    detail: 'The active provider is generative, but live conversational acceptance has not been verified for the current model and Speak release.',
  };
}

export async function getCalyxProviderReadiness(): Promise<CalyxProviderReadiness | null> {
  try {
    const response = await fetch(`${CALYX_BACKEND_BASE_URL}/api/calyx/speak/status`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const status = (await response.json()) as CalyxSpeakStatus;
    return status.reply_provider ?? null;
  } catch {
    return null;
  }
}
