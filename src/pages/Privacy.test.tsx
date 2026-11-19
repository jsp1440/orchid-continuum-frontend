// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ session: null, loading: false })),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: mocks.useAuth,
}));

const { default: Privacy } = await import('@/pages/Privacy');

function renderInto(container: HTMLElement, ui: React.ReactElement) {
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return root;
}

describe('Privacy page', () => {
  it('renders the page container', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    renderInto(div, <MemoryRouter><Privacy /></MemoryRouter>);
    expect(div.querySelector('[data-testid="privacy-page"]')).not.toBeNull();
    document.body.removeChild(div);
  });

  it('shows effective date notice with role=note', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    renderInto(div, <MemoryRouter><Privacy /></MemoryRouter>);
    const notice = div.querySelector('[data-testid="privacy-effective-date"]');
    expect(notice).not.toBeNull();
    expect(notice?.getAttribute('role')).toBe('note');
    document.body.removeChild(div);
  });

  it('includes epistemic integrity notice', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    renderInto(div, <MemoryRouter><Privacy /></MemoryRouter>);
    const notice = div.querySelector('[data-testid="privacy-epistemic-notice"]');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain('not');
    expect(notice?.textContent).toContain('scientific evidence');
    document.body.removeChild(div);
  });

  it('provides a data contact link', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    renderInto(div, <MemoryRouter><Privacy /></MemoryRouter>);
    const link = div.querySelector('[data-testid="privacy-data-contact"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('mailto:data@orchidcontinuum.org');
    document.body.removeChild(div);
  });

  it('mentions sensitive locality data protection', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    renderInto(div, <MemoryRouter><Privacy /></MemoryRouter>);
    expect(div.textContent).toContain('GPS');
    expect(div.textContent).toContain('locality data');
    document.body.removeChild(div);
  });

  it('mentions backup safeguards', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    renderInto(div, <MemoryRouter><Privacy /></MemoryRouter>);
    expect(div.textContent).toContain('backup');
    document.body.removeChild(div);
  });
});
