import { describe, expect, it } from 'vitest';
import * as imc from './intelligentMissionControl';
import type { ContinuumSubsystem, MissionControlOperations } from '@/lib/missionControlOps';

/**
 * Mission Control used to mix hand-written "scientific insights" (e.g.
 * "Lepanthes ... only 12 images mapped", "+38% year-on-year") into live
 * insights. Insights must now come only from live telemetry.
 */

const FABRICATED = ['Lepanthes', 'only 12 images', '38%', 'less than 6%', 'Pleurothallid', 'NSF Systematics', 'Dracula has received'];

function subsystem(partial: Partial<ContinuumSubsystem>): ContinuumSubsystem {
  return {
    id: 'x',
    name: 'X',
    category: 'Science',
    status: 'warning',
    completeness: 50,
    lastChecked: '2026-01-01T00:00:00Z',
    summary: '',
    blockers: [],
    recommendedNextAction: '',
    telemetryProvenance: 'live',
    ...partial,
  };
}

function ops(globalHealth: ContinuumSubsystem[]): MissionControlOperations {
  return { globalHealth } as unknown as MissionControlOperations;
}

describe('deriveScientificInsights — live telemetry only', () => {
  it('outage (no telemetry) → no insights at all', () => {
    expect(imc.deriveScientificInsights(null)).toEqual([]);
  });

  it('fallback subsystem rows never become live-sounding insights', () => {
    const fallback = ops([
      subsystem({ id: 'literature', name: 'Literature System', status: 'stub', completeness: 15 }),
    ]);
    fallback.dataMode = 'fallback';
    fallback.globalHealth[0].telemetryProvenance = 'fallback';
    expect(imc.deriveScientificInsights(fallback)).toEqual([]);
  });

  it('mixed mode still excludes fallback subsystem rows', () => {
    const mixed = ops([
      subsystem({
        id: 'literature',
        name: 'Literature System',
        status: 'stub',
        completeness: 15,
        telemetryProvenance: 'fallback',
      }),
    ]);
    mixed.dataMode = 'mixed';
    expect(imc.deriveScientificInsights(mixed)).toEqual([]);
  });

  it('partial telemetry → only the live-derived insight, with provenance', () => {
    const insights = imc.deriveScientificInsights(
      ops([subsystem({ id: 'atlas', name: 'Atlas', completeness: 30, dataSource: '/api/executive/state' }), subsystem({ id: 'kg', name: 'Knowledge Graph', completeness: 70 })]),
    );
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ id: 'insight-live-gap', detail: 'Atlas is the least complete subsystem at 30%.' });
    expect(insights[0].provenance).toContain('/api/executive/state');
    const text = JSON.stringify(insights);
    for (const fact of FABRICATED) expect(text).not.toContain(fact);
  });

  it('a subsystem whose status is unknown is never ranked as the largest gap', () => {
    const insights = imc.deriveScientificInsights(
      ops([subsystem({ id: 'runners_jobs', name: 'Runners / Jobs', status: 'unknown', completeness: 0 })]),
    );
    expect(insights).toEqual([]);
  });

  it('with the intelligence bundle unavailable, nothing is invented either', () => {
    const insights = imc.deriveScientificInsightsWithIntelligence(null, {});
    expect(insights).toEqual([]);
  });

  it('no fallback insight or activity lists are exported', () => {
    expect('FALLBACK_SCIENTIFIC_INSIGHTS' in imc).toBe(false);
    expect('FALLBACK_ACTIVITY_EVENTS' in imc).toBe(false);
  });
});
