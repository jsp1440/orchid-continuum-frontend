import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { JOURNEY_JOIN_SPECS, buildJourneyContinuityDomain } from './journeyContinuityDomain';
import { COMPLETION_GRAPH } from './completionGraphData';
import { getLeaves } from './graphOps';
import type { CompletionNode, Evidence } from './types';

/**
 * The census must not be able to claim evidence that does not exist.
 *
 * A completion graph is a set of assertions about a codebase, written by hand,
 * in a file that nothing forces to agree with the code. That is precisely how
 * it became stale enough for #367 to be filed. Percentages derived from
 * citations nobody checks are worse than no percentages, because they carry
 * the authority of having been measured.
 *
 * So every file and test this domain cites is opened. A journey node claiming
 * a producer that was deleted, or a test that was renamed, fails here rather
 * than continuing to contribute a confident number to the overall figure.
 *
 * These tests do not — and cannot — verify that the *behaviour* described is
 * correct. That is what each join's own tests are for. This checks the weaker
 * but load-bearing property that the citations are real.
 */

const exists = (ref: string) => existsSync(resolve(process.cwd(), ref));

describe('journey evidence is real', () => {
  it('cites files that exist', () => {
    const missing = JOURNEY_JOIN_SPECS.flatMap((join) =>
      join.files.filter((file) => !exists(file)).map((file) => `${join.id}: ${file}`),
    );
    expect(missing, `cited files that do not exist:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('cites tests that exist', () => {
    const missing = JOURNEY_JOIN_SPECS.flatMap((join) =>
      join.tests.filter((test) => !exists(test)).map((test) => `${join.id}: ${test}`),
    );
    expect(missing, `cited tests that do not exist:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('cites a producer and a consumer for every join, not one side', () => {
    // A join is the thing between two modules. One file is a module.
    for (const join of JOURNEY_JOIN_SPECS) {
      expect(join.files.length, `${join.id} cites too few files to be a join`).toBeGreaterThanOrEqual(2);
      expect(join.tests.length, `${join.id} cites no test`).toBeGreaterThanOrEqual(1);
    }
  });

  it('names a next action for every join', () => {
    for (const join of JOURNEY_JOIN_SPECS) {
      expect(join.nextAction.length, `${join.id}`).toBeGreaterThan(20);
    }
  });
});

describe('browser evidence is claimed only where it was obtained', () => {
  it('records the browser state as run, blocked, or not attempted — never blank', () => {
    for (const join of JOURNEY_JOIN_SPECS) {
      expect([0, 1, null], `${join.id}`).toContain(join.browser);
      expect(join.browserNote.length, `${join.id} has no browser note`).toBeGreaterThan(20);
    }
  });

  it('explains a blocked or unattempted pass rather than leaving a bare zero', () => {
    // A 0 that says nothing is indistinguishable from a failure. Each one has
    // to say why it could not be run.
    for (const join of JOURNEY_JOIN_SPECS.filter((j) => j.browser !== 1)) {
      expect(join.browserNote, `${join.id}`).toMatch(/blocked|not attempted|needs|no /i);
    }
  });

  it('withholds PRODUCT_COMPLETE from every join nobody has traversed', () => {
    // The rule the initial census existed to protect: merged and tested is not
    // the same as usable. Only a real traversal moves productComplete.
    const domain = buildJourneyContinuityDomain(buildBranch);
    const gates = getLeaves(domain);
    expect(gates.length).toBe(JOURNEY_JOIN_SPECS.length);

    for (const gate of gates) {
      const join = JOURNEY_JOIN_SPECS.find((j) => gate.id === `gate-journey-${j.id}`);
      expect(join, gate.id).toBeDefined();
      if (join!.browser === 1) {
        expect(gate.threeLevels.productComplete, gate.id).toBe('PARTIAL');
      } else {
        expect(gate.threeLevels.productComplete, gate.id).toBe('NOT_MET');
      }
      // Nothing here claims deployment evidence this repository does not have.
      expect(gate.gateScores?.deployedOperational, gate.id).toBeNull();
      expect(gate.threeLevels.productComplete, gate.id).not.toBe('MET');
    }
  });
});

describe('the domain is part of the portfolio', () => {
  it('is reachable from the root graph', () => {
    const domain = COMPLETION_GRAPH.children.find((child) => child.id === 'domain-journey-continuity');
    expect(domain, 'journey continuity domain is not in the portfolio').toBeDefined();
    expect(domain!.children.length).toBe(JOURNEY_JOIN_SPECS.length);
  });

  it('contributes real leaves to the overall census', () => {
    // If the domain were assembled but never reached the root, its evidence
    // would be invisible while the file still looked reconciled.
    const journeyLeaves = getLeaves(COMPLETION_GRAPH).filter((leaf) =>
      leaf.id.startsWith('gate-journey-'),
    );
    expect(journeyLeaves.length).toBe(JOURNEY_JOIN_SPECS.length);
  });

  it('keeps the mounted joins the issue named', () => {
    // #367 requirement 3 lists these explicitly. Deleting one now fails.
    const ids = JOURNEY_JOIN_SPECS.map((join) => join.id);
    for (const required of [
      'dossier-research',
      'dossier-calyx',
      'dossier-matrix',
      'research-atlas',
      'research-calyx',
      'research-lexicon',
      'research-matrix',
      'classroom-calyx',
      'genus-profile-fanout',
    ]) {
      expect(ids, `${required} is missing from the journey census`).toContain(required);
    }
  });
});

describe('cited PRs are corroboration, not evidence', () => {
  it('marks every PR citation as such', () => {
    const domain = buildJourneyContinuityDomain(buildBranch);
    const prEvidence = getLeaves(domain)
      .flatMap((gate) => gate.evidence)
      .filter((item: Evidence) => item.kind === 'pr');
    expect(prEvidence.length).toBeGreaterThan(0);
    for (const item of prEvidence) {
      // A PR number proves a change was merged. It does not prove the code
      // still does what the PR said, which is why it may not stand alone.
      expect(item.note, item.ref).toMatch(/corroboration only/i);
    }
  });

  it('never rests a gate on PR citations alone', () => {
    const domain = buildJourneyContinuityDomain(buildBranch);
    for (const gate of getLeaves(domain)) {
      const kinds = new Set(gate.evidence.map((item: Evidence) => item.kind));
      expect(kinds.has('file'), gate.id).toBe(true);
      expect(kinds.has('test'), gate.id).toBe(true);
    }
  });
});

/** Mirrors the private `branch` helper in completionGraphData.ts. */
function buildBranch(
  opts: {
    id: string;
    parentId: string | null;
    name: string;
    type: CompletionNode['type'];
    nextAction: string;
    evidence?: Evidence[];
    lane?: CompletionNode['lane'];
  },
  children: CompletionNode[],
): CompletionNode {
  return {
    id: opts.id,
    parentId: opts.parentId,
    name: opts.name,
    type: opts.type,
    status: 'UNKNOWN',
    threeLevels: { codeComplete: 'UNKNOWN', integratedComplete: 'UNKNOWN', productComplete: 'UNKNOWN' },
    lane: opts.lane,
    evidence: opts.evidence ?? [],
    nextAction: opts.nextAction,
    lastUpdated: '2026-08-23T00:00:00.000Z',
    children,
  };
}

describe('the reconciliation names the commit it was checked against', () => {
  it('records a full git sha on the graph snapshot', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/completion-graph/completionGraphData.ts'),
      'utf8',
    );
    expect(source).toMatch(/reconciledAgainstSha: '[0-9a-f]{40}'/);
  });
});
