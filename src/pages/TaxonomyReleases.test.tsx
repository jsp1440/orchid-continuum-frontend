// @vitest-environment jsdom

/**
 * Fail-closed audit for OC-TAXONOMY-GOVERNANCE-001 (issue #523).
 *
 * TaxonomyReleases has exactly one reachable mutation: uploading a file to
 * `/api/mission-control/taxonomy/releases/inspect`. That endpoint stores and
 * inspects a staged release — it is not canonical promotion/activation, and
 * the page says so on screen. These tests prove:
 *
 *  - that upload is unreachable without both an explicitly verified owner
 *    session and a backend readiness confirmation;
 *  - that the gate is re-verified immediately before the network call fires
 *    (not read from potentially-stale UI state), so a session revoked or a
 *    readiness flag flipped between render and click still blocks the call;
 *  - that the gate holds even if the disabled attribute on the button is
 *    bypassed, because the real boundary is in the upload handler, not the
 *    DOM;
 *  - that no reachable interaction ever calls an activation/promotion/publish
 *    endpoint.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false })),
  validateOwnerSession: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>(
    '@/contexts/AuthContext',
  );
  return { ...actual, useAuth: mocks.useAuth };
});

vi.mock('@/lib/ownerOperationsConsole', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ownerOperationsConsole')>(
    '@/lib/ownerOperationsConsole',
  );
  return { ...actual, validateOwnerSession: mocks.validateOwnerSession };
});

import TaxonomyReleases from './TaxonomyReleases';

let container: HTMLDivElement;
let root: Root;

type FetchCall = { url: string; method: string };

function authenticatedSession() {
  return {
    authenticated: true,
    status: 'ok',
    owner: 'owner',
    expires_at: null,
    allowedActions: {},
  };
}

function unauthenticatedSession(reason = 'No active Mission Control owner session.') {
  return {
    authenticated: false,
    status: 'error',
    owner: '',
    expires_at: null,
    allowedActions: {},
    reason,
  };
}

function installFetch(opts: { readyForUpload: () => boolean }): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ url, method });

    if (url.includes('/taxonomy/hassler-release-status')) {
      return new Response(JSON.stringify({}), { status: 404 });
    }
    if (url.includes('/taxonomy/readiness')) {
      const ready = opts.readyForUpload();
      return new Response(
        JSON.stringify({
          ready_for_upload: ready,
          ready_for_promotion: false,
          instruction: ready ? null : 'Taxonomy intake is not ready.',
          gates: [],
        }),
        { status: 200 },
      );
    }
    if (url.includes('/taxonomy/releases/inspect')) {
      return new Response(
        JSON.stringify({
          release_id: 'rel-1',
          snapshot: { filename: 'WorldOrchids 26-08.csv', version_label: '26-08' },
          inspection: { rows: 10, issues: 0 },
          canonical_promotion: 'blocked',
        }),
        { status: 200 },
      );
    }
    if (url.includes('/taxonomy/releases')) {
      return new Response(JSON.stringify({ releases: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof globalThis.fetch;
  return calls;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <TaxonomyReleases />
      </MemoryRouter>,
    );
  });
  await flush();
}

async function selectFile(name = 'WorldOrchids 26-08.csv') {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([new Uint8Array([1, 2, 3])], name, { type: 'text/csv' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}

function uploadButton(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) =>
    /Upload & Inspect|Uploading…|Inspecting…/.test(button.textContent ?? ''),
  ) as HTMLButtonElement | undefined;
}

beforeEach(() => {
  mocks.useAuth.mockReturnValue({ user: null, session: null, loading: false });
  mocks.validateOwnerSession.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('TaxonomyReleases — no-activation-without-owner-authorization audit', () => {
  it('never reaches an activation, promotion, or publish endpoint from any reachable interaction', async () => {
    mocks.validateOwnerSession.mockResolvedValue(authenticatedSession());
    const calls = installFetch({ readyForUpload: () => true });
    await mount();
    await selectFile();
    const button = uploadButton();
    await act(async () => {
      button?.click();
    });
    await flush();

    for (const call of calls) {
      expect(call.url).not.toMatch(/activate|promote|publish/i);
    }
  });

  it('disables upload, and never calls the inspect endpoint, while the owner session is unauthenticated', async () => {
    mocks.validateOwnerSession.mockResolvedValue(unauthenticatedSession());
    const calls = installFetch({ readyForUpload: () => true });
    await mount();
    await selectFile();

    const button = uploadButton();
    expect(button?.disabled).toBe(true);

    await act(async () => {
      button?.click();
    });
    await flush();
    expect(calls.some((call) => call.url.includes('/releases/inspect'))).toBe(false);
  });

  it('disables upload, and never calls the inspect endpoint, while backend readiness is blocked, even with an authenticated owner', async () => {
    mocks.validateOwnerSession.mockResolvedValue(authenticatedSession());
    const calls = installFetch({ readyForUpload: () => false });
    await mount();
    await selectFile();

    const button = uploadButton();
    expect(button?.disabled).toBe(true);

    await act(async () => {
      button?.click();
    });
    await flush();
    expect(calls.some((call) => call.url.includes('/releases/inspect'))).toBe(false);
  });

  it('re-verifies owner authorization immediately before uploading, so a session revoked after render still blocks the call (TOCTOU guard)', async () => {
    let revoked = false;
    mocks.validateOwnerSession.mockImplementation(async () =>
      revoked ? unauthenticatedSession('Session revoked.') : authenticatedSession(),
    );
    const calls = installFetch({ readyForUpload: () => true });
    await mount();
    await selectFile();

    const button = uploadButton();
    expect(button?.disabled).toBe(false);

    // Authorization is revoked at the backend after the button became enabled
    // but before this click's own re-check resolves.
    revoked = true;
    await act(async () => {
      button?.click();
    });
    await flush();

    expect(calls.some((call) => call.url.includes('/releases/inspect'))).toBe(false);
  });

  it('re-verifies backend readiness immediately before uploading, so a gate that flips after render still blocks the call (TOCTOU guard)', async () => {
    mocks.validateOwnerSession.mockResolvedValue(authenticatedSession());
    let ready = true;
    const calls = installFetch({ readyForUpload: () => ready });
    await mount();
    await selectFile();

    const button = uploadButton();
    expect(button?.disabled).toBe(false);

    ready = false;
    await act(async () => {
      button?.click();
    });
    await flush();

    expect(calls.some((call) => call.url.includes('/releases/inspect'))).toBe(false);
  });

  it('fails closed at the code level even if the disabled attribute is bypassed (defense in depth)', async () => {
    mocks.validateOwnerSession.mockResolvedValue(unauthenticatedSession());
    const calls = installFetch({ readyForUpload: () => true });
    await mount();
    await selectFile();

    const button = uploadButton();
    expect(button).toBeTruthy();
    if (button) button.disabled = false;

    await act(async () => {
      button?.click();
    });
    await flush();

    expect(calls.some((call) => call.url.includes('/releases/inspect'))).toBe(false);
  });

  it('allows the single mutating call only once both owner authorization and backend readiness are verified, and that call only stages/inspects — never activates', async () => {
    mocks.validateOwnerSession.mockResolvedValue(authenticatedSession());
    const calls = installFetch({ readyForUpload: () => true });
    await mount();
    await selectFile();

    const button = uploadButton();
    await act(async () => {
      button?.click();
    });
    await flush();

    const mutating = calls.filter((call) => call.method !== 'GET');
    expect(mutating.length).toBeGreaterThan(0);
    for (const call of mutating) {
      expect(call.url).toContain('/releases/inspect');
    }
    expect(container.textContent).toContain('Uploading stores and inspects the release only. It does not replace the active taxonomy.');
  });
});
