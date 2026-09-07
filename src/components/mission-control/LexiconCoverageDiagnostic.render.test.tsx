// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LexiconCoverageReport } from '@/lib/lexiconService';

const measureLexiconCoverage = vi.fn<[], Promise<LexiconCoverageReport>>();

vi.mock('@/lib/lexiconService', () => ({
  measureLexiconCoverage: () => measureLexiconCoverage(),
}));

const { default: LexiconCoverageDiagnostic } = await import('./LexiconCoverageDiagnostic');

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  measureLexiconCoverage.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('LexiconCoverageDiagnostic', () => {
  it('renders the measured coverage ratio without fabricating a number', async () => {
    measureLexiconCoverage.mockResolvedValueOnce({
      status: 'measured',
      measuredAt: '2026-09-05T00:00:00.000Z',
      totalEntries: 45,
      canonicalServedEntries: 9,
      famousFallbackOnlyEntries: 36,
      canonicalCoverageRatio: 9 / 45,
      canonicalReachable: true,
    });

    act(() => root.render(<LexiconCoverageDiagnostic />));
    await flush();

    expect(container.textContent).toContain('20%');
    expect(container.textContent).toContain('9 of 45 served entries are canonical-backed');
  });

  it('renders "unavailable" and no percentage when the measurement cannot be computed', async () => {
    measureLexiconCoverage.mockResolvedValueOnce({
      status: 'unavailable',
      measuredAt: '2026-09-05T00:00:00.000Z',
      totalEntries: 0,
      canonicalServedEntries: 0,
      famousFallbackOnlyEntries: 0,
      canonicalCoverageRatio: null,
      canonicalReachable: false,
      reason: 'Canonical Lexicon API request failed and no Famous fallback entries exist to measure against.',
    });

    act(() => root.render(<LexiconCoverageDiagnostic />));
    await flush();

    expect(container.textContent).toContain('Coverage unavailable');
    expect(container.textContent).not.toMatch(/\d+%/);
  });

  it('renders an error state without throwing when the measurement call itself rejects', async () => {
    measureLexiconCoverage.mockRejectedValueOnce(new Error('boom'));

    expect(() => act(() => root.render(<LexiconCoverageDiagnostic />))).not.toThrow();
    await flush();

    expect(container.textContent).toContain('Coverage unavailable');
  });
});
