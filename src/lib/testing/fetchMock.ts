import { vi } from "vitest";

/**
 * Correctly-typed `fetch` doubles for tests.
 *
 * The owner-verification suites each hand-rolled a `vi.fn()` returning a plain
 * object with `ok`, `status`, `statusText` and `text` — the four fields the
 * production code happens to read. That object is not a `Response`, so every
 * assignment to `globalThis.fetch` raised TS2322/TS2352 (22 errors across two
 * files), and the usual escape was `as typeof fetch`.
 *
 * Casting would have silenced the checker while leaving the double free to
 * disagree with the real contract — a hand-built object can claim
 * `{ ok: true, status: 401 }`, which no real `Response` can. These helpers
 * return genuine `Response` objects instead, so `ok` is derived from `status`
 * the way the platform derives it, and the type error disappears because the
 * mock is actually right rather than merely asserted to be.
 */

export type FetchMockResponse = {
  ok: boolean;
  status?: number;
  body: unknown;
};

/** A real `Response` carrying `body` as JSON text. */
export function jsonResponse({ ok, status, body }: FetchMockResponse): Response {
  const resolvedStatus = status ?? (ok ? 200 : 401);
  return new Response(JSON.stringify(body), {
    status: resolvedStatus,
    statusText: ok ? "OK" : "Unauthorized",
  });
}

/** A real `Response` carrying `text` verbatim — for malformed-body cases. */
export function rawResponse(text: string, status = 200): Response {
  return new Response(text, { status, statusText: "OK" });
}

/**
 * A `fetch` double that replays `responses` in order.
 *
 * Throws rather than returning undefined on an unexpected extra call, so a
 * change that quietly adds a request fails loudly instead of NPE-ing somewhere
 * downstream.
 */
export function mockFetchSequence(responses: FetchMockResponse[]): typeof globalThis.fetch {
  let callIndex = 0;
  return vi.fn(async () => {
    const response = responses[callIndex++];
    if (!response) {
      throw new Error(`mockFetchSequence: unexpected call (no response at index ${callIndex - 1})`);
    }
    return jsonResponse(response);
  }) as typeof globalThis.fetch;
}

/**
 * A `fetch` double that records every `RequestInit` it is called with.
 *
 * Returns the recording array alongside the double so a test can assert on
 * headers and credentials without reaching into mock internals.
 */
export function capturingFetch(
  response: FetchMockResponse,
): { fetch: typeof globalThis.fetch; inits: RequestInit[] } {
  const inits: RequestInit[] = [];
  const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
    if (init) inits.push(init);
    return jsonResponse(response);
  }) as typeof globalThis.fetch;
  return { fetch: fetchMock, inits };
}

/** A `fetch` double that always rejects — for network-failure paths. */
export function rejectingFetch(error: Error): typeof globalThis.fetch {
  return vi.fn(async () => {
    throw error;
  }) as typeof globalThis.fetch;
}
