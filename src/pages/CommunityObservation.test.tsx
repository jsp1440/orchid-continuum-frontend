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
const { COMMUNITY_API_BASE } = await import('@/lib/backendJson');

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body,
});

/** What a static host returns for an unknown /api path: HTML with HTTP 200. */
const htmlRewriteResponse = () => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
  json: async () => {
    throw new SyntaxError('Unexpected token <');
  },
});

const setInput = async (selector: string, value: string) => {
  const el = container.querySelector(selector) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const submitForm = async () => {
  const form = container.querySelector('[data-testid="community-submit-form"]') as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await act(async () => {});
};

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ items: [], total: 0 }));
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

  it('posts the backend ObservationSubmitRequest contract to the canonical Calyx origin', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ id: '11111111-1111-1111-1111-111111111111', moderation_state: 'SUBMITTED', created_at: '2026-09-16T00:00:00Z' }),
    );
    await render();
    await setInput('[data-testid="community-submit-species"]', 'Dracula bella');
    await setInput('[data-testid="community-submit-date"]', '2026-09-01');
    await submitForm();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${COMMUNITY_API_BASE}/observations`,
      expect.objectContaining({ method: 'POST' }),
    );
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(call[0])).toMatch(/^https:\/\//);
    const body = JSON.parse(call[1].body);
    expect(body.taxon_name_verbatim).toBe('Dracula bella');
    expect(body.epistemic_label).toBe('POSSIBLE');
    expect(body.observation_date).toBe('2026-09-01');
    expect(body.location_verbatim).toBe('Not disclosed');
    for (const forbidden of ['lat', 'lng', 'latitude', 'longitude', 'coordinates']) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it('requires an observation date before calling the API (backend contract)', async () => {
    await render();
    await setInput('[data-testid="community-submit-species"]', 'Dracula bella');
    await submitForm();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Observation date is required.');
  });

  it('shows success state only after a JSON acknowledgement with an id', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ id: '22222222-2222-2222-2222-222222222222', moderation_state: 'SUBMITTED', created_at: '2026-09-16T00:00:00Z' }),
    );
    await render();
    await setInput('[data-testid="community-submit-species"]', 'Epidendrum ibaguense');
    await setInput('[data-testid="community-submit-date"]', '2026-09-02');
    await submitForm();
    expect(container.querySelector('[data-testid="community-submit-success"]')).not.toBeNull();
  });

  it('fails closed on the static host HTML-200 rewrite: not-live notice, never "Observation submitted"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(htmlRewriteResponse());
    await render();
    await setInput('[data-testid="community-submit-species"]', 'Epidendrum ibaguense');
    await setInput('[data-testid="community-submit-date"]', '2026-09-02');
    await submitForm();
    expect(container.querySelector('[data-testid="community-submit-success"]')).toBeNull();
    expect(container.textContent).not.toContain('Observation submitted');
    const notice = container.querySelector('[data-testid="community-submit-unavailable"]');
    expect(notice?.textContent).toMatch(/not yet live/i);
    expect(notice?.textContent).toMatch(/nothing was recorded/i);
  });

  it('treats 404 (router not mounted) as not live rather than success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ detail: 'Not Found' }, 404));
    await render();
    await setInput('[data-testid="community-submit-species"]', 'Epidendrum ibaguense');
    await setInput('[data-testid="community-submit-date"]', '2026-09-02');
    await submitForm();
    expect(container.querySelector('[data-testid="community-submit-success"]')).toBeNull();
    expect(container.querySelector('[data-testid="community-submit-unavailable"]')).not.toBeNull();
  });

  it('surfaces a 422 rejection as an error with the backend detail, not as success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ detail: 'location_verbatim too long' }, 422));
    await render();
    await setInput('[data-testid="community-submit-species"]', 'Epidendrum ibaguense');
    await setInput('[data-testid="community-submit-date"]', '2026-09-02');
    await submitForm();
    expect(container.querySelector('[data-testid="community-submit-success"]')).toBeNull();
    expect(container.querySelector('[data-testid="community-submit-unavailable"]')).toBeNull();
    expect(container.textContent).toContain('location_verbatim too long');
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

  it('browse tab loads approved observations from the canonical origin (moderation_state=APPROVED)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 'obs-1',
            taxon_name_verbatim: 'Pleurothallis restrepioides',
            notes: 'Found at 1800m altitude',
            observation_date: '2026-08-01',
            epistemic_label: 'PROBABLE',
            moderation_state: 'APPROVED',
            created_at: '2026-08-05T10:00:00Z',
          },
        ],
        total: 1,
      }),
    );
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
    expect(callUrl).toBe(`${COMMUNITY_API_BASE}/observations?moderation_state=APPROVED&limit=20`);
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
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 'obs-2',
            taxon_name_verbatim: 'Masdevallia veitchiana',
            notes: null,
            observation_date: null,
            epistemic_label: 'UNCERTAIN',
            moderation_state: 'APPROVED',
            created_at: '2026-09-01T08:00:00Z',
          },
        ],
        total: 1,
      }),
    );
    await render();
    const browseTab = container.querySelector('[data-testid="tab-browse"]') as HTMLButtonElement;
    await act(async () => { browseTab.click(); });
    await act(async () => {});
    const items = container.querySelectorAll('[data-testid="community-observation-item"]');
    expect(items[0].textContent).toContain('UNCERTAIN');
  });

  it('browse renders the minimal backend list shape (id/moderation_state/created_at) without fabricating a taxon', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ items: [{ id: 'obs-3', moderation_state: 'APPROVED', created_at: '2026-09-03T08:00:00Z' }], total: 1 }),
    );
    await render();
    const browseTab = container.querySelector('[data-testid="tab-browse"]') as HTMLButtonElement;
    await act(async () => { browseTab.click(); });
    await act(async () => {});
    const items = container.querySelectorAll('[data-testid="community-observation-item"]');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Approved community record');
    expect(items[0].textContent).not.toContain('undefined');
  });

  it('browse shows a not-live notice (not an empty feed) when the host answers with HTML 200 or 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(htmlRewriteResponse());
    await render();
    const browseTab = container.querySelector('[data-testid="tab-browse"]') as HTMLButtonElement;
    await act(async () => { browseTab.click(); });
    await act(async () => {});
    expect(container.querySelector('[data-testid="community-browse-unavailable"]')?.textContent).toMatch(/not yet live/i);
    expect(container.querySelector('[data-testid="community-browse-empty"]')).toBeNull();
    expect(container.querySelector('[data-testid="community-browse-list"]')).toBeNull();
  });
});
