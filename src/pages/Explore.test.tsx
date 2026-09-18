// @vitest-environment jsdom

/**
 * The public Explore page must not claim production state it has no source for.
 *
 * Every facet on this page was written against `/api/explore/*` routes that are
 * not served, and no page reads the `facet` or `oftd` query parameters, so a
 * card that navigated to `/species?facet=country` would silently return the
 * unfiltered list. These tests pin that the page says so, and that it asserts no
 * count, coverage figure or external linkage.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// PageShell renders the shared Navbar, which reads the auth session. The page
// under test is public and does not care who is signed in.
vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>(
    '@/contexts/AuthContext',
  );
  return { ...actual, useAuth: vi.fn(() => ({ session: null })) };
});

const { default: Explore } = await import('@/pages/Explore');

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter>
        <Explore />
      </MemoryRouter>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('marks every planned facet as in development', () => {
  const facets = container.querySelectorAll('[data-testid="explore-facet"]');
  const markers = container.querySelectorAll('[data-testid="explore-facet-unavailable"]');
  expect(facets.length).toBeGreaterThan(0);
  expect(markers).toHaveLength(facets.length);
  markers.forEach(marker => expect(marker.textContent).toMatch(/in development/i));
});

it('offers no interactive control for a facet that filters nothing', () => {
  const facets = container.querySelectorAll('[data-testid="explore-facet"]');
  expect(facets.length).toBeGreaterThan(0); // never pass by finding nothing
  facets.forEach(facet => {
    expect(facet.querySelector('button')).toBeNull();
    expect(facet.querySelector('a')).toBeNull();
  });
});

it('never sends a visitor to a query parameter no page reads', () => {
  // The old page navigated to /species?facet=… and /species?oftd=1, which the
  // Species page ignores, so the visitor silently got the unfiltered list.
  const controls = Array.from(container.querySelectorAll('a, button'));
  expect(controls.length).toBeGreaterThan(0);
  const targets = controls.map(node => node.getAttribute('href') ?? node.getAttribute('data-to') ?? '');
  targets.forEach(href => {
    expect(href).not.toMatch(/[?&](facet|oftd)=/);
  });
  // Also catch a control that carries the dead parameter anywhere in its markup.
  // A destination held only in an onClick closure is invisible here; the
  // preceding test covers that case by forbidding facet controls outright.
  expect(container.innerHTML).not.toMatch(/[?&](facet|oftd)=/);
});

it('links to the species browser, the one surface here backed by live data', () => {
  const link = container.querySelector('[data-testid="explore-species-browser"]');
  expect(link?.getAttribute('href')).toBe('/species');
});

it('asserts no count or coverage figure it has no source for', () => {
  const text = container.textContent ?? '';
  // "180+ countries", "850+ genera", "40+ habitats" and the like are claims
  // about production state; this page has no data source behind them.
  expect(text).not.toMatch(/\d[\d,]*\s*\+/);
  expect(text).not.toMatch(/\b\d{2,}\s+(countries|genera|habitats|species|records)\b/i);
});

it('claims no external data linkage that is not wired', () => {
  const text = container.textContent ?? '';
  expect(text).not.toMatch(/globi/i);
  expect(text).not.toMatch(/iucn-aligned|iucn-categorized/i);
  // PageShell's hero badge says "Live data · Orchid Continuum + GBIF" and is on
  // by default, so removing the page's own claims is not enough — the rendered
  // page inherits one. This asserts over what a visitor actually sees.
  expect(text).not.toMatch(/gbif/i);
  expect(text).not.toMatch(/live data/i);
});

it('does not expose internal API paths to the public', () => {
  expect(container.textContent ?? '').not.toMatch(/\/api\//);
  expect(container.innerHTML).not.toMatch(/\/api\//);
});

it('does not describe an image placeholder as a live API', () => {
  expect(container.textContent ?? '').not.toMatch(/live api/i);
});
