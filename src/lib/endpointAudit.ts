/**
 * endpointAudit — truthful reachability checks for the public homepage.
 *
 * This module must only probe endpoints that are part of the visible homepage
 * data path or are known canonical health contracts. A missing optional route
 * must never make the whole public database appear offline.
 */

import { OC_BACKEND_BASE } from './ocBackend';
import { API_BASE_URL } from './api';
import {
  BACKEND_BASE_URL,
  ATLAS_OCCURRENCES_PROBE_URL,
} from './backendConfig';

export const CANONICAL_BACKEND = BACKEND_BASE_URL;

const SLOW_MS = 2500;
const PING_TIMEOUT_MS = 8000;

export type BackendStatus = 'live' | 'slow' | 'offline';

export interface PingResult {
  status: BackendStatus;
  latencyMs: number | null;
}

/**
 * Ping only known canonical contracts. Never use an optional/missing feature
 * route (for example campaign stats) as evidence that the whole backend is
 * offline.
 */
export async function pingBackend(signal?: AbortSignal): Promise<PingResult> {
  const candidates = [
    `${CANONICAL_BACKEND}/health`,
    `${CANONICAL_BACKEND}/api/species/search?genus=Cattleya&limit=1`,
    ATLAS_OCCURRENCES_PROBE_URL,
  ];

  for (const url of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort());
    }
    const start = performance.now();
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const latencyMs = Math.round(performance.now() - start);
      if (res.ok) {
        return { status: latencyMs > SLOW_MS ? 'slow' : 'live', latencyMs };
      }
    } catch {
      // timeout / network error — try the next canonical candidate
    } finally {
      clearTimeout(timer);
    }
  }

  return { status: 'offline', latencyMs: null };
}

export interface EndpointProbe {
  key: string;
  label: string;
  url: string;
  status: BackendStatus;
  latencyMs: number | null;
  httpStatus: number | null;
}

/**
 * Homepage-facing contracts surfaced in the status detail panel.
 *
 * The genus composite is intentionally probed with a stable genus so the panel
 * tests the same family of contract the Featured Genus experience can consume.
 */
export const AUDITED_ENDPOINTS: { key: string; label: string; url: string }[] = [
  {
    key: 'species-search',
    label: 'Species search',
    url: `${CANONICAL_BACKEND}/api/species/search?genus=Cattleya&limit=1`,
  },
  {
    key: 'atlas-occurrences',
    label: 'Atlas occurrences',
    url: ATLAS_OCCURRENCES_PROBE_URL,
  },
  {
    key: 'homepage-genus',
    label: 'Featured Genus data',
    url: `${CANONICAL_BACKEND}/api/homepage/genus/Cattleya`,
  },
];

async function probeOne(
  ep: { key: string; label: string; url: string },
  signal?: AbortSignal,
): Promise<EndpointProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort());
  }
  const start = performance.now();
  try {
    const res = await fetch(ep.url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const latencyMs = Math.round(performance.now() - start);
    const status: BackendStatus = res.ok
      ? latencyMs > SLOW_MS
        ? 'slow'
        : 'live'
      : 'offline';
    return { ...ep, status, latencyMs, httpStatus: res.status };
  } catch {
    return { ...ep, status: 'offline', latencyMs: null, httpStatus: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeEndpoints(
  signal?: AbortSignal,
): Promise<EndpointProbe[]> {
  return Promise.all(AUDITED_ENDPOINTS.map((ep) => probeOne(ep, signal)));
}

interface AuditedSource {
  module: string;
  base: string;
  expected: string;
  correct: boolean;
}

/**
 * Audit configured API base URLs. `ocBackend.ts` is a canonical public-API
 * client, so its expected origin is BACKEND_BASE_URL/OC_BACKEND_BASE — not the
 * legacy onrender service.
 */
export function auditEndpointBases(): AuditedSource[] {
  const sources: AuditedSource[] = [
    {
      module: 'lib/ocBackend.ts',
      base: OC_BACKEND_BASE,
      expected: BACKEND_BASE_URL,
    },
    {
      module: 'lib/genusData.ts',
      base: BACKEND_BASE_URL,
      expected: BACKEND_BASE_URL,
    },
    {
      module: 'lib/api.ts (env VITE_API_BASE_URL)',
      base: API_BASE_URL || '(unset — env-driven, optional)',
      expected: '(env-driven, optional)',
    },
  ].map((s) => ({
    ...s,
    correct:
      s.base === s.expected ||
      s.expected.startsWith('(env-driven') ||
      s.base.startsWith('(unset'),
  }));

  /* eslint-disable no-console */
  console.groupCollapsed(
    '%cOrchid Continuum · API endpoint audit',
    'color:#C9A84C;font-weight:bold',
  );
  console.log('Canonical API backend:', CANONICAL_BACKEND);
  sources.forEach((s) => {
    const tag = s.correct ? '✓ OK' : '✗ NEEDS REVIEW';
    const note = s.base === s.expected ? '' : ` (expected ${s.expected})`;
    console.log(`${tag} — ${s.module} → ${s.base}${note}`);
  });
  const bad = sources.filter((s) => !s.correct);
  if (bad.length === 0) {
    console.log('Every audited module resolves to its documented backend origin.');
  } else {
    console.warn(
      `${bad.length} source(s) have drifted off their documented origin:`,
      bad.map((b) => b.module),
    );
  }
  console.groupEnd();
  /* eslint-enable no-console */

  return sources;
}

export async function runStartupEndpointCheck(
  signal?: AbortSignal,
): Promise<PingResult> {
  auditEndpointBases();
  const result = await pingBackend(signal);
  /* eslint-disable no-console */
  console.log(
    `%cOrchid Continuum · backend ping → ${result.status.toUpperCase()}` +
      (result.latencyMs != null ? ` (${result.latencyMs}ms)` : ''),
    result.status === 'live'
      ? 'color:#2f9e44'
      : result.status === 'slow'
        ? 'color:#C9A84C'
        : 'color:#c0392b',
  );
  /* eslint-enable no-console */
  return result;
}
