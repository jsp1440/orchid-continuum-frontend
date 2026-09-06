import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/orchid-no-api-scheduler.yml', 'utf8');

describe('Orchid NO-API scheduler workflow', () => {
  it('runs frequent deterministic scheduling with paid providers hard parked', () => {
    expect(workflow).toContain('cron: "*/5 * * * *"');
    expect(workflow).toContain("OC_PROVIDER_NO_API_MODE: 'true'");
    expect(workflow).toContain('OC_PROVIDER_DISABLED: anthropic,gemini,openai');
    expect(workflow).toContain("OC_PROVIDER_DAILY_MAX_CALLS: '0'");
    expect(workflow).toContain("OC_PROVIDER_WAVE_MAX_CALLS: '0'");
    expect(workflow).toContain("OC_PROVIDER_MINIMUM_DISPATCH_INTERVAL_MS: '3600000'");
  });

  it('uses only deterministic refill and governor admission adapters', () => {
    expect(workflow).toContain('npx tsx scripts/deterministic-portfolio-refill-workflow.ts');
    expect(workflow).toContain('npx tsx scripts/provider-governor-workflow-gate.ts');
    expect(workflow).not.toContain('orchid-completion-lane.yml');
    expect(workflow).not.toContain('secrets: inherit');
  });

  it('contains no paid-provider action or provider credential reference', () => {
    expect(workflow).not.toMatch(/anthropics\/claude-code-action/i);
    expect(workflow).not.toMatch(/ANTHROPIC_API_KEY/);
    expect(workflow).not.toMatch(/GEMINI_API_KEY/);
    expect(workflow).not.toMatch(/OPENAI_API_KEY/);
    expect(workflow).not.toMatch(/google-gemini|openai\/|claude-code-action/i);
  });

  it('fails closed if governor authorization ever changes unexpectedly', () => {
    expect(workflow).toContain('test "${{ steps.governor.outputs.allow_paid_execution }}" = "false"');
    expect(workflow).toContain('test -z "${{ steps.governor.outputs.provider }}"');
  });
});
