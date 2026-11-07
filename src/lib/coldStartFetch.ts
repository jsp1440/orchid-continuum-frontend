/**
 * Bounded fetch with one retry for a backend that is waking up.
 *
 * The Render services behind the homepage can take longer than a single short
 * timeout to answer the first request after idling. Observed on 2026-11-07:
 * the live homepage showed "evidence service did not respond" and an empty
 * Atlas lane at ~8 s, then the same page rendered the Cattleya photograph and
 * 703 Atlas records at ~25 s. A one-shot timeout turned a slow first response
 * into a permanent "unavailable" state until the next daily rotation.
 *
 * Policy: the first attempt has `timeoutMs`, covering the headers AND the body
 * (the body is buffered inside the deadline, so a stalled body counts as a
 * timeout); if it produced no complete response (network error, timeout or
 * stalled body) or a gateway status (502/503/504), one retry runs
 * with the longer `retryTimeoutMs`. Other HTTP statuses are returned as-is so
 * callers keep their exact not-found / invalid handling. A caller abort is
 * never retried. After the retry the caller's existing fail-closed handling
 * applies unchanged: nothing is substituted for a missing response.
 */

export const COLD_START_TIMEOUT_MS = 12_000;
export const COLD_START_RETRY_TIMEOUT_MS = 25_000;
export const COLD_START_RETRY_DELAY_MS = 1_000;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

export type ColdStartOptions = {
  timeoutMs?: number;
  retryTimeoutMs?: number;
  retryDelayMs?: number;
};

export class CallerAbortError extends Error {
  constructor() {
    super('The caller aborted the request.');
    this.name = 'AbortError';
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CallerAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new CallerAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function attempt(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response | null> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    // fetch() resolves when headers arrive; read the body under the same
    // deadline and cancellation so a stalled body cannot hang the caller.
    const body = NULL_BODY_STATUSES.has(response.status) ? null : await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    if (signal?.aborted) throw new CallerAbortError();
    // Timeout or network failure: no response was received.
    void error;
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Returns the backend's Response, or null when no usable response arrived after
 * the retry. Throws an AbortError only when the caller's signal aborted.
 */
export async function fetchWithColdStartRetry(
  input: string | URL,
  init: RequestInit = {},
  signal?: AbortSignal,
  options: ColdStartOptions = {},
): Promise<Response | null> {
  const timeoutMs = options.timeoutMs ?? COLD_START_TIMEOUT_MS;
  const retryTimeoutMs = options.retryTimeoutMs ?? COLD_START_RETRY_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? COLD_START_RETRY_DELAY_MS;
  if (signal?.aborted) throw new CallerAbortError();

  const first = await attempt(input, init, timeoutMs, signal);
  if (first && !RETRYABLE_STATUSES.has(first.status)) return first;

  await wait(retryDelayMs, signal);
  const second = await attempt(input, init, retryTimeoutMs, signal);
  if (second && !RETRYABLE_STATUSES.has(second.status)) return second;
  return second ?? first;
}
