// @vitest-environment jsdom
/**
 * Research Station workbench → Atlas Next link.
 *
 * The workbench's "Continue" section is the mounted Research Station → Atlas
 * producer. These tests render the real workbench and read the href it emits.
 *
 * Fixtures: a structural Research Workspace project with one SUBJECT taxon and
 * empty documents/evidence/notes. They are clearly synthetic test shapes of the
 * workspace contract and carry no scientific evidence, locality or counts; the
 * only thing varied is the subject taxon identity under test.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveAtlasNextIncomingSubject } from '@/features/atlas-next/incomingTaxon';
import ResearchStationWorkbench from './ResearchStationWorkbench';

const PROJECT_ID = 'proj-atlas-link';

const PROJECT = {
  project_id: PROJECT_ID,
  title: 'Synthetic workspace shape',
  description: 'Structural test shape; no evidence.',
  research_question: 'Structural test question.',
  status: 'ACTIVE' as const,
};

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

function fetchWithSubject(taxonId: string) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('/taxa')) {
      return Promise.resolve(
        ok({ items: [{ project_id: PROJECT_ID, taxon_id: taxonId, relationship: 'SUBJECT' }] }),
      );
    }
    if (url.includes('/documents')) return Promise.resolve(ok({ items: [] }));
    if (url.includes('/evidence')) return Promise.resolve(ok({ items: [] }));
    if (url.includes('/notes')) return Promise.resolve(ok({ items: [] }));
    if (url.includes('/activity')) return Promise.resolve(ok({ items: [], total: 0, offset: 0 }));
    if (url.includes(PROJECT_ID)) return Promise.resolve(ok(PROJECT));
    return Promise.resolve(ok({ items: [] }));
  });
}

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

async function renderWithSubject(taxonId: string): Promise<void> {
  vi.stubGlobal('fetch', fetchWithSubject(taxonId));
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ResearchStationWorkbench projectId={PROJECT_ID} />
      </MemoryRouter>,
    ),
  );
}

/** The href of the workbench's Atlas tool link, or null when none is rendered. */
function atlasLinkHref(): string | null {
  const anchor = Array.from(container.querySelectorAll('a')).find(
    (a) => a.querySelector('.text-sm')?.textContent?.trim() === 'Atlas',
  );
  return anchor ? anchor.getAttribute('href') : null;
}

function arrive(href: string) {
  const url = new URL(href, 'https://orchid.test');
  const multi = (key: string) => url.searchParams.get(key)?.split('|').filter(Boolean);
  return {
    url,
    subject: resolveAtlasNextIncomingSubject({
      genera: multi('genera'),
      species: multi('species'),
      infraspecific: url.searchParams.get('infraspecific'),
    }),
  };
}

describe('Research Station workbench → Atlas Next', () => {
  it('links a binomial subject to Atlas Next filtered on that species', async () => {
    await renderWithSubject('Phalaenopsis amabilis');

    const href = atlasLinkHref();
    expect(href).not.toBeNull();
    const { url, subject } = arrive(href!);
    expect(url.pathname).toBe('/atlas-next');
    expect(url.searchParams.get('species')).toBe('Phalaenopsis amabilis');
    expect(url.searchParams.has('genera')).toBe(false);
    expect(url.searchParams.get('project')).toBe(PROJECT_ID);
    expect(subject).toMatchObject({ kind: 'species', binomial: 'Phalaenopsis amabilis' });
    expect(container.querySelector('[data-testid="research-station-atlas-withheld"]')).toBeNull();
  });

  it('links a genus subject to the genus-level Atlas Next view', async () => {
    await renderWithSubject('Phalaenopsis');

    const { url, subject } = arrive(atlasLinkHref()!);
    expect(url.pathname).toBe('/atlas-next');
    expect(url.searchParams.get('genera')).toBe('Phalaenopsis');
    expect(url.searchParams.has('species')).toBe(false);
    expect(subject).toEqual({ kind: 'genus', genus: 'Phalaenopsis' });
  });

  it.each(['taxon:phalaenopsis', 'Phalaenopsis amabilis (L.) Blume', 'Phalaenopsis × intermedia'])(
    'renders no Atlas link for a subject Atlas Next rejects (%s)',
    async (taxonId) => {
      await renderWithSubject(taxonId);

      expect(atlasLinkHref()).toBeNull();
      expect(
        Array.from(container.querySelectorAll('a')).some((a) =>
          (a.getAttribute('href') ?? '').startsWith('/atlas'),
        ),
      ).toBe(false);
      expect(
        container.querySelector('[data-testid="research-station-atlas-withheld"]')?.textContent,
      ).toContain('no Atlas link is offered');
      // The other continuations are unaffected by the Atlas decision.
      expect(container.textContent).toContain('Lexicon');
    },
  );
});
