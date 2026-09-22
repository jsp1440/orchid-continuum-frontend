import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
type Job = { if?: string; needs?: string | string[]; uses?: string; outputs?: object; permissions?: object;
  steps?: Array<{ uses?: string; run?: string; if?: string; with?: Record<string, unknown> }> };
const read = (file: string) => readFileSync(`.github/workflows/${file}.yml`, 'utf8');
const text = read('orchid-continuous-completion');
const workflow = yaml.load(text) as { jobs: Record<string, Job>; env: Record<string, unknown> };
describe('canonical provider-free autonomous dispatch', () => {
  it('uses graph planning, reusable fan-out and an always-run receipt audit', () => {
    expect(Object.keys(workflow.jobs)).toEqual(['reconcile', 'plan', 'dispatch', 'audit']);
    expect(workflow.env.MAX_ACTIVE_LANES).toBe(8);
    expect(workflow.env.PROVIDER_AUTHORIZED).toBe('false');
    expect(workflow.jobs.dispatch.uses).toBe('./.github/workflows/orchid-deterministic-dispatch.yml');
    expect(workflow.jobs.dispatch.if).toBe("always() && needs.plan.result == 'success' && needs.plan.outputs.issues != '[]'");
    expect(workflow.jobs.audit.if).toContain('always()');
  });
  it('converges the old scheduler onto the canonical entrypoint without another timer', () => {
    const alias = read('orchid-no-api-scheduler');
    expect(alias).toContain('uses: ./.github/workflows/orchid-continuous-completion.yml');
    expect(alias).not.toContain('schedule:');
  });
  it('tests exact caller code, with no fallback to an older integration implementation', () => {
    for (const name of ['orchid-continuous-completion', 'orchid-budgeted-completion-lane', 'orchid-completion-governed']) {
      expect(read(name)).toContain('ref: ${{ github.event.pull_request.head.sha || github.sha }}');
      expect(read(name)).not.toContain('ref: oc-autonomous-integration');
    }
  });
  it('gates the actual worker itself, including direct callers and every provider fallback', () => {
    const lane = yaml.load(read('orchid-completion-lane')) as { jobs: Record<string, Job> };
    expect(lane.jobs.execute.needs).toBe('budget-authorization');
    expect(lane.jobs.execute.if).toBe("inputs.provider_authorized && needs.budget-authorization.outputs.allowed == 'true'");
    expect(read('orchid-completion-lane')).toContain("OC_PROVIDER_NO_API_MODE: 'true'");
    expect(read('orchid-completion-lane')).toContain('scripts/oc-budget-governor.mjs');
  });
  it('also denies provider canaries triggered by worker edits', () => {
    const canary = yaml.load(read('frontend-openai-runtime-canary')) as { jobs: Record<string, Job> };
    expect(canary.jobs.canary.if).toContain("needs.budget-preflight.outputs.allowed == 'true'");
    expect(read('frontend-openai-runtime-canary')).toContain("PROVIDER_AUTHORIZED: 'false'");
  });
  it('installs the browser only for the deterministic browser route capability', () => {
    const lane = yaml.load(read('orchid-budgeted-completion-lane')) as { jobs: Record<string, Job> };
    const worker = lane.jobs['provider-free-worker'];
    const install = worker.steps?.find(step => step.run?.includes('playwright install'));
    expect(install?.if).toContain("contains(needs.classify.outputs.commands, 'npm run verify:routes')");
    expect(install?.run).toContain('playwright install --with-deps chromium');
    const preview = worker.steps?.find(step => step.run?.includes('vite preview'));
    expect(preview?.if).toContain("contains(needs.classify.outputs.commands, 'npm run verify:routes')");
    expect(preview?.run).toContain('npm run build');
    expect(preview?.run).toContain('127.0.0.1:4173');
  });
  it('preserves the suspended Anthropic recovery circuit breaker with no executable canary', () => {
    const recovery = yaml.load(read('orchid-claude-runtime-recovery')) as { jobs: Record<string, Job>; permissions: Record<string, string> };
    expect(Object.keys(recovery.jobs)).toEqual(['parked']);
    expect(recovery.permissions).toEqual({ contents: 'read', issues: 'read' });
    expect(recovery.jobs.parked.steps?.every(step => !step.uses && !/\b(?:gh|curl|node|npx)\b/.test(step.run || ''))).toBe(true);
    expect(read('orchid-claude-runtime-recovery')).not.toContain('secrets.');
    expect(read('orchid-claude-runtime-recovery')).toContain('Automatic recovery attempts: **DISABLED**');
  });
  it('always settles a granted lease and refills per lane, independently of sibling outcomes', () => {
    const wrapper = yaml.load(read('orchid-budgeted-completion-lane')) as { jobs: Record<string, Job> };
    expect(wrapper.jobs.settle.needs).toEqual(['budget-preflight', 'provider-worker']);
    expect(wrapper.jobs.settle.if).toBe("always() && needs.budget-preflight.outputs.lease_id != ''");
    expect(wrapper.jobs.settle.steps?.some(s => s.run?.endsWith(' settle'))).toBe(true);
  });
});
