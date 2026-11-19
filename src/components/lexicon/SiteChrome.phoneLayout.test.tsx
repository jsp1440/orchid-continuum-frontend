// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SiteHeader } from './SiteChrome';

/**
 * Release 1 journey 13 (phone): the Lexicon header pushed its own navigation
 * toggle off a 390px screen.
 *
 * The brand button kept its min-content width (logo plus the untruncated
 * "Illustrated Orchid Lexicon"), so the right-hand cluster — theme, display
 * settings and the navigation toggle — was shoved past the viewport edge and
 * the page scrolled sideways by 19px at 390, 49px at 360 and 89px at 320.
 *
 * jsdom has no layout engine, so the measured proof is the browser spec
 * `e2e/r1-phone-layout.spec.ts`. This pins the structural contract that makes
 * the header fit — a shrinkable, truncating brand and a non-shrinking control
 * cluster — and that every header control has an accessible name, so the fix
 * cannot be reverted without a unit failure as well.
 */

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
});

async function mount(onNavigate = vi.fn()) {
  await act(async () => {
    root.render(<SiteHeader view="home" onNavigate={onNavigate} />);
  });
  return onNavigate;
}

/** Accessible name as a screen reader would compute it for these buttons. */
function accessibleName(element: Element): string {
  const label = element.getAttribute('aria-label');
  if (label && label.trim()) return label.trim();
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('[aria-hidden], [aria-hidden="true"]').forEach((node) => node.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const classes = (element: Element | null) => new Set((element?.getAttribute('class') ?? '').split(/\s+/));

describe('Lexicon header on a phone', () => {
  it('lets the brand shrink and truncate instead of pushing the controls off-screen', async () => {
    await mount();
    const brand = container.querySelector('[data-testid="lexicon-brand"]');
    expect(brand).not.toBeNull();
    // min-width:auto on a flex item is its min-content width; min-w-0 is what
    // allows it to give up space to the controls.
    expect(classes(brand).has('min-w-0')).toBe(true);
    const lines = [...brand!.querySelectorAll('span.block')];
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) expect(classes(line).has('truncate')).toBe(true);
  });

  it('keeps the control cluster at its natural width', async () => {
    await mount();
    const controls = container.querySelector('[data-testid="lexicon-header-controls"]');
    expect(controls).not.toBeNull();
    expect(classes(controls).has('flex-none')).toBe(true);
    // An unprefixed gap-4 on the header row was part of the overflow budget at 320px.
    const row = controls!.parentElement;
    expect(classes(row).has('gap-4')).toBe(false);
  });

  it('gives every header control an accessible name', async () => {
    await mount();
    const buttons = [...container.querySelectorAll('header button')];
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    const unnamed = buttons.filter((button) => !accessibleName(button)).map((button) => button.outerHTML.slice(0, 120));
    expect(unnamed).toEqual([]);
    const names = buttons.map(accessibleName);
    expect(names).toContain('Toggle navigation');
    expect(names.some((name) => /^Display settings/.test(name))).toBe(true);
    expect(names.some((name) => /^Switch to (dark|light) theme/.test(name))).toBe(true);
  });

  it('still opens the phone navigation from the toggle', async () => {
    const onNavigate = await mount();
    const toggle = [...container.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Toggle navigation')!;
    const menu = container.querySelector('#lexicon-mobile-nav') as HTMLElement;
    expect(menu.hidden).toBe(true);
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(menu.hidden).toBe(false);
    const lexiconItem = [...menu.querySelectorAll('button')].find((button) => button.textContent === 'A–Z Lexicon')!;
    await act(async () => { lexiconItem.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onNavigate).toHaveBeenCalledWith('lexicon', undefined);
  });
});
