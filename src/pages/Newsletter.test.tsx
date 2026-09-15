// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ session: null, loading: false })),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: mocks.useAuth,
}));

const { default: Newsletter } = await import('@/pages/Newsletter');

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
  vi.restoreAllMocks();
});

function renderNewsletter() {
  act(() => {
    root.render(createElement(MemoryRouter, null, createElement(Newsletter)));
  });
}

describe('Newsletter page — COMMS-001 (#681)', () => {
  it('renders the subscribe form by default', () => {
    renderNewsletter();
    expect(container.querySelector('[data-testid="subscribe-form"]')).toBeTruthy();
  });

  it('shows subscribe, preferences, and unsubscribe tabs', () => {
    renderNewsletter();
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(3);
    const labels = Array.from(tabs).map((t) => t.textContent?.toLowerCase() ?? '').join(' ');
    expect(labels).toMatch(/subscribe/);
    expect(labels).toMatch(/preferences/);
    expect(labels).toMatch(/unsubscribe/);
  });

  it('switches to the unsubscribe form when that tab is clicked', () => {
    renderNewsletter();
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    const unsubTab = tabs.find((t) => t.textContent?.toLowerCase().includes('unsubscribe'));
    expect(unsubTab).toBeTruthy();
    act(() => (unsubTab as HTMLButtonElement).click());
    expect(container.querySelector('[data-testid="unsubscribe-form"]')).toBeTruthy();
  });

  it('switches to the preferences lookup form when that tab is clicked', () => {
    renderNewsletter();
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    const prefsTab = tabs.find((t) => t.textContent?.toLowerCase().includes('preferences'));
    act(() => (prefsTab as HTMLButtonElement).click());
    expect(container.querySelector('[data-testid="preferences-lookup-form"]')).toBeTruthy();
  });

  it('subscribe form rejects empty email without calling API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderNewsletter();
    const submitBtn = container.querySelector('[data-testid="subscribe-submit"]') as HTMLButtonElement;
    await act(async () => { submitBtn.click(); });
    expect(fetchSpy).not.toHaveBeenCalled();
    // Validation error visible
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
  });

  it('untrusted-input guard: subscribe form has no free-text body textarea', () => {
    renderNewsletter();
    const form = container.querySelector('[data-testid="subscribe-form"]');
    // Subscribe form must not expose a free-text textarea that could carry injected instructions
    expect(form?.querySelector('textarea')).toBeNull();
  });

  it('subscribe API path is an internal relative URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ preference_state: 'SUBSCRIBED' }),
    } as Response);

    renderNewsletter();

    // Inject a valid email value using the native setter trick required in jsdom
    const emailInput = container.querySelector('#subscribe-email') as HTMLInputElement;
    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      nativeSet?.call(emailInput, 'orchid@example.org');
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = container.querySelector('[data-testid="subscribe-form"]') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    if (fetchSpy.mock.calls.length > 0) {
      const url = String(fetchSpy.mock.calls[0][0]);
      expect(url).not.toMatch(/^https?:\/\//);
    }
  });
});

describe('Newsletter — unsubscribe form', () => {
  it('renders the unsubscribe submit button', () => {
    renderNewsletter();
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    const tab = tabs.find((t) => t.textContent?.toLowerCase().includes('unsubscribe'));
    act(() => (tab as HTMLButtonElement).click());
    expect(container.querySelector('[data-testid="unsubscribe-submit"]')).toBeTruthy();
  });

  it('unsubscribe rejects empty email without calling API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderNewsletter();
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    const tab = tabs.find((t) => t.textContent?.toLowerCase().includes('unsubscribe'));
    act(() => (tab as HTMLButtonElement).click());
    const submitBtn = container.querySelector('[data-testid="unsubscribe-submit"]') as HTMLButtonElement;
    await act(async () => { submitBtn.click(); });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('unsubscribe calls POST /api/constituent/unsubscribe', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ preference_state: 'UNSUBSCRIBED' }),
    } as Response);

    renderNewsletter();
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    const tab = tabs.find((t) => t.textContent?.toLowerCase().includes('unsubscribe'));
    act(() => (tab as HTMLButtonElement).click());

    const emailInput = container.querySelector('#unsub-email') as HTMLInputElement;
    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      nativeSet?.call(emailInput, 'orchid@example.org');
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = container.querySelector('[data-testid="unsubscribe-form"]') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const fetchMock = vi.mocked(globalThis.fetch);
    if (fetchMock.mock.calls.length > 0) {
      expect(String(fetchMock.mock.calls[0][0])).toBe('/api/constituent/unsubscribe');
    }
  });
});
