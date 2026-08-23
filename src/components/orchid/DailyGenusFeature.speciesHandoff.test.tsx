// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/lib/dailyGenusContext', () => ({
  useDailyGenus: () => ({ genus: 'Phalaenopsis' }),
}));

vi.mock('@/components/orchid/DailyGenusFeatureContinuum', () => ({
  default: () => <div data-testid="continuum" />,
}));

const { default: DailyGenusFeature } = await import('@/components/orchid/DailyGenusFeature');

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

describe('Genus of the Day continuation', () => {
  it('mounts the canonical featured-genus Species and Research handoffs', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <DailyGenusFeature />
        </MemoryRouter>,
      );
    });

    const links = Array.from(container.querySelectorAll('a')) as HTMLAnchorElement[];
    const species = links.find((link) => link.textContent?.includes('Browse Phalaenopsis species'));
    const research = links.find((link) => link.textContent?.includes('Continue in Research Station'));

    expect(species?.getAttribute('href')).toBe('/species?genus=Phalaenopsis');
    expect(research?.getAttribute('href')).toBe(
      '/research?genus=Phalaenopsis&origin=homepage-featured-taxon&context_is_evidence=false',
    );

    const speciesUrl = new URL(species?.getAttribute('href') ?? '', 'https://orchid.test');
    expect([...speciesUrl.searchParams.keys()]).toEqual(['genus']);
    expect(speciesUrl.search).not.toMatch(
      /locality|latitude|longitude|occurrence|record|collector|catalog|evidence|confidence|conclusion/i,
    );
  });
});
