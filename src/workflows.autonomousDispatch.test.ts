import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const text = readFileSync('.github/workflows/orchid-continuous-completion.yml', 'utf8');
type Job = { if?: string; needs?: string; uses?: string; outputs?: object;
  steps?: Array<{ uses?: string; run?: string; with?: Record<string, unknown> }> };
const workflow = yaml.load(text) as { jobs: Record<string, Job>; permissions: Record<string, string> };

// #535 retires paid dispatch. Legacy always()/lease assertions required
// execution and contradicted the new fail-closed boundary.
describe('NO-API autonomous dispatch boundary', () => {
  it('has exactly a planner, execution barrier, and five inert lanes', () => {
    expect(Object.keys(workflow.jobs).sort()).toEqual(
      ['plan', 'prepare', 'lane1', 'lane2', 'lane3', 'lane4', 'lane5'].sort(),
    );
  });
  for (let slot = 1; slot <= 5; slot += 1) {
    it(`makes lane ${slot} unconditionally unreachable without a reusable executor`, () => {
      const lane = workflow.jobs[`lane${slot}`];
      expect(lane.if).toBe('${{ false }}');
      expect(lane.needs).toBe('prepare');
      expect(lane.uses).toBeUndefined();
      expect(lane.steps).toHaveLength(1);
      expect(lane.steps?.[0].uses).toBeUndefined();
      expect(lane.steps?.[0].run?.trim()).toBe('echo "disabled by #535 NO-API circuit breaker"');
    });
  }
  it('never emits an execution issue or acquires a lease while workers are parked', () => {
    expect(workflow.jobs.prepare.outputs).toBeUndefined();
    expect(text).not.toMatch(/gh\s+(issue\s+(edit|create)|workflow\s+run|pr\s+merge)|--add-label\s+oc-running/);
    expect(text).not.toMatch(/secrets:|orchid-completion-lane\.yml|claude-code-action|OPENAI_API_KEY|GEMINI_API_KEY/);
    expect(Object.values(workflow.permissions).every(value => value === 'read')).toBe(true);
  });
  it('requires successful planning and explicitly verifies both denial outputs', () => {
    expect(workflow.jobs.prepare.needs).toBe('plan');
    expect(workflow.jobs.prepare.if).toBeUndefined();
    const barrier = workflow.jobs.prepare.steps?.map(step => step.run).join('\n');
    expect(barrier).toContain('test "${{ needs.plan.outputs.allow_paid_execution }}" = "false"');
    expect(barrier).toContain('test -z "${{ needs.plan.outputs.provider }}"');
  });
  it('tests PR code at its exact head before invoking locked adapters', () => {
    const steps = workflow.jobs.plan.steps!;
    expect(steps[0].uses).toMatch(/^actions\/checkout@[a-f0-9]{40}$/);
    expect(steps[0].with?.ref).toBe("${{ github.event.pull_request.head.sha || 'oc-autonomous-integration' }}");
    expect(steps[0].with?.['persist-credentials']).toBe(false);
    const install = steps.findIndex(step => step.run === 'npm ci --ignore-scripts');
    const adapter = steps.findIndex(step => step.run?.includes('npx --no-install tsx'));
    expect(install).toBeGreaterThan(0);
    expect(adapter).toBeGreaterThan(install);
  });
});
