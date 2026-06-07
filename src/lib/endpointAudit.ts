/**
 * endpointAudit — single source of truth for "is the backend reachable" plus a
 * one-time console audit of every API base URL the platform talks to.
 *
 * The canonical Orchid Continuum backend is:
 *   https://api.orchidcontinuum.org
 *
 * This module is intentionally tiny and side-effect-free until called. It is
 * invoked once on homepage load to (a) drive the slim status banner and (b)
 * print a console summary confirming no fetch call is pointed at localhost, a
 * stray port, or a placeholder host.
 */

import { OC_BACKEND_BASE } from './ocBackend';
import { OC_BACKEND as HARVESTER_BACKEND } from './genusData';
import { API_BASE_URL } from './api';
import { BACKEND_BASE_URL, ATLAS_OCCURRENCES_PROBE_URL } from './backendConfig';

/** Canonical backend origin every API fetch must resolve to. */
export const CANONICAL_BACKEND = BACKEND_BASE_URL;

const SLOW_MS = 2500;
const PING_TIMEOUT_MS = 8000;

export type BackendStatus = 'live' | 'slow' | 'offline';

export interface PingResult {
  status: BackendStatus;
  latencyMs: number | null;
}

/**
 * Ping the harvester backend ONCE. Resolves to:
 *   - 'live'    : responded under SLOW_MS
 *   - 'slow'    : responded, but slower than SLOW_MS
 *   - 'offline' : timed out, network error, or non-OK status
 *
 * Tries a couple of lightweight, commonly-available endpoints; the first that
 * returns an OK response wins. Never throws.
 */
export async function pingBackend(signal?: AbortSignal): Promise<PingResult> {
  const candidates = [
    `${CANONICAL_BACKEND}/api/genus/daily`,
    `${CANONICAL_BACKEND}/health`,
    `${CANONICAL_BACKEND}/api/species/search?genus=Cattleya&limit=1`,
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
      // non-OK (e.g. 404 on this particular path) — try the next candidate
    } catch {
      /* timeout / network error — try the next candidate */
    } finally {
      clearTimeout(timer);
    }
  }

  return { status: 'offline', latencyMs: null };
}

// ---------------------------------------------------------------------------
// Per-endpoint probes (for the backend status detail panel)
// ---------------------------------------------------------------------------
//
// The status banner exposes a small detail panel listing each data source a
// curator cares about, with its last-response status and latency. These are the
// three audited endpoints, all on the canonical harvester host.

export interface EndpointProbe {
  key: string;
  label: string;
  url: string;
  status: BackendStatus;
  /** Round-trip latency in ms for the last probe, or null if it failed. */
  latencyMs: number | null;
  /** HTTP status code of the last response, or null on network error/timeout. */
  httpStatus: number | null;
}

/** The three data sources surfaced in the detail panel. */
export const AUDITED_ENDPOINTS: { key: string; label: string; url: string }[] = [
  {
    key: 'species-search',
    label: 'Harvester species search',
    url: `${CANONICAL_BACKEND}/api/species/search?genus=Cattleya&limit=1`,
  },
  {
    key: 'atlas-occurrences',
    label: 'Atlas occurrences',
    url: ATLAS_OCCURRENCES_PROBE_URL,
  },
  {
    key: 'campaign-stats',
    label: 'Campaign stats',
    url: `${CANONICAL_BACKEND}/api/campaign/stats`,
  },
];

/** Probe a single endpoint, measuring latency + HTTP status. Never throws. */
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

/**
 * Probe all three audited endpoints in parallel. Used by the status detail
 * panel both on open and on its 60-second background poll.
 */
export async function probeEndpoints(
  signal?: AbortSignal,
): Promise<EndpointProbe[]> {
  return Promise.all(AUDITED_ENDPOINTS.map((ep) => probeOne(ep, signal)));
}


interface AuditedSource {
  module: string;
  base: string;
  correct: boolean;
}

/**
 * Audit every configured API base URL in the codebase and print a console
 * summary. This does NOT mutate anything — it simply verifies the bases that
 * the live data clients are compiled with and flags any that diverge from the
 * canonical harvester host. Endpoints already correct are reported as OK.
 */
export function auditEndpointBases(): AuditedSource[] {
  const sources: AuditedSource[] = [
    { module: 'lib/ocBackend.ts', base: OC_BACKEND_BASE, correct: false },
    { module: 'lib/genusData.ts', base: HARVESTER_BACKEND, correct: false },
    {
      module: 'lib/api.ts (env VITE_API_BASE_URL)',
      base: API_BASE_URL || '(unset — env-driven, optional)',
      correct: false,
    },
  ].map((s) => ({
    ...s,
    correct:
      s.base === CANONICAL_BACKEND ||
      s.base.startsWith('(unset'),
  }));

  /* eslint-disable no-console */
  console.groupCollapsed(
    '%cOrchid Continuum · API endpoint audit',
    'color:#C9A84C;font-weight:bold',
  );
  console.log('Canonical backend:', CANONICAL_BACKEND);
  sources.forEach((s) => {
    const tag = s.correct ? '✓ OK' : '✗ NEEDS REVIEW';
    console.log(`${tag} — ${s.module} → ${s.base}`);
  });
  const bad = sources.filter((s) => !s.correct);
  if (bad.length === 0) {
    console.log('All API base URLs point to the canonical harvester host.');
  } else {
    console.warn(
      `${bad.length} source(s) not pointed at the canonical host:`,
      bad.map((b) => b.module),
    );
  }
  // Note: EcuadorExpedition uses an <iframe> embed (not an API fetch); it is
  // intentionally excluded from this fetch-call audit.
  console.groupEnd();
  /* eslint-enable no-console */

  return sources;
}

/**
 * Run the audit + a single live ping, logging the result. Returns the ping
 * result so the caller (status banner) can render state without re-pinging.
 */
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
