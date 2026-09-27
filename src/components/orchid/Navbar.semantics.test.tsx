// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Site navigation is made of real links, not buttons that call navigate().
 *
 * A `<button onClick={navigate}>` is announced as a button, cannot be opened
 * in a new tab (middle-click, Ctrl/Cmd-click, "copy link"), and has no URL a
 * crawler or a visitor can see. Every item below that goes somewhere must be
 * an `<a href>`; controls that open a menu or a dialog stay buttons.
 *
 * The phone drawer is a disclosure panel inside the header (not a modal): its
 * toggle reports aria-expanded, and Escape closes it and returns focus to the
 * toggle. Real Enter/Space activation of the toggle is exercised in the
 * browser (e2e/a11y-core-routes.spec.ts); jsdom does not synthesise clicks
 * from key presses.
 */

const mocks = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>('@/contexts/AuthContext');
  return { ...actual, useAuth: mocks.useAuth };
});

import Navbar from './Navbar';

const SIGNED_OUT = { user: null, session: null, loading: false, signOut: vi.fn() };
const PRIMARY = [
  ['Home', '/'],
  ['Conservatory', '/conservatory'],
  ['Atlas', '/atlas'],
  ['Species', '/species'],
  ['CALYX', '/calyx'],
  ['Education', '/education'],
  ['OASIS', '/oacs'],
  ['About', '/about'],
] as const;

let container: HTMLDivElement;
let root: Root;
let currentPath = '/';

const PathProbe: React.FC = () => {
  currentPath = useLocation().pathname;
  return null;
};

async function mount(initial = '/') {
  mocks.useAuth.mockReturnValue(SIGNED_OUT);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[initial]}>
        <Routes><Route path="*" element={<><Navbar /><PathProbe /></>} /></Routes>
      </MemoryRouter>,
    );
  });
}

const click = async (element: Element) => {
  await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); });
};
const desktopNav = () => container.querySelector('header nav[aria-label="Primary"]')!;
const toggle = () => container.querySelector<HTMLButtonElement>('button[aria-label="Toggle navigation"]')!;
const drawer = () => container.querySelector('#site-mobile-nav');
const linkIn = (scope: Element, label: string) =>
  [...scope.querySelectorAll('a')].find((a) => a.textContent?.trim() === label);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  currentPath = '/';
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
});

describe('primary navigation is made of links', () => {
  it.each(PRIMARY)('desktop %s is an <a href="%s">', async (label, route) => {
    await mount();
    const link = linkIn(desktopNav(), label);
    expect(link, `${label} link`).toBeDefined();
    expect(link!.getAttribute('href')).toBe(route);
    // No nav destination is left behind as a button.
    const asButton = [...desktopNav().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    expect(asButton).toBeUndefined();
  });

  it('Join is a link to /get-involved; Sign in and More stay buttons', async () => {
    await mount();
    expect(linkIn(desktopNav(), 'Join')?.getAttribute('href')).toBe('/get-involved');
    const buttons = [...desktopNav().querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(buttons).toContain('More');
    expect(buttons).toContain('Sign in');
  });

  it('marks exactly the current page with aria-current="page"', async () => {
    await mount('/species/Phalaenopsis%20amabilis');
    const current = [...desktopNav().querySelectorAll('[aria-current]')];
    expect(current.map((a) => [a.textContent, a.getAttribute('aria-current')])).toEqual([['Species', 'page']]);
  });

  it('marks Home current only on the home page', async () => {
    await mount('/');
    expect(linkIn(desktopNav(), 'Home')!.getAttribute('aria-current')).toBe('page');
    expect(linkIn(desktopNav(), 'Atlas')!.hasAttribute('aria-current')).toBe(false);
  });

  it('following a link navigates in-app', async () => {
    await mount('/');
    await click(linkIn(desktopNav(), 'Atlas')!);
    expect(currentPath).toBe('/atlas');
  });

  it('carries the single Atlas genus into the Species, CALYX and Research hrefs', async () => {
    await mount('/atlas?genera=Cattleya');
    const species = new URL(linkIn(desktopNav(), 'Species')!.getAttribute('href')!, 'https://x.local');
    expect(species.pathname).toBe('/species');
    expect(species.searchParams.get('genus')).toBe('Cattleya');
    const calyx = new URL(linkIn(desktopNav(), 'CALYX')!.getAttribute('href')!, 'https://x.local');
    expect(calyx.pathname).toBe('/calyx');
    expect(calyx.search).toContain('Cattleya');
    const more = [...desktopNav().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'More')!;
    await click(more);
    const research = [...desktopNav().querySelectorAll('a')].find((a) => a.querySelector('div')?.textContent === 'Research Center')!;
    const researchUrl = new URL(research.getAttribute('href')!, 'https://x.local');
    expect(researchUrl.pathname).toBe('/research');
    expect(researchUrl.search).toContain('Cattleya');
  });

  it('does not hand a genus on when Atlas holds several', async () => {
    await mount('/atlas?genera=Cattleya|Laelia');
    expect(linkIn(desktopNav(), 'Species')!.getAttribute('href')).toBe('/species');
  });

  it('the More menu trigger reports its state', async () => {
    await mount();
    const more = [...desktopNav().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'More')!;
    expect(more.getAttribute('aria-expanded')).toBe('false');
    await click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector(`#${more.getAttribute('aria-controls')}`)).not.toBeNull();
  });

  it('a pointer click after hover-open keeps the More menu open; keyboard activation toggles', async () => {
    await mount();
    const more = [...desktopNav().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'More')!;
    // Pointer: hovering opens it, then the click (detail 1) must not shut it.
    await act(async () => { more.parentElement!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })); });
    expect(more.getAttribute('aria-expanded')).toBe('true');
    await act(async () => { more.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })); });
    expect(more.getAttribute('aria-expanded')).toBe('true');
    // Keyboard (Enter/Space activate with detail 0): toggles.
    await act(async () => { more.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 })); });
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('Escape closes the More menu and returns focus to its trigger', async () => {
    await mount();
    const more = [...desktopNav().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'More')!;
    await click(more);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more);
  });
});

describe('phone drawer', () => {
  it('toggle is a named button that reports expanded state and controls the drawer', async () => {
    await mount();
    expect(toggle().getAttribute('type')).toBe('button');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-controls')).toBe('site-mobile-nav');
    expect(drawer()).toBeNull();
    await click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(drawer()?.tagName).toBe('NAV');
    expect(drawer()?.getAttribute('aria-label')).toBeTruthy();
  });

  it('lists every primary destination as a link', async () => {
    await mount();
    await click(toggle());
    for (const [label, route] of PRIMARY) {
      expect(linkIn(drawer()!, label)?.getAttribute('href'), label).toBe(route);
    }
    expect(linkIn(drawer()!, 'Join the Continuum')?.getAttribute('href')).toBe('/get-involved');
  });

  it('Escape closes the drawer and returns focus to the toggle', async () => {
    await mount();
    await click(toggle());
    linkIn(drawer()!, 'Atlas')!.focus();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(drawer()).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle());
  });

  it('following a drawer link closes the drawer', async () => {
    await mount();
    await click(toggle());
    await click(linkIn(drawer()!, 'Species')!);
    expect(currentPath).toBe('/species');
    expect(drawer()).toBeNull();
  });
});
