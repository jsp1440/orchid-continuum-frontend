// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Release 1 journey 1: three Release 1 surfaces — the Illustrated Lexicon,
 * Orchid identification and the Literature corpus — were mounted but nothing
 * on the home page linked to them. The Lexicon was reachable only through a
 * footer button labelled "Glossary"; the other two only by typing a URL.
 *
 * The fix puts all three in the navigation drawer / "More" menu and renders
 * them in the footer as real links on every page. Linking is not authorization:
 * `/literature` keeps its ProtectedRoute, so a visitor who follows the link
 * sees the sign-in gate (asserted in App.tsx below, not re-implemented here).
 */

const mocks = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>('@/contexts/AuthContext');
  return { ...actual, useAuth: mocks.useAuth };
});

import Footer from './Footer';
import Navbar from './Navbar';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SIGNED_OUT = { user: null, session: null, loading: false, signOut: vi.fn() };
const R1_SURFACES = [
  { route: '/lexicon', label: 'Illustrated Lexicon' },
  { route: '/orchid-identification', label: 'Orchid identification' },
  { route: '/literature', label: 'Literature' },
];

let container: HTMLDivElement;
let root: Root;
let currentPath = '/';

const PathProbe: React.FC = () => {
  currentPath = useLocation().pathname;
  return null;
};

async function mount(node: React.ReactNode) {
  mocks.useAuth.mockReturnValue(SIGNED_OUT);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/']}>
        <Routes><Route path="*" element={<>{node}<PathProbe /></>} /></Routes>
      </MemoryRouter>,
    );
  });
}

const click = async (element: Element) => {
  await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); });
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  currentPath = '/';
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
});

describe('footer links the Release 1 surfaces', () => {
  it.each(R1_SURFACES)('renders a real link to $route', async ({ route, label }) => {
    await mount(<Footer />);
    const links = [...container.querySelectorAll('a[href]')].filter((a) => a.getAttribute('href') === route);
    expect(links.length, `${route} footer link`).toBe(1);
    expect(links[0].textContent).toBe(label);
  });

  it('follows the Literature link to the (still protected) route', async () => {
    await mount(<Footer />);
    const link = container.querySelector('a[href="/literature"]')!;
    await click(link);
    expect(currentPath).toBe('/literature');
  });
});

describe('site navigation offers the Release 1 surfaces', () => {
  it.each(R1_SURFACES)('lists $label in the phone navigation drawer and navigates to $route', async ({ route, label }) => {
    await mount(<Navbar />);
    const toggle = container.querySelector('button[aria-label="Toggle navigation"]')!;
    await click(toggle);
    const item = [...container.querySelectorAll('header button')].find((b) => b.textContent === label);
    expect(item, `${label} in drawer`).toBeDefined();
    await click(item!);
    expect(currentPath).toBe(route);
  });

  it.each(R1_SURFACES)('lists $label in the desktop More menu', async ({ label }) => {
    await mount(<Navbar />);
    const more = [...container.querySelectorAll('header nav button')].find((b) => b.textContent?.trim() === 'More')!;
    await click(more);
    const item = [...container.querySelectorAll('header nav button')].find((b) => b.querySelector('div')?.textContent === label);
    expect(item, `${label} in More menu`).toBeDefined();
  });

  it('does not loosen the Literature guard by linking to it', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(app).toMatch(/<Route path="\/literature" element={<ProtectedRoute[^>]*><Literature \/><\/ProtectedRoute>} \/>/);
  });
});
