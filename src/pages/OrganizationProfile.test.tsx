// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/orchid/PageShell', () => ({
  default: ({
    title,
    intro,
    heroAside,
    children,
  }: {
    title: string;
    intro: string;
    heroAside?: ReactNode;
    children: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{intro}</p>
      {heroAside}
      {children}
    </main>
  ),
}));

vi.mock('@/components/orchid/RoleBadge', () => ({
  default: () => <span>organization role</span>,
}));

const { default: OrganizationProfile } = await import('./OrganizationProfile');

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderProfile(slug: string) {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[`/org/${slug}`]}>
        <Routes>
          <Route path="/org/:slug" element={<OrganizationProfile />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

describe('OrganizationProfile public disclosure boundary', () => {
  it('shows an explicit unavailable state without the former unsupported organization claims', () => {
    renderProfile('andean-orchid-trust');

    expect(container.textContent).toContain('Organization profile unavailable');
    expect(container.textContent).toContain('No verified public organization record');
    expect(
      container.querySelector('[data-testid="organization-record-key"]')?.textContent,
    ).toContain('andean-orchid-trust');

    expect(container.textContent).not.toContain('Quito');
    expect(container.textContent).not.toContain('steward@orchidcontinuum.org');
    expect(container.textContent).not.toContain('412 members');
    expect(container.textContent).not.toContain('eight reserve managers');
    expect(container.textContent).not.toContain('High-Andean Pollinator Pulse');
    expect(container.textContent).not.toContain('Telipogon');
  });

  it('does not transform an arbitrary route slug into a claimed organization identity', () => {
    renderProfile('unverified-example-partner');

    expect(container.querySelector('h1')?.textContent).toBe('Organization profile unavailable');
    expect(container.textContent).toContain('unverified-example-partner');
    expect(container.textContent).not.toContain('Unverified Example Partner');
    expect(container.textContent).toContain('No verified projects to display');
  });
});
