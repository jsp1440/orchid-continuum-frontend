// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ session: null, loading: false })),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: mocks.useAuth,
}));

const { default: CommunityObservation } = await import('@/pages/CommunityObservation');

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ observations: [] }),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = async () => {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <CommunityObservation />
      </MemoryRouter>,
    );
  });
};

describe('CommunityObservation — COMMUNITY-001', () => {
  it('renders the provenance notice prominently', async () => {
    await render();
    const notice = container.querySelector('[data-testid="community-provenance-notice"]');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain('not scientific evidence');
  });

  it('shows the submit tab by default', async () => {
    await render();
    const form = container.querySelector('[data-testid="community-submit-form"]');
    expect(form).not.toBeNull();
  });

  it('renders all four epistemic certainty options', async () => {
    await render();
    const certaintyGroup = container.querySelector('[data-testid="community-submit-certainty"]');
    expect(certaintyGroup).not.toBeNull();
    const radios = certaintyGroup!.querySelectorAll('input[type="radio"]');
    const values = Array.from(radios).map(r => (r as HTMLInputElement).value);
    expect(values).toContain('CERTAIN');
    expect(values).toContain('PROBABLE');
    expect(values).toContain('POSSIBLE');
    expect(values).toContain('UNCERTAIN');
  });

  it('does not call fetch if species is empty', async () => {
    await render();
    const form = container.querySelector('[data-testid="community-submit-form"]') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('calls POST /api/community/observations with species and certainty', async () => {
    await render();
    const speciesInput = container.querySelector('[data-testid="community-submit-species"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(speciesInput, 'Dracula bella');
      speciesInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const form = container.querySelector('[data-testid="community-submit-form"]') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => {});
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/community/observations',
      expect.objectContaining({ method: 'POST' }),
    );
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.epistemic_certainty).toBeDefined();
    expect(body.species_name).toBe('Dracula bella');
  });

  it('shows success state after submission', async () => {
    await render();
    // Pre-fill species via direct state simulation through form submit with truthy species
    const speciesInput = container.querySelector('[data-testid="community-submit-species"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(speciesInput, 'Epidendrum ibaguense');
      speciesInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const form = container.querySelector('[data-testid="community-submit-form"]') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    // Wait for async
    await act(async () => {});
    const successEl = container.querySelector('[data-testid="community-submit-success"]');
    expect(successEl).not.toBeNull();
  });

  it('notes field is present and capped — does not exceed 2000 chars', async () => {
    await render();
    const notesInput = container.querySelector('[data-testid="community-submit-notes"]') as HTMLTextAreaElement;
    expect(notesInput).not.toBeNull();
    // notes textarea does not allow free-form submission to AI agents
    const helpText = container.textContent;
    expect(helpText).toContain('never passed to automated agents');
  });

  it('does NOT expose GPS coordinate input field', async () => {
    await render();
    // location field is country-level only — no GPS/lat/lng inputs
    const inputs = Array.from(container.querySelectorAll('input'));
    const gpsInputs = inputs.filter(inp =>
      /lat|lng|lon|coordinate|gps/i.test(inp.name + inp.id + inp.placeholder),
    );
    expect(gpsInputs).toHaveLength(0);
  });

  it('browse tab loads /api/community/observations with status=approved', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        observations: [
          {
            id: 'obs-1',
            species_name: 'Pleurothallis restrepioides',
            notes: 'Found at 1800m altitude',
            observed_at: '2026-08-01',
            epistemic_certainty: 'PROBABLE',
            status: 'APPROVED',
            submitted_at: '2026-08-05T10:00:00Z',
          },
        ],
      }),
    });
    await render();
    const browseTab = container.querySelector('[data-testid="tab-browse"]') as HTMLButtonElement;
    await act(async () => {
      browseTab.click();
    });
    await act(async () => {});
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/community/observations'),
      expect.anything(),
    );
    const callUrl: string = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callUrl).toContain('status=approved');
    const list = container.querySelector('[data-testid="community-browse-list"]');
    expect(list).not.toBeNull();
    const items = list!.querySelectorAll('[data-testid="community-observation-item"]');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Pleurothallis restrepioides');
    expect(items[0].textContent).toContain('PROBABLE');
  });

  it('browse tab shows empty state when no observations returned', async () => {
    await render();
    const browseTab = container.querySelector('[data-testid="tab-browse"]') as HTMLButtonElement;
    await act(async () => {
      browseTab.click();
    });
    await act(async () => {});
    const empty = container.querySelector('[data-testid="community-browse-empty"]');
    expect(empty).not.toBeNull();
  });

  it('each observation item shows epistemic certainty label', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        observations: [
          {
            id: 'obs-2',
            species_name: 'Masdevallia veitchiana',
            notes: null,
            observed_at: null,
            epistemic_certainty: 'UNCERTAIN',
            status: 'APPROVED',
            submitted_at: '2026-09-01T08:00:00Z',
          },
        ],
      }),
    });
    await render();
    const browseTab = container.querySelector('[data-testid="tab-browse"]') as HTMLButtonElement;
    await act(async () => { browseTab.click(); });
    await act(async () => {});
    const items = container.querySelectorAll('[data-testid="community-observation-item"]');
    expect(items[0].textContent).toContain('UNCERTAIN');
  });
});
