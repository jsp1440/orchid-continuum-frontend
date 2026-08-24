// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import HasslerReleaseLifecyclePanel from './HasslerReleaseLifecyclePanel';
import {
  HASSLER_LIFECYCLE_STATES,
  type HasslerReleaseStatusResult,
} from '@/lib/hasslerReleaseLifecycle';

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
});

function render(result: HasslerReleaseStatusResult | null, loading = false) {
  act(() => root.render(<HasslerReleaseLifecyclePanel result={result} loading={loading} />));
}

const available: HasslerReleaseStatusResult = {
  kind: 'available',
  status: {
    lifecycleState: 'STAGED_COMPLETE',
    lifecycleStates: [...HASSLER_LIFECYCLE_STATES],
    rationale: 'Staging completed; awaiting owner activation.',
    expectedRelease: { filename: 'WorldOrchids 26-08 (Aug 2 2026).csv', versionLabel: '26-08' },
    activeVsStaged: 'active_release_differs_from_exact_release',
    activeReleaseId: 'rel-active',
    stagedReleaseId: 'rel-staged',
    superseded: false,
    supersededBy: null,
    unavailableEvidence: ['durable change report is not available'],
    evidenceComplete: false,
    relinkDomains: [
      { surface: 'pollinator_links', count: 12, countObserved: true },
      { surface: 'mycorrhiza_links', count: null, countObserved: false },
    ],
    relinkCountsComplete: false,
    relinkUnresolvedBlockers: ['change report absent'],
    readOnly: true,
    automaticPromotion: false,
  },
};

describe('HasslerReleaseLifecyclePanel', () => {
  it('renders the classified state and active-vs-staged reading', () => {
    render(available);
    expect(container.querySelector('[data-testid="hassler-available"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="hassler-state"]')?.textContent).toContain('Staged');
    expect(container.querySelector('[data-testid="hassler-active-vs-staged"]')?.textContent).toContain(
      'different release',
    );
  });

  it('shows an observed downstream count but withholds an unobserved one', () => {
    render(available);
    expect(container.querySelector('[data-testid="hassler-relink-pollinator_links"]')?.textContent).toBe('12');
    expect(container.querySelector('[data-testid="hassler-relink-mycorrhiza_links"]')?.textContent).toBe(
      'not observed',
    );
  });

  it('surfaces evidence the pipeline could not establish', () => {
    render(available);
    const block = container.querySelector('[data-testid="hassler-unavailable-evidence"]');
    expect(block?.textContent).toContain('durable change report is not available');
  });

  it('fails closed when the backend is unreachable, without asserting ABSENT', () => {
    render({ kind: 'unreachable', reason: 'This status requires an active Mission Control owner session.' });
    const unreachable = container.querySelector('[data-testid="hassler-unreachable"]');
    expect(unreachable).toBeTruthy();
    expect(unreachable?.textContent).toContain('active Mission Control owner session');
    expect(unreachable?.textContent).toContain('says nothing about whether');
    // No classified-state body should render.
    expect(container.querySelector('[data-testid="hassler-available"]')).toBeNull();
    expect(container.textContent).not.toContain('Absent');
  });

  it('shows a loading state while the status is being read', () => {
    render(null, true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('lifecycle');
  });

  it('warns rather than reassures when automatic promotion is reported', () => {
    render({
      kind: 'available',
      status: { ...available.status, automaticPromotion: true },
    });
    expect(container.textContent).toContain('Automatic promotion REPORTED');
  });
});
