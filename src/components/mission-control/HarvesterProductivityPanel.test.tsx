// @vitest-environment jsdom

/**
 * The one rule this surface exists to keep: an unmeasured counter must never
 * be rendered as 0. The endpoint it replaces reports literal zeros for every
 * harvester, so "retained nothing" and "nobody instrumented this" look the same
 * there. If this panel prints 0 for an unavailable metric it has reintroduced
 * exactly that confusion in a place the owner is meant to trust.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatMetric,
  isMeasuredZero,
  UNAVAILABLE_LABEL,
  type HarvesterProductivity,
  type HarvesterProductivityReport,
  type HarvesterWindow,
} from '@/lib/harvesterProductivity';
import HarvesterProductivityPanel from '@/components/mission-control/HarvesterProductivityPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const measured = (value: number) => ({ state: 'measured' as const, value });
const unavailable = { state: 'unavailable' as const, value: null };

function window_(overrides: Partial<HarvesterWindow> = {}): HarvesterWindow {
  return {
    runs_attempted: 1,
    runs_succeeded: 1,
    runs_failed: 0,
    failure_rate: 0,
    marginal_yield_per_1000_fetched: null,
    records_fetched: unavailable,
    records_accepted: unavailable,
    records_rejected: unavailable,
    records_duplicate: unavailable,
    records_new: unavailable,
    records_updated: unavailable,
    records_linked: unavailable,
    records_unlinked: unavailable,
    graph_elements: unavailable,
    ...overrides,
  };
}

function harvester(overrides: Partial<HarvesterProductivity> = {}): HarvesterProductivity {
  return {
    harvester_id: 'literature',
    job_name: 'audit_literature_extraction_coverage',
    binding_confidence: 'exact',
    binding_note: 'The literature extraction audit is the literature surface.',
    telemetry_state: 'instrumented',
    last_successful_run: '2026-08-19T10:00:00+00:00',
    windows: { '24h': window_() },
    review_flags: [],
    ...overrides,
  };
}

function report(overrides: Partial<HarvesterProductivityReport> = {}): HarvesterProductivityReport {
  return {
    schema_version: 'harvester-productivity-001',
    telemetry_state: 'available',
    harvesters: [harvester()],
    ...overrides,
  };
}

function stubResponse(payload: HarvesterProductivityReport) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })),
  );
}

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
  vi.clearAllMocks();
});

async function render() {
  await act(async () => {
    root.render(<HarvesterProductivityPanel />);
  });
  await act(async () => { await Promise.resolve(); });
}

describe('formatMetric', () => {
  it('returns a label, never a number, when nothing measured the counter', () => {
    expect(formatMetric(unavailable)).toBe(UNAVAILABLE_LABEL);
    expect(formatMetric(undefined)).toBe(UNAVAILABLE_LABEL);
  });

  it('renders a measured zero as zero', () => {
    expect(formatMetric(measured(0))).toBe('0');
  });

  it('distinguishes a measured zero from an unavailable counter', () => {
    expect(formatMetric(measured(0))).not.toBe(formatMetric(unavailable));
    expect(isMeasuredZero(measured(0))).toBe(true);
    expect(isMeasuredZero(unavailable)).toBe(false);
  });
});

describe('HarvesterProductivityPanel', () => {
  it('does not print 0 for an uninstrumented source', async () => {
    stubResponse(report({
      harvesters: [harvester({ telemetry_state: 'uninstrumented', windows: { '24h': window_({ runs_attempted: 0, runs_succeeded: 0, failure_rate: null }) } })],
    }));
    await render();
    expect(container.textContent).toContain(UNAVAILABLE_LABEL);
    expect(container.textContent).toContain('missing instrumentation, not a measured');
  });

  it('shows a measured zero yield as an actual zero', async () => {
    stubResponse(report({
      harvesters: [harvester({
        windows: { '24h': window_({ records_fetched: measured(500000), records_new: measured(0), marginal_yield_per_1000_fetched: 0 }) },
        review_flags: ['high_throughput_no_new_records'],
      })],
    }));
    await render();
    expect(container.textContent).toContain('500,000');
    expect(container.textContent).toContain('Processed a large volume and retained nothing new');
  });

  it('separates activity from yield rather than presenting one total', async () => {
    stubResponse(report());
    await render();
    const text = container.textContent ?? '';
    expect(text).toContain('Activity');
    expect(text).toContain('Yield');
    expect(text).toContain('Integration');
    expect(text).toContain('Problems');
    expect(text.indexOf('Activity')).toBeLessThan(text.indexOf('Yield'));
    expect(text.indexOf('Yield')).toBeLessThan(text.indexOf('Integration'));
  });

  it('surfaces a failing source with its review flag', async () => {
    stubResponse(report({
      harvesters: [harvester({
        windows: { '24h': window_({ runs_attempted: 3, runs_succeeded: 1, runs_failed: 2, failure_rate: 0.6667 }) },
        review_flags: ['high_failure_rate'],
      })],
    }));
    await render();
    expect(container.textContent).toContain('More than half of recent runs failed');
    expect(container.textContent).toContain('1 source flagged for review');
  });

  it('flags a stale source', async () => {
    stubResponse(report({ harvesters: [harvester({ review_flags: ['stale_beyond_30d'] })] }));
    await render();
    expect(container.textContent).toContain('No successful run in over 30 days');
  });

  it('declares a shared job binding instead of presenting it as an independent measurement', async () => {
    stubResponse(report({
      harvesters: [harvester({ harvester_id: 'globi', binding_confidence: 'shared', binding_note: 'Shares its job with pollinator_datasets.' })],
      warnings: ['Six harvesters read three shared job names; their counters are the same measurement reported twice.'],
    }));
    await render();
    expect(container.textContent).toContain('shared binding');
    expect(container.textContent).toContain('the same measurement, reported twice');
    expect(container.textContent).toContain('same measurement reported twice');
  });

  it('fails closed and shows no counts when telemetry is unavailable', async () => {
    stubResponse({ schema_version: 'unknown', telemetry_state: 'unavailable', reason: 'Database telemetry is unavailable.', harvesters: [] });
    await render();
    expect(container.textContent).toContain('Harvester productivity is unavailable');
    expect(container.textContent).toContain('No counts are shown, because none were measured');
    expect(container.textContent).not.toContain('Activity');
  });

  it('treats a non-OK response as unavailable rather than an empty productive set', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    await render();
    expect(container.textContent).toContain('Harvester productivity is unavailable');
    expect(container.textContent).not.toContain('Nothing flagged for review in this window');
  });

  it('offers the three windows the owner asked for', async () => {
    stubResponse(report());
    await render();
    expect(container.textContent).toContain('24 hours');
    expect(container.textContent).toContain('7 days');
    expect(container.textContent).toContain('30 days');
  });
});
