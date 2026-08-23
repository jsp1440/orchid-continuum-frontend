// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import CompletionObservatory from './CompletionObservatory';

/**
 * A stale completion graph must not render indistinguishably from a current one.
 *
 * The Observatory used to print a static `CENSUS_DATE` beside its percentages.
 * A date says when the file was last written; it says nothing about whether
 * the file still describes the running code. So a graph that had fallen months
 * behind rendered exactly like one reconciled that morning, and the owner had
 * no way to tell — which is the specific way a dashboard becomes worse than no
 * dashboard.
 *
 * These drive the real component through the build stamp it actually reads,
 * because the failure being guarded is what the owner sees, not what a pure
 * function returns.
 */

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let meta: HTMLMetaElement | null = null;

/** Stamp the page the way vite.config.ts stamps a real build. */
function stampBuild(sha: string | null) {
  document.querySelector('meta[name="ocu-release-sha"]')?.remove();
  meta = null;
  if (sha === null) return;
  meta = document.createElement('meta');
  meta.setAttribute('name', 'ocu-release-sha');
  meta.setAttribute('content', sha);
  document.head.appendChild(meta);
}

function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<CompletionObservatory />));
}

const card = () => container.querySelector('[data-testid="evidence-freshness"]');
const state = () => card()?.getAttribute('data-freshness-state') ?? null;
const qualifier = () => container.querySelector('[data-testid="percentage-qualifier"]');
const text = () => container.textContent ?? '';

beforeEach(() => {
  container = document.createElement('div');
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  meta?.remove();
  meta = null;
});

describe('evidence freshness is visible on the dashboard', () => {
  it('reports unverifiable freshness when the build attested no commit', () => {
    // The default in this test environment and in any local build.
    stampBuild(null);
    render();

    expect(state()).toBe('indeterminate');
    expect(text()).toMatch(/freshness unverifiable/i);
    // And the percentage itself is qualified, for a reader who never looks at
    // the snapshot card.
    expect(qualifier()).not.toBeNull();
    expect(qualifier()!.textContent).toMatch(/not verifiable against this build/i);
  });

  it('reports drift when the build is a different commit from the evidence', () => {
    stampBuild('c'.repeat(40));
    render();

    expect(state()).toBe('drifted');
    expect(text()).toMatch(/build has moved past the evidence/i);
    expect(qualifier()!.textContent).toMatch(/not current/i);
  });

  it('never labels an unverified graph as current', () => {
    // The whole requirement, stated directly.
    for (const stamp of [null, 'unattested', '%OCU_RELEASE_SHA%', 'd'.repeat(40)]) {
      stampBuild(stamp);
      render();
      expect(state(), `stamp ${stamp}`).not.toBe('current');
      expect(qualifier(), `stamp ${stamp}`).not.toBeNull();
      act(() => root.unmount());
      container.remove();
    }
  });

  it('still shows the machine-readable snapshot identity', () => {
    stampBuild('e'.repeat(40));
    render();
    // The owner can see which commit the evidence belongs to and which commit
    // is running, rather than a date that explains neither.
    expect(text()).toMatch(/evidence @ [0-9a-f]{12}/);
    expect(text()).toMatch(/build @ eeeeeeeeeeee/);
  });

  it('no longer presents a bare census date as the freshness signal', () => {
    stampBuild(null);
    render();
    expect(text()).not.toMatch(/census as of/i);
    expect(text()).not.toMatch(/first-pass census/i);
  });
});
