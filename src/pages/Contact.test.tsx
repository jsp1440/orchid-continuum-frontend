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

const { default: Contact } = await import('@/pages/Contact');
const { CONSTITUENT_API_BASE } = await import('@/lib/constituentApi');

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

function renderContact() {
  act(() => {
    root.render(createElement(MemoryRouter, null, createElement(Contact)));
  });
}

async function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const nativeSet = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  await act(async () => {
    nativeSet?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function fillAndSubmit() {
  await setValue(container.querySelector('#contact-name') as HTMLInputElement, 'Test Grower');
  await setValue(container.querySelector('#contact-email') as HTMLInputElement, 'grower@example.org');
  await setValue(container.querySelector('#contact-subject') as HTMLInputElement, 'Cattleya question');
  await setValue(container.querySelector('#contact-body') as HTMLTextAreaElement, 'Which light level suits a Cattleya labiata indoors?');
  const form = container.querySelector('[data-testid="contact-form"]') as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
  }) as unknown as Response;

const htmlRewriteResponse = (): Response =>
  ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    json: () => Promise.reject(new SyntaxError('Unexpected token <')),
  }) as unknown as Response;

describe('Contact page — COMMS-001 (#681)', () => {
  it('renders the form and does not call the API for an invalid submission', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderContact();
    expect(container.querySelector('[data-testid="contact-form"]')).toBeTruthy();
    const form = container.querySelector('[data-testid="contact-form"]') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('posts to the canonical backend contact route and shows "Message received" only on a JSON acknowledgement', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ message: 'queued for human review' }));
    renderContact();
    await fillAndSubmit();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(`${CONSTITUENT_API_BASE}/contact`);
    expect(container.querySelector('[data-testid="contact-success"]')?.textContent).toMatch(/Message received/);
  });

  it('HTML 200 from the static host (route not live) → honest not-live state with a prefilled mailto link, never "Message received"', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlRewriteResponse());
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderContact();
    await fillAndSubmit();

    expect(container.querySelector('[data-testid="contact-success"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Message received/);
    const notice = container.querySelector('[data-testid="contact-unavailable"]');
    expect(notice?.textContent).toMatch(/not yet live/i);
    expect(notice?.textContent).toMatch(/not sent or stored/i);
    const link = container.querySelector('[data-testid="contact-mailto"]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toMatch(/^mailto:info@orchidcontinuum\.org\?subject=/);
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toContain('Cattleya question');
    // No popup: the visitor clicks the link themselves.
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('404 (endpoint absent) is also reported as not live, not as success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ detail: 'Not Found' }, 404));
    renderContact();
    await fillAndSubmit();
    expect(container.querySelector('[data-testid="contact-success"]')).toBeNull();
    expect(container.querySelector('[data-testid="contact-unavailable"]')).toBeTruthy();
  });

  it('network failure is reported as not live, not as success', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    renderContact();
    await fillAndSubmit();
    expect(container.querySelector('[data-testid="contact-success"]')).toBeNull();
    expect(container.querySelector('[data-testid="contact-unavailable"]')).toBeTruthy();
  });
});
