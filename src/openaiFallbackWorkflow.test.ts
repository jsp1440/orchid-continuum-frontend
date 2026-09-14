import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lane = readFileSync(
  resolve(__dirname, '../.github/workflows/orchid-completion-lane.yml'),
  'utf8',
);

describe('governed OpenAI completion fallback', () => {
  it('establishes ephemeral API-key auth before Codex execution', () => {
    const start = lane.indexOf('- name: Execute bounded OpenAI fallback');
    const end = lane.indexOf('- name: Classify OpenAI terminal state', start);
    const block = lane.slice(start, end);

    expect(block).toContain('export CODEX_HOME="$RUNNER_TEMP/codex-home"');
    expect(block).toContain('@openai/codex@0.151.0 login --with-api-key');
    expect(block).toContain('CODEX_HOME="$CODEX_HOME" timeout 35m');
    expect(block).toContain('@openai/codex@0.151.0 --ask-for-approval never exec');
    expect(block).not.toContain('@openai/codex@latest');

    expect(block.indexOf('login --with-api-key')).toBeLessThan(
      block.indexOf('--ask-for-approval never exec'),
    );
  });

  it('classifies OpenAI security from stderr only and avoids broad permission matching', () => {
    const start = lane.indexOf('- name: Classify OpenAI terminal state');
    const end = lane.indexOf('- name: Classify lane result and release slot', start);
    const block = lane.slice(start, end);

    expect(block).toContain('openai-stderr.log');
    expect(block).not.toContain('openai-stderr.log" "$RUNNER_TEMP/openai-stdout.log');
    expect(block).not.toMatch(/authentication\|permission/);
    expect(block).toContain('api\\.responses\\.write');
  });
});
