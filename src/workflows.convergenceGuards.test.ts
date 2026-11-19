import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { assertAdmission, lineageFor, makePlan, type Snapshot } from '../scripts/oc-dispatch-control';
import type { CompletionNode } from './lib/completion-graph/types';

const scheduler = readFileSync('.github/workflows/orchid-continuous-completion.yml', 'utf8');
const lane = readFileSync('.github/workflows/orchid-completion-lane.yml', 'utf8');
const now = '2026-09-14T04:00:00.000Z';
function fixture() {
  const leaf: CompletionNode = { id: 'leaf', parentId: 'root', name: 'Bounded repair', type: 'acceptance_gate',
    status: 'MISSING', threeLevels: { codeComplete: 'NOT_MET', integratedComplete: 'NOT_MET', productComplete: 'NOT_MET' },
    evidence: [], issues: ['#11'], nextAction: 'Implement', lastUpdated: now, children: [] };
  const root: CompletionNode = { ...leaf, id: 'root', parentId: null, children: [leaf] };
  const snapshot: Snapshot = { issues: [{ number: 11, state: 'open', title: 'Task', body: 'Acceptance', labels: [{ name: 'oc-queued' }] }],
    prs: [{ number: 90, state: 'open', body: 'OC-AUTO-ISSUE: #11', head: { ref: 'repair-11', sha: 'c'.repeat(40) } }],
    integrationSha: 'a'.repeat(40), implementationSha: 'b'.repeat(40), material: {} };
  return { root, snapshot };
}

describe('continuous completion convergence guards', () => {
  it('retains main queue/completion wakeups on the single governed scheduler', () => {
    const workflow = yaml.load(scheduler) as { on: Record<string, { types?: string[] }> };
    expect(workflow.on.issues.types).toEqual(['closed', 'reopened', 'labeled', 'unlabeled']);
    expect(workflow.on.pull_request.types).toContain('closed');
    expect(workflow.on.pull_request.types).toContain('synchronize');
    expect(scheduler).not.toMatch(/gh\s+pr\s+merge|--add-label oc-running|age > 4800/);
  });

  it('suppresses ordinary durable lineages and requires explicit repair admission', () => {
    const { root, snapshot } = fixture();
    expect(makePlan(snapshot, [], now, root).issues).toEqual([]);
    snapshot.issues[0].labels.push({ name: 'oc-repair' });
    expect(makePlan(snapshot, [], now, root).leaves[0]).toMatchObject({ issueNumber: 11, repairPr: 90, repairBranch: 'repair-11' });
    // Merged, not merely closed: a merged lineage is delivered work, so the
    // repair path stops. A closed-unmerged PR is an abandoned attempt and is
    // re-admissible up to MAX_ABANDONED_ATTEMPTS, which the dispatch-control
    // suite covers directly.
    snapshot.prs[0].state = 'closed';
    snapshot.prs[0].merged = true;
    expect(makePlan(snapshot, [], now, root).issues).toEqual([]);
  });

  it('binds repair admission to the material PR head and refuses a stale dispatch', () => {
    const { root, snapshot } = fixture();
    snapshot.issues[0].labels.push({ name: 'oc-repair' });
    const plan = makePlan(snapshot, [], now, root);
    expect(makePlan(structuredClone(snapshot), [], now, root).wave.hash).toBe(plan.wave.hash);
    snapshot.prs[0].head.sha = 'd'.repeat(40);
    expect(makePlan(snapshot, [], now, root).leaves[0].fingerprint).not.toBe(plan.leaves[0].fingerprint);
    expect(() => assertAdmission(plan, snapshot, 11, now, root)).toThrow('drift');
  });

  it('matches exact issue lineages rather than prefixes or API result limits', () => {
    const { snapshot } = fixture();
    const unrelated = { ...snapshot.prs[0], body: 'OC-AUTO-ISSUE: #111', head: { ref: 'oc-auto-111-task', sha: 'e'.repeat(40) } };
    const prs = [...Array.from({ length: 501 }, (_, i) => ({ ...unrelated, number: 100 + i })), snapshot.prs[0]];
    expect(lineageFor(11, prs).map(pr => pr.number)).toEqual([90]);
  });
  it('recognizes every durable lineage marker emitted by governed workers', () => {
    const { snapshot } = fixture();
    const marker = { ...snapshot.prs[0], number: 91, body: 'OC-LINEAGE-ISSUE: #11', head: { ref: 'repair-11', sha: 'd'.repeat(40) } };
    const slashBranch = { ...snapshot.prs[0], number: 92, body: 'bounded repair', head: { ref: 'oc-auto/11-round-2', sha: 'e'.repeat(40) } };
    expect(lineageFor(11, [snapshot.prs[0], marker, slashBranch]).map(pr => pr.number)).toEqual([90, 91, 92]);
  });

  it('verifies admission at the executable worker before writing any running label', () => {
    const runtime = readFileSync('scripts/oc-dispatch-runtime.ts', 'utf8');
    const admission = runtime.indexOf('assertAdmission(plan, current, issue, now())');
    const start = runtime.indexOf("transitionLease(store, lease.id, runId, runAttempt, 'running', { requireActive: true })");
    const label = runtime.indexOf(".concat('oc-running')");
    expect(admission).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(admission);
    expect(label).toBeGreaterThan(start);
    expect(lane).toContain('scripts/oc-dispatch-runtime.ts start');
    expect(lane).toContain("if: inputs.provider_authorized && needs.budget-authorization.outputs.allowed == 'true'");
  });
});
