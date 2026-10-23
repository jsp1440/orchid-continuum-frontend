// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Viewport } from './geo';
import type { ExplorerFilters } from './occurrenceProvider';
import { toCsv } from './exporters';

const mocks = vi.hoisted(() => ({ query: vi.fn(), canonical: vi.fn() }));
vi.mock('@/lib/backendConfig', () => ({ CALYX_BACKEND_BASE_URL: 'https://synthetic.invalid' }));
vi.mock('@/lib/orchidContinuum', () => ({ fetchAtlasOccurrencePoints: mocks.canonical }));
vi.mock('@/features/atlas-explorer/occurrenceProvider', async () => ({
  ...await vi.importActual<typeof import('./occurrenceProvider')>('@/features/atlas-explorer/occurrenceProvider'),
  queryBackend: mocks.query,
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type Hook = typeof import('./useExplorerData').useExplorerData;
let useData: Hook;
let latest: ReturnType<Hook>;
let root: Root;
let container: HTMLDivElement;
const world: Viewport = { west: -180, south: -90, east: 180, north: 90, zoom: 8 };
const east: Viewport = { west: 100, south: 0, east: 120, north: 20, zoom: 8 };
const filters = (genus: string | null): ExplorerFilters => ({ genus, scientificName: null, taxonId: null, yearFrom: null, yearTo: null, months: [] });
const point = (genus: string, id: string, lng = -73) => ({ occurrenceID: id, scientificName: `${genus} example`, genus, decimalLatitude: 10, decimalLongitude: lng });
const ok = (genus: string, id: string, lng = -73) => ({ kind: 'ok', cached: false, response: { mode: 'points', points: [point(genus, id, lng)], clusters: [], total_in_view: 1, total_is_exact: true, truncated: false, truncation_reason: null, cell_deg: null } });
const unreachable = () => ({ kind: 'unreachable', detail: 'Synthetic transport failure' });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function Probe({ view, selected }: { view: Viewport | null; selected: ExplorerFilters }) { latest = useData(view, selected); return null; }
async function render(view: Viewport | null, selected: ExplorerFilters) { await act(async () => { root.render(<Probe view={view} selected={selected} />); await new Promise(resolve => setTimeout(resolve, 0)); }); }
const recordNames = () => latest.viewData.records.map(p => p.scientificName);
beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); mocks.canonical.mockResolvedValue([]); ({ useExplorerData: useData } = await import('./useExplorerData')); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('backend views remain bound to the queried subject and viewport', () => {
  it('waits for a viewport without claiming a request failure', async () => {
    await render(null, filters('Cattleya'));
    expect(latest.viewData.status).toBe('loading'); expect(recordNames()).toEqual([]); expect(mocks.query).not.toHaveBeenCalled();
  });
  it('withholds prior-subject records and exports while a new query is pending', async () => {
    const pending = deferred<ReturnType<typeof ok>>(); mocks.query.mockResolvedValueOnce(ok('Cattleya', 'A')).mockReturnValueOnce(pending.promise);
    await render(world, filters('Cattleya')); await render(world, filters('Dracula'));
    expect(latest.viewData.status).toBe('loading'); expect(recordNames()).toEqual([]);
    expect(toCsv(latest.viewData.records, { provider: 'calyx-viewport', generatedAt: new Date(0), bbox: 'world', filters: 'Dracula' })).not.toContain('Cattleya example');
    await act(async () => pending.resolve(ok('Dracula', 'B')));
    expect(recordNames()).toEqual(['Dracula example']);
  });
  it('reports a failed changed-subject query without presenting old records as current', async () => {
    mocks.query.mockResolvedValueOnce(ok('Cattleya', 'A')).mockResolvedValueOnce(unreachable());
    await render(world, filters('Cattleya')); await render(world, filters('Dracula'));
    expect(latest.viewData.status).toBe('unavailable'); expect(recordNames()).toEqual([]);
  });
  it('does not label records from a previous viewport as the new viewport after failure', async () => {
    mocks.query.mockResolvedValueOnce(ok('Cattleya', 'A')).mockResolvedValueOnce(unreachable());
    await render(world, filters('Cattleya')); await render(east, filters('Cattleya'));
    expect(latest.viewData.status).toBe('unavailable'); expect(recordNames()).toEqual([]);
  });
  it('retains the last good data when a transient failure is for the exact same query', async () => {
    mocks.query.mockResolvedValueOnce(ok('Cattleya', 'A')).mockResolvedValueOnce(unreachable());
    await render(world, filters('Cattleya')); await render({ ...world }, filters('Cattleya'));
    expect(latest.viewData.status).toBe('ready'); expect(recordNames()).toEqual(['Cattleya example']);
  });
  it('keeps a newer successful query when an aborted older request rejects late', async () => {
    const old = deferred<ReturnType<typeof ok>>(); mocks.query.mockReturnValueOnce(old.promise).mockResolvedValueOnce(ok('Dracula', 'B', 110));
    await render(world, filters('Cattleya')); await render(east, filters('Dracula'));
    await act(async () => old.reject(new Error('late failure after abort')));
    expect(latest.calyx.kind).toBe('available'); expect(recordNames()).toEqual(['Dracula example']); expect(mocks.canonical).not.toHaveBeenCalled();
  });
  it('still falls back to the locality-projected canonical store on initial backend failure', async () => {
    mocks.query.mockResolvedValue(unreachable()); mocks.canonical.mockResolvedValue([{ id: 'canonical-A', lat: 10.012, lng: -73.012, acceptedName: 'Cattleya example', genus: 'Cattleya', family: 'Orchidaceae', assessmentResolved: false }]);
    await render(world, filters('Cattleya'));
    expect(latest.viewData.provider).toBe('canonical-store'); expect(latest.viewData.status).toBe('ready'); expect(recordNames()).toEqual(['Cattleya example']); expect(latest.viewData.records[0].generalised).toBe(true);
  });
});
