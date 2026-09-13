// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
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

vi.mock('@/components/orchid/EducationalOverlay', () => ({
  default: ({ title, body }: { title: string; body: ReactNode }) => (
    <aside>
      <h2>{title}</h2>
      {body}
    </aside>
  ),
}));

vi.mock('@/components/orchid/GlossaryTerm', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/orchid/RoleBadge', () => ({
  default: () => <span>role</span>,
}));

const { default: ConservationHub } = await import('./ConservationHub');

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

describe('ConservationHub public partner boundary', () => {
  it('fails closed when verified organization and project records are unavailable', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/conservation']}>
          <ConservationHub />
        </MemoryRouter>,
      );
    });

    expect(
      container.querySelector('[data-testid="organization-directory-unavailable"]')?.textContent,
    ).toContain('No verified member organizations are published yet');
    expect(
      container.querySelector('[data-testid="project-directory-unavailable"]')?.textContent,
    ).toContain('No verified project workspaces are published yet');

    expect(container.textContent).not.toContain('Andean Orchid Trust');
    expect(container.textContent).not.toContain('South Asia Orchidaceae Network');
    expect(container.textContent).not.toContain('Borneo Canopy Initiative');
    expect(container.textContent).not.toContain('High-Andean Pollinator Pulse');
    expect(container.textContent).not.toContain('14,000 voucher specimens');
    expect(container.textContent).not.toContain('Cajamarca, Peru');
  });

  it('preserves bounded genus handoff without exposing occurrence locality', () => {
    act(() => {
      root.render(
        <MemoryRouter
          initialEntries={['/conservation?origin=atlas-next-occurrence-evidence&genus=Telipogon']}
        >
          <ConservationHub />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Conservation context for Telipogon');
    expect(container.textContent).toContain(
      'precise coordinates, locality, and occurrence identifiers remain in Atlas',
    );
    expect(container.textContent).not.toContain('Quito');
    expect(container.textContent).not.toContain('Loja');
  });
});
