// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { default: CompletionObservatory } = await import('./CompletionObservatory');

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

describe('CompletionObservatory', () => {
  it('mounts without throwing', () => {
    expect(() => act(() => root.render(<CompletionObservatory />))).not.toThrow();
  });

  it('renders the overall completion summary and at least one domain row', () => {
    act(() => root.render(<CompletionObservatory />));
    expect(container.textContent).toContain('Overall completion');
    expect(container.textContent).toContain('Incomplete leaves');
    expect(container.textContent).toContain('Species Dossier');
  });

  it('surfaces the scheduler\'s next bounded action or an explicit all-clear', () => {
    act(() => root.render(<CompletionObservatory />));
    const hasSchedulerCard = container.textContent?.includes('Scheduler — next bounded action');
    const hasAllClear = container.textContent?.includes('No actionable unmet gates remain');
    expect(hasSchedulerCard || hasAllClear).toBe(true);
  });

  it('exposes a RECOVERABLE_LEGACY count for OC-ARCHAEOLOGY-001 (#308)', () => {
    act(() => root.render(<CompletionObservatory />));
    expect(container.textContent).toContain('Recoverable legacy');
    expect(container.textContent).toContain('recoverable legacy');
  });
});
