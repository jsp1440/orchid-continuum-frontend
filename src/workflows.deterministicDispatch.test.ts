import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
const text = readFileSync('.github/workflows/orchid-deterministic-dispatch.yml', 'utf8');
const workflow = yaml.load(text) as { jobs: Record<string, { uses: string; strategy: object; with: Record<string, unknown> }> };
describe('deterministic completion dispatch boundary', () => {
  it('fans every admitted issue out through the budgeted real lane with eight independent slots', () => {
    expect(workflow.jobs.lane.uses).toBe('./.github/workflows/orchid-budgeted-completion-lane.yml');
    expect(workflow.jobs.lane.strategy).toEqual({ 'fail-fast': false, 'max-parallel': 8, matrix: { issue: '${{ fromJSON(inputs.issues_json) }}' } });
    expect(workflow.jobs.lane.with.provider_authorized).toBe(true);
  });
  it('forwards authorized secrets only through the governed budget wrapper and never calls the real worker directly', () => {
    expect(text).toContain('secrets: inherit');
    expect(text).not.toMatch(/API_KEY|claude-code-action/);
    expect(text).not.toContain('./.github/workflows/orchid-completion-lane.yml');
  });
});
