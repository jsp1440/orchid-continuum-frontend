// @vitest-environment jsdom
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiResult } from '@/lib/api';
import { ApiError } from '@/lib/api';

/**
 * The public API that serves GET /api/zoo/queue is not reachable from the
 * test environment, so every payload here is a SYNTHETIC SHAPE, labelled as
 * such. The "present" item deliberately uses a non-taxon label and an
 * `.invalid` image host: the test proves the component renders what the API
 * sends, and must not itself bind an image to a real taxon.
 */
const SYNTHETIC_ITEM = {
  submission_id: 'synthetic-submission-1',
  proposed_taxon: 'SYNTHETIC TAXON LABEL',
  thumbnail_url: 'https://example.invalid/synthetic-thumbnail.jpg',
  submitted_at: '2026-01-01T00:00:00Z',
  review_state: 'pending',
};

const queue = vi.fn<(signal?: AbortSignal) => Promise<ApiResult<unknown>>>();

vi.mock('@/lib/zoo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/zoo')>();
  return {
    ...actual,
    loadZooQueue: async (signal?: AbortSignal) => actual.interpretZooQueue(await queue(signal)),
  };
});

import ZooReviewWorkflow from './ZooReviewWorkflow';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Taxa and stock photos the removed demo queue presented as submissions. */
const REMOVED_DEMO_TAXA = [
  'Dracula vampira',
  'Bulbophyllum echinolabium',
  'Angraecum sesquipedale',
  'Phragmipedium kovachii',
];

describe('ZooReviewWorkflow live queue states', () => {
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
    queue.mockReset();
  });

  async function renderWith(result: ApiResult<unknown>) {
    queue.mockResolvedValue(result);
    await act(async () => {
      root.render(<ZooReviewWorkflow />);
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  const status = () => container.querySelector('[data-testid="zoo-queue-status"]')?.textContent;

  function expectNoInventedRecords() {
    expect(container.querySelectorAll('img')).toHaveLength(0);
    // Icons are inline SVG (their xmlns is the only URL); no photo of any kind.
    expect(container.innerHTML).not.toMatch(/unsplash|<img|src="https?:|url\(/i);
    expect(container.textContent).not.toContain('Proposed taxon');
    for (const taxon of REMOVED_DEMO_TAXA) expect(container.textContent).not.toContain(taxon);
    expect(container.textContent).not.toMatch(/demo queue|demo-00/i);
  }

  it('shows "live queue unavailable" for an outage and invents nothing', async () => {
    await renderWith({ data: null, error: new ApiError('Request failed (503) — /api/zoo/queue', 503, '/api/zoo/queue'), unconfigured: false });
    expect(status()).toBe('Live queue unavailable');
    expect(container.querySelector('[data-testid="zoo-queue-unavailable"]')).not.toBeNull();
    expect(container.textContent).toContain('Request failed (503)');
    expect(container.textContent).not.toContain('No submissions awaiting review');
    expectNoInventedRecords();
  });

  it('treats an unconfigured API as unavailable, not as an empty queue', async () => {
    await renderWith({ data: null, error: null, unconfigured: true });
    expect(status()).toBe('Live queue unavailable');
    expect(container.textContent).toContain('not configured');
    expect(container.textContent).not.toContain('No submissions awaiting review');
    expectNoInventedRecords();
  });

  it('treats a malformed payload as unavailable', async () => {
    await renderWith({ data: { items: [SYNTHETIC_ITEM] }, error: null, unconfigured: false });
    expect(status()).toBe('Live queue unavailable');
    expectNoInventedRecords();
  });

  it('says "no submissions awaiting review" only for a confirmed empty list', async () => {
    await renderWith({ data: [], error: null, unconfigured: false });
    expect(status()).toBe('Live queue');
    expect(container.querySelector('[data-testid="zoo-queue-empty"]')?.textContent).toContain(
      'No submissions awaiting review',
    );
    expect(container.textContent).not.toContain('Live queue unavailable');
    expectNoInventedRecords();
  });

  it('renders exactly the submissions the live queue returned', async () => {
    await renderWith({ data: [SYNTHETIC_ITEM], error: null, unconfigured: false });
    expect(status()).toBe('Live queue');
    const images = Array.from(container.querySelectorAll('img'));
    expect(images.map((img) => img.getAttribute('src'))).toEqual([SYNTHETIC_ITEM.thumbnail_url]);
    expect(container.textContent).toContain(SYNTHETIC_ITEM.proposed_taxon);
    expect(container.textContent).toContain(SYNTHETIC_ITEM.submission_id);
    for (const taxon of REMOVED_DEMO_TAXA) expect(container.textContent).not.toContain(taxon);
    expect(container.innerHTML).not.toMatch(/unsplash/i);
  });
});

describe('ZooReviewWorkflow source', () => {
  // The component must hold no submission, taxon or image records of its own.
  const source = readFileSync('src/components/zoo/ZooReviewWorkflow.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('contains no hard-coded image URLs or queue records', () => {
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).not.toMatch(/unsplash/i);
    expect(source).not.toMatch(/DEMO_QUEUE|submission_id:\s*['"`]/);
    expect(source).not.toMatch(/proposed_taxon:\s*['"`]/);
    expect(source).not.toMatch(/thumbnail_url:\s*['"`]/);
    for (const taxon of REMOVED_DEMO_TAXA) expect(source).not.toContain(taxon);
  });
});
