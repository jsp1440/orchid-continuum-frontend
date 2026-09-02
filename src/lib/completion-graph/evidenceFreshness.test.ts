import { describe, expect, it } from 'vitest';

import {
  FRESHNESS_WINDOW_DAYS,
  assessFreshness,
  readBuildSha,
  type EvidenceSnapshot,
} from './evidenceFreshness';

/**
 * A stale completion graph must not render indistinguishably from a current one.
 *
 * That is the whole requirement, and the dangerous case is not staleness — it
 * is *unknown* freshness. A build that did not attest its commit cannot be
 * compared to anything, and if that fell through to a date-only check the
 * Observatory could report "current" while running arbitrary code. So the
 * indeterminate branch is tested first and hardest.
 *
 * `presentAsCurrent` exists so the UI has one boolean to consult rather than
 * re-deriving the rule. Exactly one state may set it.
 */

const SNAPSHOT_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

const snapshot = (overrides: Partial<EvidenceSnapshot> = {}): EvidenceSnapshot => ({
  reconciledAgainstSha: SNAPSHOT_SHA,
  reconciledAt: '2026-08-23T00:00:00.000Z',
  scope: 'test snapshot',
  ...overrides,
});

const at = (iso: string) => new Date(iso);

describe('freshness verdicts', () => {
  it('reports current only when the build is the commit the evidence was checked against', () => {
    const verdict = assessFreshness(snapshot(), {
      buildSha: SNAPSHOT_SHA,
      now: at('2026-08-23T06:00:00.000Z'),
    });
    expect(verdict.state).toBe('current');
    expect(verdict.presentAsCurrent).toBe(true);
  });

  it('reports drift when the build has moved past the evidence', () => {
    const verdict = assessFreshness(snapshot(), {
      buildSha: OTHER_SHA,
      now: at('2026-08-24T00:00:00.000Z'),
    });
    expect(verdict.state).toBe('drifted');
    expect(verdict.presentAsCurrent).toBe(false);
    expect(verdict.detail).toMatch(/not reflected below/i);
  });

  it('reports stale past the bounded window', () => {
    const verdict = assessFreshness(snapshot(), {
      buildSha: OTHER_SHA,
      now: at('2026-09-15T00:00:00.000Z'),
    });
    expect(verdict.state).toBe('stale');
    expect(verdict.headline).toMatch(/STALE — refresh required/);
    expect(verdict.presentAsCurrent).toBe(false);
  });

  it('goes stale on age even when the build still matches', () => {
    // A commit that stayed deployed for a month does not keep its evidence
    // fresh. Matching SHAs are not a licence to skip the window.
    const verdict = assessFreshness(snapshot(), {
      buildSha: SNAPSHOT_SHA,
      now: at('2026-09-30T00:00:00.000Z'),
    });
    expect(verdict.state).toBe('stale');
    expect(verdict.presentAsCurrent).toBe(false);
  });

  it('holds the window boundary', () => {
    const onTheDay = assessFreshness(snapshot(), {
      buildSha: SNAPSHOT_SHA,
      now: at('2026-08-30T00:00:00.000Z'),
    });
    expect(onTheDay.ageDays).toBe(FRESHNESS_WINDOW_DAYS);
    expect(onTheDay.state).toBe('current');

    const dayAfter = assessFreshness(snapshot(), {
      buildSha: SNAPSHOT_SHA,
      now: at('2026-08-31T00:00:00.000Z'),
    });
    expect(dayAfter.ageDays).toBe(FRESHNESS_WINDOW_DAYS + 1);
    expect(dayAfter.state).toBe('stale');
  });
});

describe('unknown freshness is never current', () => {
  it('reports indeterminate when the build attested no commit', () => {
    const verdict = assessFreshness(snapshot(), {
      buildSha: null,
      now: at('2026-08-23T00:00:00.000Z'),
    });
    expect(verdict.state).toBe('indeterminate');
    expect(verdict.presentAsCurrent).toBe(false);
    expect(verdict.detail).toMatch(/cannot be confirmed against the running code/i);
  });

  it('does not let a fresh date rescue an unattested build', () => {
    // The dangerous path: age is fine, so a date-only check would say current.
    const verdict = assessFreshness(snapshot(), {
      buildSha: null,
      now: at('2026-08-23T00:00:01.000Z'),
    });
    expect(verdict.ageDays).toBe(0);
    expect(verdict.state).toBe('indeterminate');
  });

  it('reports indeterminate when the snapshot itself declares no usable commit', () => {
    for (const bad of ['', 'unattested', 'abc123', SNAPSHOT_SHA.slice(0, 39)]) {
      const verdict = assessFreshness(snapshot({ reconciledAgainstSha: bad }), {
        buildSha: SNAPSHOT_SHA,
        now: at('2026-08-23T00:00:00.000Z'),
      });
      expect(verdict.state, `snapshot sha "${bad}"`).toBe('indeterminate');
    }
  });

  it('treats an undatable snapshot as ageless rather than guessing', () => {
    const verdict = assessFreshness(snapshot({ reconciledAt: 'not a date' }), {
      buildSha: OTHER_SHA,
      now: at('2026-08-23T00:00:00.000Z'),
    });
    expect(verdict.ageDays).toBeNull();
    // Undatable but comparable: the SHAs still differ, so it has drifted.
    expect(verdict.state).toBe('drifted');
    expect(verdict.presentAsCurrent).toBe(false);
  });

  it('never reports a negative age from a clock skew', () => {
    const verdict = assessFreshness(snapshot(), {
      buildSha: SNAPSHOT_SHA,
      now: at('2026-08-01T00:00:00.000Z'),
    });
    expect(verdict.ageDays).toBe(0);
  });

  it('sets presentAsCurrent for exactly one state', () => {
    // The UI consults this single boolean. If a second state ever sets it,
    // that state starts rendering as up to date without anyone deciding so.
    const cases = [
      assessFreshness(snapshot(), { buildSha: SNAPSHOT_SHA, now: at('2026-08-23T00:00:00Z') }),
      assessFreshness(snapshot(), { buildSha: OTHER_SHA, now: at('2026-08-24T00:00:00Z') }),
      assessFreshness(snapshot(), { buildSha: OTHER_SHA, now: at('2026-09-30T00:00:00Z') }),
      assessFreshness(snapshot(), { buildSha: null, now: at('2026-08-23T00:00:00Z') }),
    ];
    expect(cases.filter((verdict) => verdict.presentAsCurrent)).toHaveLength(1);
    expect(cases.find((verdict) => verdict.presentAsCurrent)?.state).toBe('current');
  });
});

describe('reading the build stamp', () => {
  const withMeta = (content: string | null) => ({
    querySelector: () =>
      content === null
        ? null
        : ({ getAttribute: () => content } as unknown as Element),
  });

  it('reads a stamped commit', () => {
    expect(readBuildSha(withMeta(SNAPSHOT_SHA) as never)).toBe(SNAPSHOT_SHA);
    expect(readBuildSha(withMeta(SNAPSHOT_SHA.toUpperCase()) as never)).toBe(SNAPSHOT_SHA);
  });

  it('treats the build own placeholder as no attestation', () => {
    // vite.config.ts fails closed to this string for local/non-git builds.
    expect(readBuildSha(withMeta('unattested') as never)).toBeNull();
  });

  it('treats an unreplaced template token as no attestation', () => {
    // Served without the transform, the raw token would otherwise be read as
    // a commit id and compared against one.
    expect(readBuildSha(withMeta('%OCU_RELEASE_SHA%') as never)).toBeNull();
  });

  it('rejects anything that is not a full commit id', () => {
    for (const bad of ['', '   ', 'main', 'abc123', SNAPSHOT_SHA.slice(0, 39)]) {
      expect(readBuildSha(withMeta(bad) as never), bad).toBeNull();
    }
    expect(readBuildSha(withMeta(null) as never)).toBeNull();
  });
});
