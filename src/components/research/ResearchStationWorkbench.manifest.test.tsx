// @vitest-environment jsdom
/**
 * ManifestPanel render tests — Brain #103 vertical slice.
 *
 * Covers idle → building → ready and idle → building → error transitions at
 * the React render layer. All fetch calls are mocked; no backend is reached.
 * Fixtures are deterministic; no paid model APIs are invoked.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MANIFEST_VERSION } from '@/lib/evidenceDecisionManifest';
import type { RunEvidenceManifest } from '@/lib/evidenceDecisionManifest';
import ResearchStationWorkbench from './ResearchStationWorkbench';

// ── Fixtures ───────────────────────────────────────────────────────────────

const PROJECT_ID = 'proj-phal-01';

const PROJECT = {
  project_id: PROJECT_ID,
  title: 'Phalaenopsis cultivation study',
  description: 'Temperature range investigation',
  research_question: 'What is the optimal temperature range for Phalaenopsis cultivation?',
  status: 'ACTIVE' as const,
};

const SUBJECT_TAXON = {
  project_id: PROJECT_ID,
  taxon_id: 'taxon:phalaenopsis',
  relationship: 'SUBJECT' as const,
};

const MANIFEST_FIXTURE: RunEvidenceManifest = {
  contract_version: MANIFEST_VERSION,
  run_id: `run:${PROJECT_ID}:1`,
  research_question: PROJECT.research_question,
  taxon_id: SUBJECT_TAXON.taxon_id,
  taxonomy_snapshot_id: 'hassler:2026-09-01',
  run_fingerprint: 'a'.repeat(64),
  created_at_utc: '2026-09-12T00:00:00+00:00',
  verification_state: 'ready_for_review',
  resolved_evidence_count: 1,
  missing_evidence_count: 0,
  knowledge_gap_count: 0,
  contradictions: ['candidate:phal-cool-highland'],
  review_decision: null,
  epistemic_state: null,
  human_review_required: true,
  automatic_scientific_publication_allowed: false,
  canonical_knowledge_mutation_allowed: false,
  canonical_activation_requires_human_authority: true,
  immutable: true,
};

const CONVERSATION = { conversation_id: 'conv-test' };

const TURN_RESPONSE = {
  conversation_id: 'conv-test',
  answer: 'Phalaenopsis grow optimally at intermediate-warm temperatures.',
  synthesis_structure: {
    generative: true,
    claim_coverage: [],
    missing_evidence: [],
    resolved_subject: 'Phalaenopsis',
    taxonomy_snapshot_id: 'hassler:2026-09-01',
    evidence_class_readiness: {
      status: 'ready',
      literature_present: true,
      literature_review_required: true,
      continuum_evidence_classes: ['trait_record', 'occurrence_summary'],
      continuum_evidence_class_count: 2,
      required_continuum_evidence_class_count: 2,
      missing_requirements: [],
    },
    governed_provenance: null,
  },
};

// ── Response helpers ───────────────────────────────────────────────────────

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const err = (status: number, detail = 'Service unavailable'): Response =>
  new Response(JSON.stringify({ detail }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// ── URL-dispatching fetch mock ─────────────────────────────────────────────
//
// Calls during one workbench load+synthesize+manifest round:
//   GET  /api/research/projects/{id}           → getResearchProject
//   GET  /api/research/projects/{id}/taxa      → listResearchTaxa
//   GET  /api/research/projects/{id}/documents → listResearchDocuments
//   GET  /api/research/projects/{id}/evidence  → listResearchEvidence
//   GET  /api/research/projects/{id}/notes     → listResearchNotes
//   GET  /api/research/projects/{id}/activity… → listResearchActivity (ResearchActivityPanel)
//   POST /api/calyx/speak/conversations        → createCalyxConversation
//   POST /api/calyx/speak/conversations/…/turns → sendCalyxTurn
//   POST /synthesis/run-manifest               → buildRunManifest
//
// Because the first six arrive in non-deterministic order (mix of Promise.all
// and separate useEffect), we dispatch by URL substring rather than by call
// sequence.

function makeManifestResponse(override?: Response | null): Response {
  return override ?? ok(MANIFEST_FIXTURE);
}

function makeFetch(
  manifestResponse?: Response | null,
  turnResponse: unknown = TURN_RESPONSE,
): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    // Manifest POST
    if (url.includes('/synthesis/run-manifest')) {
      return Promise.resolve(makeManifestResponse(manifestResponse));
    }
    // Calyx turn POST
    if (url.includes('/turns') && init?.method === 'POST') {
      return Promise.resolve(ok(turnResponse));
    }
    // Calyx conversation POST (create, no /turns)
    if (
      url.includes('/api/calyx/speak/conversations') &&
      init?.method === 'POST' &&
      !url.includes('/turns')
    ) {
      return Promise.resolve(ok(CONVERSATION));
    }
    // Research Station sub-resources (order: taxa, documents, evidence, notes, activity)
    if (url.includes('/taxa')) return Promise.resolve(ok({ items: [SUBJECT_TAXON] }));
    if (url.includes('/documents')) return Promise.resolve(ok({ items: [] }));
    if (url.includes('/evidence')) return Promise.resolve(ok({ items: [] }));
    if (url.includes('/notes')) return Promise.resolve(ok({ items: [] }));
    if (url.includes('/activity')) return Promise.resolve(ok({ items: [], total: 0, offset: 0 }));
    // Project GET (last — most general path match for this project id)
    if (url.includes(PROJECT_ID)) return Promise.resolve(ok(PROJECT));
    // Fallback
    return Promise.resolve(ok({ items: [] }));
  });
}

// ── Harness ────────────────────────────────────────────────────────────────

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(fetch = makeFetch()): Promise<void> {
  vi.stubGlobal('fetch', fetch);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ResearchStationWorkbench projectId={PROJECT_ID} />
      </MemoryRouter>,
    ),
  );
}

async function clickButton(label: RegExp | string): Promise<void> {
  await act(async () => {
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      typeof label === 'string' ? b.textContent?.includes(label) : label.test(b.textContent ?? ''),
    );
    btn?.click();
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('ManifestPanel', () => {
  it('shows "Build run manifest" button after synthesis completes', async () => {
    await render();
    await clickButton('Synthesize this investigation');

    expect(container.textContent).toContain('Build run manifest');
    expect(container.textContent).not.toContain('Building run manifest');
  });

  it('renders manifest card with fingerprint, counts, badges and governance after successful POST', async () => {
    await render();
    await clickButton('Synthesize this investigation');
    await clickButton('Build run manifest');

    // Fingerprint prefix (first 12 chars of 'a'.repeat(64))
    expect(container.textContent).toContain('aaaaaaaaaaaa');
    // Verification state label
    expect(container.textContent).toContain('Ready for human review');
    // Evidence count labels
    expect(container.textContent).toContain('Resolved');
    expect(container.textContent).toContain('Missing');
    expect(container.textContent).toContain('Gaps');
    // Badges
    expect(container.textContent).toContain('Human review required');
    expect(container.textContent).toContain('Immutable');
    // Contradiction preserved
    expect(container.textContent).toContain('candidate:phal-cool-highland');
    // Governance invariants card
    expect(container.textContent).toContain('No automatic publication');
    expect(container.textContent).toContain('No canonical mutation');
  });

  it('shows "Manifest unavailable" error card when POST returns 503', async () => {
    await render(makeFetch(err(503, 'Service temporarily unavailable')));
    await clickButton('Synthesize this investigation');
    await clickButton('Build run manifest');

    expect(container.textContent).toContain('Manifest unavailable');
    // Dismiss button must be present in error state
    const dismissBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Dismiss'),
    );
    expect(dismissBtn).toBeTruthy();
  });

  it('Dismiss resets to idle and shows "Build run manifest" button again', async () => {
    await render(makeFetch(err(503)));
    await clickButton('Synthesize this investigation');
    await clickButton('Build run manifest');

    expect(container.textContent).toContain('Manifest unavailable');

    await clickButton('Dismiss');

    expect(container.textContent).toContain('Build run manifest');
    expect(container.textContent).not.toContain('Manifest unavailable');
  });

  it('disables button and shows "Building run manifest…" while POST is in flight', async () => {
    let resolveManifest!: (r: Response) => void;
    const pendingFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/synthesis/run-manifest')) {
        return new Promise<Response>((resolve) => {
          resolveManifest = resolve;
        });
      }
      return makeFetch()(url, init);
    });

    await render(pendingFetch);
    await clickButton('Synthesize this investigation');

    await act(async () => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Build run manifest'),
      );
      btn?.click();
    });

    const buildingBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Building run manifest'),
    );
    expect(buildingBtn).toBeTruthy();
    expect(buildingBtn?.disabled).toBe(true);

    // Settle the pending fetch so the component doesn't leak async state
    await act(async () => {
      resolveManifest(ok(MANIFEST_FIXTURE));
    });
  });

  it('does not call POST /synthesis/run-manifest until the button is clicked', async () => {
    const fetch = makeFetch();
    await render(fetch);
    await clickButton('Synthesize this investigation');

    const manifestCalls = (fetch.mock.calls as [string][]).filter(([url]) =>
      url.includes('/synthesis/run-manifest'),
    );
    expect(manifestCalls).toHaveLength(0);
    expect(container.textContent).toContain('Build run manifest');
  });

  it('uses stable governed run and taxonomy identities', async () => {
    const fetch = makeFetch();
    await render(fetch);
    await clickButton('Synthesize this investigation');
    await clickButton('Build run manifest');

    const manifestCall = (fetch.mock.calls as [string, RequestInit][]).find(([url]) =>
      url.includes('/synthesis/run-manifest'),
    );
    expect(manifestCall).toBeTruthy();
    const body = JSON.parse(String(manifestCall?.[1]?.body)) as {
      run_id: string;
      taxonomy_snapshot_id: string;
    };
    expect(body.run_id).toBe(`run:${PROJECT_ID}:conv-test`);
    expect(body.taxonomy_snapshot_id).toBe('hassler:2026-09-01');
  });

  it('marks a governed packet evidence-incomplete when evidence is missing', async () => {
    const fetch = makeFetch(undefined, {
      ...TURN_RESPONSE,
      synthesis_structure: {
        ...TURN_RESPONSE.synthesis_structure,
        missing_evidence: ['warm-growing comparison'],
      },
    });
    await render(fetch);
    await clickButton('Synthesize this investigation');
    await clickButton('Build run manifest');

    const manifestCall = (fetch.mock.calls as [string, RequestInit][]).find(([url]) =>
      url.includes('/synthesis/run-manifest'),
    );
    const body = JSON.parse(String(manifestCall?.[1]?.body)) as {
      verification_packets: Array<{ verification_state: string; knowledge_gaps: string[] }>;
    };
    expect(body.verification_packets[0]).toMatchObject({
      verification_state: 'evidence_incomplete',
      knowledge_gaps: ['warm-growing comparison'],
    });
  });

  it('fails closed without a canonical taxonomy snapshot and does not POST', async () => {
    const fetch = makeFetch(undefined, {
      ...TURN_RESPONSE,
      synthesis_structure: {
        ...TURN_RESPONSE.synthesis_structure,
        taxonomy_snapshot_id: null,
      },
    });
    await render(fetch);
    await clickButton('Synthesize this investigation');
    await clickButton('Build run manifest');

    expect(container.textContent).toContain('Manifest unavailable');
    expect(container.textContent).toContain('canonical taxon and taxonomy snapshot identities');
    const manifestCalls = (fetch.mock.calls as [string][]).filter(([url]) =>
      url.includes('/synthesis/run-manifest'),
    );
    expect(manifestCalls).toHaveLength(0);
  });
});
