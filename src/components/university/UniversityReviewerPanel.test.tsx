// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  universityReviewerApi,
  type UniversityReviewDecision,
  type UniversityReviewerContext,
  type UniversityReviewQueueItem,
  type UniversityReviewerSessionDetail,
} from '@/lib/universityReviewerApi';
import UniversityReviewerPanel from './UniversityReviewerPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const authorizedContext: UniversityReviewerContext = {
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

const submittedSession: UniversityReviewQueueItem = {
  session_id: 'session-1',
  laboratory_id: 'lab-1',
  chapter_id: 'chapter-1',
  status: 'submitted',
  current_stage: 'contribute',
  revision: 7,
  created_at: '2026-09-08T12:00:00Z',
  updated_at: '2026-09-08T12:30:00Z',
};

const sessionDetail: UniversityReviewerSessionDetail = {
  ...submittedSession,
  events: [
    {
      event_id: 'event-1',
      event_type: 'learner_conclusion',
      stage: 'interpret',
      payload: { text: 'The evidence supports a bounded learner conclusion.' },
      session_revision: 7,
      created_at: '2026-09-08T12:25:00Z',
    },
  ],
  review_history: [
    {
      decision: 'changes_requested',
      notes: 'Clarify the provenance statement.',
      reviewed_revision: 6,
      reviewer_capability: 'review.science',
      created_at: '2026-09-08T12:20:00Z',
    },
  ],
  privacy: {
    learner_actor_exposed: false,
    event_actor_exposed: false,
    reviewer_actor_exposed: false,
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

async function waitForText(expected: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (container.textContent?.includes(expected)) return;
    await flush();
  }
  throw new Error(`Timed out waiting for: ${expected}`);
}

async function waitForCondition(predicate: () => boolean, description: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await flush();
  }
  throw new Error(`Timed out waiting for: ${description}`);
}

function buttonWithText(expected: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.includes(expected),
  );
  if (!button) throw new Error(`Button not found: ${expected}`);
  return button;
}

function mockReviewerApi(expertReviewAllowed: boolean) {
  vi.spyOn(universityReviewerApi, 'context').mockResolvedValue({
    ...authorizedContext,
    expert_review_allowed: expertReviewAllowed,
    effective_capabilities: expertReviewAllowed
      ? [...authorizedContext.effective_capabilities, 'review.expert']
      : authorizedContext.effective_capabilities,
  });
  const queue = vi.spyOn(universityReviewerApi, 'queue').mockResolvedValue({
    sessions: [submittedSession],
    next_cursor: null,
    has_more: false,
  });
  vi.spyOn(universityReviewerApi, 'session').mockResolvedValue(sessionDetail);
  const decide = vi.spyOn(universityReviewerApi, 'decide').mockImplementation(
    async (_sessionId, input) => ({
      review_id: 'review-1',
      session_id: submittedSession.session_id,
      decision: input.decision,
      reviewed_revision: submittedSession.revision,
      candidate_knowledge_promoted: false,
      publication_performed: false,
      created_at: '2026-09-08T12:40:00Z',
    }),
  );
  return { decide, queue };
}

async function openSubmittedSession() {
  await waitForText('Submitted investigation');
  act(() => buttonWithText('Submitted investigation').click());
  await waitForText('Review revision 7');
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
    await waitForText('Scientific reviewer sign-in required');

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
    await waitForText('Scientific reviewer workspace locked');

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
    await waitForText('No submitted investigations are awaiting review');

    expect(container.textContent).toContain('Scientific reviewer workspace');
    expect(container.textContent).toContain('No submitted investigations are awaiting review');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('UniversityReviewerPanel governed decision flow', () => {
  it('renders the submitted record and prior review history returned by the reviewer API', async () => {
    mockReviewerApi(false);
    mount();
    await openSubmittedSession();

    expect(container.textContent).toContain('The evidence supports a bounded learner conclusion.');
    expect(container.textContent).toContain('Prior review history');
    expect(container.textContent).toContain('Clarify the provenance statement.');
    expect(container.textContent).toContain('Actors are intentionally omitted');
  });

  it('withholds Candidate Knowledge consideration without expert-review authority', async () => {
    mockReviewerApi(false);
    mount();
    await openSubmittedSession();

    expect(buttonWithText('Request changes')).not.toBeNull();
    expect(buttonWithText('Approve for learning')).not.toBeNull();
    expect(container.textContent).not.toContain('Approve for Candidate Knowledge consideration');
  });

  it.each([
    ['Request changes', 'changes_requested'],
    ['Approve for learning', 'approved_for_learning'],
    [
      'Approve for Candidate Knowledge consideration',
      'approved_for_candidate_knowledge_consideration',
    ],
  ] as const)(
    'sends the exact reviewed revision for %s',
    async (buttonLabel, decision: UniversityReviewDecision) => {
      const { decide, queue } = mockReviewerApi(true);
      mount();
      await openSubmittedSession();

      act(() => buttonWithText(buttonLabel).click());
      await waitForCondition(() => decide.mock.calls.length === 1, 'review API decision');
      await waitForCondition(() => queue.mock.calls.length === 2, 'review queue refresh');
      const expectedMessage =
        decision === 'approved_for_candidate_knowledge_consideration'
          ? 'No Candidate Knowledge promotion or publication was performed'
          : 'Human review decision recorded';
      await waitForText(expectedMessage);

      expect(decide).toHaveBeenCalledWith(submittedSession.session_id, {
        reviewed_revision: submittedSession.revision,
        decision,
        notes: null,
      });
      expect(queue).toHaveBeenCalledTimes(2);
      expect(container.querySelector('[role="status"]')?.textContent).toContain(expectedMessage);
      expect(container.textContent).toContain('Select an investigation to inspect its scientific record');
    },
  );
});
