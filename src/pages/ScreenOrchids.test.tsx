// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ScreenOrchids from './ScreenOrchids';

/**
 * The recovered film writing, rendered.
 *
 * A reading experience, not a media library. The page must render no image,
 * no embed and no outbound film link — not because it forgot to, but because
 * the recovered data has no field for any of them.
 */

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false })),
}));

vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>(
    '@/contexts/AuthContext',
  );
  return { ...actual, useAuth: mocks.useAuth };
});

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ScreenOrchids />
      </MemoryRouter>,
    );
  });
}

const text = () => container.textContent ?? '';
const entries = () => container.querySelectorAll('[data-testid="screen-orchid"]');

async function search(value: string) {
  const input = container.querySelector('input[type="search"]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe('orchids on screen', () => {
  it('renders the whole collection grouped by decade', async () => {
    await mount();
    expect(entries()).toHaveLength(20);
    expect(text()).toContain('1930s');
    expect(text()).toContain('20 of 20 readings');
  });

  it('shows the writing, not just the credits', async () => {
    await mount();
    expect(text()).toContain('Decay Beneath Glamour');
    expect(text()).toMatch(/moral corruption hiding beneath high society/i);
  });

  it('renders no image and no outbound link within the recovered entries', async () => {
    await mount();
    // Scoped to the entries themselves: the surrounding PageShell carries the
    // site's own chrome and partner links, which are not what this guards.
    for (const entry of entries()) {
      expect(entry.querySelectorAll('img')).toHaveLength(0);
      expect(entry.querySelectorAll('iframe')).toHaveLength(0);
      expect(entry.querySelectorAll('a')).toHaveLength(0);
    }
    // And nothing in the rendered readings is a URL at all.
    const rendered = [...entries()].map((entry) => entry.textContent ?? '').join(' ');
    expect(rendered).not.toMatch(/https?:\/\//);
  });

  it('states on the page that no media was reproduced', async () => {
    await mount();
    expect(text()).toMatch(/No posters, stills, trailers or film links are reproduced/i);
    expect(text()).toMatch(/FCOS article collection/i);
  });

  it('filters the readings', async () => {
    await mount();
    await search('Bogart');
    expect(entries()).toHaveLength(1);
    expect(text()).toContain('The Big Sleep');

    await search('zzz-no-such-film');
    expect(entries()).toHaveLength(0);
    expect(text()).toMatch(/No reading in this collection matches/i);
  });
});
