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
const { CONSTITUENT_API_BASE } = await import('@/lib/constituentApi');

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
  }) as unknown as Response;

/** What a static host returns for an unknown /api path: HTML with HTTP 200. */
const htmlRewriteResponse = (): Response =>
  ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    json: () => Promise.reject(new SyntaxError('Unexpected token <')),
  }) as unknown as Response;

async function setInputValue(el: HTMLInputElement, value: string) {
  const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    nativeSet?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit(selector: string) {
  const form = container.querySelector(selector) as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

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

  it('subscribe posts JSON to the canonical Calyx backend origin with the backend field names', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ normalized_email: 'orchid@example.org', state: 'SUBSCRIBED' }));

    renderNewsletter();
    await setInputValue(container.querySelector('#subscribe-email') as HTMLInputElement, 'orchid@example.org');
    await submit('[data-testid="subscribe-form"]');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe(`${CONSTITUENT_API_BASE}/subscribe`);
    expect(String(url)).toMatch(/^https:\/\//);
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({ email: 'orchid@example.org', frequency: 'monthly', format: 'html' });
    expect(body).not.toHaveProperty('preferred_frequency');
    expect(container.querySelector('[data-testid="subscribe-success"]')).toBeTruthy();
  });

  it('subscribe fails closed when the host answers with HTML 200 (route not live): no false success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlRewriteResponse());

    renderNewsletter();
    await setInputValue(container.querySelector('#subscribe-email') as HTMLInputElement, 'orchid@example.org');
    await submit('[data-testid="subscribe-form"]');

    expect(container.querySelector('[data-testid="subscribe-success"]')).toBeNull();
    const notice = container.querySelector('[data-testid="subscribe-unavailable"]');
    expect(notice).toBeTruthy();
    expect(notice?.textContent).toMatch(/not yet live/i);
    expect(notice?.textContent).toMatch(/nothing was recorded/i);
    expect(notice?.querySelector('a[href^="mailto:info@orchidcontinuum.org"]')).toBeTruthy();
  });

  it('subscribe treats 401/404 as not live rather than as an error or a success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ detail: 'Owner session or API key is required' }, 401));

    renderNewsletter();
    await setInputValue(container.querySelector('#subscribe-email') as HTMLInputElement, 'orchid@example.org');
    await submit('[data-testid="subscribe-form"]');

    expect(container.querySelector('[data-testid="subscribe-success"]')).toBeNull();
    expect(container.querySelector('[data-testid="subscribe-unavailable"]')).toBeTruthy();
  });

  it('subscribe surfaces a backend 422 rejection as an error, not as success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ detail: 'Email address is not valid.' }, 422));

    renderNewsletter();
    await setInputValue(container.querySelector('#subscribe-email') as HTMLInputElement, 'orchid@example.org');
    await submit('[data-testid="subscribe-form"]');

    expect(container.querySelector('[data-testid="subscribe-success"]')).toBeNull();
    expect(container.querySelector('[data-testid="subscribe-unavailable"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Email address is not valid.');
  });
});

describe('Newsletter — unsubscribe form', () => {
  it('subscribe remembers the manage token the backend issued and offers the Preferences tab', async () => {
    window.localStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ normalized_email: 'reader@example.org', state: 'subscribed', manage_token: 'tok-abc' }),
    );
    renderNewsletter();
    await setInputValue(container.querySelector('#subscribe-email') as HTMLInputElement, 'Reader@Example.org');
    await submit('[data-testid="subscribe-form"]');
    expect(container.querySelector('[data-testid="subscribe-success"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="subscribe-manageable"]')).toBeTruthy();
    expect(window.localStorage.getItem('orchid-continuum.newsletter.manage-token.v1.reader%40example.org')).toBe('tok-abc');
  });

  it('subscribe without a token stores nothing and does not promise browser preference management', async () => {
    window.localStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ normalized_email: 'reader@example.org', state: 'subscribed', manage_token: null }),
    );
    renderNewsletter();
    await setInputValue(container.querySelector('#subscribe-email') as HTMLInputElement, 'reader@example.org');
    await submit('[data-testid="subscribe-form"]');
    expect(container.querySelector('[data-testid="subscribe-success"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="subscribe-manageable"]')).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it('preferences sends the remembered token and opens the edit form on 200', async () => {
    window.localStorage.setItem('orchid-continuum.newsletter.manage-token.v1.reader%40example.org', 'tok-abc');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ topics: ['taxonomy'], frequency: 'weekly' }),
    );
    renderNewsletter();
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    act(() => (tabs.find((t) => t.textContent?.toLowerCase().includes('preferences')) as HTMLButtonElement).click());
    await setInputValue(container.querySelector('#prefs-email') as HTMLInputElement, 'reader@example.org');
    await submit('[data-testid="preferences-lookup-form"]');
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toBe(`${CONSTITUENT_API_BASE}/preferences?email=reader%40example.org&token=tok-abc`);
    expect(container.querySelector('[data-testid="preferences-edit-form"]')).toBeTruthy();
    window.localStorage.clear();
  });

  it('preferences without a token shows the needs-token state on 401, not "not live" and not an edit form', async () => {
    window.localStorage.clear();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ detail: 'Owner session or API key is required' }, 401));
    renderNewsletter();
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    act(() => (tabs.find((t) => t.textContent?.toLowerCase().includes('preferences')) as HTMLButtonElement).click());
    await setInputValue(container.querySelector('#prefs-email') as HTMLInputElement, 'reader@example.org');
    await submit('[data-testid="preferences-lookup-form"]');
    expect(String(fetchSpy.mock.calls[0][0])).not.toContain('token=');
    expect(container.querySelector('[data-testid="preferences-needs-token"]')?.textContent).toMatch(/never open on an email address alone/i);
    expect(container.querySelector('[data-testid="preferences-unavailable"]')).toBeNull();
    expect(container.querySelector('[data-testid="preferences-edit-form"]')).toBeNull();
  });

  it('unsubscribe forgets the browser token for that address', async () => {
    window.localStorage.setItem('orchid-continuum.newsletter.manage-token.v1.reader%40example.org', 'tok-abc');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ normalized_email: 'reader@example.org', state: 'unsubscribed' }));
    renderNewsletter();
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    act(() => (tabs.find((t) => t.textContent?.toLowerCase().includes('unsubscribe')) as HTMLButtonElement).click());
    await setInputValue(container.querySelector('#unsub-email') as HTMLInputElement, 'reader@example.org');
    await submit('[data-testid="unsubscribe-form"]');
    expect(container.querySelector('[data-testid="unsubscribe-success"]')).toBeTruthy();
    expect(window.localStorage.getItem('orchid-continuum.newsletter.manage-token.v1.reader%40example.org')).toBeNull();
  });

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

  it('unsubscribe posts to the canonical backend /api/constituent/unsubscribe and only succeeds on JSON', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ normalized_email: 'orchid@example.org', state: 'UNSUBSCRIBED' }));

    renderNewsletter();
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    const tab = tabs.find((t) => t.textContent?.toLowerCase().includes('unsubscribe'));
    act(() => (tab as HTMLButtonElement).click());

    await setInputValue(container.querySelector('#unsub-email') as HTMLInputElement, 'orchid@example.org');
    await submit('[data-testid="unsubscribe-form"]');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(`${CONSTITUENT_API_BASE}/unsubscribe`);
    expect(container.querySelector('[data-testid="unsubscribe-success"]')).toBeTruthy();
  });

  it('unsubscribe fails closed on HTML 200 (route not live)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlRewriteResponse());

    renderNewsletter();
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    const tab = tabs.find((t) => t.textContent?.toLowerCase().includes('unsubscribe'));
    act(() => (tab as HTMLButtonElement).click());

    await setInputValue(container.querySelector('#unsub-email') as HTMLInputElement, 'orchid@example.org');
    await submit('[data-testid="unsubscribe-form"]');

    expect(container.querySelector('[data-testid="unsubscribe-success"]')).toBeNull();
    expect(container.querySelector('[data-testid="unsubscribe-unavailable"]')).toBeTruthy();
  });
});

describe('Newsletter — preferences form', () => {
  it('preferences lookup fails closed on HTML 200 instead of pretending to load', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlRewriteResponse());

    renderNewsletter();
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    const tab = tabs.find((t) => t.textContent?.toLowerCase().includes('preferences'));
    act(() => (tab as HTMLButtonElement).click());

    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    await setInputValue(emailInput, 'orchid@example.org');
    const form = emailInput.closest('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(container.querySelector('[data-testid="preferences-unavailable"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="preferences-success"]')).toBeNull();
  });
});
