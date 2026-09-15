// @vitest-environment jsdom
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Mock AuthContext (not used directly in DeceptionLab, but AuthProvider in
// the tree requires it when mounted through real contexts)
// ---------------------------------------------------------------------------
const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, signOut: vi.fn(), loading: false })),
);
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import DeceptionLab from './DeceptionLab';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let container: HTMLDivElement;

function renderLab() {
  act(() => {
    createRoot(container).render(
      <MemoryRouter>
        <DeceptionLab />
      </MemoryRouter>,
    );
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeceptionLab', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders the page root element', () => {
    renderLab();
    expect(container.querySelector('[data-testid="deception-lab-page"]')).toBeTruthy();
  });

  it('renders the page title "Deception Lab"', () => {
    renderLab();
    const title = container.querySelector('[data-testid="deception-lab-title"]');
    expect(title?.textContent).toContain('Deception Lab');
  });

  it('renders the provenance notice with role=note', () => {
    renderLab();
    const notice = container.querySelector('[data-testid="deception-lab-provenance-notice"]');
    expect(notice).toBeTruthy();
    expect(notice?.getAttribute('role')).toBe('note');
    expect(notice?.textContent).toMatch(/not scientific evidence/i);
  });

  it('does not silently promote observations to canonical scientific fact — notice present', () => {
    renderLab();
    const text = container.textContent ?? '';
    expect(text).toMatch(/no.*observation.*automatically promoted/i);
  });

  it('asserts sensitive orchid localities are not exposed by default', () => {
    renderLab();
    const text = container.textContent ?? '';
    expect(text).toMatch(/sensitive.*orchid.*local/i);
    expect(text).toMatch(/never exposed by default/i);
  });

  it('renders the scientific questions tab panel by default', () => {
    renderLab();
    expect(container.querySelector('[data-testid="tab-panel-questions"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="question-families-list"]')).toBeTruthy();
  });

  it('renders all six question family cards', () => {
    renderLab();
    const families = container.querySelectorAll('[data-testid^="question-family-"]');
    expect(families.length).toBe(6);
  });

  it('switches to the workspace tab and shows the hypothesis loop', () => {
    renderLab();
    const workspaceTab = container.querySelector('[data-testid="tab-workspace"]');
    act(() => {
      (workspaceTab as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="tab-panel-workspace"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="hypothesis-loop"]')).toBeTruthy();
  });

  it('workspace tab: hypothesis loop has at least 2 competing hypotheses described', () => {
    renderLab();
    act(() => {
      (container.querySelector('[data-testid="tab-workspace"]') as HTMLButtonElement).click();
    });
    const text = container.querySelector('[data-testid="hypothesis-loop"]')?.textContent ?? '';
    expect(text).toMatch(/≥2|at least two/i);
  });

  it('workspace tab: each hypothesis has supporting/contradicting/unknown evidence distinction', () => {
    renderLab();
    act(() => {
      (container.querySelector('[data-testid="tab-workspace"]') as HTMLButtonElement).click();
    });
    const text = container.textContent ?? '';
    expect(text).toMatch(/supporting/i);
    expect(text).toMatch(/contradicting/i);
    expect(text).toMatch(/unknown/i);
  });

  it('workspace tab: field follow-up suggestions are described as non-destructive', () => {
    renderLab();
    act(() => {
      (container.querySelector('[data-testid="tab-workspace"]') as HTMLButtonElement).click();
    });
    const text = container.textContent ?? '';
    expect(text).toMatch(/non-destructive/i);
  });

  it('workspace tab: no conferencing/hardware purchase without owner gate', () => {
    renderLab();
    act(() => {
      (container.querySelector('[data-testid="tab-workspace"]') as HTMLButtonElement).click();
    });
    const text = container.textContent ?? '';
    expect(text).toMatch(/owner.*authorization|owner.*gated|owner.*gate/i);
  });

  it('switches to the integrations tab and shows integration cards', () => {
    renderLab();
    act(() => {
      (container.querySelector('[data-testid="tab-integrations"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="tab-panel-integrations"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="integrations-list"]')).toBeTruthy();
  });

  it('integrations tab: Atlas integration card is present and links to /atlas', () => {
    renderLab();
    act(() => {
      (container.querySelector('[data-testid="tab-integrations"]') as HTMLButtonElement).click();
    });
    const atlas = container.querySelector('[data-testid="integration-atlas"]');
    expect(atlas).toBeTruthy();
    const link = atlas?.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/atlas');
  });

  it('integrations tab: OASIS Community integration card is present', () => {
    renderLab();
    act(() => {
      (container.querySelector('[data-testid="tab-integrations"]') as HTMLButtonElement).click();
    });
    const oasis = container.querySelector('[data-testid="integration-oasis-community"]');
    expect(oasis).toBeTruthy();
  });

  it('integrations tab: CALYX integration card is present', () => {
    renderLab();
    act(() => {
      (container.querySelector('[data-testid="tab-integrations"]') as HTMLButtonElement).click();
    });
    const calyx = container.querySelector('[data-testid="integration-calyx-research-assistant"]');
    expect(calyx).toBeTruthy();
  });

  it('renders the epistemic footer with scientific provenance notice', () => {
    renderLab();
    const footer = container.querySelector('[data-testid="deception-lab-epistemic-footer"]');
    expect(footer).toBeTruthy();
    expect(footer?.textContent).toMatch(/human scientific review/i);
    expect(footer?.textContent).toMatch(/knowledge graph/i);
  });

  it('expanding a question family card shows testable question examples', () => {
    renderLab();
    const firstCard = container.querySelector('[data-testid="question-family-repeated-evolution"]');
    const toggle = firstCard?.querySelector('button');
    act(() => {
      (toggle as HTMLButtonElement).click();
    });
    const text = firstCard?.textContent ?? '';
    expect(text).toMatch(/testable question examples/i);
  });

  it('question family cards state evidence state is tracked per hypothesis — not established facts', () => {
    renderLab();
    const firstCard = container.querySelector('[data-testid="question-family-repeated-evolution"]');
    const toggle = firstCard?.querySelector('button');
    act(() => {
      (toggle as HTMLButtonElement).click();
    });
    const text = firstCard?.textContent ?? '';
    expect(text).toMatch(/not established facts/i);
  });
});
