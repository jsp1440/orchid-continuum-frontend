// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/orchid/Navbar', () => ({ default: () => null }));
vi.mock('@/components/orchid/Footer', () => ({ default: () => null }));
import ComingSoon from './ComingSoon';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The Coming Soon "Notify Me" form posts to the CRM subscribe route, which the
 * Calyx backend does not mount yet (see calyxBackendRouteInventory.test.ts).
 * It must never tell the visitor they are on the list unless the signup was
 * actually delivered.
 */
describe('ComingSoon notify-me confirmation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // jsdom cannot navigate to mailto:; the hand-off is asserted through the copy.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function submit(response: () => Promise<Response>) {
    vi.stubGlobal('fetch', vi.fn(response));
    act(() =>
      root.render(
        <MemoryRouter initialEntries={['/coming-soon/zoo']}>
          <Routes>
            <Route path="/coming-soon/:section" element={<ComingSoon />} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    const input = container.querySelector('input[type="email"]') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setValue?.call(input, 'person@example.org');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  it('does not claim a subscription when the backend answers 404', async () => {
    await submit(async () =>
      new Response('{"detail":"Not Found"}', { status: 404, headers: { 'content-type': 'application/json' } }),
    );
    expect(container.textContent).not.toContain("You're on the list");
    expect(container.textContent).toContain('send that message');
  });

  it('does not claim a subscription when the backend is unreachable', async () => {
    await submit(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(container.textContent).not.toContain("You're on the list");
    expect(container.textContent).toContain('send that message');
  });

  it('confirms only a delivered signup', async () => {
    await submit(async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }));
    expect(container.textContent).toContain("You're on the list.");
    expect(container.textContent).not.toContain('send that message');
  });
});
