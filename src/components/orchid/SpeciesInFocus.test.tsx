// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SpeciesCard } from './SpeciesInFocus';
import type { FeaturedSpecies } from '@/lib/speciesFeature';

/**
 * Regression coverage for the homepage Species-in-Focus card's Atlas action.
 *
 * The "View in atlas" link must go through the same guarded canonical
 * species → Atlas contract the Species Dossier uses, and must fail closed
 * (omit the action) when the featured entry is not a bounded canonical
 * binomial — a genus-only or grex/hybrid label must never be widened into a
 * species-filtered Atlas search.
 */

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

function renderCard(data: FeaturedSpecies) {
  act(() => {
    root.render(
      <MemoryRouter>
        <SpeciesCard data={data} />
      </MemoryRouter>,
    );
  });
}

function atlasLink(): HTMLAnchorElement | null {
  return container.querySelector<HTMLAnchorElement>('a[href^="/atlas?species="]');
}

describe('Species-in-Focus card → Atlas action', () => {
  it('routes the Atlas action through the canonical guard for a bounded binomial', () => {
    renderCard({ name: 'Cattleya labiata', genus: 'Cattleya' });

    const link = atlasLink();
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/atlas?species=Cattleya+labiata');
    expect(link?.textContent).toContain('View in atlas');
  });

  it('fails closed on a genus-only featured name, keeping the species card action', () => {
    renderCard({ name: 'Cattleya', genus: 'Cattleya' });

    expect(atlasLink()).toBeNull();
    // No Atlas link of any shape should leak the non-species label.
    expect(container.querySelector('a[href^="/atlas"]')).toBeNull();
    // The always-available species-card navigation is unaffected.
    expect(container.querySelector('button[aria-label="View Cattleya"]')).toBeTruthy();
  });

  it('fails closed on a grower/grex-style label rather than widening it', () => {
    renderCard({ name: 'Cattleya Bow Bells', genus: 'Cattleya' });

    expect(atlasLink()).toBeNull();
  });
});
