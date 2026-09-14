// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CitationList } from './CalyxWorkspace';
import type { CalyxCitation } from '@/lib/calyxWorkspace';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(items: CalyxCitation[]) {
  act(() => root.render(<CitationList items={items} />));
}

describe('CitationList source links', () => {
  it('links a well-formed DOI to its resolver, opening safely in a new tab', () => {
    render([{ title: 'Cool-growing Phalaenopsis traits', doi: '10.1234/orchid.42' }]);
    const link = container.querySelector<HTMLAnchorElement>('[data-testid="citation-link-doi"]');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('https://doi.org/10.1234/orchid.42');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noreferrer');
  });

  it('renders PMID and PMCID as distinct source links', () => {
    render([{ title: 'A paper', pmid: '31234567', pmcid: 'PMC7654321' }]);
    expect(container.querySelector('[data-testid="citation-link-pmid"]')?.getAttribute('href')).toBe(
      'https://pubmed.ncbi.nlm.nih.gov/31234567/',
    );
    expect(container.querySelector('[data-testid="citation-link-pmcid"]')?.getAttribute('href')).toBe(
      'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7654321/',
    );
  });

  it('keeps a malformed identifier as plain text with no link', () => {
    render([{ title: 'A paper', doi: 'not-a-doi' }]);
    expect(container.querySelector('[data-testid="citation-link-doi"]')).toBeNull();
    expect(container.querySelector('[data-testid="citation-identifiers"]')?.textContent).toContain(
      'DOI not-a-doi',
    );
  });

  it('says an identifier was not supplied rather than inventing a link', () => {
    render([{ title: 'A paper' }]);
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[data-testid="citation-identifiers"]')?.textContent).toContain(
      'Persistent identifier not supplied',
    );
  });

  it('renders nothing when there are no citations', () => {
    render([]);
    expect(container.textContent).toBe('');
  });
});
