import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
const read = (name: string) => readFileSync(`.github/workflows/${name}.yml`, 'utf8');
const canonical = read('orchid-continuous-completion');
const alias = read('orchid-no-api-scheduler');
const wrapper = read('orchid-budgeted-completion-lane');
const paidProviderPattern = /anthropics\/claude-code-action|google-gemini|openai\/|ANTHROPIC_API_KEY|GEMINI_API_KEY|OPENAI_API_KEY|secrets:\s*inherit/i;

const pauseNotice = '  # Scheduled launches paused pending recovery from runner nonexecution.';
const activeSchedule = [{ cron: '2/5 * * * *' }];
const retainedTriggers = ['pull_request', 'issues', 'workflow_dispatch', 'workflow_call'];

function assertCanonicalTriggerContract(source: string): void {
  const doc = yaml.load(source) as { on: Record<string, unknown> };
  for (const trigger of retainedTriggers) expect(doc.on).toHaveProperty(trigger);
  // Only the explicit incident-pause notice immediately under "on:" permits
  // absent cron registration. An unexplained missing timer must still fail.
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  if (lines.some((line, index) => line === 'on:' && lines[index + 1] === pauseNotice)) {
    expect(doc.on).not.toHaveProperty('schedule');
  } else {
    expect(doc.on.schedule).toEqual(activeSchedule);
  }
}

function triggerFixture(paused: boolean, schedule: unknown = activeSchedule): string {
  const on: Record<string, unknown> = Object.fromEntries(retainedTriggers.map((trigger) => [trigger, null]));
  if (!paused) on.schedule = schedule;
  const source = yaml.dump({ on }, { noCompatMode: true });
  return paused ? source.replace('on:\n', 'on:\n' + pauseNotice + '\n') : source;
}

describe('canonical scheduler preserves governed provider policy', () => {
  it('preserves explicit incident pause or the single active timer, and delegates its compatibility alias', () => {
    assertCanonicalTriggerContract(canonical);
    expect(alias).not.toContain('schedule:');
    expect(alias).toContain('uses: ./.github/workflows/orchid-continuous-completion.yml');
    expect(canonical).toContain('scripts/oc-dispatch-runtime.ts plan');
  });
  it('accepts the documented paused configuration with manual and event triggers retained', () => {
    assertCanonicalTriggerContract(triggerFixture(true));
  });
  it('accepts exactly the offset five-minute timer in active configuration', () => {
    assertCanonicalTriggerContract(triggerFixture(false));
  });
  it('rejects an unexplained missing timer', () => {
    expect(() => assertCanonicalTriggerContract(triggerFixture(true).replace(pauseNotice + '\n', ''))).toThrow();
  });
  it('rejects a timer registered while the explicit pause remains', () => {
    const source = triggerFixture(false).replace('on:\n', 'on:\n' + pauseNotice + '\n');
    expect(() => assertCanonicalTriggerContract(source)).toThrow();
  });
  it.each([
    ['wrong cadence', [{ cron: '* * * * *' }]],
    ['extra timer', [...activeSchedule, { cron: '7/10 * * * *' }]],
    ['empty registration', []],
    ['null registration', null],
  ])('rejects active configuration with %s', (_reason, schedule) => {
    expect(() => assertCanonicalTriggerContract(triggerFixture(false, schedule))).toThrow();
  });
  it.each(retainedTriggers)('rejects paused configuration missing retained %s trigger', (trigger) => {
    const source = triggerFixture(true).replace('  ' + trigger + ': null\n', '');
    expect(() => assertCanonicalTriggerContract(source)).toThrow();
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
