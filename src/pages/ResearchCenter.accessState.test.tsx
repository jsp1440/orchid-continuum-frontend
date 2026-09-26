// @vitest-environment jsdom

/**
 * J8 (Release 1): what a signed-in member is told on /research when the
 * Research Workspace reads are owner-only, and when the page may claim live
 * data.
 *
 * GET /api/research/projects is owner-only for members (backend #1643); the
 * 401 body below is the real backend's text (app/security.py
 * verify_owner_or_api_key). Project/taxon rows are SYNTHETIC shapes; nothing
 * here is a claim about any orchid. Only the network and the auth session are
 * stubbed.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ownerSession: false,
  useAuth: vi.fn(() => ({ user: { id: 'member-1' }, session: { access_token: 'member' }, loading: false })),
}));

vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>('@/contexts/AuthContext');
  return { ...actual, useAuth: mocks.useAuth };
});
vi.mock('@/lib/backendConfig', async () => {
  const actual = await vi.importActual<typeof import('@/lib/backendConfig')>('@/lib/backendConfig');
  return { ...actual, hasOwnerBearerSession: () => mocks.ownerSession };
});

import ResearchCenter from './ResearchCenter';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OWNER_REQUIRED = { detail: 'Owner session or API key is required' };
const PROJECT_ID = 'synthetic-project-1';
const READY: Record<string, unknown> = {
  '/api/research/projects': { items: [{ project_id: PROJECT_ID, title: 'Synthetic investigation', research_question: 'Synthetic question?', status: 'ACTIVE' }] },
  [`/api/research/projects/${PROJECT_ID}`]: { project_id: PROJECT_ID, title: 'Synthetic investigation', research_question: 'Synthetic question?', status: 'ACTIVE' },
  [`/api/research/projects/${PROJECT_ID}/taxa`]: { items: [{ project_id: PROJECT_ID, taxon_id: 'taxon:synthetic', relationship: 'SUBJECT' }] },
  [`/api/research/projects/${PROJECT_ID}/documents`]: { items: [] },
  [`/api/research/projects/${PROJECT_ID}/evidence`]: { items: [] },
  [`/api/research/projects/${PROJECT_ID}/notes`]: { items: [] },
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubBackend(projects: (path: string) => Response | null) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input instanceof Request ? input.url : input), 'http://local.test').pathname;
    if (path.startsWith('/api/research/projects')) {
      const answer = projects(path);
      if (answer) return answer;
    }
    return json(404, { detail: 'Not Found' });
  }));
}

let container: HTMLDivElement;
let root: Root;

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/research']}>
        <ResearchCenter />
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  mocks.ownerSession = false;
});

const text = () => container.textContent ?? '';
const badge = () => container.querySelector('[data-testid="page-data-badge"]') as HTMLElement | null;

describe('Research Station for a signed-in member', () => {
  it('says the view is limited to owner access, not "sign-in required", and claims no live data', async () => {
    stubBackend(() => json(401, OWNER_REQUIRED));
    await render();

    expect(text()).toContain('Owner access only');
    expect(text()).toContain('This view is limited to owner access.');
    expect(text()).not.toMatch(/sign-in required/i);
    expect(text()).not.toContain('Owner session or API key is required');
    // Retrying cannot change an access rule.
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Try again')).toBe(false);

    expect(badge()?.textContent).toBe('Research Workspace · owner access only');
    expect(badge()?.dataset.live).toBe('false');
    expect(text()).not.toMatch(/Live data · Orchid Continuum \+ GBIF/);
    expect(text()).not.toContain('Research Station · live');
  });

  it('treats a 403 the same way', async () => {
    stubBackend(() => json(403, { detail: 'OWNER_ACCESS_REQUIRED' }));
    await render();
    expect(text()).toContain('This view is limited to owner access.');
    expect(badge()?.dataset.live).toBe('false');
  });

  it('asks an owner whose session was refused to sign in again as the owner', async () => {
    mocks.ownerSession = true;
    stubBackend(() => json(401, { detail: 'Owner session expired' }));
    await render();
    expect(text()).toContain('Owner session not verified');
    expect(text()).toContain('Sign in again as the owner');
    expect(badge()?.textContent).toBe('Research data unavailable');
  });

  it('labels an outage as unavailable with a retry', async () => {
    stubBackend(() => json(503, { detail: 'Service Unavailable' }));
    await render();
    expect(text()).toContain('Research Workspace unavailable');
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Try again')).toBe(true);
    expect(badge()?.textContent).toBe('Research data unavailable');
    expect(badge()?.dataset.live).toBe('false');
  });

  it('shows the live badge only once the investigation actually loaded', async () => {
    stubBackend((path) => (path in READY ? json(200, READY[path]) : null));
    await render();
    expect(text()).toContain('Synthetic question?');
    expect(badge()?.textContent).toBe('Live data · Research Workspace');
    expect(badge()?.dataset.live).toBe('true');
    expect(text()).toContain('Research Station · live');
    expect(badge()?.textContent).not.toMatch(/GBIF/);
  });

  it('labels an empty workspace as empty, not live', async () => {
    stubBackend((path) => (path === '/api/research/projects' ? json(200, { items: [] }) : null));
    await render();
    expect(text()).toContain('No research projects yet');
    expect(badge()?.textContent).toBe('No research projects yet');
    expect(badge()?.dataset.live).toBe('false');
  });
});
