// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiveActivityFeedPanel, ScientificInsightsPanel } from './MissionControl';
import type { ContinuumSubsystem, MissionControlOperations } from '@/lib/missionControlOps';

/**
 * Mission Control's insight and activity panels used to render hand-written
 * "insights" and "demo events" (fabricated counts, a healthy heartbeat, a
 * grant deadline). With no live data they must render an explicit empty state.
 */

const FABRICATED = [
  'Lepanthes',
  'only 12 images',
  '38%',
  'Pleurothallid',
  '478 images indexed',
  '314 orphan relationships',
  'Runtime heartbeat healthy',
  'Smithsonian deadline',
  'Showing demo events',
];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(node: React.ReactNode) {
  act(() => root.render(node));
  return container.textContent ?? '';
}

function assertNoFabrication(text: string) {
  for (const fact of FABRICATED) expect(text, fact).not.toContain(fact);
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Mission Control panels — no fabricated fallback content', () => {
  it('insights panel with telemetry unavailable shows the unavailable state only', () => {
    const text = render(<ScientificInsightsPanel dashboard={null} />);
    expect(container.querySelector('[data-testid="mission-control-insights-empty"]')).not.toBeNull();
    expect(text).toContain('Insights unavailable');
    expect(container.querySelectorAll('article')).toHaveLength(0);
    assertNoFabrication(text);
  });

  it('insights panel treats a fallback dashboard as unavailable, not successfully empty', () => {
    const text = render(<ScientificInsightsPanel dashboard={{ dataMode: 'fallback', globalHealth: [] } as unknown as MissionControlOperations} />);
    expect(text).toContain('Insights unavailable');
    expect(text).not.toContain('live telemetry reported no subsystem completeness');
    expect(container.querySelectorAll('article')).toHaveLength(0);
  });

  it('insights panel with partial telemetry renders only live-derived insights with their source', () => {
    const row = {
      id: 'atlas', name: 'Atlas', category: 'Science', status: 'warning', completeness: 20,
      lastChecked: '2026-01-01T00:00:00Z', summary: '', blockers: [], recommendedNextAction: 'Fix atlas.',
      dataSource: '/api/executive/state',
      telemetryProvenance: 'live',
    } satisfies ContinuumSubsystem;
    const text = render(<ScientificInsightsPanel dashboard={{ globalHealth: [row] } as unknown as MissionControlOperations} />);
    expect(container.querySelectorAll('article')).toHaveLength(1);
    expect(text).toContain('Atlas is the least complete subsystem at 20%.');
    expect(text).toContain('Source: Mission Control subsystem telemetry (/api/executive/state)');
    assertNoFabrication(text);
  });

  it('activity panel with no backend events shows an explicit empty state, not demo events', () => {
    const text = render(<LiveActivityFeedPanel activities={[]} />);
    expect(container.querySelector('[data-testid="mission-control-activity-empty"]')).not.toBeNull();
    expect(text).toContain('No activity events available');
    assertNoFabrication(text);
  });
});
