// @vitest-environment jsdom

/**
 * J3 (Release 1): the Species page must not tell a visitor "No species
 * matched" when the search service could not be reached. A failed request gets
 * an explicit unavailable state with a retry; a genuine empty answer keeps the
 * "no species matched" copy. Backend outcomes are mocked at the ocBackend
 * boundary; the rows are SYNTHETIC shapes, not claims about any orchid.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ searchSpeciesOutcome: vi.fn() }));

vi.mock('@/lib/ocBackend', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ocBackend')>('@/lib/ocBackend');
  return { ...actual, ...mocks };
});
vi.mock('@/components/orchid/Navbar', () => ({ default: () => null }));
vi.mock('@/components/orchid/Footer', () => ({ default: () => null }));

const { default: Species } = await import('@/pages/Species');

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/species']}>
        <Species />
      </MemoryRouter>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function search(term: string) {
  const input = container.querySelector('input[type="text"]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, term);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
}

const text = () => container.textContent ?? '';

describe('species search result states', () => {
  it('renders an unreachable search service as unavailable with a retry, never as zero results', async () => {
    mocks.searchSpeciesOutcome.mockResolvedValue({ status: 'unavailable', httpStatus: 0 });
    await search('Dracula');

    expect(container.querySelector('[data-testid="species-search-unavailable"]')).not.toBeNull();
    expect(text()).toContain('Species search is temporarily unavailable');
    expect(text()).toContain('Search unavailable');
    expect(text()).not.toMatch(/0 results/i);
    expect(text()).not.toMatch(/No species matched/);

    // Retry re-asks the service and, once it answers, the answer is shown.
    mocks.searchSpeciesOutcome.mockResolvedValue({
      status: 'ok',
      results: [{ taxonomy_id: 'synthetic-1', canonical_name: 'Synthetic example', genus: 'Synthetic' }],
    });
    const retry = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Try again'))!;
    act(() => retry.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(mocks.searchSpeciesOutcome).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="species-search-unavailable"]')).toBeNull();
    expect(text()).toContain('1 result');
    expect(text()).toContain('Synthetic example');
  });

  it('keeps the "no species matched" copy for a genuine empty answer', async () => {
    mocks.searchSpeciesOutcome.mockResolvedValue({ status: 'ok', results: [] });
    await search('Dracula');

    expect(text()).toMatch(/0 results/i);
    expect(text()).toContain('No species matched');
    expect(container.querySelector('[data-testid="species-search-unavailable"]')).toBeNull();
    expect(text()).not.toContain('temporarily unavailable');
  });
});
