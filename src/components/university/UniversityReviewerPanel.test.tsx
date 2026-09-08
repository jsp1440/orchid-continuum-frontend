// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import UniversityReviewerPanel from './UniversityReviewerPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const authorizedContext = {
  principal_id: 'reviewer-1',
  authenticated: true,
  roles: [],
  qualifications: ['orchid-taxonomy-reviewer'],
  specialties: [],
  effective_capabilities: ['review.science'],
  science_review_allowed: true,
  expert_review_allowed: false,
  durable_sessions_enabled: true,
  governance: {
    administrator_role_does_not_imply_scientific_authority: true,
    learner_identity_does_not_imply_reviewer_authority: true,
    publication_performed: false,
    candidate_knowledge_promoted: false,
  },
};

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  act(() => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount() {
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <UniversityReviewerPanel />
      </QueryClientProvider>,
    );
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('UniversityReviewerPanel access states', () => {
  it('renders a visible state while reviewer access is being verified', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    mount();

    expect(container.textContent).toContain('Verifying scientific reviewer access');
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('renders an explicit sign-in state for an unauthenticated request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'unauthorized' }), { status: 401 })),
    );
    mount();
    await flush();

    expect(container.textContent).toContain('Scientific reviewer sign-in required');
    expect(container.textContent).toContain('Authentication alone does not grant scientific-review authority');
    expect(container.textContent).not.toBe('');
  });

  it('keeps scientific-review authorization locked when the backend denies it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ...authorizedContext, science_review_allowed: false }),
          { status: 200 },
        )),
    );
    mount();
    await flush();

    expect(container.textContent).toContain('Scientific reviewer workspace locked');
    expect(container.textContent).not.toContain('No submitted investigations are awaiting review');
  });

  it('renders the authorized reviewer queue without weakening its gate', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/learning/reviewer/context')) {
        return new Response(JSON.stringify(authorizedContext), { status: 200 });
      }
      if (url.includes('/api/learning/reviewer/sessions?')) {
        return new Response(
          JSON.stringify({ sessions: [], next_cursor: null, has_more: false }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    mount();
    await flush();
    await flush();

    expect(container.textContent).toContain('Scientific reviewer workspace');
    expect(container.textContent).toContain('No submitted investigations are awaiting review');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
