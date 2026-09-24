import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
const read = (name: string) => readFileSync(`.github/workflows/${name}.yml`, 'utf8');
const canonical = read('orchid-continuous-completion');
const alias = read('orchid-no-api-scheduler');
const wrapper = read('orchid-budgeted-completion-lane');
const paidProviderPattern = /anthropics\/claude-code-action|google-gemini|openai\/|ANTHROPIC_API_KEY|GEMINI_API_KEY|OPENAI_API_KEY|secrets:\s*inherit/i;

describe('canonical scheduler preserves governed provider policy', () => {
  it('has a single offset five-minute timer and a compatibility alias to the same graph planner', () => {
    const doc = yaml.load(canonical) as { on: { schedule: Array<{ cron: string }> } };
    expect(doc.on.schedule).toEqual([{ cron: '2/5 * * * *' }]);
    expect(alias).not.toContain('schedule:');
    expect(alias).toContain('uses: ./.github/workflows/orchid-continuous-completion.yml');
    expect(canonical).toContain('scripts/oc-dispatch-runtime.ts plan');
  });
  it('keeps bounded daily/wave limits and the existing governor at every worker boundary', () => {
    for (const text of [wrapper, read('orchid-completion-lane')]) {
      expect(text).toContain("OC_PROVIDER_NO_API_MODE: 'false'");
      expect(text).toContain("OC_PROVIDER_DISABLED: ''");
      expect(text).toContain("OC_PROVIDER_DAILY_MAX_CALLS: '4'");
      expect(text).toContain("OC_PROVIDER_WAVE_MAX_CALLS: '1'");
      expect(text).toContain('npx --no-install tsx scripts/provider-governor-workflow-gate.ts');
    }
  });
  it('forwards secrets only through reusable-workflow inheritance, never inline provider keys', () => {
    for (const text of [canonical, wrapper, read('orchid-deterministic-dispatch')]) {
      expect(text).not.toMatch(/ANTHROPIC_API_KEY|GEMINI_API_KEY|OPENAI_API_KEY/);
    }
    expect(canonical).toContain('secrets: inherit');
    expect(wrapper).toContain('secrets: inherit');
    expect(read('orchid-deterministic-dispatch')).toContain('secrets: inherit');
    expect(alias).not.toMatch(paidProviderPattern);
  });
  it('requires successful budget admission, a fenced lease, and explicit authorization for the real executor', () => {
    expect(wrapper).toContain("if: inputs.provider_authorized && needs.budget-preflight.outputs.allowed == 'true' && needs.budget-preflight.outputs.lease_id != ''");
    expect(read('orchid-deterministic-dispatch')).toContain('provider_authorized: true');
  });
  it('preserves exact context and per-issue receipts instead of claiming progress from an empty run', () => {
    expect(canonical).toContain('path: .oc-wave/*.json');
    expect(canonical).toContain('scripts/oc-dispatch-runtime.ts audit');
    expect(wrapper).toContain('path: .oc-receipts/*.json');
    expect(wrapper).toContain('if-no-files-found: error');
  });
});
