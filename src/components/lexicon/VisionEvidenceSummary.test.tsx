// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import realBackend from '@/lib/__fixtures__/visionEvidence.realBackend.json';
import { VisionEvidenceSummary } from './VisionEvidenceSummary';

/**
 * Rendered for real; only `fetch` is mocked, answering with the payloads
 * captured from the backend (see the fixture's `_capture` note).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function respond(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  }));
}

async function render(conceptId: string | undefined) {
  await act(async () => {
    root.render(<VisionEvidenceSummary conceptId={conceptId} fallback={<p data-testid="static-note">Static Vision Lab note</p>} />);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

const node = () => container.querySelector('[data-testid="vision-evidence"]') as HTMLElement | null;

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

describe('VisionEvidenceSummary', () => {
  it('keeps the static note and makes no request when the entry has no UUID concept id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await render(undefined);
    expect(container.querySelector('[data-testid="static-note"]')).not.toBeNull();
    expect(node()).toBeNull();
    await render('resupination');
    expect(container.querySelector('[data-testid="static-note"]')).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows counts, review state and limitations exactly as returned, and no images', async () => {
    respond(realBackend.populated.body);
    await render(realBackend.populated.concept_id);
    expect(node()?.dataset.state).toBe('ready');
    expect(container.querySelector('[data-testid="static-note"]')).toBeNull();
    const counts = container.querySelector('[data-testid="vision-evidence-counts"]')!.textContent!;
    expect(counts).toContain('Reference sets1');
    expect(counts).toContain('Reference images1');
    expect(counts).toContain('Vision observations0');
    expect(counts).toContain('Analyses (first reference set)1');
    expect(container.querySelector('[data-testid="vision-evidence-review-state"]')!.textContent).toBe('MACHINE_GENERATED');
    expect(container.querySelector('[data-testid="vision-evidence-reference-sets"]')!.textContent).toBe('Capture harness reference set');
    expect(container.querySelector('[data-testid="vision-evidence-limitations"]')!.textContent).toBe('Uncalibrated image');
    expect(container.querySelector('img')).toBeNull();
  });

  it('distinguishes empty from unavailable from malformed', async () => {
    respond(realBackend.empty.body);
    await render(realBackend.empty.concept_id);
    expect(node()?.dataset.state).toBe('empty');
    expect(node()?.textContent).toContain('holds no reference sets');

    // Synthetic error-state shape (not evidence).
    respond({ detail: { code: 'SYNTHETIC_TEST_CODE' } }, 503);
    await render(realBackend.populated.concept_id);
    expect(node()?.dataset.state).toBe('unavailable');
    expect(node()?.textContent).toContain('HTTP 503, SYNTHETIC_TEST_CODE');
    expect(node()?.textContent).toContain('not a finding that no evidence exists');
    expect(node()?.textContent).not.toContain('holds no reference sets');

    respond({ ...realBackend.populated.body, vision_observations: null });
    await render(realBackend.empty.concept_id);
    expect(node()?.dataset.state).toBe('malformed');
    expect(node()?.textContent).not.toContain('holds no reference sets');
    expect(container.querySelector('[data-testid="vision-evidence-counts"]')).toBeNull();
  });
});
