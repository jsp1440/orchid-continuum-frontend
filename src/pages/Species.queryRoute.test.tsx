// @vitest-environment jsdom

/**
 * The Species search keeps its query in the URL (?q=) so a search can be
 * shared, bookmarked and linked to from other pages (e.g. "Search species"
 * on a dossier with no taxon record). Backend outcomes are mocked at the
 * ocBackend boundary; result rows are SYNTHETIC shapes, not claims about any
 * orchid, and the query strings are only search text.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
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
let router: ReturnType<typeof createMemoryRouter>;

function mount(entry: string) {
  router = createMemoryRouter([{ path: '/species', element: <Species /> }], { initialEntries: [entry] });
  act(() => {
    root.render(<RouterProvider router={router} />);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.searchSpeciesOutcome.mockResolvedValue({ status: 'ok', results: [] });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const input = () => container.querySelector('input[name="q"]') as HTMLInputElement;
const text = () => container.textContent ?? '';
const urlQuery = () => new URLSearchParams(router.state.location.search).get('q');
const searchedTerms = () => mocks.searchSpeciesOutcome.mock.calls.map((call) => call[0]);

async function settle(ms = 400) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function type(term: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input(), term);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

function submit() {
  act(() => {
    input().form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

async function navigate(to: string | number) {
  await act(async () => {
    await (typeof to === 'number' ? router.navigate(to) : router.navigate(to));
  });
  await settle();
}

describe('species search ?q= prefill', () => {
  it('fills the box from ?q= and runs that search exactly once', async () => {
    mount('/species?q=Dracula');
    expect(input().value).toBe('Dracula');
    await settle();
    await settle(2000);
    expect(searchedTerms()).toEqual(['Dracula']);
    expect(text()).toContain('No species matched');
  });

  it.each([
    ['a name with spaces', 'Notagenus fakeus'],
    ['diacritics', 'Épidendrum ñandú'],
    ['a hybrid sign', 'Cattleya × guatemalensis'],
  ])('decodes %s from the URL exactly', async (_label, name) => {
    mount(`/species?q=${encodeURIComponent(name)}`);
    expect(input().value).toBe(name);
    await settle();
    expect(searchedTerms()).toEqual([name]);
  });

  it('renders an injection payload as plain text, never as markup', async () => {
    const payload = '<img src=x onerror="window.__speciesPwned=1"><b>bold</b>';
    mount(`/species?q=${encodeURIComponent(payload)}`);
    await settle();
    expect(input().value).toBe(payload);
    expect(searchedTerms()).toEqual([payload]);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(text()).toContain(`No species matched “${payload}”`);
    expect((window as unknown as { __speciesPwned?: number }).__speciesPwned).toBeUndefined();
  });

  it('bounds and trims an oversized query, in the box, the search and the URL', async () => {
    mount(`/species?q=${encodeURIComponent(`  ${'x'.repeat(500)}  `)}`);
    await settle();
    expect(input().maxLength).toBe(200);
    expect(searchedTerms()).toEqual(['x'.repeat(200)]);
    expect(urlQuery()).toBe('x'.repeat(200));
  });

  it('keeps the unavailable state distinct from no matches for a prefilled query', async () => {
    mocks.searchSpeciesOutcome.mockResolvedValue({ status: 'unavailable', httpStatus: 503 });
    mount('/species?q=Dracula');
    await settle();
    expect(container.querySelector('[data-testid="species-search-unavailable"]')).not.toBeNull();
    expect(text()).toContain('no results can be shown for “Dracula”');
    expect(text()).not.toContain('No species matched');
    expect(text()).not.toMatch(/0 results/i);
  });

  it('keeps no matches distinct from unavailable for a prefilled query', async () => {
    mount('/species?q=Dracula');
    await settle();
    expect(text()).toMatch(/0 results/i);
    expect(text()).toContain('No species matched “Dracula”');
    expect(container.querySelector('[data-testid="species-search-unavailable"]')).toBeNull();
  });

  it('lets an explicit q win over a genus filter it contradicts, and drops that filter chip', async () => {
    mount('/species?genus=Phalaenopsis&q=Dracula');
    await settle();
    expect(input().value).toBe('Dracula');
    expect(searchedTerms()).toEqual(['Dracula']);
    expect(text()).not.toContain('Filtering by');
    expect(router.state.location.search).toBe('?q=Dracula');
  });

  it('still hydrates a genus-only handoff without adding a redundant q', async () => {
    mount('/species?genus=Phalaenopsis');
    await settle();
    expect(input().value).toBe('Phalaenopsis');
    expect(text()).toContain('Filtering by');
    expect(router.state.location.search).toBe('?genus=Phalaenopsis');
  });
});

describe('species search keeps the URL in step', () => {
  it('replaces the entry while typing, keeping other parameters, and encodes the query', async () => {
    mount('/species?ref=home');
    await type('Cattleya × guatemalensis');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(urlQuery()).toBe('Cattleya × guatemalensis');
    expect(new URLSearchParams(router.state.location.search).get('ref')).toBe('home');
    expect(router.state.location.search).not.toMatch(/[× ]/);
    expect(input().value).toBe('Cattleya × guatemalensis');
  });

  it('never overwrites what the visitor is typing with its normalised echo', async () => {
    mount('/species');
    await type('Dracula ');
    expect(urlQuery()).toBe('Dracula');
    expect(input().value).toBe('Dracula ');
  });

  it('removes q when the box is cleared', async () => {
    mount('/species?q=Dracula');
    await settle();
    await type('');
    expect(router.state.location.search).toBe('');
  });

  it('commits a submitted search so Back returns to it after the next edit', async () => {
    mount('/species');
    await type('Dracula');
    submit();
    await type('Vanilla');
    expect(router.state.historyAction).toBe('PUSH');
    expect(urlQuery()).toBe('Vanilla');
    await type('Vanilla planifolia');
    expect(router.state.historyAction).toBe('REPLACE');

    mocks.searchSpeciesOutcome.mockClear();
    await navigate(-1);
    expect(urlQuery()).toBe('Dracula');
    expect(input().value).toBe('Dracula');
    expect(searchedTerms()).toEqual(['Dracula']);

    await navigate(1);
    expect(input().value).toBe('Vanilla planifolia');
  });

  it('treats a suggestion click as a committed search', async () => {
    mount('/species');
    const dracula = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Dracula')!;
    act(() => dracula.click());
    await settle();
    expect(router.state.historyAction).toBe('PUSH');
    expect(urlQuery()).toBe('Dracula');
  });

  it('adopts a query from in-app navigation and clears it when navigation removes it', async () => {
    mount('/species');
    await navigate('/species?q=Stanhopea');
    expect(input().value).toBe('Stanhopea');
    expect(searchedTerms()).toEqual(['Stanhopea']);
    await navigate('/species');
    expect(input().value).toBe('');
  });
});

const BIDI_PATTERN = /[‎‏؜‪-‮⁦-⁩]/;
const echo = () => container.querySelector('bdi');

describe('species search neutralises bidirectional overrides in shared queries', () => {
  // A shared link whose query tries to reverse the copy around its echo.
  const payload = '‮ABC⁦ try⁩‏؜';

  it('strips them from the box, the search, the URL and the echoed copy', async () => {
    mount(`/species?q=${encodeURIComponent(payload)}`);
    await settle();
    expect(input().value).toBe('ABC try');
    expect(searchedTerms()).toEqual(['ABC try']);
    expect(urlQuery()).toBe('ABC try');
    expect(router.state.location.search).toBe('?q=ABC+try');
    expect(text()).toContain('No species matched “ABC try” · try another term');
    expect(text()).not.toMatch(BIDI_PATTERN);
  });

  it('treats a query made only of bidi controls as no query', async () => {
    mount(`/species?q=${encodeURIComponent('‮⁧‏')}`);
    await settle();
    expect(input().value).toBe('');
    expect(searchedTerms()).toEqual([]);
    expect(router.state.location.search).toBe('');
  });

  it('strips them from what the visitor types or pastes, keeping the spacing typed', async () => {
    mount('/species');
    await type('Dracula‮ ');
    expect(input().value).toBe('Dracula ');
    expect(urlQuery()).toBe('Dracula');
    expect(searchedTerms()).toEqual(['Dracula']);
    expect(text()).not.toMatch(BIDI_PATTERN);
  });

  it('isolates the echoed query in <bdi> in the no-matches state', async () => {
    mount('/species?q=Dracula');
    await settle();
    const isolated = echo();
    expect(isolated?.textContent).toBe('Dracula');
    expect(isolated?.parentElement?.textContent).toBe('No species matched “Dracula” · try another term');
  });

  it('isolates the echoed query in <bdi> in the unavailable state', async () => {
    mocks.searchSpeciesOutcome.mockResolvedValue({ status: 'unavailable', httpStatus: 503 });
    mount('/species?q=Dracula');
    await settle();
    const panel = container.querySelector('[data-testid="species-search-unavailable"]')!;
    const isolated = panel.querySelector('bdi');
    expect(isolated?.textContent).toBe('Dracula');
    expect(isolated?.parentElement?.textContent).toContain('no results can be shown for “Dracula”.');
  });

  it('isolates the genus named in the filter chip in <bdi>', async () => {
    mount('/species?genus=Phalaenopsis');
    await settle();
    const chip = Array.from(container.querySelectorAll('a')).find((a) => a.textContent === 'Genus: Phalaenopsis');
    expect(chip?.querySelector('bdi')?.textContent).toBe('Phalaenopsis');
  });
});

describe('species search is keyed on the normalised term, not the raw box value', () => {
  it('starts no new search for an edit that leaves the searched term unchanged', async () => {
    mount('/species');
    await type('Dracula');
    expect(searchedTerms()).toEqual(['Dracula']);
    await type('Dracula ');
    await type('  Dracula  ');
    await settle(2000);
    expect(input().value).toBe('  Dracula  ');
    expect(searchedTerms()).toEqual(['Dracula']);
  });

  it('starts no new search when a shared query differs from the box only by padding', async () => {
    mount(`/species?q=${encodeURIComponent('  Dracula  ')}`);
    await settle();
    await type('Dracula ');
    await settle(2000);
    expect(searchedTerms()).toEqual(['Dracula']);
  });

  it('still searches again once the normalised term really changes', async () => {
    mount('/species');
    await type('Dracula ');
    await type('Dracula v');
    expect(searchedTerms()).toEqual(['Dracula', 'Dracula v']);
  });
});
