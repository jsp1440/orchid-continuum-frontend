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
