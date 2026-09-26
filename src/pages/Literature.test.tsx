// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The literature index, and the four things that must not look alike.
 *
 * This route rendered ComingSoon for a long time, and the reason was real:
 * there was no discovery contract, so any index would have been invented. The
 * contract now exists, so the page shows the corpus.
 *
 * The failure states carry the weight. An empty corpus, an unreachable
 * service, a session without permission, and a malformed response all reduce
 * to "nothing on screen" unless each is rendered as itself — and only one of
 * them means the Continuum holds no literature.
 */

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false })),
}));

vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>(
    '@/contexts/AuthContext',
  );
  return { ...actual, useAuth: mocks.useAuth };
});

import accessDenied from '@/lib/__fixtures__/literatureAccessDenied.realBackend.json';

import Literature from './Literature';

function paper(id: string, overrides: Record<string, unknown> = {}) {
  return {
    paper_id: id,
    readable: true,
    title: `Thermal niche in ${id}`,
    authors: ['A. Botanist'],
    journal: 'Orchid Science',
    publication_year: 2026,
    claim_count: 2,
    evidence_count: 1,
    review_decision_count: 0,
    ...overrides,
  };
}

function respond(body: unknown, status = 200) {
  globalThis.fetch = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as typeof globalThis.fetch;
}

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof globalThis.fetch;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <Literature />
      </MemoryRouter>,
    );
  });
  // Let the load settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const text = () => container.textContent ?? '';
const rows = () => container.querySelectorAll('[data-testid="literature-list"] > li');

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe('the literature index shows the corpus', () => {
  it('lists the extraction results with their yields', async () => {
    respond({ papers: [paper('p-1'), paper('p-2')], total: 2, limit: 25, offset: 0, unreadable_count: 0 });
    await mount();

    expect(rows()).toHaveLength(2);
    expect(text()).toContain('Thermal niche in p-1');
    expect(text()).toMatch(/2 claims · 1 evidence/);
  });

  it('reports a damaged record rather than hiding it', async () => {
    // Omitting it would make the corpus look smaller than it is.
    respond({
      papers: [paper('p-1'), { paper_id: 'p-broken', readable: false, reason: 'PAPER_RECORD_MISSING' }],
      total: 2,
      limit: 25,
      offset: 0,
      unreadable_count: 1,
    });
    await mount();

    expect(rows()).toHaveLength(2);
    expect(text()).toMatch(/could not be read/i);
    expect(text()).toMatch(/a damaged record is part of the corpus/i);
    expect(text()).toMatch(/1 record on this page could not be read/i);
  });

  it('keeps a page distinct from the corpus', async () => {
    respond({ papers: [paper('p-1')], total: 40, limit: 25, offset: 0, unreadable_count: 0 });
    await mount();
    // "1 of 40" — never just "1".
    expect(text()).toMatch(/showing 1 of 40/i);
  });
});

describe('an empty corpus is not a failure', () => {
  it('says the store is reachable and holds nothing', async () => {
    respond({ papers: [], total: 0, limit: 25, offset: 0, unreadable_count: 0 });
    await mount();

    expect(container.querySelector('[data-testid="literature-empty"]')).not.toBeNull();
    expect(text()).toMatch(/reachable and holds no extraction results/i);
    expect(text()).toMatch(/an empty corpus, not a failure to read it/i);
  });
});

describe('failures never read as an empty corpus', () => {
  it('renders a refusal as an access state, not a generic error', async () => {
    respond({ detail: { code: 'NOT_AUTHORIZED' } }, 403);
    await mount();

    expect(container.querySelector('[data-testid="literature-access-required"]')).not.toBeNull();
    expect(text()).toMatch(/access is not permitted for this account/i);
    expect(text()).toMatch(/says nothing about how much literature the Continuum holds/i);
    expect(container.querySelector('[data-testid="literature-empty"]')).toBeNull();
    expect(container.querySelector('[data-testid="literature-error"]')).toBeNull();
  });

  it('renders an outage as an outage, and offers a retry', async () => {
    respond({ detail: { code: 'UNAVAILABLE' } }, 503);
    await mount();

    expect(text()).toMatch(/literature corpus is unavailable/i);
    expect(container.querySelector('[data-testid="literature-empty"]')).toBeNull();
    expect([...container.querySelectorAll('button')].some((b) => /try again/i.test(b.textContent ?? ''))).toBe(true);
  });

  it('does not offer a retry for a failure a retry cannot fix', async () => {
    respond({ detail: { code: 'NOT_AUTHORIZED' } }, 403);
    await mount();
    expect([...container.querySelectorAll('button')].some((b) => /try again/i.test(b.textContent ?? ''))).toBe(false);
  });

  it('treats a malformed 200 as malformed, not as an empty corpus', async () => {
    // The dangerous one: a 200 with no papers array would otherwise render as
    // "the Continuum holds no literature".
    respond({ total: 0 });
    await mount();

    expect(container.querySelector('[data-testid="literature-error"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="literature-empty"]')).toBeNull();
    // Asserting the specific wording, not merely that *some* error rendered:
    // without the client's malformed guard a downstream TypeError produces a
    // network error instead, which would satisfy a weaker check.
    expect(text()).toMatch(/could not be loaded/i);
    expect(text()).toMatch(/response this client cannot read/i);
  });
});

describe('paging', () => {
  it('disables Previous on the first page and Next on the last', async () => {
    respond({ papers: [paper('p-1')], total: 1, limit: 25, offset: 0, unreadable_count: 0 });
    await mount();

    const previous = [...container.querySelectorAll('button')].find((b) => /previous/i.test(b.textContent ?? ''));
    const next = [...container.querySelectorAll('button')].find((b) => /next/i.test(b.textContent ?? ''));
    expect((previous as HTMLButtonElement).disabled).toBe(true);
    expect((next as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Next when the corpus is larger than the page', async () => {
    respond({ papers: [paper('p-1')], total: 40, limit: 25, offset: 0, unreadable_count: 0 });
    await mount();

    const next = [...container.querySelectorAll('button')].find((b) => /next/i.test(b.textContent ?? ''));
    expect((next as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('the list carries no paper bodies', () => {
  it('shows counts, not content', async () => {
    // Section text and claim text have their own display policies; a list
    // response is the wrong place to release them, and the backend does not.
    respond({
      papers: [paper('p-1', { claim_count: 9, evidence_count: 4 })],
      total: 1,
      limit: 25,
      offset: 0,
      unreadable_count: 0,
    });
    await mount();

    expect(text()).toMatch(/9 claims · 4 evidence/);
    expect(text()).not.toMatch(/abstract/i);
  });
});

/**
 * A signed-in member, refused.
 *
 * `/literature` sits behind ProtectedRoute, so the reader here is signed in.
 * Owner decision (2026-09-26): the literature reads accept a member's Supabase
 * session. A refusal therefore means the session could not be verified (401),
 * the account is not permitted (403), or member access is not yet configured
 * on the server (503 with the member-auth-not-configured code) — and each must
 * read as itself, never as an outage or an empty corpus. The 401 bodies are
 * the backend's own responses, captured in
 * `literatureAccessDenied.realBackend.json`; the 403 and the 503
 * not-configured bodies are clearly synthetic shapes for those branches.
 */
describe('a signed-in member who is refused', () => {
  const signedIn = () =>
    mocks.useAuth.mockReturnValue({
      user: { id: 'member-1' },
      session: { access_token: 'member-session' },
      loading: false,
    } as never);

  const accessState = () => container.querySelector('[data-testid="literature-access-required"]');
  const retry = () =>
    [...container.querySelectorAll('button')].some((b) => /try again/i.test(b.textContent ?? ''));

  afterEach(() => {
    mocks.useAuth.mockReturnValue({ user: null, session: null, loading: false });
  });

  it('is told the session could not be verified and to sign in again, on the backend\'s own 401', async () => {
    signedIn();
    respond(accessDenied.list_no_credentials.body, accessDenied.list_no_credentials.status);
    await mount();

    expect(accessState()).not.toBeNull();
    expect(accessState()?.getAttribute('data-access-status')).toBe('401');
    expect(accessState()?.getAttribute('data-access-reason')).toBe('session_unverified');
    expect(accessState()?.getAttribute('data-signed-in')).toBe('true');
    expect(text()).toMatch(/your session could not be verified — sign in again/i);
    expect(text()).toMatch(/you are signed in here/i);
    // The superseded "closed to members" copy is gone.
    expect(text()).not.toMatch(/not yet open to members/i);
    expect(text()).not.toMatch(/owner or API access required/i);
    // Not the generic error, not the empty corpus, and no retry that cannot help.
    expect(container.querySelector('[data-testid="literature-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="literature-empty"]')).toBeNull();
    expect(text()).not.toMatch(/not authorised to browse/i);
    expect(retry()).toBe(false);
  });

  it('gets the same state when a non-owner bearer is rejected', async () => {
    signedIn();
    respond(accessDenied.list_non_owner_bearer.body, accessDenied.list_non_owner_bearer.status);
    await mount();

    expect(accessState()?.getAttribute('data-access-status')).toBe('401');
    expect(text()).toMatch(/your session could not be verified/i);
  });

  it('gets the same state on a 403 (synthetic shape)', async () => {
    signedIn();
    respond({ detail: 'Forbidden' }, 403);
    await mount();

    expect(accessState()?.getAttribute('data-access-status')).toBe('403');
    expect(accessState()?.getAttribute('data-access-reason')).toBe('forbidden');
    expect(text()).toMatch(/access is not permitted for this account/i);
    expect(text()).not.toMatch(/your session could not be verified/i);
    expect(retry()).toBe(false);
  });

  it('is told the session could not be verified on INVALID_MEMBER_TOKEN (synthetic shape of the #1643 body)', async () => {
    signedIn();
    respond({ detail: { code: 'INVALID_MEMBER_TOKEN', message: 'Member session is invalid or expired' } }, 401);
    await mount();

    expect(accessState()?.getAttribute('data-access-reason')).toBe('session_unverified');
    expect(text()).toMatch(/your session could not be verified — sign in again/i);
    expect(retry()).toBe(false);
  });

  it('is told member verification is temporarily unavailable, with a retry, on MEMBER_AUTH_UNAVAILABLE (synthetic shape)', async () => {
    signedIn();
    respond({ detail: { code: 'MEMBER_AUTH_UNAVAILABLE', message: 'synthetic' } }, 503);
    await mount();

    expect(accessState()?.getAttribute('data-access-status')).toBe('503');
    expect(accessState()?.getAttribute('data-access-reason')).toBe('member_auth_unavailable');
    expect(text()).toMatch(/member verification is temporarily unavailable — try again/i);
    expect(container.querySelector('[data-testid="literature-error"]')).toBeNull();
    expect(retry()).toBe(true);

    // The retry re-reads the index.
    respond({ papers: [paper('p-1')], total: 1, limit: 25, offset: 0, unreadable_count: 0 });
    const button = [...container.querySelectorAll('button')].find((b) => /try again/i.test(b.textContent ?? ''));
    await act(async () => {
      button?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(accessState()).toBeNull();
    expect(rows()).toHaveLength(1);
  });

  it('is told member access is not yet configured on the server on MEMBER_AUTH_NOT_CONFIGURED (synthetic shape)', async () => {
    signedIn();
    respond({ detail: { code: 'MEMBER_AUTH_NOT_CONFIGURED', message: 'synthetic' } }, 503);
    await mount();

    expect(accessState()?.getAttribute('data-access-status')).toBe('503');
    expect(accessState()?.getAttribute('data-access-reason')).toBe('member_access_unconfigured');
    expect(text()).toMatch(/member access is not yet configured on the server/i);
    expect(text()).toMatch(/not an outage/i);
    // Distinct from an outage: no outage panel and no retry that cannot help.
    expect(container.querySelector('[data-testid="literature-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="literature-empty"]')).toBeNull();
    expect(retry()).toBe(false);
  });

  it('sees an outage as an outage, not as a refusal', async () => {
    signedIn();
    respond({ detail: 'Owner session signing is not configured' }, 503);
    await mount();

    expect(accessState()).toBeNull();
    expect(container.querySelector('[data-testid="literature-error"]')).not.toBeNull();
    expect(text()).toMatch(/literature corpus is unavailable/i);
    expect(text()).not.toMatch(/member access is not yet configured/i);
    expect(retry()).toBe(true);
  });

  it('sees an unreachable service as unreachable, not as a refusal', async () => {
    signedIn();
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof globalThis.fetch;
    await mount();

    expect(accessState()).toBeNull();
    expect(text()).toMatch(/could not be reached/i);
    expect(retry()).toBe(true);
  });

  it('sees an empty corpus as empty, not as a refusal', async () => {
    signedIn();
    respond({ papers: [], total: 0, limit: 25, offset: 0, unreadable_count: 0 });
    await mount();

    expect(accessState()).toBeNull();
    expect(container.querySelector('[data-testid="literature-empty"]')).not.toBeNull();
  });

  it('sees the corpus when the service answers', async () => {
    signedIn();
    respond({ papers: [paper('p-1')], total: 1, limit: 25, offset: 0, unreadable_count: 0 });
    await mount();

    expect(accessState()).toBeNull();
    expect(rows()).toHaveLength(1);
  });
});

describe('an anonymous refusal', () => {
  it('asks for a sign-in rather than claiming a session failed verification', async () => {
    respond(accessDenied.list_no_credentials.body, accessDenied.list_no_credentials.status);
    await mount();

    const state = container.querySelector('[data-testid="literature-access-required"]');
    expect(state?.getAttribute('data-signed-in')).toBe('false');
    expect(text()).toMatch(/sign in to read the literature workspace/i);
    expect(text()).not.toMatch(/you are signed in/i);
    expect(text()).not.toMatch(/your session could not be verified/i);
  });
});
