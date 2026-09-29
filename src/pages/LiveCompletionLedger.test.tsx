// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LiveCompletionLedger from './LiveCompletionLedger';

vi.mock('@/components/orchid/Navbar', () => ({ default: () => <div data-testid="navbar" /> }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const ledger = {
  schema_version: 1,
  program: 'OC-FINISH-14D',
  source_of_truth: 'github',
  hard_paid_ceiling_usd: 50,
  paid_spend_usd: 0.001027,
  receipt_count: 2,
  verified_complete_count: 1,
  generated_at: '2026-09-14T21:00:00.000Z',
  completed: [
    { id: 1, title: 'Evidence-linked proof', ref: 'frontend#1', status: 'complete', url: 'https://github.com/example/repo/issues/1' },
    { id: 2, title: 'Legacy unlinked receipt', ref: 'backend#2', status: 'complete' },
  ],
  active: [
    { title: 'A running lane', ref: 'frontend#3', status: 'running' },
    { title: 'A queued lane', ref: 'frontend#4', status: 'queued' },
    { title: 'An owner gate', ref: 'Brain#5', status: 'owner_gate' },
    { title: 'A blocker', ref: 'backend#6', status: 'blocked' },
  ],
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(ledger), { status: 200 })));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderLedger() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <LiveCompletionLedger />
      </MemoryRouter>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('LiveCompletionLedger', () => {
  it('separates completion receipts from active work and links available evidence', async () => {
    await renderLedger();
    expect(container.textContent).toContain('Completion receipts');
    expect(container.textContent).toContain('Evidence-linked proof');
    expect(container.textContent).toContain('Legacy unlinked receipt');
    expect(container.textContent).toContain('Current execution');
    expect(container.querySelector('a[href="https://github.com/example/repo/issues/1"]')).not.toBeNull();
  });

  it('shows execution counts, NO-API mode, and stale snapshot truthfully', async () => {
    await renderLedger();
    expect(container.textContent).toContain('Evidence-linked');
    expect(container.textContent).toContain('2 receipts total');
    expect(container.textContent).toContain('Running');
    expect(container.textContent).toContain('Queued');
    expect(container.textContent).toContain('Owner gates');
    expect(container.textContent).toContain('Blocked');
    expect(container.textContent).toContain('NO-API');
    expect(container.textContent).toContain('State snapshot is stale or uninitialized');
  });

  it('requests the dedicated state-branch ledger with cache bypass', async () => {
    await renderLedger();
    const mockedFetch = vi.mocked(fetch);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(String(mockedFetch.mock.calls[0][0])).toContain(
      'raw.githubusercontent.com/jsp1440/orchid-continuum-frontend/oc-live-ledger-state/public/data/oc-live-completion-ledger.json?t=',
    );
    expect(mockedFetch.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
  });
});
