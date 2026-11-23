// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AtlasChecklistPage from './AtlasChecklistPage';
import { parseAtlasCalyxQuestionContext } from '@/features/atlas-next/calyxHandoff';

vi.mock('@/lib/backendConfig', () => ({ CALYX_BACKEND_BASE_URL: 'https://calyx.test' }));

const NOTICE = 'Statements of one checklist; areas, not occurrence records.';
const GEOMETRY = { state: 'not_held', explanation: 'No outline is held.' };
const env = { schema: 'oc.atlas-checklist-layer.v1', notice: NOTICE, geometry: GEOMETRY };
const ID = { kg_node_id: 66746, canonical_key: 'taxon:32953', label: 'Angraecum sesquipedale' };

const AREAS = { ...env, status: 'available', areas_matching: 1, next_offset: null,
  areas: [{ kg_node_id: 1, label: 'Madagascar', name_without_direction_prefix: null, taxa_listed: 2 }] };
const AREA = { ...env, status: 'available', area: { label: 'Madagascar' }, taxa_listed: 2, taxa_listed_with_a_marker: 1,
  next_offset: null, calyx: { question: 'Which orchids grow in Madagascar?' },
  taxa: [{ kg_edge_id: 9, taxon: ID, evidence: { checklist: { source_marker: '?' } }, calyx: { question: 'x' } }] };
const gapRow = { state: 'NONE_RECORDED', rows: [], gap: 'Nothing retrieved for this facet in this store. That is not evidence that nothing exists.' };
const TAXON = { ...env, status: 'available', identity: ID, calyx: { question: 'Where does Angraecum sesquipedale grow?' },
  not_served: [{ facet: 'occurrences' }, { facet: 'environment' }],
  panels: {
    names: { synonymy: { state: 'OK', truncated: false, gap: null, rows: [{ kg_edge_id: 5, to_label: 'Aeranthus sesquipedalis',
      evidence_status: 'CITED_UNREVIEWED_CHECKLIST_STATEMENT', review_state: 'UNREVIEWED', rule_name: 'world_plants_synonymy_v1' }] } },
    interactions: { pollination_cited: gapRow },
  } };

function mockFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url);
    const hit = Object.keys(routes).find((k) => url.includes(k));
    return { ok: true, status: 200, json: async () => routes[hit as string] };
  }));
  return calls;
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe('AtlasChecklistPage', () => {
  it('walks area → taxa → evidence → Ask Calyx, with source signs verbatim and gaps stated', async () => {
    const calls = mockFetch({ '/atlas/checklist/areas': AREAS, '/atlas/checklist/area?': AREA, '/atlas/checklist/taxon/66746': TAXON });
    render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
    await screen.findByText(/Madagascar/);
    expect(screen.getByText(/Geometry: not held/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Madagascar/ }));
    const taxonButton = await screen.findByRole('button', { name: 'Angraecum sesquipedale' });
    expect(screen.getByText('[?]')).toBeTruthy();
    expect(screen.getByText(/Statements, not a species count/)).toBeTruthy();
    fireEvent.click(taxonButton);
    await screen.findByText(/graph node 66746 · taxon:32953/);
    expect(screen.getByText(/CITED_UNREVIEWED_CHECKLIST_STATEMENT · review: UNREVIEWED/)).toBeTruthy();
    expect(screen.getByText(/not evidence that nothing exists/)).toBeTruthy();
    expect(screen.getByText(/Not served by the Continuum's contract: occurrences, environment/)).toBeTruthy();
    const link = screen.getByRole('link', { name: /Where does Angraecum sesquipedale grow\?/ });
    const href = link.getAttribute('href') as string;
    expect(parseAtlasCalyxQuestionContext(href.split('?')[1])?.question).toBe('Where does Angraecum sesquipedale grow?');
    expect(calls.some((c) => c.includes('/atlas/checklist/taxon/66746'))).toBe(true);
    expect(calls.every((c) => c.startsWith('https://calyx.test/atlas/checklist/'))).toBe(true);
  });

  it('sends the genus and sign filters to the backend', async () => {
    const calls = mockFetch({ '/atlas/checklist/areas': AREAS, '/atlas/checklist/area?': AREA });
    render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Madagascar/ }));
    await screen.findByRole('button', { name: 'Angraecum sesquipedale' });
    fireEvent.change(screen.getByLabelText(/Genus/), { target: { value: 'Angraecum' } });
    fireEvent.change(screen.getByLabelText(/Source signs/), { target: { value: 'marked' } });
    await waitFor(() => expect(calls.some((c) => c.includes('genus=Angraecum') && c.includes('marked=true'))).toBe(true));
  });

  it('says a gap for an area the checklist does not write, not "no orchids"', async () => {
    mockFetch({ '/atlas/checklist/areas': AREAS, '/atlas/checklist/area?': { ...env, status: 'available', reader_state: 'NOT_FOUND',
      taxa: [], next_offset: null, calyx: null, gap: 'Nothing retrieved for this facet in this store. That is not evidence that nothing exists.' } });
    render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Madagascar/ }));
    await screen.findByText(/not evidence that nothing exists/);
    expect(screen.queryByText(/no orchids/i)).toBeNull();
  });

  it('shows the switched-off state the backend returns and offers no controls', async () => {
    mockFetch({ '/atlas/checklist/areas': { ...env, status: 'not_enabled' } });
    render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
    await screen.findByText(/switched off. Nothing was read/);
    expect(screen.queryByLabelText(/Area name/)).toBeNull();
  });

  it('says unavailable as a gap, not an absence', async () => {
    mockFetch({ '/atlas/checklist/areas': { ...env, status: 'unavailable' } });
    render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
    await screen.findByText(/gap in what could be read, not an absence/);
  });

  it('says why an implied species concept has no statements, and a shared label hands no question to Calyx', async () => {
    mockFetch({
      '/atlas/checklist/areas': AREAS,
      '/atlas/checklist/area?': AREA,
      '/atlas/checklist/taxon/66746': { ...env, status: 'no_checklist_row', identity: ID, panels: {}, calyx: null,
        explanation: 'The checklist has no row of its own for it.' },
    });
    render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Madagascar/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Angraecum sesquipedale' }));
    await screen.findByText(/no row of its own/);
    expect(screen.queryByRole('link', { name: /Where does/ })).toBeNull();
  });

  it('shows the reason instead of a link when no question can be handed over', async () => {
    mockFetch({
      '/atlas/checklist/areas': AREAS,
      '/atlas/checklist/area?': AREA,
      '/atlas/checklist/taxon/66746': { ...TAXON, calyx: { question: null, reason: 'Another graph node carries the same label.' } },
    });
    render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Madagascar/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Angraecum sesquipedale' }));
    await screen.findByText(/Another graph node carries the same label/);
  });

  it('shows the record-summary sentences as given, a derived summary and not a range', async () => {
    const sentence = 'Derived from GBIF records, unreviewed: the Continuum holds 1 GBIF occurrence record in full. This is a derived summary, not its range.';
    mockFetch({
      '/atlas/checklist/areas': AREAS,
      '/atlas/checklist/area?': AREA,
      '/atlas/checklist/taxon/66746': { ...TAXON, panels: { record_context: { record_context: { state: 'OK', rows: [], gap: null, statements: [sentence] } } } },
    });
    render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Madagascar/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Angraecum sesquipedale' }));
    await screen.findByText(sentence);
  });
});

// Add `act` to the existing @testing-library/react named import before appending.

  it('clears the previous area and taxon evidence immediately while a new area is still loading', async () => {
    let finishFrance!: (value: unknown) => void;
    const pendingFrance = new Promise<unknown>((resolve) => { finishFrance = resolve; });
    const twoAreas = {
      ...AREAS,
      areas_matching: 2,
      areas: [...AREAS.areas, {
        kg_node_id: 2,
        label: 'France',
        name_without_direction_prefix: null,
        taxa_listed: 0,
      }],
    };
    // The more specific France route must precede the generic /area? fixture.
    mockFetch({
      '/atlas/checklist/areas': twoAreas,
      '/atlas/checklist/area?name=France': pendingFrance,
      '/atlas/checklist/area?': AREA,
      '/atlas/checklist/taxon/66746': TAXON,
    });
    render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Madagascar/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Angraecum sesquipedale' }));
    await screen.findByText(/graph node 66746 · taxon:32953/);
    expect(screen.getByText(/Aeranthus sesquipedalis/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Where does Angraecum sesquipedale grow/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /France/ }));
    // No France response has resolved. Clearing must happen on selection,
    // not after the next request succeeds; old source/question context must
    // not remain beside the new selection or an honest loading/empty state.
    expect(screen.queryByText(/graph node 66746 · taxon:32953/)).toBeNull();
    expect(screen.queryByText(/Aeranthus sesquipedalis/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Angraecum sesquipedale' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Where does Angraecum sesquipedale grow/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Which orchids grow in Madagascar/ })).toBeNull();

    finishFrance({
      ...env,
      status: 'available',
      area: { label: 'France' },
      taxa_listed: 0,
      taxa_listed_with_a_marker: 0,
      taxa: [],
      next_offset: null,
      calyx: { question: 'Which orchids grow in France?' },
    });
    await screen.findByRole('heading', { name: 'France' });
    expect(screen.queryByText(/graph node 66746 · taxon:32953/)).toBeNull();
    expect(screen.queryByText(/Aeranthus sesquipedalis/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Where does Angraecum sesquipedale grow/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Which orchids grow in France/ })).toBeTruthy();
  });

  it('ignores an old taxon response that arrives after changing the selected area', async () => {
    let finishTaxon!: (value: unknown) => void;
    const pendingTaxon = new Promise<unknown>((resolve) => { finishTaxon = resolve; });
    mockFetch({
      '/atlas/checklist/areas': {
        ...AREAS,
        areas_matching: 2,
        areas: [...AREAS.areas, {
          kg_node_id: 2,
          label: 'France',
          name_without_direction_prefix: null,
          taxa_listed: 0,
        }],
      },
      '/atlas/checklist/area?name=France': {
        ...env,
        status: 'available',
        area: { label: 'France' },
        taxa_listed: 0,
        taxa: [],
        next_offset: null,
        calyx: null,
      },
      '/atlas/checklist/area?': AREA,
      '/atlas/checklist/taxon/66746': pendingTaxon,
    });
    render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Madagascar/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Angraecum sesquipedale' }));
    fireEvent.click(screen.getByRole('button', { name: /France/ }));
    await screen.findByRole('heading', { name: 'France' });
    // Flush the resolved JSON promise and React's update queue. A negative
    // waitFor alone could pass before the stale state callback has executed.
    await act(async () => {
      finishTaxon(TAXON);
      await pendingTaxon;
    });
    expect(screen.queryByText(/graph node 66746 · taxon:32953/)).toBeNull();
    expect(screen.queryByText(/Aeranthus sesquipedalis/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Where does Angraecum sesquipedale grow/ })).toBeNull();
  });


it('keeps the current area usable when selecting the same area again', async () => {
  mockFetch({ '/atlas/checklist/areas': AREAS, '/atlas/checklist/area?': AREA, '/atlas/checklist/taxon/66746': TAXON });
  render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /Madagascar/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Angraecum sesquipedale' }));
  await screen.findByText(/graph node 66746 · taxon:32953/);
  fireEvent.click(screen.getByRole('button', { name: /Madagascar/ }));
  expect(screen.getByRole('button', { name: 'Angraecum sesquipedale' })).toBeTruthy();
  expect(screen.queryByText(/graph node 66746 · taxon:32953/)).toBeNull();
  expect(screen.queryByRole('link', { name: /Where does Angraecum sesquipedale grow/ })).toBeNull();
});


it('pages area names forward and back using the server cursor', async () => {
  const offsets: number[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    const offset = Number(url.searchParams.get('offset'));
    offsets.push(offset);
    const body = offset === 0
      ? { ...AREAS, areas_matching: 2, next_offset: 37 }
      : { ...AREAS, areas_matching: 2, areas: [{ ...AREAS.areas[0], kg_node_id: 2, label: 'France' }] };
    return { ok: true, status: 200, json: async () => body };
  }));
  render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
  await screen.findByRole('button', { name: /Madagascar/ });
  fireEvent.click(screen.getByRole('button', { name: 'Next areas' }));
  await screen.findByRole('button', { name: /France/ });
  expect(screen.queryByRole('button', { name: 'Next areas' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Previous areas' }));
  await screen.findByRole('button', { name: /Madagascar/ });
  expect(offsets).toEqual([0, 37, 0]);
  expect(screen.queryByRole('button', { name: 'Previous areas' })).toBeNull();
});

it('resets area pagination when the search changes', async () => {
  const requests: URL[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    requests.push(url);
    const first = Number(url.searchParams.get('offset')) === 0 && !url.searchParams.get('q');
    return { ok: true, status: 200, json: async () => first
      ? { ...AREAS, next_offset: 37 }
      : { ...AREAS, areas: [{ ...AREAS.areas[0], kg_node_id: 2, label: 'France' }] } };
  }));
  render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
  await screen.findByRole('button', { name: /Madagascar/ });
  fireEvent.click(screen.getByRole('button', { name: 'Next areas' }));
  await screen.findByRole('button', { name: /France/ });
  fireEvent.change(screen.getByLabelText('Area name'), { target: { value: 'France' } });
  await waitFor(() => expect(requests[requests.length - 1]?.searchParams.get('q')).toBe('France'));
  await screen.findByRole('button', { name: /France/ });
  expect(requests[requests.length - 1]?.searchParams.get('offset')).toBe('0');
  expect(screen.queryByRole('button', { name: 'Previous areas' })).toBeNull();
});

it('ignores an old area page after a new search returns', async () => {
  let finishPage!: (body: unknown) => void;
  const pendingPage = new Promise((resolve) => { finishPage = resolve; });
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    const isNewSearch = url.searchParams.get('q') === 'France';
    const body = isNewSearch
      ? { ...AREAS, areas: [{ ...AREAS.areas[0], kg_node_id: 2, label: 'France' }] }
      : Number(url.searchParams.get('offset')) === 37 ? null : { ...AREAS, next_offset: 37 };
    return { ok: true, status: 200, json: async () => body ?? pendingPage };
  }));
  render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
  await screen.findByRole('button', { name: /Madagascar/ });
  fireEvent.click(screen.getByRole('button', { name: 'Next areas' }));
  fireEvent.change(screen.getByLabelText('Area name'), { target: { value: 'France' } });
  await screen.findByRole('button', { name: /France/ });
  await act(async () => {
    finishPage({ ...AREAS, areas: [{ ...AREAS.areas[0], label: 'Stale area' }] });
    await pendingPage;
  });
  expect(screen.getByRole('button', { name: /France/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Stale area/ })).toBeNull();
});

function deferredResponse() {
  let resolve!: (body: unknown) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<unknown>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function mockRequests(answer: (url: URL) => unknown) {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => ({
    ok: true, status: 200, json: async () => answer(new URL(input)),
  })));
}

const OTHER_ID = { ...ID, kg_node_id: 66747, canonical_key: 'taxon:other', label: 'Synthetic second taxon' };
const TWO_TAXA = { ...AREA, next_offset: 25, taxa: [
  ...AREA.taxa, { ...AREA.taxa[0], kg_edge_id: 10, taxon: OTHER_ID },
] };

it.each(['genus', 'source signs', 'next taxon page'])('invalidates old area and taxon context during a pending and failed %s request', async (change) => {
  const pending = deferredResponse();
  let areaReads = 0;
  mockRequests((url) => {
    if (url.pathname.endsWith('/areas')) return AREAS;
    if (url.pathname.includes('/taxon/')) return TAXON;
    areaReads += 1;
    return areaReads === 1 ? TWO_TAXA : areaReads === 2 ? pending.promise : {
      ...AREA, taxa: [{ ...AREA.taxa[0], taxon: OTHER_ID }],
      calyx: { question: 'Which orchids grow in the recovered area?' },
    };
  });
  render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /Madagascar/ }));
  fireEvent.click(await screen.findByRole('button', { name: ID.label }));
  await screen.findByText(/graph node 66746/);
  if (change === 'genus') fireEvent.change(screen.getByLabelText('Genus'), { target: { value: 'New genus' } });
  else if (change === 'source signs') fireEvent.change(screen.getByLabelText('Source signs'), { target: { value: 'marked' } });
  else fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  const expectNoAbandonedContext = () => {
    expect(screen.queryByRole('button', { name: ID.label })).toBeNull();
    expect(screen.queryByRole('button', { name: OTHER_ID.label })).toBeNull();
    expect(screen.queryByText(/Statements, not a species count/)).toBeNull();
    expect(screen.queryByText(/graph node 66746/)).toBeNull();
    expect(screen.queryByText(/Aeranthus sesquipedalis/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Ask Calyx/ })).toBeNull();
    expect((screen.getByLabelText('Genus') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText('Source signs') as HTMLSelectElement).disabled).toBe(false);
  };
  expectNoAbandonedContext();
  await act(async () => { pending.reject(new Error('Area filter request failed')); });
  expect(screen.getByRole('alert').textContent).toBe('Area filter request failed');
  expectNoAbandonedContext();
  // A successful area-name search must not erase the independent area error.
  fireEvent.change(screen.getByLabelText('Area name'), { target: { value: 'Madagascar' } });
  await screen.findByRole('button', { name: /Madagascar/ });
  expect(screen.getByRole('alert').textContent).toBe('Area filter request failed');
  fireEvent.change(screen.getByLabelText('Genus'), { target: { value: 'Recovered genus' } });
  expect(screen.queryByRole('alert')).toBeNull();
  await screen.findByRole('button', { name: OTHER_ID.label });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('link', { name: /recovered area/ })).toBeTruthy();
});

it('clears the area-name error when a new search starts and recovers successfully', async () => {
  const first = deferredResponse();
  const recovered = deferredResponse();
  mockRequests((url) => url.searchParams.get('q') ? recovered.promise : first.promise);
  render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
  await act(async () => { first.reject(new Error('Area names failed')); });
  expect(screen.getByRole('alert').textContent).toBe('Area names failed');
  expect(screen.getByRole('region', { name: 'Areas' }).textContent).not.toContain('Loading…');
  fireEvent.change(screen.getByLabelText('Area name'), { target: { value: 'Recovery' } });
  expect(screen.queryByRole('alert')).toBeNull();
  await act(async () => { recovered.resolve(AREAS); });
  await screen.findByRole('button', { name: /Madagascar/ });
  expect(screen.queryByRole('alert')).toBeNull();
});

it('recovers taxon and area-name errors independently without clearing the other stream', async () => {
  const taxonFailure = deferredResponse();
  const areasFailure = deferredResponse();
  const taxonRecovery = deferredResponse();
  mockRequests((url) => {
    if (url.pathname.endsWith('/areas')) return url.searchParams.get('q') === 'Fail names' ? areasFailure.promise : AREAS;
    if (url.pathname.endsWith('/area')) return TWO_TAXA;
    return url.pathname.endsWith('/66746') ? taxonFailure.promise : taxonRecovery.promise;
  });
  render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /Madagascar/ }));
  fireEvent.click(await screen.findByRole('button', { name: ID.label }));
  await act(async () => { taxonFailure.reject(new Error('Taxon evidence failed')); });
  expect(screen.getByRole('alert').textContent).toBe('Taxon evidence failed');
  expect(screen.getByRole('region', { name: 'Evidence for the taxon' }).textContent).not.toContain('Loading…');
  fireEvent.change(screen.getByLabelText('Area name'), { target: { value: 'Successful names' } });
  await screen.findByRole('button', { name: /Madagascar/ });
  expect(screen.getByRole('alert').textContent).toBe('Taxon evidence failed');
  fireEvent.change(screen.getByLabelText('Area name'), { target: { value: 'Fail names' } });
  await act(async () => { areasFailure.reject(new Error('Area names failed')); });
  expect(screen.getAllByRole('alert').map((alert) => alert.textContent).sort()).toEqual(['Area names failed', 'Taxon evidence failed']);
  fireEvent.click(screen.getByRole('button', { name: OTHER_ID.label }));
  expect(screen.getByRole('alert').textContent).toBe('Area names failed');
  await act(async () => { taxonRecovery.resolve({ ...TAXON, identity: OTHER_ID }); });
  await screen.findByRole('heading', { name: OTHER_ID.label });
  expect(screen.getByRole('alert').textContent).toBe('Area names failed');
  fireEvent.change(screen.getByLabelText('Area name'), { target: { value: 'Recovered names' } });
  await screen.findByRole('button', { name: /Madagascar/ });
  expect(screen.queryByRole('alert')).toBeNull();
});

it.each(['areas', 'area', 'taxon'])('ignores a late old %s rejection after its replacement succeeds', async (stream) => {
  const old = deferredResponse();
  mockRequests((url) => {
    if (url.pathname.endsWith('/areas')) return url.searchParams.get('q') === 'Old' ? old.promise : AREAS;
    if (url.pathname.endsWith('/area')) return url.searchParams.get('genus') === 'Old' ? old.promise : TWO_TAXA;
    return url.pathname.endsWith('/66746') ? old.promise : { ...TAXON, identity: OTHER_ID };
  });
  render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
  await screen.findByRole('button', { name: /Madagascar/ });
  if (stream === 'areas') {
    fireEvent.change(screen.getByLabelText('Area name'), { target: { value: 'Old' } });
    fireEvent.change(screen.getByLabelText('Area name'), { target: { value: 'New' } });
    await screen.findByRole('button', { name: /Madagascar/ });
  } else {
    fireEvent.click(screen.getByRole('button', { name: /Madagascar/ }));
    await screen.findByRole('button', { name: ID.label });
    if (stream === 'area') {
      fireEvent.change(screen.getByLabelText('Genus'), { target: { value: 'Old' } });
      fireEvent.change(screen.getByLabelText('Genus'), { target: { value: 'New' } });
      await screen.findByRole('button', { name: ID.label });
    } else {
      fireEvent.click(screen.getByRole('button', { name: ID.label }));
      fireEvent.click(screen.getByRole('button', { name: OTHER_ID.label }));
      await screen.findByRole('heading', { name: OTHER_ID.label });
    }
  }
  await act(async () => { old.reject(new Error('Abandoned request failed')); });
  expect(screen.queryByRole('alert')).toBeNull();
});

const NON_AVAILABLE_RESPONSES = [
  { status: 'unavailable', reason_code: 'BUSY', httpStatus: 503, message: /graph could not be read/i },
  { status: 'unavailable', reason_code: 'READ_FAILED', httpStatus: 503, message: /graph could not be read/i },
  { status: 'not_enabled', reason_code: 'NOT_ENABLED', httpStatus: 200, message: /switched off. Nothing was read/i },
] as const;

function statusEnvelope(status: string, reason_code: string) {
  return {
    ...env, status, read_only: true, reason_code,
    explanation: status === 'unavailable'
      ? 'The graph could not be read. A stated gap, not an absence.'
      : 'The checklist layer is switched off. Nothing was read, and nothing is said about any taxon or area.',
  };
}

it.each(NON_AVAILABLE_RESPONSES)('renders an area $reason_code envelope without success fields and recovers to a genuine empty read', async ({ status, reason_code, httpStatus, message }) => {
  let areaReads = 0;
  const recovered = deferredResponse();
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/areas')) return { ok: true, status: 200, json: async () => AREAS };
    areaReads += 1;
    const blocked = areaReads === 2;
    return { ok: !blocked || httpStatus === 200, status: blocked ? httpStatus : 200,
      json: async () => areaReads === 1 ? TWO_TAXA : blocked ? statusEnvelope(status, reason_code) : recovered.promise };
  }));
  render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /Madagascar/ }));
  await screen.findByRole('button', { name: ID.label });
  fireEvent.change(screen.getByLabelText('Genus'), { target: { value: 'Blocked genus' } });
  await screen.findByRole('status');
  expect(screen.getByRole('status').textContent).toMatch(message);
  expect(screen.queryByRole('button', { name: ID.label })).toBeNull();
  expect(screen.queryByText(/Statements, not a species count/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  expect(screen.queryByRole('link', { name: /Ask Calyx/ })).toBeNull();
  const section = screen.getByRole('region', { name: 'Taxa of the area' });
  expect(section.textContent).not.toMatch(/Loading|0 statements|undefined/i);
  expect((screen.getByLabelText('Genus') as HTMLInputElement).disabled).toBe(false);
  expect((screen.getByLabelText('Source signs') as HTMLSelectElement).disabled).toBe(false);

  fireEvent.change(screen.getByLabelText('Genus'), { target: { value: 'Recovered genus' } });
  expect(screen.queryByRole('status')).toBeNull();
  expect(section.textContent).toContain('Loading');
  await act(async () => { recovered.resolve({ ...AREA, taxa_listed: 0, taxa_listed_with_a_marker: 0, taxa: [], next_offset: null, calyx: null }); });
  await screen.findByText(/0 statements. Statements, not a species count/);
  expect(screen.queryByRole('status')).toBeNull();
  expect(section.textContent).not.toMatch(/Loading|undefined/);
});

it.each(NON_AVAILABLE_RESPONSES)('renders a taxon $reason_code envelope as a status and recovers to another identity', async ({ status, reason_code, httpStatus, message }) => {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    const blocked = url.pathname.endsWith('/66746');
    const body = url.pathname.endsWith('/areas') ? AREAS : url.pathname.endsWith('/area') ? TWO_TAXA
      : blocked ? statusEnvelope(status, reason_code) : { ...TAXON, identity: OTHER_ID };
    return { ok: !blocked || httpStatus === 200, status: blocked ? httpStatus : 200, json: async () => body };
  }));
  render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /Madagascar/ }));
  fireEvent.click(await screen.findByRole('button', { name: ID.label }));
  await screen.findByRole('status');
  expect(screen.getByRole('status').textContent).toMatch(message);
  const section = screen.getByRole('region', { name: 'Evidence for the taxon' });
  expect(section.textContent).not.toMatch(/Loading|graph node|Not served|undefined/);
  expect(section.querySelector('a')).toBeNull();
  expect((screen.getByLabelText('Genus') as HTMLInputElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: OTHER_ID.label }));
  await screen.findByRole('heading', { name: OTHER_ID.label });
  expect(screen.queryByRole('status')).toBeNull();
  expect(section.textContent).toContain('graph node 66747');
  expect(section.textContent).not.toContain('graph node 66746');
});

it('gates the areas unavailable envelope before reading area rows or cursors', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: false, status: 503, json: async () => statusEnvelope('unavailable', 'READ_FAILED'),
  })));
  render(<MemoryRouter><AtlasChecklistPage /></MemoryRouter>);
  await screen.findByRole('status');
  expect(screen.getByRole('status').textContent).toMatch(/gap.*not an absence/i);
  expect(screen.queryByRole('button')).toBeNull();
  expect(document.body.textContent).not.toMatch(/undefined areas|0 areas|Loading/);
});
