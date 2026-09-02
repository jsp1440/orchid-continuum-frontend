import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lane = readFileSync('.github/workflows/orchid-completion-lane.yml', 'utf8');
const diagnosis = readFileSync('scripts/diagnose-claude-run.mjs', 'utf8');

describe('autonomous provider execution truthfulness', () => {
  it('uses the workflow-scoped GitHub token so Claude does not depend on OIDC workflow-file validation', () => {
    expect(lane).toContain('github_token: ${{ github.token }}');
  });

  it('does not classify a green Claude action with no SDK execution log as healthy progress', () => {
    expect(lane).toContain('CLAUDE_OUTCOME" == "success" && "$log_present" != "true"');
    expect(lane).toContain('kind=runtime_config');
    expect(lane).toContain('CLAUDE_KIND" == "runtime_config"');
    expect(lane).toContain('parked fail-closed instead of treating the no-op as progress');
  });

  it('independently suppresses ordinary provider execution when a durable PR already owns the lineage', () => {
    expect(lane).toContain('durable=$(gh pr list');
    expect(lane).toContain('unchanged durable PR #${durable} already owns this lineage');
    expect(lane).toContain('--remove-label oc-running --remove-label oc-queued --add-label oc-validating');
  });

  it('keeps authentication and permission anomalies fail-closed ahead of safe-provider fallback', () => {
    const security = lane.indexOf('invalid_api_key');
    const provider = lane.indexOf('billing_error');
    expect(security).toBeGreaterThan(-1);
    expect(provider).toBeGreaterThan(security);
  });

  it('diagnostics reveal provider-key presence only, never shape, prefix or length', () => {
    expect(diagnosis).toContain('function keyPresence()');
    expect(diagnosis).not.toContain('unexpected prefix');
    expect(diagnosis).not.toContain('well-formed, length');
    expect(diagnosis).not.toContain('key.length');
  });
});
