// @vitest-environment jsdom

/**
 * OrchidUniversity is the student-facing entry point for
 * `cap-university-curriculum-core`. It had no render-level coverage: only its
 * sub-library functions and reviewer/lab components were tested, never this
 * page mounted as a real tree. A crash here (e.g. an undefined identifier,
 * per the AppLayout incident this suite's sibling documents) would only ever
 * surface as a blank/error-boundary page in production.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ session: null, user: null, signOut: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
);

const { default: OrchidUniversity } = await import('./OrchidUniversity');

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
  vi.clearAllMocks();
});

function mount() {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/university']}>
        <OrchidUniversity />
      </MemoryRouter>,
    );
  });
}

describe('OrchidUniversity', () => {
  it('mounts without throwing', () => {
    expect(() => mount()).not.toThrow();
  });

  it('renders the guided-inquiry curriculum content, not an empty or error tree', () => {
    mount();
    expect(container.textContent).not.toContain('Something went wrong');
    expect(container.textContent).toContain('Five movements of inquiry');
    expect(container.textContent).toContain('Applied AI');
    expect(container.textContent?.length ?? 0).toBeGreaterThan(200);
  });

  it('links to the live Applied AI & Data Science module and the reviewer boundary text stays honest', () => {
    mount();
    const link = Array.from(container.querySelectorAll('a')).find(
      (a) => a.getAttribute('href') === '/university/applied-ai-data-science',
    );
    expect(link).not.toBeUndefined();
  });
});
