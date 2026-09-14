// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResearchTraitExplorer from './ResearchTraitExplorer';

let container: HTMLDivElement;
let root: Root;
let fetch: ReturnType<typeof vi.fn>;
const fixture = (name = 'Cattleya purpurata') => ({
  contract_version: 'oc-research-traits-v1',
  subject: { rank: 'species', name }, state: 'AVAILABLE',
  generated_at: '2026-09-06T00:00:00Z',
  distributions: [{
    trait_id: 'test-trait', label: 'Fixture trait', evidence_state: 'PROVISIONAL',
    buckets: [{ value: 'test-category', count: 0 }, { value: null, count: null }],
    receipts: [{ source_id: 'fixture-source', record_id: 'fixture-record', source_name: 'Transport fixture', source_url: 'https://example.org/fixture', license: 'test-license' }],
  }],
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  fetch = vi.fn().mockResolvedValue(response(fixture()));
  vi.stubGlobal('fetch', fetch);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(subject = 'Cattleya purpurata') {
  await act(async () => root.render(<ResearchTraitExplorer key={subject} initialSubject={subject} />));
}
async function submit() {
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}
async function editName(value: string) {
  await act(async () => {
    const input = container.querySelector('input')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Research Trait Explorer', () => {
  it('requires explicit retrieval and preserves the arriving species', async () => {
    await render();
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector('input')?.value).toBe('Cattleya purpurata');
    expect(container.querySelector('select')?.value).toBe('species');
    expect(container.textContent).toContain('it supplies no scientific evidence');
    await submit();
    expect(fetch.mock.calls[0][0]).toContain('species=Cattleya+purpurata');
    expect(container.textContent).toContain('PROVISIONAL');
    expect(container.textContent).toContain('Sample size: UNKNOWN');
    expect(container.textContent).toContain('Confidence: not supplied');
    expect(container.querySelectorAll('tbody tr')[0].textContent).toBe('test-category0');
    expect(container.querySelectorAll('tbody tr')[1].textContent).toBe('UNKNOWNUNKNOWN');
    expect(container.textContent).toContain('fixture-record');
    expect(container.querySelector('a')?.href).toBe('https://example.org/fixture');
    expect(container.querySelector('a')?.rel).toContain('noopener');
  });

  it('labels keyboard controls and announces request state', async () => {
    await render();
    for (const element of container.querySelectorAll('input, select')) {
      expect(container.querySelector(`label[for="${element.id}"]`)).not.toBeNull();
    }
    expect(container.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite');
    await submit();
    expect(container.querySelector('caption')?.textContent).toContain('Fixture trait');
    expect(container.querySelectorAll('th[scope="col"]')).toHaveLength(2);
  });

  it.each([[404, 'not yet available'], [401, 'Sign in'], [503, 'Trait data is unavailable']])('renders HTTP %s honestly', async (status, message) => {
    fetch.mockResolvedValue(response({}, status as number));
    await render();
    await submit();
    expect(container.textContent).toContain(message);
    expect(container.querySelector('table')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['UNKNOWN', 'UNAVAILABLE', 'WITHHELD', 'ABSENT'])('keeps %s visible without manufacturing counts', async (state) => {
    fetch.mockResolvedValue(response({ ...fixture(), state, distributions: [] }));
    await render();
    await submit();
    expect(container.textContent).toContain(state);
    expect(container.textContent).toContain('No biological absence or zero count is inferred');
    expect(container.querySelector('table')).toBeNull();
  });

  it('clears prior results on edits and ignores a late response even when transport ignores abort', async () => {
    let finish!: (value: Response) => void;
    fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    await render();
    await submit();
    expect(container.textContent).toContain('Loading traits for Cattleya purpurata');
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    await editName('Cattleya labiata');
    expect(signal.aborted).toBe(true);
    fetch.mockResolvedValueOnce(response(fixture('Cattleya labiata')));
    await submit();
    await act(async () => finish(response(fixture())));
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Cattleya labiata');
    expect(container.querySelector('[role="status"]')?.textContent).not.toContain('Cattleya purpurata');
    await editName('Cattleya maxima');
    expect(container.querySelector('table')).toBeNull();
  });

  it('clears a persisted result on navigation and makes no unsolicited request', async () => {
    await render();
    await submit();
    await render('Cattleya');
    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelector('select')?.value).toBe('genus');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a mismatched response without showing another subject’s trait values', async () => {
    fetch.mockResolvedValue(response(fixture('Cattleya labiata')));
    await render();
    await submit();
    expect(container.textContent).toContain('Trait data is unavailable');
    expect(container.textContent).not.toContain('test-category');
  });
});
