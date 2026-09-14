// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

import LiteraturePaper from './LiteraturePaper';

/**
 * The paper page, mounted.
 *
 * The unit tests prove the gate and the client are correct in isolation. These
 * prove the page actually routes text through them — a correct gate that a
 * component bypasses protects nothing.
 */

const SECTION_TEXT = 'Plants were held at 14 degrees for eight weeks before assessment.';
const ABSTRACT = 'We assessed dormancy across sixty accessions of cool-growing Phalaenopsis.';

function paperBody(overrides: Record<string, unknown> = {}) {
  return {
    paper_id: 'p-1',
    metadata: { title: 'Thermal niche', authors: ['A. Botanist'], abstract: ABSTRACT },
    sections: [{ section_id: 's-1', heading: 'Methods', text: SECTION_TEXT, order: 0 }],
    claims: [
      {
        claim_id: 'c-1',
        statement: 'Dormancy tracks cooler thermal niches.',
        claim_type: 'interpretation',
        evidence_ids: ['ev-1', 'ev-3'],
        provenance: { method: 'model_extracted', confidence: 0.7, review_status: 'unreviewed' },
      },
    ],
    evidence: [
      { evidence_id: 'ev-1', supports_ids: ['c-1'] },
      { evidence_id: 'ev-3' },
    ],
    entities: [],
    ...overrides,
  };
}

function route(paper: unknown, binding: { status: number; body?: unknown }) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/source-binding')) {
      return new Response(binding.body === undefined ? '' : JSON.stringify(binding.body), {
        status: binding.status,
      });
    }
    return new Response(JSON.stringify(paper), { status: 200 });
  }) as typeof globalThis.fetch;
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
      <MemoryRouter initialEntries={['/literature/p-1']}>
        <Routes>
          <Route path="/literature/:paperId" element={<LiteraturePaper />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

const text = () => container.textContent ?? '';

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

describe('the page routes text through the display gate', () => {
  it('shows no source text when the paper has no binding', async () => {
    route(paperBody(), { status: 404 });
    await mount();

    // The whole point: the words are in the payload and do not reach the page.
    expect(text()).not.toContain(SECTION_TEXT);
    expect(text()).not.toContain(ABSTRACT);
    expect(container.querySelectorAll('[data-withheld-reason="no-binding"]').length).toBeGreaterThan(0);
    expect(text()).toMatch(/unrecorded permission is not an unrestricted one/i);
  });

  it('shows the text when the binding permits full text', async () => {
    route(paperBody(), { status: 200, body: { display_policy: 'FULL_TEXT_ALLOWED' } });
    await mount();

    expect(text()).toContain(SECTION_TEXT);
    expect(text()).toContain(ABSTRACT);
    expect(container.querySelector('[data-withheld-reason="no-binding"]')).toBeNull();
  });

  it('truncates under a limited-preview binding and says so', async () => {
    const long = 'y'.repeat(400);
    route(paperBody({ sections: [{ section_id: 's-1', heading: 'Methods', text: long, order: 0 }] }), {
      status: 200,
      body: { display_policy: 'LIMITED_PREVIEW_ONLY' },
    });
    await mount();

    expect(text()).not.toContain(long);
    expect(text()).toMatch(/preview only/i);
  });

  it('withholds text when the binding could not be read, distinctly from absent', async () => {
    route(paperBody(), { status: 503 });
    await mount();

    expect(text()).not.toContain(SECTION_TEXT);
    expect(text()).toMatch(/binding could not be read/i);
  });

  it('shows the structure even when every word is withheld', async () => {
    // A withheld paper is not a blank page — the account of what was extracted
    // is a fact about the extraction, not the source's expression.
    route(paperBody(), { status: 404 });
    await mount();

    expect(text()).toMatch(/Claims \(1\)/);
    expect(text()).toMatch(/Sections \(1\)/);
    expect(container.querySelectorAll('[data-testid="claim-card"]')).toHaveLength(1);
  });
});

describe('the page keeps four things apart', () => {
  it('labels a model-extracted claim as the extractor reading, not a finding', async () => {
    route(paperBody(), { status: 200, body: { display_policy: 'FULL_TEXT_ALLOWED' } });
    await mount();

    expect(container.querySelector('[data-testid="machine-caveat"]')).not.toBeNull();
    expect(text()).toMatch(/model output is not evidence/i);
  });

  it('shows an unreviewed claim as not reviewed', async () => {
    route(paperBody(), { status: 200, body: { display_policy: 'FULL_TEXT_ALLOWED' } });
    await mount();
    expect(container.querySelector('[data-testid="claim-review"]')?.textContent).toMatch(/not reviewed/i);
  });

  it('separates associated evidence from supporting evidence', async () => {
    route(paperBody(), { status: 200, body: { display_policy: 'FULL_TEXT_ALLOWED' } });
    await mount();

    // ev-1 supports; ev-3 is merely linked.
    expect(text()).toMatch(/association is not support/i);
    const relation = container.querySelector('[data-testid="claim-evidence-relation"]');
    expect(relation?.textContent).toMatch(/Supports1/);
    expect(relation?.textContent).toMatch(/Associated only1/);
  });

  it('flags a claim its own paper contradicts', async () => {
    route(
      paperBody({ evidence: [{ evidence_id: 'ev-1', contradicts_ids: ['c-1'] }] }),
      { status: 200, body: { display_policy: 'FULL_TEXT_ALLOWED' } },
    );
    await mount();
    expect(container.querySelector('[data-testid="contradiction-caveat"]')).not.toBeNull();
  });

  it('does not flag a contradiction when there is none', async () => {
    route(paperBody(), { status: 200, body: { display_policy: 'FULL_TEXT_ALLOWED' } });
    await mount();
    expect(container.querySelector('[data-testid="contradiction-caveat"]')).toBeNull();
  });
});

describe('protected locality', () => {
  it('renders no coordinate and reports that site data was withheld', async () => {
    route(
      paperBody({
        entities: [
          {
            entity_id: 'e-1',
            entity_type: 'location',
            name: 'Type locality',
            attributes: { decimalLatitude: -3.145, verbatimLocality: '2 km N of the ridge' },
          },
        ],
      }),
      { status: 200, body: { display_policy: 'FULL_TEXT_ALLOWED' } },
    );
    await mount();

    expect(text()).not.toContain('-3.145');
    expect(text()).not.toContain('2 km N of the ridge');
    expect(container.querySelector('[data-testid="locality-withheld"]')).not.toBeNull();
    expect(text()).toMatch(/collection risk/i);
  });

  it('shows no locality notice when the extraction carried none', async () => {
    route(paperBody(), { status: 200, body: { display_policy: 'FULL_TEXT_ALLOWED' } });
    await mount();
    expect(container.querySelector('[data-testid="locality-withheld"]')).toBeNull();
  });
});

describe('failures', () => {
  it('renders a missing paper as missing, with no retry', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('', { status: 404 }),
    ) as typeof globalThis.fetch;
    await mount();

    expect(container.querySelector('[data-testid="paper-error"]')).not.toBeNull();
    expect(text()).toMatch(/No extraction is stored under this identifier/i);
    expect([...container.querySelectorAll('button')].some((b) => /try again/i.test(b.textContent ?? ''))).toBe(false);
  });

  it('stops claiming the binding is loading once the load has failed', async () => {
    // Caught in a real browser: the policy panel kept saying "Loading the
    // source binding…" after the request had failed, which asserts an
    // operation that is no longer running.
    globalThis.fetch = vi.fn(
      async () => new Response('', { status: 503 }),
    ) as typeof globalThis.fetch;
    await mount();

    const summary = container.querySelector('[data-testid="policy-summary"]');
    expect(summary?.textContent).not.toMatch(/loading the source binding/i);
    expect(summary?.textContent).toMatch(/no source binding was read/i);
  });

  it('renders an outage as an outage, with a retry', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('', { status: 503 }),
    ) as typeof globalThis.fetch;
    await mount();

    expect(text()).toMatch(/literature service is unavailable/i);
    expect(text()).toMatch(/says nothing about what the extraction contains/i);
    expect([...container.querySelectorAll('button')].some((b) => /try again/i.test(b.textContent ?? ''))).toBe(true);
  });
});
