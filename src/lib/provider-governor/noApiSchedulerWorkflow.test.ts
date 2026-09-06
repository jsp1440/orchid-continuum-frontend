import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/orchid-no-api-scheduler.yml', 'utf8');
const compatibilityWorkflow = readFileSync('.github/workflows/orchid-continuous-completion.yml', 'utf8');

const paidProviderPattern = /anthropics\/claude-code-action|google-gemini|openai\/|ANTHROPIC_API_KEY|GEMINI_API_KEY|OPENAI_API_KEY|secrets:\s*inherit|orchid-completion-lane\.yml/i;

describe('Orchid NO-API scheduler workflow', () => {
  it('runs frequent deterministic scheduling with paid providers hard parked', () => {
    expect(workflow).toContain('cron: "*/5 * * * *"');
    expect(workflow).toContain("OC_PROVIDER_NO_API_MODE: 'true'");
    expect(workflow).toContain('OC_PROVIDER_DISABLED: anthropic,gemini,openai');
    expect(workflow).toContain("OC_PROVIDER_DAILY_MAX_CALLS: '0'");
    expect(workflow).toContain("OC_PROVIDER_WAVE_MAX_CALLS: '0'");
    expect(workflow).toContain("OC_PROVIDER_MINIMUM_DISPATCH_INTERVAL_MS: '3600000'");
  });

  it('uses only locked deterministic refill and governor admission adapters', () => {
    expect(workflow).toContain('npm ci --ignore-scripts');
    expect(workflow).toContain('npx --no-install tsx scripts/deterministic-portfolio-refill-workflow.ts');
    expect(workflow).toContain('npx --no-install tsx scripts/provider-governor-workflow-gate.ts');
    expect(workflow).not.toMatch(paidProviderPattern);
  });

  it('contains no paid-provider action or provider credential reference', () => {
    expect(workflow).not.toMatch(paidProviderPattern);
  });

  it('preserves JSON telemetry without shell reparsing', () => {
    expect(workflow).toContain('REFILL_TELEMETRY_JSON: ${{ steps.refill.outputs.telemetry_json }}');
    expect(workflow).toContain('GOVERNOR_TELEMETRY_JSON: ${{ steps.governor.outputs.telemetry_json }}');
    expect(workflow).toContain('"- refill_telemetry: ${REFILL_TELEMETRY_JSON}"');
    expect(workflow).toContain('"- governor_telemetry: ${GOVERNOR_TELEMETRY_JSON}"');
  });

  it('fails closed if governor authorization ever changes unexpectedly', () => {
    expect(workflow).toContain('test "${{ steps.governor.outputs.allow_paid_execution }}" = "false"');
    expect(workflow).toContain('test -z "${{ steps.governor.outputs.provider }}"');
  });
});

describe('legacy continuous-completion compatibility entrypoint', () => {
  it('preserves the convergence trigger and job shape without restoring paid execution', () => {
    expect(compatibilityWorkflow).toContain('name: Orchid Continuous Completion (NO API MODE)');
    expect(compatibilityWorkflow).toContain('cron: "*/5 * * * *"');
    expect(compatibilityWorkflow).toContain('pull_request:');
    expect(compatibilityWorkflow).toContain('workflow_dispatch:');
    expect(compatibilityWorkflow).toContain('  plan:');
    expect(compatibilityWorkflow).toContain('  prepare:');
    for (const lane of ['lane1', 'lane2', 'lane3', 'lane4', 'lane5']) {
      expect(compatibilityWorkflow).toContain(`  ${lane}:`);
    }
  });

  it('keeps every compatibility lane inert and provider-free in NO-API mode', () => {
    expect(compatibilityWorkflow).toContain("OC_PROVIDER_NO_API_MODE: 'true'");
    expect(compatibilityWorkflow).toContain("OC_PROVIDER_ANTHROPIC_ENABLED: 'false'");
    expect(compatibilityWorkflow).toContain("OC_PROVIDER_GEMINI_ENABLED: 'false'");
    expect(compatibilityWorkflow).toContain("OC_PROVIDER_OPENAI_ENABLED: 'false'");
    expect(compatibilityWorkflow).toContain("OC_PROVIDER_DAILY_MAX_CALLS: '0'");
    expect(compatibilityWorkflow).toContain("OC_PROVIDER_WAVE_MAX_CALLS: '0'");
    expect(compatibilityWorkflow).toContain('if: ${{ false }}');
    expect(compatibilityWorkflow).not.toMatch(paidProviderPattern);
  });

  it('keeps the compatibility workflow read-only and telemetry-only', () => {
    expect(compatibilityWorkflow).toContain('permissions:\n  contents: read\n  issues: read\n  pull-requests: read\n  actions: read');
    expect(compatibilityWorkflow).toContain('Committed persistent planner state: no mutation; telemetry only');
    expect(compatibilityWorkflow).not.toMatch(/contents:\s*write|issues:\s*write|pull-requests:\s*write/i);
  });
});
