import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export interface CalyxProviderReadiness {
  mode: string;
  generative_configured: boolean;
  model: string;
  endpoint_configured: boolean;
  live_acceptance_verified: boolean;
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
  if (readiness.generative_configured && readiness.live_acceptance_verified) {
    return {
      state: 'accepted_generative',
      label: `Generative Calyx · ${readiness.model}`,
      detail: 'A configured conversational provider has a live-acceptance attestation.',
    };
  }
  if (readiness.generative_configured) {
    return {
      state: 'acceptance_pending',
      label: `Generative provider configured · ${readiness.model}`,
      detail: 'Configuration is present, but live conversational acceptance has not been attested yet.',
    };
  }
  return {
    state: 'deterministic_fallback',
    label: `Governed fallback · ${readiness.model}`,
    detail: 'Calyx is using the deterministic governed evidence formatter, not a generative conversational model.',
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
