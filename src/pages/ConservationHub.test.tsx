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

  it('renders explicit conservation graph coverage unknown state when genus arrives from Atlas', () => {
    act(() => {
      root.render(
        <MemoryRouter
          initialEntries={['/conservation?origin=atlas-next-occurrence-evidence&genus=Dracula']}
        >
          <ConservationHub />
        </MemoryRouter>,
      );
    });

    const coverageEl = container.querySelector('[data-testid="conservation-graph-coverage"]');
    expect(coverageEl).toBeTruthy();
    const unavailableEl = container.querySelector('[data-testid="conservation-status-unavailable"]');
    expect(unavailableEl?.textContent).toMatch(/no conservation assessment for Dracula is yet documented/i);
    // Absence must be labeled as absence-of-record, not absence-of-species
    expect(unavailableEl?.textContent).toMatch(/absence here is not evidence of absence/i);
  });

  it('does not render conservation graph coverage section when no Atlas origin is present', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/conservation']}>
          <ConservationHub />
        </MemoryRouter>,
      );
    });
    expect(container.querySelector('[data-testid="conservation-graph-coverage"]')).toBeNull();
  });

  it('marks protocol library examples as illustrative placeholders', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/conservation']}>
          <ConservationHub />
        </MemoryRouter>,
      );
    });
    const notice = container.querySelector('[data-testid="protocol-library-illustrative-notice"]');
    expect(notice?.textContent).toMatch(/illustrative.*not verified records/i);
  });

  it('does not expose occurrence IDs, record IDs, or coordinate fields from the URL', () => {
    // Regression: even if malicious URL params are added, they must not appear in the DOM
    act(() => {
      root.render(
        <MemoryRouter
          initialEntries={[
            '/conservation?origin=atlas-next-occurrence-evidence&genus=Ophrys&occurrenceId=abc123&lat=37.5&lng=23.2&locality=Athens',
          ]}
        >
          <ConservationHub />
        </MemoryRouter>,
      );
    });
    const text = container.textContent ?? '';
    expect(text).not.toContain('abc123');
    expect(text).not.toContain('37.5');
    expect(text).not.toContain('23.2');
    expect(text).not.toContain('Athens');
  });
});
