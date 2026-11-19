// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readContinuum = vi.hoisted(() => vi.fn());
vi.mock('@/lib/featuredTaxonContinuum', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/featuredTaxonContinuum')>(),
  fetchFeaturedTaxonContinuum: readContinuum,
}));

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
  readContinuum.mockReset().mockResolvedValue({ conservation: { state: 'unknown', nodes: 0, edges: 0, relationship: null } });
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

  it('preserves bounded genus handoff without exposing occurrence locality', async () => {
    await act(async () => {
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
    expect(readContinuum).toHaveBeenCalledWith('Telipogon', expect.any(AbortSignal));
  });

  it('renders explicit conservation graph coverage unknown state when genus arrives from Atlas', async () => {
    await act(async () => {
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
    expect(unavailableEl?.textContent).toContain('No conservation graph links were returned for Dracula');
    // Absence must be labeled as absence-of-record, not absence-of-species
    expect(unavailableEl?.textContent).toContain('not evidence that threats are absent');
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

  it('does not expose occurrence IDs, record IDs, or coordinate fields from the URL', async () => {
    // Regression: even if malicious URL params are added, they must not appear in the DOM
    await act(async () => {
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
    expect(readContinuum).toHaveBeenCalledWith('Ophrys', expect.any(AbortSignal));
  });

  it('renders documented coverage and the canonical summary without deriving a threat category', async () => {
    readContinuum.mockResolvedValue({ conservation: { state: 'known', nodes: 2, edges: 3,
      relationship: { hasData: true, summary: 'Two source-backed conservation relationships.' } } });
    await act(async () => root.render(<MemoryRouter initialEntries={['/conservation?origin=atlas-next-occurrence-evidence&genus=Vanilla']}><ConservationHub /></MemoryRouter>));
    expect(container.textContent).toContain('2 linked nodes · 3 relationships');
    expect(container.textContent).toContain('Two source-backed conservation relationships.');
    expect(container.textContent).toContain('not a conservation assessment or threat category');
    expect(container.textContent).not.toContain('No conservation graph links');
  });

  it('distinguishes a failed read from an unknown assessment and hides transport details', async () => {
    readContinuum.mockRejectedValue(new Error('https://private.test 503'));
    await act(async () => root.render(<MemoryRouter initialEntries={['/conservation?origin=atlas-next-occurrence-evidence&genus=Ophrys']}><ConservationHub /></MemoryRouter>));
    expect(container.textContent).toContain('Conservation graph coverage is currently unavailable');
    expect(container.textContent).not.toMatch(/private\.test|503|No conservation graph links/);
  });

  it.each(['Ophrys Sicily', 'Ophrys/secret', 'Ophrys-1', 'O'.repeat(81)])('rejects noncanonical genus context without fetching it: %s', async genus => {
    await act(async () => root.render(<MemoryRouter initialEntries={[`/conservation?origin=atlas-next-occurrence-evidence&genus=${encodeURIComponent(genus)}`]}><ConservationHub /></MemoryRouter>));
    expect(readContinuum).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="conservation-graph-coverage"]')).toBeNull();
  });

  it('aborts an outstanding read when leaving the handoff', async () => {
    readContinuum.mockImplementation(() => new Promise(() => {}));
    await act(async () => root.render(<MemoryRouter initialEntries={['/conservation?origin=atlas-next-occurrence-evidence&genus=Ophrys']}><ConservationHub /></MemoryRouter>));
    const signal = readContinuum.mock.calls[0][1] as AbortSignal;
    act(() => root.render(null));
    expect(signal.aborted).toBe(true);
  });
});
