// @vitest-environment jsdom

/**
 * Page-level proof that the Calyx Science Status dashboard fails closed per
 * section. Healthy endpoints answer with payloads captured verbatim from the
 * backend (`__fixtures__/calyxScienceDashboard.realBackend.json`); a failing
 * endpoint answers HTTP 503, a synthetic error state. The page must keep the
 * healthy sections' real figures and must never render a failed section as
 * zero, empty, or still loading.
 *
 * Only the owner-session check is mocked, to reach the dashboard behind the
 * owner gate; the gate itself is not what this suite tests.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import captured from '@/lib/__fixtures__/calyxScienceDashboard.realBackend.json';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ session: null, user: null, signOut: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/lib/ownerOperationsConsole', () => ({
  validateOwnerSession: vi.fn(async () => ({ authenticated: true, status: 'authenticated', owner: 'owner' })),
  createOwnerSession: vi.fn(),
  endOwnerSession: vi.fn(async () => undefined),
}));

type Section = 'summary' | 'status' | 'departments' | 'gaps' | 'datasets' | 'missions' | 'harvesters' | 'dossiers';

function stubScienceBackend(failing: Section[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const match = /\/api\/science\/([a-z]+)$/.exec(url);
      if (!match) return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      const section = match[1] as Section;
      if (failing.includes(section)) return new Response('{}', { status: 503, statusText: 'Service Unavailable' });
      return new Response(JSON.stringify(captured[section]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

const { default: CalyxScienceStatus } = await import('./CalyxScienceStatus');

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
  vi.unstubAllGlobals();
});

async function mountAndLoad() {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/calyx-science']}>
        <CalyxScienceStatus />
      </MemoryRouter>,
    );
  });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (container.textContent?.includes('Last fetched:') && !container.textContent.includes('Last fetched: not loaded')) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error('dashboard never loaded');
}

function statValue(label: string): string {
  // The Stat tile is <div><div><div>{label}</div><Icon/></div><div>{value}</div></div>.
  const labelEl = Array.from(container.querySelectorAll('div')).find(
    (el) => el.childElementCount === 0 && el.textContent === label,
  );
  const tile = labelEl?.parentElement?.parentElement;
  if (!tile) throw new Error(`no stat tile for ${label}`);
  return tile.lastElementChild?.textContent ?? '';
}

describe('CalyxScienceStatus per-section fail-closed rendering', () => {
  it('renders the captured backend figures with no unavailable banner when every section answers', async () => {
    stubScienceBackend([]);
    await mountAndLoad();

    expect(container.textContent).not.toContain('did not respond');
    expect(statValue('Runtime mode')).toBe(captured.summary.mode);
    expect(statValue('Science departments')).toBe(String(captured.summary.department_count));
    expect(statValue('Known gaps')).toBe(String(captured.status.known_gap_count));
    expect(container.textContent).toContain(captured.datasets.datasets[0].display_name);
  });

  it('reads "unavailable", not zero, for a count whose summary and section both failed, and keeps the rest', async () => {
    stubScienceBackend(['summary', 'departments']);
    await mountAndLoad();

    expect(container.textContent).toContain('2 of 8 Calyx science endpoints did not respond');
    expect(statValue('Science departments')).toBe('unavailable');
    expect(container.textContent).toContain('Department telemetry is unavailable right now -- not confirmed zero.');
    // Runtime mode is still reported by the status endpoint.
    expect(statValue('Runtime mode')).toBe(captured.status.mode);
    // Healthy sections still render their real data.
    expect(statValue('Known gaps')).toBe(String(captured.status.known_gap_count));
    expect(container.textContent).toContain(captured.datasets.datasets[0].display_name);
  });

  it('reports runtime mode as unavailable, not "loading", when both summary and status failed', async () => {
    stubScienceBackend(['summary', 'status']);
    await mountAndLoad();

    expect(statValue('Runtime mode')).toBe('unavailable');
    // Known gaps falls back to the real gaps list, which did answer.
    expect(statValue('Known gaps')).toBe(String(captured.gaps.gaps.length));
    // With no summary or status, the safety gates are unknown rather than assumed.
    expect(container.textContent).toContain('Destructive actions: unknown');
  });

  it('marks failed dataset and dossier sections unavailable instead of rendering them as empty', async () => {
    stubScienceBackend(['datasets', 'dossiers']);
    await mountAndLoad();

    expect(container.textContent).toContain('Dataset telemetry is unavailable right now -- not confirmed zero.');
    expect(container.textContent).toContain('Dossier queue telemetry is unavailable right now -- not confirmed zero.');
    expect(container.textContent).not.toContain(captured.datasets.datasets[0].display_name);
    expect(statValue('Science departments')).toBe(String(captured.summary.department_count));
  });

  it('shows a full-page error, not an empty dashboard, when every section failed', async () => {
    stubScienceBackend(['summary', 'status', 'departments', 'gaps', 'datasets', 'missions', 'harvesters', 'dossiers']);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/calyx-science']}>
          <CalyxScienceStatus />
        </MemoryRouter>,
      );
    });
    for (let attempt = 0; attempt < 30 && !container.textContent?.includes('503'); attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    expect(container.textContent).toContain('503');
    expect(container.textContent).toContain('Last fetched: not loaded');
    expect(statValue('Science departments')).toBe('-');
  });
});
