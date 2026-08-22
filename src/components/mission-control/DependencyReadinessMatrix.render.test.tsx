// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { default: DependencyReadinessMatrix } = await import('./DependencyReadinessMatrix');

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
});

describe('DependencyReadinessMatrix', () => {
  it('mounts without throwing', () => {
    expect(() => act(() => root.render(<DependencyReadinessMatrix />))).not.toThrow();
  });

  it('renders the never-reveals-a-value disclaimer and the environment summary cards', () => {
    act(() => root.render(<DependencyReadinessMatrix />));
    expect(container.textContent).toContain('never displays, stores, or compares a credential');
    expect(container.textContent).toContain('Backend · Render');
    expect(container.textContent).toContain('Frontend · GitHub Actions');
  });

  it('lists known dependencies by provider name', () => {
    act(() => root.render(<DependencyReadinessMatrix />));
    expect(container.textContent).toContain('Anthropic (Claude API)');
    expect(container.textContent).toContain('GitHub (built-in Actions token)');
  });

  it('never renders anything resembling a live secret value', () => {
    act(() => root.render(<DependencyReadinessMatrix />));
    expect(container.textContent).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    expect(container.textContent).not.toMatch(/sk-ant-[a-zA-Z0-9-]{10,}/);
  });
});
