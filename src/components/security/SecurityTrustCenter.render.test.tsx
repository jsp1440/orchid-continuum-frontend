// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Trust Center surface is feature-flagged on for these tests.
vi.stubEnv('VITE_SECURITY_TRUST_CENTER', 'true');

const { SecurityTrustCenter } = await import(
  '@/components/security/SecurityTrustCenter'
);

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

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
  vi.restoreAllMocks();
});

async function flush() {
  // Allow the Promise.all + state updates to settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('SecurityTrustCenter — fail closed', () => {
  it('shows the unauthorized state on 403 and renders no incident data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 403 })),
    );
    await act(async () => {
      root.render(<SecurityTrustCenter />);
    });
    await flush();
    expect(container.textContent).toContain('not authorized');
    expect(container.textContent).not.toContain('SIMULATED');
  });

  it('shows the unavailable state on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down');
      }),
    );
    await act(async () => {
      root.render(<SecurityTrustCenter />);
    });
    await flush();
    expect(container.textContent).toContain('failing closed');
  });

  it('renders incidents and labels simulated ones when authorized', async () => {
    const incidents = [
      {
        incident_id: 'i1',
        title: 'auth.repeated_failures on auth',
        status: 'open',
        severity_band: 'high',
        created_at: '2026-08-27T10:00:00.000Z',
        updated_at: '2026-08-27T10:05:00.000Z',
        simulated: true,
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = url.includes('/metrics')
          ? { incidents_by_status: { open: 1 }, prevented_or_paused_actions: 3, events_rejected: 2, confirmed_vs_false_positive: { confirmed: 0, false_positive: 0 } }
          : incidents;
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    await act(async () => {
      root.render(<SecurityTrustCenter />);
    });
    await flush();
    expect(container.textContent).toContain('auth.repeated_failures');
    expect(container.textContent).toContain('SIMULATED');
    expect(container.textContent).toContain('Prevented / paused');
  });
});

describe('SecurityTrustCenter — feature flag off', () => {
  it('shows a disabled message when the flag is off', async () => {
    vi.stubEnv('VITE_SECURITY_TRUST_CENTER', 'false');
    vi.resetModules();
    const mod = await import('@/components/security/SecurityTrustCenter');
    await act(async () => {
      root.render(<mod.SecurityTrustCenter />);
    });
    await flush();
    expect(container.textContent).toContain('disabled for the current deployment');
  });
});
