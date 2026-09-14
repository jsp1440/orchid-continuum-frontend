// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import CapabilityGrid from './CapabilityGrid';

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
        <CapabilityGrid />
        {twice && <CapabilityGrid />}
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

describe('CapabilityGrid accessibility (#289)', () => {
  it('names the region from its visible heading', () => {
    render();
    const region = container.querySelector('section')!;
    expect(document.getElementById(region.getAttribute('aria-labelledby')!)).toBe(
      region.querySelector('h2'),
    );
  });

  it('gives every card its visible title as a concise name and keeps the body as a description', () => {
    render();
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons).toHaveLength(8);
    for (const button of buttons) {
      expect(document.getElementById(button.getAttribute('aria-labelledby')!)).toBe(
        button.querySelector('h3'),
      );
      expect(document.getElementById(button.getAttribute('aria-describedby')!)).toBe(
        button.querySelector('p'),
      );
      expect([...button.querySelectorAll('svg')].every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
    }
  });

  it('retains native Enter/Space buttons, sequential focus and the existing destinations', () => {
    render();
    const destinations = ['/atlas', '/oacs', '/explore', '/research', '/collection', '/collection', '/intelligence-graph', '/education'];
    const buttons = [...container.querySelectorAll('button')];
    buttons.forEach((button, index) => {
      // Native buttons provide Enter/Space activation. jsdom does not implement
      // browser key default actions, so check focus and the resulting activation
      // separately rather than claiming synthetic key events exercise a browser.
      expect(button.type).toBe('button');
      expect(button.tabIndex).toBe(0);
      expect(button.disabled).toBe(false);
      button.focus();
      expect(document.activeElement).toBe(button);
      act(() => button.click());
      expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(destinations[index]);
      expect(button.className).toContain('focus-visible:outline-2');
      expect(button.className).toContain('focus-visible:outline-offset-4');
    });
  });

  it('keeps accessible references unique when more than one grid is rendered', () => {
    render(true);
    const ids = [...container.querySelectorAll('[aria-labelledby], [aria-describedby]')]
      .flatMap((element) => ['aria-labelledby', 'aria-describedby'].map((name) => element.getAttribute(name)))
      .filter((id): id is string => id !== null);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => document.getElementById(id))).toBe(true);
  });
});
