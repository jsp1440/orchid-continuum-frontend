// @vitest-environment jsdom

/**
 * Fail-closed audit for OC-TAXONOMY-GOVERNANCE-001 (issue #523).
 *
 * TaxonomyOperations is a readiness dashboard, not an activation console: it
 * has exactly one interactive control (a readiness refresh) plus two
 * navigation links, and every network call it makes must be a read. If a
 * future change ever adds a mutating control here, these tests fail and
 * force that control through the owner-authorization boundary explicitly
 * rather than letting it slip in as "just another readiness card".
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false })),
}));

vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>(
    '@/contexts/AuthContext',
  );
  return { ...actual, useAuth: mocks.useAuth };
});

import TaxonomyOperations from './TaxonomyOperations';

let container: HTMLDivElement;
let root: Root;

type FetchCall = { url: string; method: string };

function installFetch(): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ url, method });
    if (url.includes('/taxonomy/readiness')) {
      return new Response(
        JSON.stringify({
          ready_for_upload: false,
          ready_for_promotion: false,
          gates: [
            {
              name: 'owner_authentication',
              status: 'blocked',
              evidence: 'No active owner session.',
              checked_at: new Date(0).toISOString(),
            },
          ],
          checked_at: new Date(0).toISOString(),
          instruction: 'Do not upload the production taxonomy file until live readiness evidence is available.',
          read_only: true,
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

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <TaxonomyOperations />
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mocks.useAuth.mockReturnValue({ user: null, session: null, loading: false });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('TaxonomyOperations — no-activation-without-owner-authorization audit', () => {
  it('exposes exactly one interactive control in its own content: the readiness refresh button', async () => {
    installFetch();
    await mount();
    // Scoped to <main> so Navbar/Footer chrome (menus, favorites, etc.) is
    // excluded — this audit is about TaxonomyOperations' own reachable
    // actions, not the shared site chrome it happens to render inside.
    const main = container.querySelector('main');
    const buttons = Array.from(main?.querySelectorAll('button') ?? []);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label')).toBe('Refresh readiness');
  });

  it('issues only GET requests on load and on every refresh', async () => {
    const calls = installFetch();
    await mount();

    const refresh = container.querySelector('button[aria-label="Refresh readiness"]') as HTMLButtonElement;
    await act(async () => {
      refresh.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.method).toBe('GET');
    }
  });

  it('never reaches an activation, promotion, or publish endpoint from any reachable interaction', async () => {
    const calls = installFetch();
    await mount();

    const refresh = container.querySelector('button[aria-label="Refresh readiness"]') as HTMLButtonElement;
    await act(async () => {
      refresh.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    for (const call of calls) {
      expect(call.url).not.toMatch(/activate|promote|publish/i);
    }
  });

  it('states that promotion is blocked and kept separate from upload readiness, never implying activation happened here', async () => {
    installFetch();
    await mount();
    expect(container.textContent).toContain('Upload readiness and canonical promotion are intentionally separate decisions.');
    expect(container.textContent).toContain('blocked');
  });
});
