// @vitest-environment node

/**
 * Every PR the autonomous system produces targets `oc-autonomous-integration`,
 * not `main`. That branch is the governed staging gate, so it is the branch
 * whose incoming changes most need validating.
 *
 * A workflow gated on `branches: [main]` does not run for those PRs. When
 * frontend-ci.yml and calyx-matrix-005-validation.yml were main-only, work
 * merged into the gate carried no exact-head evidence at all - PR #213's head
 * drew a Vercel preview and nothing else, and a preview build is not a test
 * suite. Those two have since been corrected; this test exists so the next
 * workflow added does not quietly reintroduce the hole.
 *
 * A workflow that runs on *every* base branch (no `branches` filter) already
 * covers the gate and is not the concern here.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const WORKFLOW_DIR = '.github/workflows';
const INTEGRATION_BRANCH = 'oc-autonomous-integration';

type Workflow = {
  on?: { pull_request?: { branches?: string[] } };
  // A bare `on:` key parses as the boolean true in YAML 1.1.
  true?: { pull_request?: { branches?: string[] } };
};

function loadWorkflows(): { name: string; branches: string[] | undefined; hasPullRequest: boolean }[] {
  return readdirSync(WORKFLOW_DIR)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map((file) => {
      // Tolerate a file that will not parse. Throwing here collapses the whole
      // suite into "no tests", which hides the very breakage the parse test
      // below exists to name.
      let parsed: Workflow | undefined;
      try {
        parsed = yaml.load(readFileSync(join(WORKFLOW_DIR, file), 'utf8')) as Workflow;
      } catch {
        parsed = undefined;
      }
      const triggers = parsed?.on ?? parsed?.true;
      const pullRequest = triggers?.pull_request;
      return {
        name: file,
        branches: pullRequest?.branches,
        hasPullRequest: pullRequest !== undefined,
      };
    });
}

describe('pull-request validation covers the autonomous integration gate', () => {
  const workflows = loadWorkflows();

  it('finds workflows to check', () => {
    expect(workflows.length).toBeGreaterThan(0);
    expect(workflows.some((w) => w.name === 'frontend-ci.yml')).toBe(true);
  });

  it('has no workflow that validates main but skips the integration gate', () => {
    const mainOnly = workflows
      .filter((w) => w.hasPullRequest && w.branches?.includes('main') && !w.branches.includes(INTEGRATION_BRANCH))
      .map((w) => w.name);

    expect(mainOnly,
      `these workflows run for PRs into main but not for PRs into ${INTEGRATION_BRANCH}, ` +
      'which is where every autonomous PR actually lands',
    ).toEqual([]);
  });

  it('keeps the frontend build under both branches', () => {
    const ci = workflows.find((w) => w.name === 'frontend-ci.yml');
    expect(ci?.branches).toContain('main');
    expect(ci?.branches).toContain(INTEGRATION_BRANCH);
  });

  it('parses every workflow file', () => {
    // GitHub creates a run for an unparseable workflow and fails it with zero
    // jobs, which reads as "the workflow failed" rather than "the workflow was
    // never valid". orchid-integration-revalidation.yml sat in that state
    // through four runs: an unquoted `if:` scalar containing ": ", which YAML
    // forbids. Nothing surfaced it because a failed run looks like a failed run.
    const dir = readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    const broken: string[] = [];
    for (const file of dir) {
      try {
        yaml.load(readFileSync(join(WORKFLOW_DIR, file), 'utf8'));
      } catch (error) {
        broken.push(`${file}: ${(error as Error).message.split('\n')[0]}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('would fail if a main-only workflow were introduced', () => {
    // Proves the check above tests the property rather than an empty set.
    const hypothetical = [...workflows, { name: 'regression.yml', branches: ['main'], hasPullRequest: true }];
    const mainOnly = hypothetical
      .filter((w) => w.hasPullRequest && w.branches?.includes('main') && !w.branches.includes(INTEGRATION_BRANCH))
      .map((w) => w.name);
    expect(mainOnly).toEqual(['regression.yml']);
  });
});

/**
 * Two ways the autonomous supervisor silently stopped working. Both were found
 * by reading job data, not logs, and both are the same shape: a step that looks
 * correct and cannot succeed.
 */
describe('the autonomous supervisor can actually run', () => {
  function runBlocks(): { file: string; job: string; step: string; run: string; pipefail: boolean }[] {
    const out: { file: string; job: string; step: string; run: string; pipefail: boolean }[] = [];
    for (const file of readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))) {
      let doc: { jobs?: Record<string, { steps?: { name?: string; run?: string }[] }> };
      try {
        doc = yaml.load(readFileSync(join(WORKFLOW_DIR, file), 'utf8')) as typeof doc;
      } catch {
        continue;
      }
      for (const [job, spec] of Object.entries(doc?.jobs ?? {})) {
        for (const step of spec?.steps ?? []) {
          if (typeof step?.run !== 'string') continue;
          out.push({
            file,
            job,
            step: step.name ?? '(unnamed)',
            run: step.run,
            pipefail: /set -[a-z]*o pipefail|set -o pipefail/.test(step.run),
          });
        }
      }
    }
    return out;
  }

  it('never pipes an unbounded producer into head under pipefail', () => {
    // `gh pr list ... | head -1` returns 141: head exits after one line, gh takes
    // SIGPIPE once output passes the 64KB pipe buffer, pipefail propagates it and
    // set -e kills the step. It works until enough PRs are open, then fails every
    // run — which is when the supervisor matters most.
    const offenders: string[] = [];
    for (const block of runBlocks()) {
      if (!block.pipefail) continue;
      for (const line of block.run.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) continue;
        if (!/\|\s*head\b/.test(trimmed)) continue;
        // A guarded pipeline cannot abort the step.
        if (/\|\|\s*true/.test(trimmed)) continue;
        offenders.push(`${block.file} :: ${block.job} :: ${block.step} :: ${trimmed}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('does not look for validation runs under an event those workflows never emit', () => {
    // The supervisor queried `gh run list --workflow frontend-ci.yml --event
    // workflow_dispatch`. frontend-ci.yml triggers on pull_request only, so the
    // query always returned [] and every PR hit the `continue` below it. The
    // merge path was unreachable for as long as it had existed.
    const offenders: string[] = [];
    for (const block of runBlocks()) {
      for (const line of block.run.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) continue;
        const match = /--workflow\s+(\S+\.ya?ml)/.exec(trimmed);
        if (!match) continue;
        if (!/--event\s+workflow_dispatch/.test(trimmed)) continue;

        let target: { on?: { workflow_dispatch?: unknown }; true?: { workflow_dispatch?: unknown } };
        try {
          target = yaml.load(readFileSync(join(WORKFLOW_DIR, match[1]), 'utf8')) as typeof target;
        } catch {
          continue;
        }
        const triggers = target?.on ?? target?.true;
        if (triggers && !('workflow_dispatch' in triggers)) {
          offenders.push(`${block.file} :: ${block.step} queries ${match[1]} for workflow_dispatch, which it never emits`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
