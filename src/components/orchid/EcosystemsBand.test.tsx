// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import EcosystemsBand from './EcosystemsBand';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function render(twice = false) {
  act(() => {
    root.render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <EcosystemsBand />
        {twice && <EcosystemsBand />}
        <Location />
      </MemoryRouter>,
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

describe('EcosystemsBand accessibility (#289)', () => {
  it('names the region and makes the all-communities link understandable outside its context', () => {
    render();
    const region = container.querySelector('section')!;
    expect(document.getElementById(region.getAttribute('aria-labelledby')!)).toBe(region.querySelector('h2'));
    const all = container.querySelector('a[href="/ecosystems"]')!;
    expect(all.getAttribute('aria-label')).toBe('Explore all seven communities of practice');
    expect(all.textContent).toBe('Explore all seven');
  });

  it('announces each community name and description without decorative numerals or icons', () => {
    render();
    const cards = [...container.querySelectorAll('a[aria-labelledby]')];
    expect(cards).toHaveLength(7);
    for (const card of cards) {
      const label = document.getElementById(card.getAttribute('aria-labelledby')!);
      const description = document.getElementById(card.getAttribute('aria-describedby')!);
      expect(label?.parentElement).toBe(card);
      expect(label?.textContent?.trim()).toBeTruthy();
      expect(description?.parentElement).toBe(card);
      expect(description?.textContent?.trim()).toBeTruthy();
      expect(card.querySelector('span')?.getAttribute('aria-hidden')).toBe('true');
    }
    expect([...container.querySelectorAll('svg')].every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('preserves native link keyboard semantics, document-order focus and every existing destination', () => {
    render();
    const destinations = ['/ecosystems', '/explore', '/collection', '/university', '/classroom', '/research', '/conservation', '/societies'];
    const links = [...container.querySelectorAll('a')];
    expect(links).toHaveLength(destinations.length);
    links.forEach((link, index) => {
      // Native links activate with Enter; Space keeps its normal page-scroll
      // behavior. Do not replace links with button roles or custom key handlers.
      expect(link.getAttribute('href')).toBe(destinations[index]);
      expect(link.getAttribute('role')).toBeNull();
      expect(link.tabIndex).toBe(0);
      link.focus();
      expect(document.activeElement).toBe(link);
      act(() => link.click());
      expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(destinations[index]);
      expect(link.className).toContain('focus-visible:outline-2');
      expect(link.className).toContain('focus-visible:outline-offset-4');
    });
  });

  it('keeps accessible references unique across repeated component instances', () => {
    render(true);
    const ids = [...container.querySelectorAll('[aria-labelledby], [aria-describedby]')]
      .flatMap((element) => ['aria-labelledby', 'aria-describedby'].map((name) => element.getAttribute(name)))
      .filter((id): id is string => id !== null);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => document.getElementById(id))).toBe(true);
  });
});
