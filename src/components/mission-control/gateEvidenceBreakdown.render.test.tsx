// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { COMPLETION_GRAPH } from '@/lib/completion-graph/completionGraphData';
import { computeNodePercentage } from '@/lib/completion-graph/scoring';

const { default: CompletionObservatory } = await import('./CompletionObservatory');

/**
 * The breakdown, mounted inside the Observatory it qualifies.
 *
 * A separate correct module means nothing if the page that shows the headline
 * percentage does not show the basis beside it. These tests hold that pairing.
 */

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
});

const text = () => container.textContent ?? '';

describe('the Observatory publishes the basis beside the headline', () => {
  beforeEach(() => {
    act(() => root.render(<CompletionObservatory />));
  });

  it('renders the breakdown on the same surface as the percentage', () => {
    expect(container.querySelector('[data-testid="gate-evidence-breakdown"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="evidenced-weight"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="demonstrated-weight"]')).not.toBeNull();
  });

  it('shows a basis lower than the headline it qualifies', () => {
    // The whole reason the panel exists: the headline is renormalised over a
    // fraction of the weighting, so it reads higher than the evidence covers.
    const headline = computeNodePercentage(COMPLETION_GRAPH) as number;
    const evidenced = Number(
      (container.querySelector('[data-testid="evidenced-weight"]')?.textContent ?? '').replace('%', ''),
    );
    expect(Number.isFinite(evidenced)).toBe(true);
    expect(evidenced).toBeLessThan(headline);
  });

  it('shows every gate, including the ones with no evidence', () => {
    const rows = container.querySelectorAll('[data-testid="gate-rows"] > li');
    expect(rows).toHaveLength(6);
    expect(container.querySelector('[data-testid="gate-row-deployedOperational"]')).not.toBeNull();
  });

  it('marks the deployment gate as thinly evidenced and says what would satisfy it', () => {
    const deployed = container.querySelector('[data-testid="gate-row-deployedOperational"]');
    expect(deployed?.getAttribute('data-thin')).toBe('true');
    expect(deployed?.textContent).toMatch(/completed by a user against the deployed production stack/i);
  });

  it('does not mark a well-evidenced gate as thin', () => {
    // Without this the panel would flag everything and mean nothing.
    expect(
      container.querySelector('[data-testid="gate-row-implementationPresent"]')?.getAttribute('data-thin'),
    ).toBe('false');
  });

  it('states that service health is not deployment evidence', () => {
    // Live health panels render on this same page. The distinction has to be
    // on screen, not only in the module that avoids conflating them.
    const disclaimer = container.querySelector('[data-testid="health-disclaimer"]');
    expect(disclaimer?.textContent).toMatch(/not evidence for the deployed-and-operational gate/i);
    expect(disclaimer?.textContent).toMatch(/No figure above is derived from them/i);
  });

  it('presents the demonstrated figure as a floor, not a score', () => {
    // An unevaluated gate is UNKNOWN, and UNKNOWN is not failure. If this
    // number ever reads as "the completion percentage" it understates by
    // exactly the amount nobody has checked.
    expect(text()).toMatch(/a floor, not a score/i);
    expect(text()).toMatch(/unevaluated gate is unknown, not\s+failed/i);
  });
});
