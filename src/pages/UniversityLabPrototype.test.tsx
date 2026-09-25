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

const readOnlyReadiness: UniversityReleaseReadiness = {
  release_contract: 'OCU-RELEASE-IDENTITY-001',
  content_contract: 'OCU-CHAPTER-CONTENT-001',
  university_enabled: true,
  read_only_ready: true,
  session_writes_enabled: false,
  learner_auth_enabled: false,
  publication_enabled: false,
  candidate_knowledge_writes_enabled: false,
  calyx_model_calls_enabled: false,
  human_review_required: true,
  persistence: 'process_local_memory',
  durable_sessions_enabled: false,
  durable_gate: {
    session_writes_enabled: false,
    learner_auth_enabled: false,
    durable_flag_enabled: false,
    read_only_release_verified: true,
    release_evidence_present: true,
    release_evidence_valid: true,
    release_evidence_id: 'evidence-1',
    durable_sessions_enabled: false,
  },
  required_read_only_configuration: {
    OCU_UNIVERSITY_ENABLED: true,
    OCU_UNIVERSITY_SESSION_WRITES_ENABLED: false,
  },
};

const readOnlyCapability: UniversityCapability = {
  enabled: true,
  session_writes_enabled: false,
  learner_auth_enabled: false,
  persistence: 'process_local_memory',
  durable_sessions_enabled: false,
  publication_enabled: false,
  candidate_knowledge_writes_enabled: false,
  calyx_model_calls_enabled: false,
};

const catalog: UniversityCatalog = {
  chapter: { id: 'BITB-CHAPTER-ORCHID-FLOWERING-001', title: 'Why do orchids bloom?', summary: 'A bounded chapter.', status: 'published' },
  laboratory: { id: 'OCU-LAB-FAILURE-TO-BLOOM-001', title: 'Failure to bloom', summary: 'A bounded laboratory.', status: 'published' },
  capability: readOnlyCapability,
};

const chapter: UniversityChapter = {
  chapter_id: catalog.chapter.id,
  title: catalog.chapter.title,
  summary: catalog.chapter.summary,
  status: 'published',
  learning_objectives: ['Distinguish observation from interpretation.'],
  sections: [
    { section_id: 'sec-1', title: 'Observation', epistemic_status: 'evidence-backed', body: 'Orchids bloom under specific bounded conditions.' },
  ],
  laboratory_links: [{ laboratory_id: catalog.laboratory.id, launch_label: 'Start the lab', required_sections: ['sec-1'] }],
  publication_allowed: false,
};

const laboratory: UniversityLaboratory = {
  laboratory_id: catalog.laboratory.id,
  title: catalog.laboratory.title,
  summary: catalog.laboratory.summary,
  status: 'published',
  inquiry_sequence: ['observe', 'question', 'investigate', 'analyze', 'interpret', 'communicate', 'contribute'],
  evidence_catalog: [{ evidence_id: 'ev-1', label: 'Bloom timing record', epistemic_status: 'verified', summary: 'A bounded evidence item.' }],
  tutor_mode: 'deterministic',
  publication_allowed: false,
  automatic_candidate_knowledge: false,
  human_review_required: true,
};

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
    vi.spyOn(universityApi, 'releaseReadiness').mockResolvedValue({
      ...readOnlyReadiness,
      university_enabled: false,
      read_only_ready: false,
    });
    vi.spyOn(universityApi, 'capability').mockResolvedValue({ ...readOnlyCapability, enabled: false });
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
