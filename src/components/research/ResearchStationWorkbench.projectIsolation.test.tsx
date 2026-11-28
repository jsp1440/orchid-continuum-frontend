// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ResearchStationSynthesis } from '@/lib/researchStationSynthesis';
import ResearchStationWorkbench from './ResearchStationWorkbench';

const mocks = vi.hoisted(() => ({ synthesize: vi.fn() }));
vi.mock('@/lib/researchStationSynthesis', async () => ({
  ...await vi.importActual<typeof import('@/lib/researchStationSynthesis')>('@/lib/researchStationSynthesis'),
  runResearchStationSynthesis: mocks.synthesize,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const project = (id: string) => ({ project_id: id, title: `Synthetic ${id} investigation`, research_question: `Question for ${id}?`, hypothesis: `Unverified ${id} hypothesis`, status: 'ACTIVE' });
const synthesis = (id: string): ResearchStationSynthesis => ({ conversationId: `conv-${id}`, answer: `Synthetic ${id} answer`, structure: null, plan: null, mission: null, citations: [], degraded: true });
async function render(id: string) {
  await act(async () => root.render(<MemoryRouter><ResearchStationWorkbench projectId={id} /></MemoryRouter>));
}
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  mocks.synthesize.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = new URL(url, 'https://fixture.test').pathname;
    const match = path.match(/\/projects\/([^/]+)(.*)/);
    if (!match) return response({ items: [] });
    const [, id, suffix] = match;
    if (suffix === '/taxa') return response({ items: [{ project_id: id, taxon_id: id === 'old' ? 'Cattleya labiata' : 'Dracula simia', relationship: 'SUBJECT' }] });
    return response(suffix ? { items: [], total: 0 } : project(id));
  }));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it('ignores a delayed old-project load after the next investigation is ready', async () => {
  const oldLoad = deferred<Response>();
  const fetch = vi.mocked(globalThis.fetch);
  const current = fetch.getMockImplementation()!;
  fetch.mockImplementation((...args) => String(args[0]).endsWith('/projects/old') ? oldLoad.promise : current(...args));
  await render('old');
  await render('new');
  expect(container.textContent).toContain('Question for new?');
  await act(async () => oldLoad.resolve(response(project('old'))));
  expect(container.textContent).toContain('Question for new?');
  expect(container.textContent).not.toContain('Question for old?');
  for (const anchor of container.querySelectorAll('a')) expect(anchor.href).not.toContain('project=old');
});

it('never carries an old synthesis or conversation into the next project', async () => {
  const oldSynthesis = deferred<ResearchStationSynthesis>();
  mocks.synthesize.mockReturnValueOnce(oldSynthesis.promise).mockResolvedValueOnce(synthesis('new'));
  await render('old');
  const start = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Synthesize this investigation'))!;
  await act(async () => start.click());
  expect(mocks.synthesize).toHaveBeenCalledTimes(1);
  await render('new');
  await act(async () => oldSynthesis.resolve(synthesis('old')));
  expect(container.textContent).not.toContain('Synthetic old answer');
  expect(container.textContent).toContain('Question for new?');
  for (const anchor of container.querySelectorAll('a')) expect(anchor.href).not.toContain('conv-old');
  const next = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Synthesize this investigation'))!;
  await act(async () => next.click());
  expect(container.textContent).toContain('Synthetic new answer');
  expect(mocks.synthesize.mock.calls[1][0].project.project_id).toBe('new');
});

it('clears a completed conversation when the project changes', async () => {
  mocks.synthesize.mockResolvedValue(synthesis('old'));
  await render('old');
  const start = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Synthesize this investigation'))!;
  await act(async () => start.click());
  expect(container.querySelector('a[href*="conv-old"]')).not.toBeNull();
  await render('new');
  expect(container.querySelector('a[href*="conv-old"]')).toBeNull();
  expect(container.textContent).not.toContain('Synthetic old answer');
});
