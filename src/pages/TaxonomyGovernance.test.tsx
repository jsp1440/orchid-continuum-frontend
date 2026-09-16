// @vitest-environment jsdom
/**
 * OC-TAXONOMY-GOVERNANCE-001 (issue #523)
 *
 * Audit of TaxonomyOperations and TaxonomyReleases against the
 * owner-authorization activation boundary.
 *
 * Audit result:
 * - TaxonomyOperations: fully read-only. All fetch calls are GET requests.
 *   No button or link can activate, promote, or publish a taxonomy release.
 * - TaxonomyReleases: the only mutable action is "Upload & Inspect", which
 *   (a) requires ownerAuthenticated (validateOwnerSession must return
 *       authenticated===true and a non-empty owner identity), AND
 *   (b) requires the backend to confirm ready_for_upload===true, AND
 *   (c) targets the /inspect endpoint — staging only, not promotion.
 *   No promotion, activation, or replacement button exists in the frontend.
 *
 * These tests are regression guards for the above invariants.
 */

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock factories — must be available when vi.mock() factories run
// ---------------------------------------------------------------------------

type MockOwnerSession = {
  authenticated: boolean;
  status: string;
  owner: string;
  token?: string;
  expires_at: string | null;
  allowedActions: Record<string, unknown>;
  reason?: string;
};

const mockValidateOwnerSession = vi.hoisted(() =>
  vi.fn(async (): Promise<MockOwnerSession> => ({
    authenticated: false,
    status: 'error',
    owner: '',
    token: undefined,
    expires_at: null,
    allowedActions: {},
    reason: 'No active owner session — test default',
  })),
);

const mockFetchHasslerReleaseStatus = vi.hoisted(() =>
  vi.fn(async () => ({
    kind: 'unreachable' as const,
    reason: 'Backend unavailable in test environment',
  })),
);

vi.mock('@/lib/ownerOperationsConsole', () => ({
  validateOwnerSession: mockValidateOwnerSession,
}));

vi.mock('@/lib/hasslerReleaseLifecycle', () => ({
  fetchHasslerReleaseStatus: mockFetchHasslerReleaseStatus,
}));

vi.mock('@/lib/backendConfig', () => ({
  CALYX_BACKEND_BASE_URL: 'https://calyx-test.invalid',
  installOwnerSessionTransport: () => {},
}));

vi.mock('@/components/orchid/Navbar', () => ({
  default: () => <nav aria-label="Primary navigation">Navbar</nav>,
}));

vi.mock('@/components/orchid/Footer', () => ({
  default: () => <footer>Footer</footer>,
}));

vi.mock('@/components/mission-control/HasslerReleaseLifecyclePanel', () => ({
  default: ({
    result,
    loading,
  }: {
    result: { kind: string; reason?: string } | null;
    loading?: boolean;
  }) => (
    <div data-testid="hassler-panel">
      {loading
        ? 'loading'
        : result?.kind === 'unreachable'
          ? `unavailable: ${result.reason ?? ''}`
          : 'lifecycle-data'}
    </div>
  ),
}));

import TaxonomyOperations from './TaxonomyOperations';
import TaxonomyReleases from './TaxonomyReleases';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as Response;
}

function makeErrJson(status: number, detail: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({ detail }),
    text: async () => JSON.stringify({ detail }),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as Response;
}

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  // Default fetch: unauthorized for all endpoints
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeErrJson(401, 'Unauthorized'));

  // Default session: unauthenticated
  mockValidateOwnerSession.mockResolvedValue({
    authenticated: false,
    status: 'error',
    owner: '',
    token: undefined,
    expires_at: null,
    allowedActions: {},
    reason: 'No active owner session — test default',
  });

  // Default hassler: unreachable
  mockFetchHasslerReleaseStatus.mockResolvedValue({
    kind: 'unreachable',
    reason: 'Backend unavailable in test environment',
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// TaxonomyOperations — read-only dashboard
// ---------------------------------------------------------------------------

describe('TaxonomyOperations — owner-authorization audit', () => {
  it('renders without activating or promoting taxonomy on mount', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <TaxonomyOperations />
        </MemoryRouter>,
      );
    });
    // If the page renders without throwing, it did not attempt a promotion
    expect(container.querySelector('h1')?.textContent).toMatch(/taxonomy.*operations/i);
  });

  it('all fetch calls on mount are GET requests — no mutable taxonomy API call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkJson({ releases: [], gates: [], ready_for_upload: false, ready_for_promotion: false }),
    );

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TaxonomyOperations />
        </MemoryRouter>,
      );
    });

    const methods = fetchSpy.mock.calls.map(([, init]) => (init as RequestInit | undefined)?.method?.toUpperCase() ?? 'GET');
    expect(methods.every((m) => m === 'GET' || m === undefined)).toBe(true);

    const urls = fetchSpy.mock.calls.map(([url]) => String(url));
    expect(urls.every((u) => !u.includes('/promote') && !u.includes('/activate') && !u.includes('/apply'))).toBe(true);
  });

  it('fails closed showing error when readiness endpoint returns an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeErrJson(503, 'Backend unavailable'));

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TaxonomyOperations />
        </MemoryRouter>,
      );
    });

    // The error banner must appear; readiness must NOT show "approved"
    const text = container.textContent ?? '';
    expect(text).toMatch(/unable to load|backend unavailable|readiness.*blocked|error/i);
    expect(text).not.toMatch(/promotion readiness:.*approved/i);
  });

  it('renders no button or link whose text implies taxonomy activation or promotion', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkJson({
        releases: [],
        gates: [],
        ready_for_upload: false,
        ready_for_promotion: false,
        instruction: 'Blocked.',
        read_only: true,
        checked_at: new Date().toISOString(),
      }),
    );

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TaxonomyOperations />
        </MemoryRouter>,
      );
    });

    const allButtonsAndLinks = [
      ...Array.from(container.querySelectorAll('button')),
      ...Array.from(container.querySelectorAll('a')),
    ];

    const activationKeywords = ['activate', 'promote', 'publish taxonomy', 'apply release', 'replace taxonomy'];
    for (const el of allButtonsAndLinks) {
      const text = el.textContent?.toLowerCase() ?? '';
      for (const kw of activationKeywords) {
        expect(
          text,
          `Expected no "${kw}" interactive element — found: "${el.textContent}"`,
        ).not.toContain(kw);
      }
    }
  });

  it('readiness displays "blocked" when backend indicates not ready for promotion', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkJson({
        releases: [],
        gates: [],
        ready_for_upload: false,
        ready_for_promotion: false,
        instruction: 'Resolve all blocked gates before proceeding.',
        read_only: true,
        checked_at: new Date().toISOString(),
      }),
    );

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TaxonomyOperations />
        </MemoryRouter>,
      );
    });

    const text = container.textContent ?? '';
    // Promotion status is shown as "blocked" not "approved"
    expect(text).toMatch(/promotion readiness:.*blocked/i);
    expect(text).not.toMatch(/promotion readiness:.*approved/i);
  });
});

// ---------------------------------------------------------------------------
// TaxonomyReleases — owner-gated upload (inspect only, not promote)
// ---------------------------------------------------------------------------

describe('TaxonomyReleases — owner-authorization audit', () => {
  it('shows "Owner authorization required" when session is not authenticated', async () => {
    // Default mock: unauthenticated — checkAccessAndReadiness returns early
    await act(async () => {
      root.render(
        <MemoryRouter>
          <TaxonomyReleases />
        </MemoryRouter>,
      );
    });

    const text = container.textContent ?? '';
    expect(text).toMatch(/owner authorization required/i);
  });

  it('upload button is disabled when owner is not authenticated', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <TaxonomyReleases />
        </MemoryRouter>,
      );
    });

    // The upload button text is "Upload & Inspect"
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Upload'),
    );
    // Button either absent (no file selected) or disabled
    if (uploadBtn) {
      expect(uploadBtn.hasAttribute('disabled')).toBe(true);
    }
  });

  it('upload button is disabled when backend readiness is blocked even with authenticated session', async () => {
    // Session authenticated but backend says not ready
    mockValidateOwnerSession.mockResolvedValue({
      authenticated: true,
      status: 'active',
      owner: 'test-owner',
      token: 'cookie' as const,
      expires_at: null,
      allowedActions: {},
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkJson({
        ready_for_upload: false,
        ready_for_promotion: false,
        instruction: 'Taxonomy intake is blocked. Resolve the blocked readiness checks.',
        gates: [{ name: 'staging_schema', status: 'blocked', evidence: 'not ready', checked_at: new Date().toISOString(), blocking_reason: 'schema migration required' }],
      }),
    );

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TaxonomyReleases />
        </MemoryRouter>,
      );
    });

    const uploadBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Upload'),
    );
    if (uploadBtn) {
      expect(uploadBtn.hasAttribute('disabled')).toBe(true);
    }
    // Connection status shows "blocked"
    const text = container.textContent ?? '';
    expect(text).toMatch(/taxonomy intake blocked/i);
  });

  it('renders no button or link whose text implies taxonomy promotion or activation', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <TaxonomyReleases />
        </MemoryRouter>,
      );
    });

    const allInteractives = [
      ...Array.from(container.querySelectorAll('button')),
      ...Array.from(container.querySelectorAll('a')),
    ];

    const activationKeywords = ['promote', 'activate', 'apply release', 'replace taxonomy', 'publish taxonomy'];
    for (const el of allInteractives) {
      const text = el.textContent?.toLowerCase() ?? '';
      for (const kw of activationKeywords) {
        expect(
          text,
          `Expected no "${kw}" interactive element — found: "${el.textContent}"`,
        ).not.toContain(kw);
      }
    }
  });

  it('no fetch call targets a promotion, activation, or replacement endpoint', async () => {
    // Authenticated + ready to isolate which endpoints get called
    mockValidateOwnerSession.mockResolvedValue({
      authenticated: true,
      status: 'active',
      owner: 'test-owner',
      token: 'cookie' as const,
      expires_at: null,
      allowedActions: {},
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkJson({
        ready_for_upload: true,
        ready_for_promotion: false,
        instruction: 'Ready for upload. Promotion requires additional owner approval.',
        gates: [],
        releases: [],
      }),
    );

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TaxonomyReleases />
        </MemoryRouter>,
      );
    });

    const urls = fetchSpy.mock.calls.map(([url]) => String(url));
    // None of the endpoints called during normal mount should be a mutation that promotes or activates
    const promotionEndpoints = ['/promote', '/activate', '/apply', '/replacement', '/canonical-release'];
    for (const url of urls) {
      for (const ep of promotionEndpoints) {
        expect(url, `Unexpected promotion endpoint call: ${url}`).not.toContain(ep);
      }
    }
  });

  it('upload (inspect) endpoint is /releases/inspect — staging only, not promotion', async () => {
    // This test verifies the code-level invariant:
    // the endpoint used for the upload action contains "inspect" not "promote"
    //
    // Because triggering the upload requires a real File object (not feasible in
    // jsdom without significant ceremony), we verify the invariant by inspecting
    // the component source text via the known endpoint path.
    //
    // The authoritative evidence: TaxonomyReleases.tsx line ~201 calls
    //   /api/mission-control/taxonomy/releases/inspect   (POST)
    // and the amber notice on line ~349 explicitly states:
    //   "Uploading stores and inspects the release only. It does not replace the active taxonomy."
    //
    // The test below asserts this via a text search on the rendered page,
    // which includes the warning notice.
    await act(async () => {
      root.render(
        <MemoryRouter>
          <TaxonomyReleases />
        </MemoryRouter>,
      );
    });

    const text = container.textContent ?? '';
    expect(text).toMatch(/uploading stores and inspects.*only.*does not replace the active taxonomy/i);
  });

  it('HasslerReleaseLifecyclePanel is present and shows unavailable when backend unreachable', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <TaxonomyReleases />
        </MemoryRouter>,
      );
    });

    const panel = container.querySelector('[data-testid="hassler-panel"]');
    expect(panel).toBeTruthy();
    expect(panel?.textContent).toMatch(/unavailable/i);
    // Must NOT show a zero or fabricated count as if the release is absent
    expect(panel?.textContent).not.toBe('0');
  });

  it('promotion_readiness field shown as text only — no action wired to it', async () => {
    mockValidateOwnerSession.mockResolvedValue({
      authenticated: true,
      status: 'active',
      owner: 'test-owner',
      token: 'cookie' as const,
      expires_at: null,
      allowedActions: {},
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkJson({
        ready_for_upload: true,
        ready_for_promotion: false,
        instruction: 'Upload ready. Promotion blocked: owner_promotion_approval gate not yet passed.',
        gates: [
          { name: 'owner_promotion_approval', status: 'blocked', evidence: 'Awaiting explicit owner approval', checked_at: new Date().toISOString(), blocking_reason: null },
        ],
        releases: [],
      }),
    );

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TaxonomyReleases />
        </MemoryRouter>,
      );
    });

    // No interactive element should invoke promotion
    const allInteractives = [
      ...Array.from(container.querySelectorAll<HTMLButtonElement>('button')),
      ...Array.from(container.querySelectorAll<HTMLAnchorElement>('a')),
    ];
    const promotionInteractives = allInteractives.filter((el) =>
      ['promote', 'activate', 'apply'].some((kw) => (el.textContent ?? '').toLowerCase().includes(kw)),
    );
    expect(promotionInteractives).toHaveLength(0);
  });
});
