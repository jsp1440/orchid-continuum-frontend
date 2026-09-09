/* @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ResearcherJefferyParham from './ResearcherJefferyParham';

vi.mock('@/components/orchid/Navbar', () => ({
  default: () => <nav aria-label="Primary navigation">Orchid Continuum</nav>,
}));

vi.mock('@/components/orchid/Footer', () => ({
  default: () => <footer>Orchid Continuum footer</footer>,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(
      <MemoryRouter>
        <ResearcherJefferyParham />
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  document.title = 'Orchid Continuum';
  document.head
    .querySelectorAll('script[data-researcher-profile="jeffery-scott-parham"]')
    .forEach((node) => node.remove());

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('public Research Station researcher profile', () => {
  it('renders the documented identity and preserves the authenticated workspace boundary', () => {
    mount();

    expect(container.querySelector('h1')?.textContent).toBe('Jeffery Scott Parham');
    expect(container.textContent).toContain('Founder and Principal Developer of Orchid Continuum');
    expect(container.textContent).toContain('President of the Five Cities Orchid Society');
    expect(container.textContent).toContain('M.S., Plant Pathology');
    expect(container.textContent).toContain('USDA Horticultural Crops Research Laboratory');
    expect(container.textContent).toContain('National University and Fresno City College');
    expect(container.textContent).toContain('nonprofit fiscal sponsorship through Ecologistics, Inc.');

    const workspaceLink = Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).find(
      (link) => link.getAttribute('href') === '/research',
    );
    expect(workspaceLink?.textContent).toContain('Research Station workspace');
    expect(container.textContent).toContain('member research workspace remains authenticated');
  });

  it('publishes deterministic browser metadata without inventing researcher credentials', () => {
    mount();

    expect(document.title).toBe(
      'Jeffery Scott Parham — Botanist & Orchid Researcher | Orchid Research Station',
    );
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain(
      'Official Orchid Research Station profile',
    );

    const script = document.querySelector<HTMLScriptElement>(
      'script[data-researcher-profile="jeffery-scott-parham"]',
    );
    const profile = JSON.parse(script?.textContent ?? '{}') as Record<string, unknown>;

    expect(profile).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Jeffery Scott Parham',
      jobTitle: 'Botanist and Orchid Researcher',
    });
    expect(script?.textContent).not.toMatch(/ORCID|publication|grant/i);
  });

  it('keeps the stable researcher route public while the research workspace stays protected', () => {
    const appSource = readFileSync('src/App.tsx', 'utf8');

    expect(appSource).toContain(
      '<Route path="/research-station/researchers/jeffery-scott-parham" element={<ResearcherJefferyParham />} />',
    );
    expect(appSource).toContain(
      '<Route path="/research" element={<ProtectedRoute title="Research Center · members only"',
    );
    expect(appSource).not.toMatch(
      /path="\/research-station\/researchers\/jeffery-scott-parham"[\s\S]{0,160}<ProtectedRoute/,
    );
  });
});
