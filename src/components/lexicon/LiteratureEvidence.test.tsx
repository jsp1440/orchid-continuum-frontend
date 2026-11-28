// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { LiteratureEvidence } from './LiteratureEvidence';
import type { LiteratureRecord } from '@/data/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
function render(record: Partial<LiteratureRecord> = {}) {
  act(() => root.render(<LiteratureEvidence records={[{ id: 'fixture', title: 'Synthetic botanical citation', ...record }]} />));
}
it('links supplied DOI and source while preserving bibliographic and review metadata', () => {
  render({ doi: '10.1234/fixture', url: 'https://example.org/paper', authors: ['Fixture author'], year: 2026,
    journal: 'Fixture journal', evidence_type: 'source-reported', summary: 'Provisional interpretation',
    provenance: { source: 'Fixture source', citation: 'Original citation', license: 'CC-BY', validation_status: 'revision_needed' } });
  expect(container.querySelector('a')?.href).toBe('https://doi.org/10.1234/fixture');
  expect(container.querySelector('a[href="https://example.org/paper"]')?.getAttribute('rel')).toBe('noopener noreferrer');
  for (const text of ['Fixture author', '2026', 'Fixture journal', 'source-reported', 'Provisional interpretation', 'revision_needed', 'Original citation', 'Fixture source', 'CC-BY']) expect(container.textContent).toContain(text);
});
it('does not infer review from a DOI or from the entry containing a source', () => {
  render({ doi: '10.1234/fixture' });
  expect(container.textContent).toContain('Review state: Not supplied');
  expect(container.textContent).not.toContain('expert_reviewed');
});
it.each(['javascript:alert(1)', 'data:text/html,fixture', '//example.org/paper', '/paper', 'https://user:secret@example.org/paper', 'https://example.org/\nprivate'])('refuses unsafe source %s', (url) => {
  render({ url, doi: 'not-a-doi' });
  expect(container.querySelector('a')).toBeNull();
  expect(container.textContent).toContain('DOI not-a-doi');
  expect(container.textContent).toContain('Source link unavailable');
});
it('preserves a usable source URL even when the DOI is malformed', () => {
  render({ doi: 'javascript:alert(1)', url: 'https://example.org/paper' });
  expect(container.querySelectorAll('a')).toHaveLength(1);
  expect(container.querySelector('a')?.textContent).toBe('Open source');
});
it('shows explicit missing source state without inventing a citation', () => {
  render();
  expect(container.querySelector('a')).toBeNull();
  expect(container.textContent).toContain('Source link unavailable');
});
