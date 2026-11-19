/**
 * Scientific capability states for the Command Center.
 *
 * Backend health is not scientific capability. This reads the backend's reviewed
 * `scientific_capabilities` records and keeps four things apart: works only locally,
 * not supported, absent (no data), blocked. `WORKS_LIVE` is accepted only with
 * `live_verified === true`; anything else is refused so a dashboard can never show a
 * live scientific capability that nobody verified.
 */

import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export const CAPABILITY_STATES = [
  'WORKS_LIVE',
  'WORKS_LOCAL_ONLY',
  'NOT_SUPPORTED',
  'ABSENT',
  'BLOCKED',
] as const;
export type CapabilityState = (typeof CAPABILITY_STATES)[number];

export interface ScientificCapability {
  id: string;
  question: string;
  state: CapabilityState;
  boundary: string;
  evidence: string;
  refs: string[];
  live_verified: boolean;
}

export class CapabilityContractError extends Error {
  constructor(message: string) {
    super(`Scientific capability contract violation: ${message}`);
    this.name = 'CapabilityContractError';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parse the `scientific_capabilities` array of the registry response, fail closed. */
export function parseCapabilities(raw: unknown): ScientificCapability[] {
  if (!Array.isArray(raw)) throw new CapabilityContractError('scientific_capabilities must be an array');
  return raw.map((item, index) => {
    if (!isRecord(item)) throw new CapabilityContractError(`item ${index} must be an object`);
    const state = item.state;
    if (!CAPABILITY_STATES.includes(state as CapabilityState)) {
      throw new CapabilityContractError(`item ${index} has unknown state ${JSON.stringify(state)}`);
    }
    const liveVerified = item.live_verified === true;
    if (state === 'WORKS_LIVE' && !liveVerified) {
      throw new CapabilityContractError(`item ${index} claims WORKS_LIVE without live verification`);
    }
    if (state === 'WORKS_LOCAL_ONLY' && liveVerified) {
      throw new CapabilityContractError(`item ${index} is local-only but marked live_verified`);
    }
    for (const key of ['id', 'question', 'boundary', 'evidence'] as const) {
      if (typeof item[key] !== 'string' || !(item[key] as string).trim()) {
        throw new CapabilityContractError(`item ${index} is missing ${key}`);
      }
    }
    if (!Array.isArray(item.refs) || item.refs.length === 0 || !item.refs.every((r) => typeof r === 'string')) {
      throw new CapabilityContractError(`item ${index} needs evidence refs`);
    }
    return {
      id: item.id as string,
      question: item.question as string,
      state: state as CapabilityState,
      boundary: item.boundary as string,
      evidence: item.evidence as string,
      refs: item.refs as string[],
      live_verified: liveVerified,
    };
  });
}

export const CAPABILITY_LABEL: Record<CapabilityState, string> = {
  WORKS_LIVE: 'works (live verified)',
  WORKS_LOCAL_ONLY: 'works locally only, not live',
  NOT_SUPPORTED: 'not supported',
  ABSENT: 'no data',
  BLOCKED: 'blocked',
};

export type CapabilityLoad =
  | { kind: 'ok'; capabilities: ScientificCapability[] }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string };

export async function fetchCapabilities(signal?: AbortSignal): Promise<CapabilityLoad> {
  let response: Response;
  try {
    response = await fetch(`${CALYX_BACKEND_BASE_URL}/api/command-center/registry`, {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'Network error' };
  }
  if (response.status === 401 || response.status === 403) return { kind: 'unauthorized' };
  if (!response.ok) return { kind: 'error', message: `HTTP ${response.status}` };
  if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return { kind: 'error', message: 'Expected JSON from the registry endpoint' };
  }
  try {
    const body = (await response.json()) as unknown;
    if (!isRecord(body)) throw new CapabilityContractError('registry must be an object');
    // An older backend without the field is reported as unavailable, never as an empty list.
    if (!('scientific_capabilities' in body)) {
      return { kind: 'error', message: 'This backend does not report scientific capability yet' };
    }
    return { kind: 'ok', capabilities: parseCapabilities(body.scientific_capabilities) };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'Malformed response' };
  }
}
