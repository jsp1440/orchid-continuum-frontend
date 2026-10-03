// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContinuumWeb from '@/components/orchid/ContinuumWeb';

vi.mock('@/lib/dailyGenusContext', () => ({
  useDailyGenus: () => ({
    genus: 'Phragmipedium',
    continuum: null,
    continuumStatus: 'unavailable',
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function LocationProbe() {
  const location = useLocation();
  return createElement('output', { 'data-testid': 'location' }, location.pathname);
}

function renderMountedHomepageRelationshipWeb() {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '*',
            element: createElement(
              'main',
              null,
              createElement(LocationProbe),
              createElement(ContinuumWeb),
            ),
          }),
        ),
      ),
    );
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

describe('mounted homepage relationship accessibility (#289)', () => {
  it('labels the production section and exposes native keyboard controls', () => {
    renderMountedHomepageRelationshipWeb();

    const section = container.querySelector('#continuum-web');
    expect(section?.getAttribute('aria-labelledby')).toBe('continuum-web-heading');
    expect(section?.querySelector('#continuum-web-heading')).toBeTruthy();

    const group = section?.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Featured genus relationship selectors');

    const controls = Array.from(group?.querySelectorAll('button[aria-pressed]') ?? []);
    expect(controls).toHaveLength(7);
    for (const control of controls) {
      expect(control).toBeInstanceOf(HTMLButtonElement);
      expect((control as HTMLButtonElement).tabIndex).toBe(0);
      expect(control.getAttribute('aria-controls')).toBe('continuum-relationship-evidence');
    }
  });

  it('updates the labelled evidence region through a relationship control', () => {
    renderMountedHomepageRelationshipWeb();

    const fungi = container.querySelector(
      '#continuum-relationship-fungi',
    ) as HTMLButtonElement;
    expect(fungi.getAttribute('aria-pressed')).toBe('false');

    act(() => fungi.click());

    expect(fungi.getAttribute('aria-pressed')).toBe('true');
    const region = container.querySelector('#continuum-relationship-evidence');
    expect(region?.getAttribute('role')).toBe('region');
    expect(region?.getAttribute('aria-labelledby')).toBe('continuum-relationship-fungi');
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });

  it('keeps the featured taxon action keyboard-focusable and navigable', () => {
    renderMountedHomepageRelationshipWeb();

    const featured = container.querySelector(
      'button[aria-label="Open the Phragmipedium genus page"]',
    ) as HTMLButtonElement;
    expect(featured).toBeInstanceOf(HTMLButtonElement);
    expect(featured.tabIndex).toBe(0);

    act(() => featured.click());

    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(
      '/genus/Phragmipedium',
    );
  });
});
