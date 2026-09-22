// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import CapabilityGrid from '@/components/orchid/CapabilityGrid';
import EcosystemsBand from '@/components/orchid/EcosystemsBand';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function LocationProbe() {
  const location = useLocation();
  return createElement('output', { 'data-testid': 'location' }, location.pathname);
}

function renderHomepageBands() {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(
          Routes,
          null,
          createElement(
            Route,
            {
              path: '*',
              element: createElement(
                'main',
                null,
                createElement(LocationProbe),
                createElement(CapabilityGrid),
                createElement(EcosystemsBand),
              ),
            },
          ),
        ),
      ),
    );
  });
}

function pressKey(element: HTMLElement, key: 'Enter' | ' ') {
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('homepage accessibility (#289)', () => {
  it('exposes labelled capability cards as a keyboard-focusable list', () => {
    renderHomepageBands();

    const section = container.querySelector('#what-the-graph-makes-possible');
    expect(section?.getAttribute('aria-labelledby')).toBe('capability-grid-heading');

    const list = section?.querySelector('[role="list"]');
    expect(list?.getAttribute('aria-label')).toBe('Orchid Continuum capabilities');

    const cards = Array.from(list?.querySelectorAll('[role="listitem"] > button') ?? []);
    expect(cards).toHaveLength(8);
    for (const card of cards) {
      const labelledBy = card.getAttribute('aria-labelledby');
      const describedBy = card.getAttribute('aria-describedby');
      expect(labelledBy && section?.querySelector(`#${labelledBy}`)).toBeTruthy();
      expect(describedBy && section?.querySelector(`#${describedBy}`)).toBeTruthy();
      expect((card as HTMLButtonElement).tabIndex).toBe(0);
    }
  });

  it('activates capability cards with Space and Enter', () => {
    renderHomepageBands();
    const firstCard = container.querySelector(
      '#what-the-graph-makes-possible [role="listitem"] > button',
    ) as HTMLButtonElement;

    firstCard.focus();
    pressKey(firstCard, ' ');
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/atlas');

    renderHomepageBands();
    const secondCard = container.querySelectorAll(
      '#what-the-graph-makes-possible [role="listitem"] > button',
    )[1] as HTMLButtonElement;
    pressKey(secondCard, 'Enter');
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/oacs');
  });

  it('labels ecosystem links and activates cards with Space and Enter', () => {
    renderHomepageBands();

    const section = container.querySelector('#ecosystems');
    expect(section?.getAttribute('aria-labelledby')).toBe('ecosystems-heading');
    const list = section?.querySelector('[role="list"]');
    expect(list?.getAttribute('aria-label')).toBe('Communities of practice');

    const links = Array.from(section?.querySelectorAll('a') ?? []);
    expect(links).toHaveLength(8);
    for (const link of links) {
      expect(link.getAttribute('aria-label')).toBeTruthy();
      expect((link as HTMLAnchorElement).tabIndex).toBe(0);
    }

    const firstCard = list?.querySelector('a[href="/explore"]') as HTMLAnchorElement;
    pressKey(firstCard, ' ');
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/explore');

    renderHomepageBands();
    const allEcosystems = section?.querySelector('a[href="/ecosystems"]') as HTMLAnchorElement;
    pressKey(allEcosystems, 'Enter');
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/ecosystems');
  });
});
