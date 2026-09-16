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

import DeceptionLab, { readLabHandoff } from './DeceptionLab';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let container: HTMLDivElement;

function renderLab(initialEntry = '/deception-lab') {
  act(() => {
    createRoot(container).render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <DeceptionLab />
      </MemoryRouter>,
    );
  });
}

const openWorkspace = () =>
  act(() => {
    (container.querySelector('[data-testid="tab-workspace"]') as HTMLButtonElement).click();
  });

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

// ---------------------------------------------------------------------------
// Journey 6 mount: live HypothesisLoopPanel inside the workspace tab
// ---------------------------------------------------------------------------

describe('DeceptionLab · live hypothesis loop (Journey 6)', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    mockUseAuth.mockReturnValue({ user: null, signOut: vi.fn(), loading: false });
  });

  afterEach(() => {
    document.body.removeChild(container);
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({ user: null, signOut: vi.fn(), loading: false });
  });

  it('unauthenticated: workspace shows a sign-in prompt and does not mount the live panel', () => {
    renderLab();
    openWorkspace();
    expect(container.querySelector('[data-testid="hypothesis-loop-signin"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="hypothesis-loop-panel"]')).toBeNull();
    // The static loop description remains available to everyone.
    expect(container.querySelector('[data-testid="hypothesis-loop"]')).toBeTruthy();
    const prompt = container.querySelector('[data-testid="hypothesis-loop-signin"]')?.textContent ?? '';
    expect(prompt).toMatch(/human scientific review/i);
    expect(prompt).toMatch(/sensitive locality/i);
  });

  it('authenticated: mounts HypothesisLoopPanel with the opaque auth subject and no network call before submit', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    mockUseAuth.mockReturnValue({
      user: { id: 'auth-subject-123', email: 'private@example.org' } as never,
      signOut: vi.fn(),
      loading: false,
    });
    renderLab();
    openWorkspace();
    expect(container.querySelector('[data-testid="hypothesis-loop-panel"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="hypothesis-loop-signin"]')).toBeNull();
    expect(container.querySelector('[data-testid="observation-cue-form"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="generate-hypotheses"]')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('private@example.org');
    fetchSpy.mockRestore();
  });

  it('Field Journal handoff URL opens the workspace tab and pre-fills only the taxon hint', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'auth-subject-123' } as never,
      signOut: vi.fn(),
      loading: false,
    });
    renderLab(
      '/deception-lab?tab=workspace&observation=field-journal-draft:abc&taxon=Ophrys%20apifera' +
        '&lat=51.5&lng=-0.12&locality=Secret%20Fen&place=Hidden%20Meadow',
    );
    expect(container.querySelector('[data-testid="tab-panel-workspace"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tab-workspace"]')?.getAttribute('aria-selected')).toBe(
      'true',
    );
    const taxon = container.querySelector('[data-testid="taxon-hint"]') as HTMLInputElement;
    expect(taxon.value).toBe('Ophrys apifera');
    // Locality-bearing params are ignored entirely: never rendered, never pre-filled.
    const text = container.textContent ?? '';
    expect(text).not.toContain('Secret Fen');
    expect(text).not.toContain('Hidden Meadow');
    expect(text).not.toContain('51.5');
    expect(text).not.toContain('-0.12');
    const inputs = Array.from(container.querySelectorAll('input, textarea, select')) as HTMLInputElement[];
    expect(inputs.some((el) => /Secret|Hidden|51\.5|-0\.12/.test(el.value))).toBe(false);
  });

  it('readLabHandoff: unknown tab falls back to questions; oversized ids are dropped; taxon is trimmed', () => {
    expect(readLabHandoff(new URLSearchParams('tab=bogus')).tab).toBe('questions');
    expect(readLabHandoff(new URLSearchParams('tab=integrations')).tab).toBe('integrations');
    const long = 'x'.repeat(129);
    expect(readLabHandoff(new URLSearchParams({ observation: long })).observationId).toBeUndefined();
    expect(readLabHandoff(new URLSearchParams({ observation: 'draft-1' })).observationId).toBe('draft-1');
    expect(readLabHandoff(new URLSearchParams({ taxon: '  Ophrys   apifera ' })).taxonHint).toBe(
      'Ophrys apifera',
    );
    const handoff = readLabHandoff(new URLSearchParams('lat=1&lng=2&locality=Fen'));
    expect(handoff).toEqual({ tab: 'questions', observationId: undefined, taxonHint: undefined });
  });
});
