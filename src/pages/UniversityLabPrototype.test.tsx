// @vitest-environment jsdom

/**
 * UniversityLabPrototype is the one place in `cap-university-curriculum-core`
 * that actually enforces the University's scientific-safety contract: it must
 * stay closed whenever release-readiness and capability disagree, must never
 * substitute mock science for an unavailable backend, and must only ever show
 * the durable learner notebook once the backend has proven the durable gate.
 * None of that had render coverage — only the underlying pure functions in
 * universityRelease.ts were tested. This renders the real component tree
 * against mocked universityApi responses so a regression in the wiring
 * between those functions and the JSX (not just the functions themselves)
 * would fail here instead of only in production.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { universityApi, type UniversityCapability, type UniversityCatalog, type UniversityChapter, type UniversityLaboratory } from '@/lib/universityApi';
import type { UniversityReleaseReadiness } from '@/lib/universityRelease';
import captured from '@/lib/__fixtures__/universityReadOnly.realBackend.json';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ session: null, user: null, signOut: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
);

const { default: UniversityLabPrototype } = await import('./UniversityLabPrototype');

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// Every payload below was captured verbatim from the backend's own
// /api/learning/* routes (see the fixture's `_capture` note) rather than
// hand-written, so the render assertions hold against the shapes the backend
// actually serves — including its real `draft` status and release contract.
const readOnlyReadiness = captured.readOnly.readiness as UniversityReleaseReadiness;
const readOnlyCapability = captured.readOnly.capability as UniversityCapability;
const catalog = captured.readOnly.catalog as UniversityCatalog;
const chapter = captured.readOnly.chapter as UniversityChapter;
const laboratory = captured.readOnly.laboratory as UniversityLaboratory;
const disabledReadiness = captured.disabled.readiness as UniversityReleaseReadiness;
const disabledCapability = captured.disabled.capability as UniversityCapability;

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

afterEach(() => {
  act(() => root.unmount());
  client.clear();
  container.remove();
  vi.restoreAllMocks();
});

function mount() {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/university/lab']}>
        <QueryClientProvider client={client}>
          <UniversityLabPrototype />
        </QueryClientProvider>
      </MemoryRouter>,
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

describe('UniversityLabPrototype release-gate rendering', () => {
  it('shows a checking state before release readiness resolves', () => {
    vi.spyOn(universityApi, 'releaseReadiness').mockImplementation(() => new Promise(() => undefined));
    vi.spyOn(universityApi, 'capability').mockImplementation(() => new Promise(() => undefined));
    mount();

    expect(container.textContent).toContain('Checking University release readiness');
  });

  it('fails closed with an explicit unavailable state rather than substituting mock science', async () => {
    vi.spyOn(universityApi, 'releaseReadiness').mockRejectedValue(new Error('network down'));
    vi.spyOn(universityApi, 'capability').mockRejectedValue(new Error('network down'));
    mount();
    await waitForText('University service unavailable');

    expect(container.textContent).toContain('No educational data has been inferred or substituted');
  });

  it('stays closed and lists blockers when the backend reports university disabled', async () => {
    vi.spyOn(universityApi, 'releaseReadiness').mockResolvedValue(disabledReadiness);
    vi.spyOn(universityApi, 'capability').mockResolvedValue(disabledCapability);
    const catalogSpy = vi.spyOn(universityApi, 'catalog');
    mount();
    await waitForText('University backend installed but disabled');

    expect(container.textContent).toContain('University backend is disabled.');
    expect(catalogSpy).not.toHaveBeenCalled();
  });

  it('renders the read-only chapter and laboratory once every safety contract agrees', async () => {
    vi.spyOn(universityApi, 'releaseReadiness').mockResolvedValue(readOnlyReadiness);
    vi.spyOn(universityApi, 'capability').mockResolvedValue(readOnlyCapability);
    vi.spyOn(universityApi, 'catalog').mockResolvedValue(catalog);
    vi.spyOn(universityApi, 'chapter').mockResolvedValue(chapter);
    vi.spyOn(universityApi, 'laboratory').mockResolvedValue(laboratory);
    mount();
    await waitForText(chapter.title);

    expect(container.textContent).toContain(laboratory.title);
    expect(container.textContent).toContain('Read-only laboratory');
    expect(container.textContent).toContain('Publication is disabled.');
    expect(container.textContent).toContain('Candidate Knowledge writes are disabled.');
    // Session persistence is disclosed as the non-durable prototype, and the
    // durable-only learner notebook must not render in read-only mode.
    expect(container.textContent).toContain('process-local, non-durable prototype');
    expect(container.textContent).not.toContain('Durable learner notebook');
    expect(container.textContent).not.toContain('Scientific inquiry notebook');
  });
});
